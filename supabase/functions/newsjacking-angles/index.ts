import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { isDemoUser } from "../_shared/guard-demo.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { getModelForAction } from "../_shared/anthropic.ts";

const AXE_LABELS: Record<string, string> = {
  // Nouveaux axes (micro-phénomènes culturels)
  mot_qui_revient: "Mot / concept qui revient",
  obsession_collective: "Obsession collective",
  comportement_emergent: "Comportement émergent",
  debat_recurrent: "Débat récurrent",
  objet_culturel: "Objet culturel (film/livre/série)",
  actu_connectable: "Actu connectable",
  // Anciens axes (rétro-compat pour réponses en cache)
  societe_debat: "Société / Débat",
  economie_argent: "Économie / Argent",
  culture_pop: "Culture / Pop",
  science_decouverte: "Science / Découverte",
  politique_loi: "Politique / Loi",
  viral_insolite: "Viral / Insolite",
};

const TON_LABELS: Record<string, string> = {
  // Nouveaux registres
  confortable: "confortable et reconnaissable",
  entre_deux: "connu pris sous un angle inattendu",
  decalant: "décalant et inattendu",
  // Anciens (rétro-compat)
  serieux_marquant: "sérieux et marquant",
  drole_decale: "drôle et décalé",
  surprenant_contre_intuitif: "surprenant et contre-intuitif",
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isDemoUser(user.id)) {
      return new Response(JSON.stringify({ error: "Fonctionnalité non disponible en mode démo." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const actu = body?.actu;
    const workspace_id = body?.workspace_id || undefined;

    if (!actu || typeof actu !== "object" || !actu.titre || !actu.resume) {
      return new Response(JSON.stringify({ error: "Actu invalide (titre + resume requis)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit (plus permissif que la recherche)
    const rl = checkRateLimit(user.id, 15, 60_000);
    if (!rl.allowed) {
      return rateLimitResponse(rl.retryAfterMs!, corsHeaders);
    }

    // Quota — "content" (rédaction d'angles, moins coûteux qu'une vraie recherche web)
    const quota = await checkQuota(user.id, "content", workspace_id);
    if (!quota.allowed) {
      return quotaDeniedResponse(quota, corsHeaders);
    }

    // Branding context
    const sbService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const ctx = await getUserContext(sbService, user.id, workspace_id);
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.content);
    const nicheLabel = ctx?.profile?.activite || ctx?.profile?.type_activite || "son secteur";

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY non configurée" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = getModelForAction("content");
    const axeLabel = AXE_LABELS[actu.axe] || actu.axe || "actu";
    const tonLabel = TON_LABELS[actu.ton] || "marquant";

    const isGlobale = actu.type === "globale";
    const pontRule = isGlobale
      ? `▶ ACTU GLOBALE — RÈGLE DU PONT (impérative) :
Cette actu n'est PAS dans le secteur de la personne. Chaque angle DOIT s'appuyer sur le PONT déjà identifié ci-dessus (champ "Pertinence") — ne dérive PAS vers une autre connexion plus lointaine.
- Le hook part de l'actu (ce que tout le monde a vu/entendu)
- Le pivot ramène à l'expertise métier de "${nicheLabel}" via l'élément précis cité dans la pertinence
- Privilégie "declencheur_externe", "constat_decale" ou "recit_experience"
- "parallele_absurde" : MAX 1 angle sur 3, et UNIQUEMENT si le parallèle est immédiatement lisible (pas un parallèle qu'il faut "déballer" en 2 phrases)`
      : `▶ ACTU NICHE — l'angle doit valoriser l'expertise unique de la personne sur cette actu de son secteur. Privilégie "constat_decale", "recit_experience" ou "declencheur_externe". Reste branché sur le pont déjà identifié dans "Pertinence".`;

    const systemPrompt = `Tu es une copywriter senior spécialisée en newsjacking pour créateur·ices de contenu.

PROFIL DE LA PERSONNE :
${brandingContext}

══════════════════════════════════════════════
ACTU SUR LAQUELLE TRAVAILLER
══════════════════════════════════════════════
Titre : ${actu.titre}
Résumé : ${actu.resume}
Source : ${actu.source || "non précisée"}
Type : ${actu.type || "globale"}
Axe : ${axeLabel}
Ton suggéré : ${tonLabel}
Pertinence : ${actu.pertinence || "—"}

══════════════════════════════════════════════
TA MISSION : 3 ANGLES DISTINCTS POUR CETTE ACTU
══════════════════════════════════════════════

${pontRule}

CHAQUE angle doit utiliser UN véhicule différent parmi ces 5 :
1. recit_experience — INVITE la personne à raconter une scène vécue (sans la fabriquer toi-même). Le hook doit être une AMORCE qui pose le décor d'un type de situation que la personne a probablement déjà vécue dans son métier — JAMAIS une anecdote inventée avec date, dialogue ou client fictif.
2. declencheur_externe — "Cette actu m'a fait réaliser un truc sur mon métier…"
3. constat_decale — "Ce que cette actu révèle sur [secteur], c'est que…"
4. montrer_plutot_quexpliquer — avant/après, process visible, transformation
5. parallele_absurde — "Cette actu n'a rien à voir avec mon métier… et pourtant ça illustre exactement…"

⚠️ Les 3 angles doivent utiliser 3 véhicules DIFFÉRENTS.

══════════════════════════════════════════════
RÈGLE DE VÉRITÉ — INTERDICTION ABSOLUE D'INVENTER
══════════════════════════════════════════════
Tu n'es PAS la personne. Tu ne connais PAS sa vie. Donc tu ne fabriques RIEN à sa place :
- ❌ INTERDIT : inventer une date ("2019, je vends à un client…"), un dialogue rapporté ("il m'a dit que…"), un chiffre personnel ("mes prix ont grimpé de 40%"), un client/projet fictif, une transformation chiffrée fausse.
- ❌ INTERDIT : storytelling en "je" qui sonne comme une anecdote précise mais qui est inventé de toutes pièces.
- ✅ AUTORISÉ pour "recit_experience" : un hook-AMORCE qui invite la personne à compléter ("Tu te souviens de la dernière fois qu'un client t'a demandé d'enlever le mot…?", "Cette scène, on l'a toutes vécue : …"), avec une description qui dit explicitement à la personne quelle scène de SON vécu raconter.
- ✅ AUTORISÉ partout : faits publics vérifiables liés à l'actu, mécanismes nommés (biais, dynamique de marché), observations sectorielles génériques.

RÈGLES ABSOLUES :
- L'actu est le DÉCLENCHEUR, pas le sujet
- JAMAIS "voici ce qui se passe + mon avis"
- TOUJOURS relier à l'expertise et au vécu de la personne — mais SANS fabriquer ce vécu
- JAMAIS de format "X conseils" ou "X erreurs"
- Hook = max 20 mots, percutant, évite les questions rhétoriques mollasses
- Description = 2-3 phrases maximum, concrète, avec un point de vue
- Pour "recit_experience", la description DOIT préciser à la personne quoi raconter de son propre vécu (pas inventer à sa place)

══════════════════════════════════════════════
FORMAT DE RÉPONSE — JSON STRICT (pas de markdown)
══════════════════════════════════════════════

{
  "angles": [
    {
      "vehicule": "recit_experience" | "declencheur_externe" | "constat_decale" | "montrer_plutot_quexpliquer" | "parallele_absurde",
      "hook": "La première phrase du contenu (max 20 mots)",
      "description": "En 2-3 phrases, comment relier l'actu à l'expertise de la personne",
      "format_suggere": "post" | "carousel" | "reel" | "story" | "linkedin"
    },
    { ... },
    { ... }
  ]
}

Renvoie EXACTEMENT 3 angles, avec 3 véhicules différents.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages: [{ role: "user", content: systemPrompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic error:", response.status, "model:", model, "body:", errText.slice(0, 500));
      const userMsg = response.status === 529 ? "L'IA est temporairement surchargée. Réessaie dans quelques secondes."
        : `Erreur IA (${response.status}). Réessaie.`;
      return new Response(JSON.stringify({ error: userMsg }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const textBlocks = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text);
    const fullText = textBlocks.join("\n");

    // Parse JSON
    let parsed: any;
    try {
      parsed = JSON.parse(fullText.trim());
    } catch {
      const firstBrace = fullText.indexOf("{");
      const lastBrace = fullText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          parsed = JSON.parse(fullText.slice(firstBrace, lastBrace + 1));
        } catch (e) {
          console.error("JSON parse failed. Preview:", fullText.slice(0, 500));
          return new Response(JSON.stringify({ error: "Erreur de parsing IA. Réessaie." }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: "Réponse IA invalide. Réessaie." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!parsed.angles || !Array.isArray(parsed.angles) || parsed.angles.length === 0) {
      return new Response(JSON.stringify({ error: "Format de réponse invalide." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logUsage(user.id, "content", "newsjacking", undefined, model, workspace_id);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("newsjacking-angles error:", e);
    const message = e instanceof Error && e.name === "AbortError"
      ? "Timeout : la génération a pris trop de temps. Réessaie."
      : e instanceof Error ? e.message : "Erreur interne";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
