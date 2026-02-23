import { callAnthropicSimple } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non autorisé");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Non autorisé");

    // Admin check
    if (user.email !== "laetitia@nowadaysagency.com") {
      throw new Error("Accès réservé à l'admin");
    }

    // Quota check
    const quota = await checkQuota(user.id, "content");
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { prenom, activite, instagram, site_web, probleme } =
      await req.json();

    if (!prenom || !activite) {
      return new Response(
        JSON.stringify({ error: "Prénom et activité obligatoires" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const systemPrompt = `Tu es une experte en communication pour solopreneuses créatives. À partir des infos fournies, génère un branding complet et crédible pour cette personne. Réponds UNIQUEMENT en JSON valide, sans commentaires ni markdown.`;

    const userPrompt = `INFOS FOURNIES :
- Prénom : ${prenom}
- Activité : ${activite}
${instagram ? `- Instagram : ${instagram}` : ""}
${site_web ? `- Site web : ${site_web}` : ""}
${probleme ? `- Problème : ${probleme}` : ""}

GÉNÈRE CE JSON EXACTEMENT :

{
  "profile": {
    "first_name": "${prenom}",
    "activity": "${activite}",
    "activity_type": "type d'activité"
  },
  "branding": {
    "positioning": "phrase de positionnement en 1-2 lignes",
    "mission": "sa mission en 1 phrase",
    "unique_proposition": "ce qui la rend unique en 3-4 phrases",
    "values": ["Valeur1", "Valeur2", "Valeur3", "Valeur4"]
  },
  "persona": {
    "prenom": "Prénom de la cible",
    "age": "tranche d'âge",
    "metier": "métier de la cible",
    "situation": "sa situation",
    "ca": "CA estimé",
    "frustrations": "ses frustrations",
    "desires": "ce qu'elle veut",
    "phrase_signature": "une citation typique"
  },
  "tone": {
    "keywords": ["mot1", "mot2", "mot3", "mot4"],
    "description": "description du ton en 2-3 phrases",
    "avoid": ["à éviter 1", "à éviter 2"]
  },
  "offers": [
    {"name": "Nom de l'offre", "price": "prix", "description": "description courte"},
    {"name": "Offre 2", "price": "prix", "description": "description"}
  ],
  "story_summary": "résumé de son histoire en 3-4 phrases",
  "editorial": {
    "pillars": ["Pilier 1", "Pilier 2", "Pilier 3", "Pilier 4"],
    "frequency": "3 posts/semaine"
  },
  "calendar_posts": [
    {"title": "titre du post", "format": "carousel", "objective": "visibility", "planned_day": "monday"},
    {"title": "titre 2", "format": "reel", "objective": "engagement", "planned_day": "wednesday"},
    {"title": "titre 3", "format": "post", "objective": "conversion", "planned_day": "friday"},
    {"title": "titre 4", "format": "story", "objective": "nurturing", "planned_day": "tuesday"},
    {"title": "titre 5", "format": "carousel", "objective": "authority", "planned_day": "thursday"}
  ],
  "contacts": [
    {"name": "Nom du compte", "type": "network", "note": "pourquoi ce contact"},
    {"name": "Compte 2", "type": "prospect", "note": "raison"},
    {"name": "Compte 3", "type": "partner", "note": "raison"}
  ],
  "audit": {
    "score": 68,
    "points_forts": [
      {"titre": "Point fort 1", "detail": "explication"},
      {"titre": "Point fort 2", "detail": "explication"}
    ],
    "points_faibles": [
      {"titre": "Faiblesse 1", "detail": "explication", "priorite": "haute", "module": "persona"},
      {"titre": "Faiblesse 2", "detail": "explication", "priorite": "moyenne", "module": "tone"},
      {"titre": "Faiblesse 3", "detail": "explication", "priorite": "haute", "module": "editorial"}
    ],
    "plan_action": [
      {"titre": "Action 1", "temps": "20 min", "module": "persona"},
      {"titre": "Action 2", "temps": "15 min", "module": "tone"},
      {"titre": "Action 3", "temps": "30 min", "module": "editorial"}
    ]
  }
}

RÈGLES :
- Tout doit être crédible et spécifique à l'activité "${activite}"
- Les offres doivent avoir des prix réalistes pour ce marché
- La cible doit correspondre au marché de cette activité
- L'audit doit pointer de vrais problèmes courants pour ce type d'activité
- Le calendrier doit avoir 5 posts variés
- Les contacts doivent être des comptes crédibles dans la même niche
- JSON VALIDE uniquement, pas de commentaires`;

    const raw = await callAnthropicSimple(
      "claude-sonnet-4-5-20250929",
      systemPrompt,
      userPrompt,
      0.8,
      8192
    );

    // Parse JSON from response
    let generated_data;
    try {
      // Try to extract JSON from possible markdown wrapping
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      generated_data = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr, "Raw:", raw.substring(0, 500));
      throw new Error("Erreur de parsing de la réponse IA");
    }

    // Log usage
    await logUsage(user.id, "content", "demo_generation", null, "claude-sonnet-4-5-20250929");

    return new Response(
      JSON.stringify({ generated_data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("generate-demo error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erreur interne" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
