import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";

const MODULE_QUESTIONS: Record<string, string[]> = {
  profil: [
    "Ton titre LinkedIn actuel, c'est quoi ? (La ligne sous ton nom, celle que tout le monde voit en premier)",
    "Qui sont les personnes que tu veux attirer sur LinkedIn ? Des client·es ? Des partenaires ? Les deux ?",
    "C'est quoi ton principal avantage ? Le truc qui fait que les gens te choisissent TOI et pas la voisine.",
    "Ta photo de profil : elle est récente, pro, et lumineuse ? Ta bannière : elle dit quoi sur toi actuellement ?",
  ],
  resume: [
    "Tu rencontres ta cliente idéale dans un café. Elle te demande 'tu fais quoi ?'. Tu réponds quoi en 30 secondes ?",
    "Ton parcours en 3 temps : avant (le problème ou la situation), le déclic (le moment où tout a changé), maintenant (ce que tu fais et pourquoi).",
    "Quel résultat concret tes client·es obtiennent ? Un chiffre, un avant/après, un témoignage : quelque chose de tangible.",
    "Quelle est ta conviction profonde sur ton métier ? Le truc qui te fait lever le matin même quand c'est dur.",
    "Qu'est-ce que tu veux que la personne FASSE après avoir lu ton résumé ? Te contacter, visiter ton site, s'abonner à ta newsletter ?",
  ],
  strategie: [
    "Combien de posts LinkedIn tu publies par mois actuellement ? Et c'est quoi ton objectif réaliste ?",
    "De quoi tu parles sur LinkedIn ? C'est les mêmes sujets qu'Instagram ou c'est différent ?",
    "Quel type de post LinkedIn tu préfères écrire : récits personnels, conseils pratiques, points de vue tranchés, ou actualités commentées ?",
  ],
};

const MODULE_LABELS: Record<string, string> = {
  profil: "Profil",
  resume: "Résumé (À propos)",
  strategie: "Stratégie de contenu",
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
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { phase, module, answers, workspace_id } = body;

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

    const [ctx, auditRes] = await Promise.all([
      getUserContext(sbService, user.id, workspace_id),
      sbService.from("linkedin_audit")
        .select("score_global, resume")
        .eq(filterCol, filterVal)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const audit = auditRes.data;
    const contextText = formatContextForAI(ctx, { ...CONTEXT_PRESETS.audit, includeAudit: true });
    const moduleLabel = MODULE_LABELS[module] || module;

    // ── PHASE QUESTIONS ──
    if (phase === "questions") {
      const baseQuestions = MODULE_QUESTIONS[module] || MODULE_QUESTIONS.profil;

      const systemPrompt = `Tu es une consultante LinkedIn experte. Tu accompagnes des solopreneuses et entrepreneures.

CONTEXTE BRANDING :
${contextText}

DERNIER AUDIT LINKEDIN :
${audit ? `Score global : ${audit.score_global ?? "?"}\nRésumé : ${audit.resume || ""}` : "Pas d'audit disponible"}

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

      const raw = await callAnthropicSimple(getModelForAction("coaching_light"), systemPrompt, "Génère les questions personnalisées.", 0.4, 2000);

      let result;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON");
        result = JSON.parse(jsonMatch[0]);
      } catch {
        result = {
          questions: baseQuestions.map((q, i) => ({ numero: i + 1, question: q, placeholder: "" })),
          intro: "On va optimiser ensemble ta section " + moduleLabel + " sur LinkedIn !",
        };
      }

      await logUsage(user.id, "suggestion", "linkedin_coaching_questions");
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── PHASE DIAGNOSTIC ──
    if (phase === "diagnostic") {
      if (!answers || !Array.isArray(answers) || answers.length === 0) {
        return new Response(JSON.stringify({ error: "Réponses requises" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const moduleSpecificInstructions: Record<string, string> = {
        profil: `Pour le module 'profil' :
- Génère 3 titres LinkedIn optimisés au format "Ce que tu fais | Pour qui | Résultat".
- Donne des recommandations personnalisées pour la photo et la bannière.
- Proposals avec field: "linkedin_title_1", "linkedin_title_2", "linkedin_title_3" avec chaque titre en value.
- Ajoute une proposal field: "photo_banner_tips" avec les recommandations photo/bannière.`,

        resume: `Pour le module 'resume' :
- Génère 3 versions du résumé LinkedIn en utilisant le branding (ton, storytelling, proposition de valeur) :
  1. Version courte (~100 mots) : percutante, va droit au but
  2. Version moyenne (~200 mots) : équilibrée, storytelling + expertise
  3. Version longue (~300 mots) : complète, parcours + vision + CTA
- Chaque version doit commencer par une accroche forte (pas "Bonjour, je suis…").
- Proposals avec field: "linkedin_resume_short", "linkedin_resume_medium", "linkedin_resume_long".`,

        strategie: `Pour le module 'strategie' :
- Génère un mini plan éditorial LinkedIn :
  - 3 piliers de contenu adaptés à son activité
  - Une fréquence de publication réaliste
  - 2 exemples d'accroches par pilier
- Proposals avec field: "linkedin_strategy" contenant le plan complet formaté en texte lisible.
- Ajoute une proposal field: "linkedin_hooks" avec les 6 accroches listées.`,
      };

      const systemPrompt = `Tu es une consultante LinkedIn experte. Tu accompagnes des solopreneuses et entrepreneures. À partir des réponses de l'utilisatrice, génère un diagnostic actionnable.

CONTEXTE BRANDING :
${contextText}

DERNIER AUDIT LINKEDIN :
${audit ? `Score global : ${audit.score_global ?? "?"}` : "Pas d'audit disponible"}

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

      const raw = await callAnthropicSimple(getModelForAction("coaching_light"), systemPrompt, "Génère ton diagnostic et tes propositions.", 0.5, 4000);

      let result;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON");
        result = JSON.parse(jsonMatch[0]);
      } catch {
        console.error("Failed to parse linkedin coaching diagnostic:", raw);
        return new Response(JSON.stringify({ error: "Erreur lors de l'analyse. Réessaie." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await logUsage(user.id, "content", "linkedin_coaching_diagnostic");
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Phase inconnue. Utilise 'questions' ou 'diagnostic'." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("linkedin-coaching error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
