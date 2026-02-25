import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { LINKEDIN_PRINCIPLES } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic, getDefaultModel } from "../_shared/anthropic.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Branding data now fetched via getUserContext

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Anthropic API key checked in shared helper

    // Check plan limits (audit type)
    const quotaCheck = await checkQuota(user.id, "audit");
    if (!quotaCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: quotaCheck.message, remaining: 0, category: quotaCheck.reason }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { workspace_id } = body;
    const ctx = await getUserContext(supabase, user.id, workspace_id, "linkedin");
    const contextStr = formatContextForAI(ctx, CONTEXT_PRESETS.linkedinAudit);

    // Build screenshot content array for multimodal
    const contentParts: any[] = [];
    const screenshots = body.screenshots || [];
    for (const s of screenshots) {
      if (s.url) {
        contentParts.push({ type: "image_url", image_url: { url: s.url } });
      }
    }

    const systemPrompt = `${LINKEDIN_PRINCIPLES}

Tu es experte en optimisation de profils LinkedIn pour des solopreneuses créatives et engagées (mode, artisanat, bien-être, design, coaching).

DONNÉES DE RÉFÉRENCE LINKEDIN 2025-2026 :

PONDÉRATION PAR SECTION :

Profil : 30% du score total
- Photo (5 pts) : professionnelle, visage visible 60% du cadre, fond clair. Jusqu'à 14x plus de vues.
- Bannière (5 pts) : communique le positionnement, pas vide, dimensions 1584×396
- Titre (10 pts) : contient mots-clés SEO, formule valeur, max 220 car., PAS de buzzwords vides ("passionné", "expert en tout")
- URL (3 pts) : personnalisée, sans chiffres aléatoires
- Résumé (7 pts) : hook dans les 265 premiers car., 5 éléments (hook/passion/parcours/offre/CTA)

Contenu : 35% du score total
- Fréquence (8 pts) : 2-4 posts/semaine = optimal. < 1/semaine = quasi-invisible
- Qualité accroches (10 pts) : 210 premiers car. décisifs, doivent arrêter le scroll
- Longueur/format (7 pts) : sweet spot 1300-1900 car., diversité de formats
- Hashtags (3 pts) : 0-2 max, de niche (les hashtags génériques ne servent plus)
- Diversité formats (7 pts) : texte + carrousels PDF (engagement 3x) + vidéo native

Stratégie : 20% du score total
- Cohérence thématique (8 pts) : autorité sur un sujet > publier sur tout
- Timing (4 pts) : mardi-jeudi, 8h-9h ou 14h-15h
- Organisation (4 pts) : calendrier éditorial > "quand j'ai le temps"
- Recyclage cross-plateforme (4 pts) : adapter le ton, pas copier-coller

Réseau : 15% du score total
- Qualité connexions (5 pts) : pertinentes dans le secteur, seuil symbolique 500+
- Networking actif (5 pts) : invitations ciblées avec message perso
- Recommandations (5 pts) : 3-5 minimum, diversifiées (preuve sociale ultra-puissante en B2B)

DONNÉES CLÉS POUR L'ANALYSE :
- Profil personnel : 561% plus de portée que page entreprise
- Commentaires : 8x plus puissants que les likes pour l'algorithme
- Liens externes dans un post : -60% de distribution
- Contenu IA détectable (non humanisé) : -43% d'engagement
- Golden Hour (60-90 min après publication) : engagement x3 si bons signaux
- Dwell time (temps passé à lire) : signal silencieux mais puissant pour l'algo
- Le mode Créateur donne accès aux hashtags de suivi

RÈGLES DE SCORING :
- Score par élément : /100
- Status : "good" si > 70, "warning" si 40-70, "missing" si < 40
- Feedback : TOUJOURS commencer par ce qui est bien avant ce qui manque
- Recommendation : action concrète avec lien vers la page de l'outil

DONNÉES DE L'AUDIT :
- URL profil : "${body.profileUrl || "non fourni"}"
- Objectif principal : ${body.objective || "non précisé"}
- Rythme actuel : ${body.currentRhythm || "non précisé"}
- Vues moyennes : ${body.avgViews || "non précisé"}
- Nombre de connexions : ${body.connectionsCount || "non précisé"}
- Type de connexions : ${JSON.stringify(body.connectionTypes || [])}
- Politique d'acceptation : ${body.acceptancePolicy || "non précisé"}
- Demandes proactives : ${body.proactiveRequests || "non précisé"}
- Recommandations : ${body.recommendationsCount || "non précisé"}
- Type de contenu : ${JSON.stringify(body.contentTypes || [])}
- Type d'engagement : ${body.engagementType || "non précisé"}
- Style d'accroche : ${body.accrochestyle || "non précisé"}
- Recyclage cross-canal : ${body.recycling || "non précisé"}
- Organisation publication : ${body.publicationOrg || "non précisé"}
- Demandes entrantes : ${body.inboundRequests || "non précisé"}

${contextStr}

TON : direct, bienveillant, actionnable. Pas de jargon LinkedIn.

GRILLE DE SCORING GRANULAIRE :

HEADLINE (score /25) :
- Impact des 80 premiers caractères (/8) : les 80 premiers caractères sont visibles dans les commentaires. Ils doivent être percutants.
- Présence de mots-clés recherchables (/5) : l'algorithme LinkedIn indexe le headline. Y a-t-il des termes que sa cible rechercherait ?
- Structure claire (/5) : utilisation de séparateurs (│ ou ·), lisibilité, pas de liste de buzzwords
- Zéro buzzwords vides (/4) : pas de "passionnée", "innovante", "experte en", "spécialiste de"
- Proposition de valeur visible (/3) : en 1 seconde, on comprend ce qu'elle fait et pour qui

ABOUT / RÉSUMÉ (score /25) :
- Hook des 3 premières lignes (/8) : avant le clic "voir plus", ça accroche ou c'est plat ?
- Storytelling ou structure narrative (/5) : il y a un fil conducteur, pas juste une liste
- CTA clair (/4) : le résumé dit quoi faire ensuite (contacter, visiter, suivre)
- Preuve sociale ou crédibilité (/4) : chiffres, témoignages, expérience, enseignement
- Ton cohérent avec le branding (/4) : le ton LinkedIn correspond au branding déclaré

Intègre ces scores granulaires dans le JSON de retour sous la clé "granular_scores".

Réponds UNIQUEMENT en JSON sans backticks :
{
  "score_global": 45,
  "sections": {
    "profil": {
      "score": 52,
      "elements": [
        {
          "name": "Photo de profil",
          "score": 8,
          "max_score": 10,
          "status": "good",
          "feedback": "...",
          "recommendation": "..."
        }
      ]
    },
    "contenu": {
      "score": 38,
      "elements": [...]
    },
    "strategie": {
      "score": 41,
      "elements": [...]
    },
    "reseau": {
      "score": 49,
      "elements": [...]
    }
  },
  "granular_scores": {
    "headline": {
      "impact_80_chars": { "score": 6, "max": 8, "feedback": "..." },
      "keywords": { "score": 3, "max": 5, "feedback": "..." },
      "structure": { "score": 4, "max": 5, "feedback": "..." },
      "no_buzzwords": { "score": 2, "max": 4, "feedback": "..." },
      "value_prop": { "score": 2, "max": 3, "feedback": "..." },
      "total": 17
    },
    "about": {
      "hook_3_lines": { "score": 5, "max": 8, "feedback": "..." },
      "storytelling": { "score": 3, "max": 5, "feedback": "..." },
      "cta": { "score": 2, "max": 4, "feedback": "..." },
      "social_proof": { "score": 3, "max": 4, "feedback": "..." },
      "tone_coherence": { "score": 3, "max": 4, "feedback": "..." },
      "total": 16
    }
  },
  "top_5_priorities": [
    {
      "rank": 1,
      "title": "...",
      "impact": "high",
      "why": "...",
      "action_label": "...",
      "action_route": "/linkedin/profil"
    }
  ]
}`;

    const userContent: any[] = [
      { type: "text", text: "Analyse mon profil LinkedIn en détail avec les screenshots fournis et les données ci-dessus." },
      ...contentParts,
    ];

    // Note: Anthropic doesn't support image_url in the same way as OpenAI
    // For multimodal with screenshots, we include image data in message content
    const content = await callAnthropic({
      model: getDefaultModel(),
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      temperature: 0.7,
    });

    await logUsage(user.id, "audit", "audit_linkedin");

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("linkedin-audit-ai error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
