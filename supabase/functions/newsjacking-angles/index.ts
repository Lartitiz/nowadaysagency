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
  console.log(`[newsjacking-angles] request received method=${req.method}`);

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
    // mode : "primary" (1 angle, prompt court) | "variants" (2 angles évitant un véhicule) | défaut = 3 angles (legacy)
    const mode: "primary" | "variants" | "full" = body?.mode === "primary" || body?.mode === "variants" ? body.mode : "full";
    const excludeVehicules: string[] = Array.isArray(body?.exclude_vehicules) ? body.exclude_vehicules : [];

    if (!actu || typeof actu !== "object" || !actu.titre || !actu.resume) {
      return new Response(JSON.stringify({ error: "Actu invalide (titre + resume requis)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit (plus permissif que la recherche). En mode "primary" (pré-calcul),
    // on autorise des bursts plus élevés pour permettre le fan-out de 4 actus en parallèle.
    const rl = mode === "primary"
      ? checkRateLimit(user.id, 30, 60_000)
      : checkRateLimit(user.id, 15, 60_000);
    if (!rl.allowed) {
      return rateLimitResponse(rl.retryAfterMs!, corsHeaders);
    }

    // Quota — "content" (rédaction d'angles, moins coûteux qu'une vraie recherche web)
    const quota = await checkQuota(user.id, "content", workspace_id);
    if (!quota.allowed) {
      return quotaDeniedResponse(quota, corsHeaders);
    }

    // Branding context — preset allégé pour "primary", complet pour "variants"/"full"
    const sbService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const ctx = await getUserContext(sbService, user.id, workspace_id);
    const preset = mode === "primary" ? CONTEXT_PRESETS.newsjacking : CONTEXT_PRESETS.content;
    const brandingContext = formatContextForAI(ctx, preset);
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

    // "reaction" = actu choisie en mode élargi (macro/scoop) ou lien collé sans
    // pont fort : la pertinence est une PISTE DE RÉACTION, pas une citation métier.
    // On relâche le pivot pour ne pas re-fabriquer le pont forcé que ces modes
    // évitent par design (cf. newsjacking-ai macroBlock/scoopBlock).
    const isReaction = actu.angle_mode === "reaction";
    const isGlobale = actu.type === "globale";
    const pontRule = isReaction
      ? `▶ ACTU "RÉACTION" — PONT RELÂCHÉ (actu grand public, mode élargi) :
Cette actu a été choisie pour sa RÉSONANCE GRAND PUBLIC, pas pour un lien direct au métier de "${nicheLabel}". N'essaie PAS de forcer un retour à l'expertise métier.
- L'angle est une RÉACTION authentique : la personne réagit comme citoyenne / spectatrice / témoin de son époque, partage un ressenti, ouvre un débat, raconte ce que ça lui évoque.
- Le pont peut être une valeur, une émotion, une conviction, un parti pris — PAS forcément la cible, l'offre ou le métier.
- Reste fidèle à la "Pertinence" ci-dessus (c'est une piste de réaction, pas une accroche commerciale).
- Privilégie "declencheur_externe", "constat_decale" ou "recit_experience". Évite le pivot commercial appuyé.
- Interdit quand même : le pont 100% hors-sol type "ça nous rappelle l'importance de la communication". Une réaction sincère oui ; un slogan marketing plaqué, non.`
      : isGlobale
      ? `▶ ACTU GLOBALE — RÈGLE DU PONT (impérative) :
Cette actu n'est PAS dans le secteur de la personne. Chaque angle DOIT s'appuyer sur le PONT déjà identifié ci-dessus (champ "Pertinence") — ne dérive PAS vers une autre connexion plus lointaine.
- Le hook part de l'actu (ce que tout le monde a vu/entendu)
- Le pivot ramène à l'expertise métier de "${nicheLabel}" via l'élément précis cité dans la pertinence
- Privilégie "declencheur_externe", "constat_decale" ou "recit_experience"
- "parallele_absurde" : MAX 1 angle sur 3, et UNIQUEMENT si le parallèle est immédiatement lisible (pas un parallèle qu'il faut "déballer" en 2 phrases)`
      : `▶ ACTU NICHE — l'angle doit valoriser l'expertise unique de la personne sur cette actu de son secteur. Privilégie "constat_decale", "recit_experience" ou "declencheur_externe". Reste branché sur le pont déjà identifié dans "Pertinence".`;

    // Cadrage spécifique au mode (1 angle / 2 variantes / 3 complets)
    let missionBlock: string;
    let expectedCount: number;
    let maxTokens: number;

    if (mode === "primary") {
      expectedCount = 1;
      maxTokens = 700;
      missionBlock = `TA MISSION : 1 SEUL ANGLE — le plus évident, le plus solide pour cette actu.

Choisis LE véhicule qui s'impose naturellement parmi ces 5 :
1. recit_experience — INVITE la personne à raconter une scène vécue (sans la fabriquer toi-même).
2. declencheur_externe — "Cette actu m'a fait réaliser un truc sur mon métier…"
3. constat_decale — "Ce que cette actu révèle sur [secteur], c'est que…"
4. montrer_plutot_quexpliquer — avant/après, process visible, transformation
5. parallele_absurde — "Cette actu n'a rien à voir avec mon métier… et pourtant ça illustre exactement…"`;
    } else if (mode === "variants") {
      expectedCount = 2;
      maxTokens = 1200;
      const excludedTxt = excludeVehicules.length
        ? `\n\n⚠️ EXCLUS (déjà couvert) : ${excludeVehicules.join(", ")}. NE PROPOSE PAS ces véhicules. Choisis 2 autres véhicules DIFFÉRENTS entre eux et différents des exclus.`
        : "";
      missionBlock = `TA MISSION : 2 ANGLES COMPLÉMENTAIRES (variantes) pour cette actu.

Choisis 2 véhicules DIFFÉRENTS entre eux parmi ces 5 :
1. recit_experience — INVITE la personne à raconter une scène vécue (sans la fabriquer toi-même).
2. declencheur_externe — "Cette actu m'a fait réaliser un truc sur mon métier…"
3. constat_decale — "Ce que cette actu révèle sur [secteur], c'est que…"
4. montrer_plutot_quexpliquer — avant/après, process visible, transformation
5. parallele_absurde — "Cette actu n'a rien à voir avec mon métier… et pourtant ça illustre exactement…"${excludedTxt}`;
    } else {
      expectedCount = 3;
      maxTokens = 1500;
      missionBlock = `TA MISSION : 3 ANGLES DISTINCTS POUR CETTE ACTU

CHAQUE angle doit utiliser UN véhicule différent parmi ces 5 :
1. recit_experience — INVITE la personne à raconter une scène vécue (sans la fabriquer toi-même). Le hook doit être une AMORCE qui pose le décor d'un type de situation que la personne a probablement déjà vécue dans son métier — JAMAIS une anecdote inventée avec date, dialogue ou client fictif.
2. declencheur_externe — "Cette actu m'a fait réaliser un truc sur mon métier…"
3. constat_decale — "Ce que cette actu révèle sur [secteur], c'est que…"
4. montrer_plutot_quexpliquer — avant/après, process visible, transformation
5. parallele_absurde — "Cette actu n'a rien à voir avec mon métier… et pourtant ça illustre exactement…"

⚠️ Les 3 angles doivent utiliser 3 véhicules DIFFÉRENTS.`;
    }

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
${missionBlock}
══════════════════════════════════════════════

${pontRule}

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
CHECK FINAL — pour CHAQUE angle, avant de l'écrire :
══════════════════════════════════════════════
${isReaction
  ? `- Est-ce une RÉACTION sincère et incarnée (pas un slogan marketing plaqué) ? Si c'est creux ou générique → REFORMULE.
- Reste-t-il fidèle à la piste de réaction donnée dans "Pertinence" ? Si l'angle part ailleurs → REFORMULE.
(Pas besoin de citer la cible ou l'offre : ici la personne réagit à une actu grand public. Ne force PAS un pivot métier.)`
  : `Demande-toi : "Quel élément précis du profil cet angle utilise-t-il ?" (cible / activité / combat / pilier / valeur)
- Si tu ne peux pas nommer l'élément → l'angle dérive, REFORMULE-le pour qu'il s'ancre dans la pertinence donnée plus haut.
- Si l'angle ramène à un autre sujet plus lointain que celui de la pertinence → REFORMULE.`}

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
    }
  ]
}

Renvoie EXACTEMENT ${expectedCount} angle${expectedCount > 1 ? "s" : ""}${expectedCount > 1 ? ", avec des véhicules DIFFÉRENTS" : ""}.`;

    const t0 = Date.now();
    console.log(`[newsjacking-angles] start mode=${mode} — user=${user.id.slice(0,8)} actu="${String(actu.titre).slice(0,60)}" promptLen=${systemPrompt.length}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: systemPrompt }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    console.log(`[newsjacking-angles] mode=${mode} claude responded in ${Date.now() - t0}ms — status=${response.status}`);

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
    console.log(`[newsjacking-angles] text length=${fullText.length}`);

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

    if (!parsed.angles || !Array.isArray(parsed.angles)) {
      return new Response(JSON.stringify({ error: "Format de réponse invalide." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalisation/whitelist des champs d'angle : vehicule et format_suggere
    // doivent rester dans les valeurs connues du front (sinon badge ✨ générique
    // et format suggéré ininterprétable à l'étape 2). On clampe sur des défauts
    // sûrs et on jette les angles sans hook/développement exploitable.
    const ALLOWED_VEHICULES = new Set(["recit_experience","declencheur_externe","constat_decale","montrer_plutot_quexpliquer","parallele_absurde"]);
    const ALLOWED_FORMATS = new Set(["post","carousel","reel","story","linkedin"]);
    parsed.angles = parsed.angles
      .filter((a: any) => a && typeof a === "object")
      .map((a: any) => ({
        vehicule: ALLOWED_VEHICULES.has(a.vehicule) ? a.vehicule : "declencheur_externe",
        hook: typeof a.hook === "string" ? a.hook.trim() : "",
        description: typeof a.description === "string" ? a.description.trim() : "",
        format_suggere: ALLOWED_FORMATS.has(a.format_suggere) ? a.format_suggere : "post",
      }))
      .filter((a: any) => a.hook && a.description);

    if (parsed.angles.length === 0) {
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
