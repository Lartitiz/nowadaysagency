import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";

const MODULE_QUESTIONS: Record<string, string[]> = {
  bio: [
    "Montre-moi ta bio Instagram actuelle. Colle-la ici telle quelle.",
    "Si une inconnue tombe sur ton profil, en 3 secondes elle doit comprendre quoi exactement ?",
    "Quel résultat concret ta cliente obtient en travaillant avec toi ? Pas le service : le résultat.",
    "Quel CTA tu veux dans ta bio ? Qu'est-ce que la personne doit FAIRE après l'avoir lue ?",
  ],
  feed: [
    "Regarde tes 9 derniers posts. Tu vois un fil rouge visuel ? Des couleurs récurrentes, un style reconnaissable ?",
    "Si une inconnue scrolle ton feed pendant 5 secondes, qu'est-ce qu'elle comprend de toi et de ce que tu fais ?",
    "Quel post a le mieux marché ces dernières semaines ? À ton avis, c'est quoi qui a fonctionné ?",
  ],
  epingles: [
    "Quels sont tes 3 posts épinglés actuellement ? Décris-les en une phrase chacun. Si tu n'en as pas, dis-le.",
    "Si une cliente potentielle visite ton profil pour la première fois, quels 3 contenus tu voudrais qu'elle voie en premier ?",
    "Parmi tes posts : lequel montre le mieux ta personnalité ? Lequel montre ton expertise ? Et lequel montre ce que tu vends ?",
  ],
  alaune: [
    "Quelles stories à la une tu as actuellement ? Liste leurs noms.",
    "Si une nouvelle abonnée découvre ton profil, quelles infos ESSENTIELLES doit-elle trouver dans tes à la une ?",
    "As-tu un à la une 'Qui suis-je' ou 'Mon parcours' ? Si non, qu'est-ce qui t'en empêche ?",
  ],
  nom_edito: [
    "Ton nom de profil Instagram contient-il un mot-clé que ta cible rechercherait ? (Ex : 'Marie | Coach Mindset' au lieu de juste 'Marie')",
    "Ta ligne éditoriale, c'est quoi en 2 phrases ? Et est-ce qu'un·e inconnu·e la devinerait en scrollant tes 6 derniers posts ?",
  ],
};

const MODULE_LABELS: Record<string, string> = {
  bio: "Bio",
  feed: "Feed",
  epingles: "Posts épinglés",
  alaune: "Stories à la une",
  nom_edito: "Nom & Ligne éditoriale",
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
    const { phase, module, answers, audit_context, workspace_id } = body;

    if (!module || !phase) {
      return new Response(JSON.stringify({ error: "module et phase requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const quota = await checkQuota(user.id, "suggestion");
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sbService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const filterCol = workspace_id ? "workspace_id" : "user_id";
    const filterVal = workspace_id || user.id;

    // Fetch user context + last audit
    const [ctx, auditRes] = await Promise.all([
      getUserContext(sbService, user.id, workspace_id),
      sbService.from("instagram_audit").select("score_global, score_bio, score_feed, score_edito, score_stories, score_epingles, resume")
        .eq(filterCol, filterVal).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const audit = auditRes.data;
    const contextText = formatContextForAI(ctx, { ...CONTEXT_PRESETS.audit, includeAudit: true });
    const moduleLabel = MODULE_LABELS[module] || module;

    if (phase === "questions") {
      const baseQuestions = MODULE_QUESTIONS[module] || MODULE_QUESTIONS.bio;

      const systemPrompt = `Tu es une consultante Instagram experte. Tu accompagnes des solopreneuses créatives.

CONTEXTE BRANDING :
${contextText}

DERNIER AUDIT INSTAGRAM :
${audit ? `Score bio : ${audit.score_bio ?? "?"}/20\nScore feed : ${audit.score_feed ?? "?"}/20\nScore stories : ${audit.score_stories ?? "?"}/20\nScore épinglés : ${audit.score_epingles ?? "?"}/20\nScore édito : ${audit.score_edito ?? "?"}/20\nRésumé : ${audit.resume || ""}` : "Pas d'audit disponible"}

MODULE : ${moduleLabel}

MISSION :
Adapte ces questions au contexte de l'utilisatrice. Si elle a déjà du branding rempli, creuse plus profond. Si un score d'audit est faible, oriente les questions vers le problème.

Questions de base :
${baseQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Retourne UNIQUEMENT un JSON :
{
  "questions": [${baseQuestions.map((_, i) => `{"numero": ${i + 1}, "question": "...", "placeholder": "..."}`).join(", ")}],
  "intro": "Message d'intro court et personnalisé (2 phrases max)"
}`;

      const raw = await callAnthropicSimple(getModelForAction("coaching"), systemPrompt, "Génère les questions personnalisées.", 0.4, 2000);

      let result;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON");
        result = JSON.parse(jsonMatch[0]);
      } catch {
        result = {
          questions: baseQuestions.map((q, i) => ({ numero: i + 1, question: q, placeholder: "" })),
          intro: "On va optimiser ensemble ta section " + moduleLabel + " !",
        };
      }

      await logUsage(user.id, "suggestion", "ig_profile_coaching_questions");
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (phase === "diagnostic") {
      if (!answers || !Array.isArray(answers) || answers.length === 0) {
        return new Response(JSON.stringify({ error: "Réponses requises" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const moduleSpecificInstructions: Record<string, string> = {
        bio: `Pour le module 'bio' : génère 3 propositions de bio complète (150 caractères max chacune).
Chaque proposal doit avoir field: "bio_option_1", "bio_option_2", "bio_option_3" avec la bio complète en value.`,
        feed: `Pour le module 'feed' : génère 3 recommandations visuelles concrètes.
Chaque proposal doit avoir un field descriptif et une value avec la recommandation détaillée.`,
        epingles: `Pour le module 'epingles' : recommande 3 types de posts à épingler avec le thème et pourquoi.
Chaque proposal doit avoir field: "epingle_1", "epingle_2", "epingle_3".`,
        alaune: `Pour le module 'alaune' : propose une structure de 4-6 stories à la une avec titres et contenu suggéré.
Chaque proposal doit avoir field: "alaune_1", "alaune_2", etc.`,
        nom_edito: `Pour le module 'nom_edito' : propose 3 noms de profil optimisés + un résumé de ligne éditoriale.
Proposals avec field: "nom_option_1", "nom_option_2", "nom_option_3", "ligne_editoriale".`,
      };

      const systemPrompt = `Tu es une consultante Instagram experte. Tu accompagnes des solopreneuses créatives. À partir des réponses de l'utilisatrice, génère un diagnostic actionnable.

CONTEXTE BRANDING :
${contextText}

DERNIER AUDIT INSTAGRAM :
${audit ? `Score bio : ${audit.score_bio ?? "?"}/20\nScore feed : ${audit.score_feed ?? "?"}/20\nScore stories : ${audit.score_stories ?? "?"}/20\nScore épinglés : ${audit.score_epingles ?? "?"}/20\nScore édito : ${audit.score_edito ?? "?"}/20` : "Pas d'audit disponible"}

MODULE : ${moduleLabel}

RÉPONSES :
${answers.map((a: any, i: number) => `Q${i + 1}: ${a.question}\nR${i + 1}: ${a.answer}`).join("\n\n")}

${moduleSpecificInstructions[module] || ""}

Retourne un JSON :
{
  "diagnostic": "Résumé en 2-3 phrases de ce qui va et ce qui ne va pas",
  "pourquoi": "Explication du problème principal",
  "consequences": ["Ce que ça coûte de ne pas changer"],
  "proposals": [
    {"label": "Description de la proposition", "field": "champ_a_modifier", "value": "valeur proposée"}
  ]
}

Sois directe, bienveillante, et concrète. Pas de jargon. Tutoiement.`;

      const raw = await callAnthropicSimple(getModelForAction("coaching"), systemPrompt, "Génère ton diagnostic et tes propositions.", 0.5, 4000);

      let result;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON");
        result = JSON.parse(jsonMatch[0]);
      } catch {
        console.error("Failed to parse ig profile coaching diagnostic:", raw);
        return new Response(JSON.stringify({ error: "Erreur lors de l'analyse. Réessaie." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await logUsage(user.id, "content", "ig_profile_coaching_diagnostic");
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Phase inconnue. Utilise 'questions' ou 'diagnostic'." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("instagram-profile-coaching error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
