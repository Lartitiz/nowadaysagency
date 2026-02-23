import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODULE_QUESTIONS: Record<string, string[]> = {
  persona: [
    "Parmi toutes les personnes avec qui tu travailles (ou voudrais travailler), laquelle te donne le plus d'énergie ? Celle avec qui tu te dis « oui, c'est exactement pour ça que je fais ce métier ». Décris-la.",
    "Qu'est-ce qu'elle cherche vraiment quand elle vient vers toi ? Pas le service, le résultat profond.",
    "Quel est son plus gros blocage par rapport à la com' ou à ce que tu proposes ?",
    "Combien elle serait prête à investir pour résoudre ce problème ?",
  ],
  offers: [
    "Quelle offre tes client·es achètent le plus facilement ? Pourquoi à ton avis ?",
    "Quelle offre tu VOUDRAIS vendre plus ?",
    "Quelle est la différence concrète entre tes offres ? (en une phrase chacune)",
    "Quand une cliente hésite entre tes offres, qu'est-ce qui la fait choisir l'une plutôt que l'autre ?",
  ],
  bio: [
    "Si tu avais 10 secondes pour expliquer ce que tu fais à quelqu'un dans un ascenseur, tu dirais quoi ?",
    "Qu'est-ce que ta cliente idéale tape dans la barre de recherche Instagram pour te trouver ?",
    "Quel résultat concret tu apportes ?",
    "Quel est ton CTA idéal ? Qu'est-ce que tu veux que les gens fassent après avoir lu ta bio ?",
  ],
  story: [
    "C'est quoi le moment déclencheur ? Le jour où tu as décidé de faire ce que tu fais ?",
    "Quelle galère ou quel obstacle a tout changé pour toi ?",
    "Quel est le message profond que tu veux transmettre à travers ton travail ?",
    "Qu'est-ce que les gens ne savent pas sur toi et qui les surprendrait ?",
  ],
  tone: [
    "Si ta marque était une personne, elle parlerait comment ? Donne un exemple de phrase typique.",
    "Qu'est-ce qui t'énerve dans la communication des autres ? Le ton que tu ne veux SURTOUT PAS.",
    "Montre-moi un post ou un compte dont le ton t'inspire. Pourquoi ?",
    "Tu es plutôt « je te secoue avec bienveillance » ou « je t'accompagne en douceur » ?",
  ],
  editorial: [
    "De quoi tu pourrais parler pendant des heures sans te lasser ?",
    "Quel sujet revient le plus souvent dans tes conversations avec tes client·es ?",
    "Quel type de post te fait le plus plaisir à créer ?",
    "Combien de posts par semaine c'est réaliste pour toi, honnêtement ?",
  ],
};

// Map module to the branding table/fields to update
const MODULE_UPDATE_MAP: Record<string, { table: string; fields: string[] }> = {
  persona: { table: "persona", fields: ["step_1_frustrations", "step_2_transformation"] },
  offers: { table: "offers", fields: ["name", "description", "benefits"] },
  bio: { table: "brand_profile", fields: ["mission", "offer", "target_description"] },
  story: { table: "storytelling", fields: ["step_1_declencheur", "step_2_combat", "step_3_message"] },
  tone: { table: "brand_profile", fields: ["tone_register", "tone_style", "combat_cause", "combat_fights", "key_expressions"] },
  editorial: { table: "brand_strategy", fields: ["pillar_major", "pillar_minor_1", "pillar_minor_2"] },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { phase, module, answers, rec_id } = body;

    if (!module || !phase) {
      return new Response(JSON.stringify({ error: "module et phase requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Quota check
    const category = phase === "questions" ? "suggestion" : "content";
    const quota = await checkQuota(user.id, category);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user context
    const sbService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [brandRes, auditRes, recRes] = await Promise.all([
      sbService.from("brand_profile").select("*").eq("user_id", user.id).maybeSingle(),
      sbService.from("branding_audits").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      rec_id ? sbService.from("audit_recommendations").select("*").eq("id", rec_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    const branding = brandRes.data;
    const audit = auditRes.data;
    const recommendation = recRes.data;

    if (phase === "questions") {
      // PHASE 1: Generate personalized questions
      const baseQuestions = MODULE_QUESTIONS[module] || MODULE_QUESTIONS.persona;
      
      const systemPrompt = `Tu es une consultante en communication bienveillante et experte. Tu accompagnes des solopreneuses créatives.

CONTEXTE :
- Module : ${module}
- Branding existant : ${branding ? JSON.stringify({ mission: branding.mission, offer: branding.offer, target_description: branding.target_description, voice_description: branding.voice_description }) : "Pas encore rempli"}
- Recommandation d'audit : ${recommendation ? `"${recommendation.conseil || recommendation.label}" (priorité ${recommendation.priorite})` : "Aucune"}
- Dernier score audit : ${audit?.score_global || "Non disponible"}

MISSION :
Adapte ces 4 questions de base au contexte de l'utilisatrice. Si elle a déjà du branding rempli, reformule les questions pour creuser plus profond. Si une recommandation d'audit existe, oriente les questions vers le problème identifié.

Questions de base :
${baseQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Retourne UNIQUEMENT un JSON :
{
  "questions": [
    {"numero": 1, "question": "...", "placeholder": "..."},
    {"numero": 2, "question": "...", "placeholder": "..."},
    {"numero": 3, "question": "...", "placeholder": "..."},
    {"numero": 4, "question": "...", "placeholder": "..."}
  ],
  "intro": "Message d'intro court et personnalisé (2 phrases max)"
}`;

      const raw = await callAnthropicSimple("claude-sonnet-4-5-20250929", systemPrompt, "Génère les questions personnalisées.", 0.4, 2000);
      
      let result;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON");
        result = JSON.parse(jsonMatch[0]);
      } catch {
        // Fallback to base questions
        result = {
          questions: baseQuestions.map((q, i) => ({ numero: i + 1, question: q, placeholder: "" })),
          intro: recommendation?.conseil || "On va creuser ensemble pour trouver la meilleure approche.",
        };
      }

      await logUsage(user.id, "suggestion", "coaching_questions");
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (phase === "diagnostic") {
      // PHASE 2: Generate diagnostic + proposals
      if (!answers || !Array.isArray(answers) || answers.length === 0) {
        return new Response(JSON.stringify({ error: "Réponses requises" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updateMap = MODULE_UPDATE_MAP[module] || MODULE_UPDATE_MAP.persona;

      const systemPrompt = `Tu es une consultante en communication bienveillante et experte. Tu accompagnes des solopreneuses créatives.

CONTEXTE DE L'AUDIT :
${audit ? `Score global : ${audit.score_global}/100\nSynthèse : ${audit.synthese}\nPoints faibles : ${JSON.stringify(audit.points_faibles || [])}` : "Pas d'audit disponible"}

BRANDING ACTUEL :
${branding ? JSON.stringify({ mission: branding.mission, offer: branding.offer, target_description: branding.target_description, voice_description: branding.voice_description, tone_register: branding.tone_register, combat_cause: branding.combat_cause }) : "Pas encore rempli"}

RECOMMANDATION D'AUDIT :
${recommendation ? `"${recommendation.titre || recommendation.label}" - ${recommendation.conseil_contextuel || recommendation.conseil || ""}` : "Aucune"}

MODULE : ${module}
TABLE CIBLE : ${updateMap.table}
CHAMPS À METTRE À JOUR : ${updateMap.fields.join(", ")}

RÉPONSES DE L'UTILISATRICE :
${answers.map((a: any, i: number) => `Q${i + 1}: ${a.question}\nR${i + 1}: ${a.answer}`).join("\n\n")}

TON STYLE :
- Direct et chaleureux, tutoiement
- Tu expliques le POURQUOI de tes recommandations
- Tu donnes des exemples concrets
- Pas de jargon marketing
- Tu assumes tes choix ("je te recommande X parce que...")
- Honnête même si ça pique

MISSION :
1. Analyse les réponses + branding existant + audit
2. Explique en 3-5 phrases ce que tu recommandes et POURQUOI
3. Propose les textes concrets pour mettre à jour le branding
4. Retourne un JSON structuré

RETOURNE UNIQUEMENT un JSON :
{
  "diagnostic": "Texte du diagnostic (3-5 phrases, tutoiement)",
  "pourquoi": "Explication du raisonnement (2-3 phrases)",
  "consequences": ["Ce que ça change concrètement 1", "2", "3"],
  "proposals": [
    {"label": "Nom du champ en français", "field": "nom_du_champ_technique", "value": "Texte proposé"},
    ...
  ]
}

Les proposals doivent correspondre aux champs de la table ${updateMap.table}.
Pour le module persona, propose : description (portrait complet), frustrations, desires (désirs), phrase_signature.
Pour le module tone, propose : tone_register, tone_style, combat_cause, key_expressions.
Pour le module bio, propose : mission (pitch court), offer (offre résumée), target_description.
Pour le module story, propose des éléments narratifs clés.
Pour le module offers, propose nom, description, bénéfices pour chaque offre.
Pour le module editorial, propose piliers de contenu.`;

      const raw = await callAnthropicSimple("claude-sonnet-4-5-20250929", systemPrompt, "Génère ton diagnostic et tes propositions.", 0.5, 4000);

      let result;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON");
        result = JSON.parse(jsonMatch[0]);
      } catch {
        console.error("Failed to parse coaching diagnostic:", raw);
        return new Response(JSON.stringify({ error: "Erreur lors de l'analyse. Réessaie." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await logUsage(user.id, "content", "coaching_diagnostic");
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Phase inconnue. Utilise 'questions' ou 'diagnostic'." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("coaching-module error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
