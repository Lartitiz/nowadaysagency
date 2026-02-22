import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { objective, price_range, time_available, face_cam, subject, is_launch, branding_context, type } = await req.json();

    // Check recent sale sequences for garde-fou
    let gardeFouAlerte: string | null = null;
    if (objective === "vente") {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("stories_sequences")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("objective", "vente")
        .gte("created_at", sevenDaysAgo);
      if ((count ?? 0) >= 3) {
        gardeFouAlerte = "⚠️ Tes stories récentes sont très orientées vente. Reviens à de la connexion ou de l'éducation pour maintenir la confiance. Ratio sain : 80% connexion/éducation, 20% vente.";
      }
    }

    // Quick daily stories
    if (type === "daily") {
      const systemPrompt = `Tu es experte en création de stories Instagram pour des solopreneuses créatives et engagées.

ANTI-SLOP : JAMAIS de "Dans un monde où", "N'hésitez pas", "Plongeons dans", "En outre", "Cela étant dit", "Force est de constater", "Il convient de", tirets cadratins. SI DÉTECTÉ, RÉÉCRIRE.

${branding_context || ""}

Génère 5 stories du quotidien personnalisées. Aujourd'hui on est ${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}.

Les 5 stories suivent cette structure :
1. 🌅 L'ouverture : ce qu'elle fait / sa journée (connexion)
2. ☀️ L'observation : un truc lié à son expertise (éducation)
3. ☀️ La question : demander l'avis (engagement + sticker)
4. 🌙 Le conseil : un tip actionnable en 1 story (valeur)
5. 🌙 La clôture : mot de fin ou teaser demain (continuité)

Réponds en JSON strict :
{
  "structure_type": "quotidien",
  "structure_label": "5 stories du quotidien",
  "total_stories": 5,
  "estimated_time": "10 min",
  "stickers_used": ["..."],
  "garde_fou_alerte": null,
  "stories": [
    {
      "number": 1,
      "timing": "matin",
      "timing_emoji": "🌅",
      "role": "Ouverture",
      "format": "texte_fond",
      "format_label": "📝 Texte sur fond coloré",
      "text": "...",
      "sticker": null,
      "tip": "...",
      "face_cam": false,
      "sous_titres_needed": false
    }
  ]
}

RÈGLES :
- Ton oral, décontracté, comme un message vocal à une amie
- Écriture inclusive point médian
- Au moins 1 sticker interactif (sondage ou question)
- Hook fort sur la story 1
- JAMAIS de jargon marketing
- Réponds UNIQUEMENT avec le JSON`;

      const response = await callAI(LOVABLE_API_KEY, systemPrompt, "Génère mes 5 stories du quotidien.");
      return new Response(JSON.stringify({ content: response }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Main generation
    const priceBlock = objective === "vente" && price_range ? `\n- Gamme de prix : ${price_range}` : "";
    const launchBlock = is_launch ? "\n- Phase : LANCEMENT (orienter vers vente + preuve sociale)" : "\n- Phase : croisière";

    const systemPrompt = `Tu es experte en création de stories Instagram pour des solopreneuses créatives et engagées (mode, artisanat, bien-être, design, coaching).

ANTI-SLOP : JAMAIS de "Dans un monde où", "N'hésitez pas", "Plongeons dans", "En outre", "Cela étant dit", "Force est de constater", "Il convient de", tirets cadratins (—). SI DÉTECTÉ, RÉÉCRIRE.

AVANT DE RÉDIGER, RÉFLÉCHIS EN INTERNE (ne montre PAS) : Quel est le problème ? Quelle émotion ? Quelle accroche est la MEILLEURE ? Mon output a-t-il du slop ?

${branding_context || ""}

DEMANDE :
- Objectif : ${objective}${priceBlock}
- Temps disponible : ${time_available}
- Face cam : ${face_cam}
- Sujet : ${subject || "au choix selon la ligne éditoriale"}${launchBlock}

STRUCTURES DISPONIBLES (choisis la plus adaptée) :
- journal_bord : Connexion, 3-5 stories
- probleme_solution : Éducation, 4-6 stories
- storytime : Connexion, 5-8 stories
- vente_douce : Vente, 5-7 stories
- faq_live : Vente/Éducation, 5-8 stories
- build_in_public : Connexion, 3-5 stories
- micro_masterclass : Éducation, 6-10 stories
- teasing : Amplification, 3-5 stories

CORRESPONDANCE objectif × temps :
- Connexion + 5min → journal_bord | + 15min → build_in_public | + 30min → storytime
- Éducation + 5min → 1-2 stories astuce | + 15min → probleme_solution | + 30min → micro_masterclass
- Vente + 5min → 1-2 stories mention | + 15min → vente_douce | + 30min → séquence complète 7-10
- Engagement + 5min → sondage+question 2 stories | + 15min → quiz+question 3-5
- Amplification + 5min → repartage+question 2 | + 15min → teasing 3-5

${objective === "vente" ? getVenteInstructions(price_range) : ""}

GARDE-FOUS OBLIGATOIRES :
1. Max 10 stories par séquence
2. TOUJOURS au moins 1 sticker interactif (DM⭐⭐⭐⭐, sondage⭐⭐⭐, slider⭐⭐, lien⭐)
3. Sticker lien JAMAIS sur story 1 ou 2, toujours avant-dernière ou dernière
4. JAMAIS de CTA agressif. Toujours en mode permission : "si ça te parle", "écris-moi"
5. Si face cam → TOUJOURS mentionner sous-titres
6. Story 1 = hook fort (24% de l'audience part après)
7. Étaler les stories : matin/midi/soir
8. Ton oral, décontracté, comme un message vocal à une amie
9. Écriture inclusive point médian
10. Expressions naturelles : "bon", "en vrai", "franchement", "le truc c'est que"
11. Apartés entre parenthèses : "(oui, même toi)", "(pas besoin de se ruiner)"
12. JAMAIS de jargon marketing
13. JAMAIS de tiret cadratin (—)

Réponds en JSON strict :
{
  "structure_type": "...",
  "structure_label": "...",
  "total_stories": N,
  "estimated_time": "X min",
  "stickers_used": ["sondage", "question_ouverte"],
  "garde_fou_alerte": ${gardeFouAlerte ? `"${gardeFouAlerte}"` : "null"},
  "stories": [
    {
      "number": 1,
      "timing": "matin",
      "timing_emoji": "🌅",
      "role": "Hook",
      "format": "texte_fond",
      "format_label": "📝 Texte sur fond coloré",
      "text": "...",
      "sticker": {
        "type": "sondage",
        "label": "Sondage",
        "options": ["Oui", "Non"],
        "placement": "bas de la story"
      },
      "tip": "...",
      "face_cam": false,
      "sous_titres_needed": false
    }
  ]
}

Réponds UNIQUEMENT avec le JSON, rien d'autre.`;

    const response = await callAI(LOVABLE_API_KEY, systemPrompt, "Génère ma séquence stories.");
    return new Response(JSON.stringify({ content: response }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("stories-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getVenteInstructions(priceRange?: string): string {
  const instructions: Record<string, string> = {
    petit: `SÉQUENCE PETIT PRIX (<100€) : 3-4 stories
1. Story contexte : ton décontracté, "j'ai créé un truc"
2. Story offre : visuel + bénéfice principal + prix
3. Story preuve : screenshot témoignage
4. Story CTA : "Écris [MOT] en DM"`,
    moyen: `SÉQUENCE MOYEN (100-500€) : 5-7 stories
1. Story émotion : face cam intime, "faut que je te parle"
2. Story problème : identification + sondage
3. Story solution : concept clé en face cam
4. Story offre : visuel + prix + dates
5. Story preuve : témoignage
6. Story interaction : sondage "tu veux les détails en DM ?"
7. Story CTA : "Écris [MOT] en DM"`,
    premium: `SÉQUENCE PREMIUM (500€+) : 7-10 stories
1. Hook : "j'ai un truc à te dire"
2-3. Contexte perso : pourquoi tu as créé cette offre
4. Problème : identification forte
5-6. Transformation : before/after cliente
7. Offre : format, pour qui
8. Pratique : prix, dates, modalités
9. Objection principale : face cam douce
10. CTA : "écris-moi pour en parler"`,
    physique: `SÉQUENCE PRODUIT PHYSIQUE : 4-6 stories
1. Teasing : gros plan détail
2. Révélation : produit entier
3. Making-of : process de création
4. Details : prix, matériaux, dispo
5. Preuve : photo cliente OU avis
6. CTA : lien boutique`,
    gratuit: `SÉQUENCE FREEBIE : 3-4 stories
1. Problème : "si tu galères avec [sujet]"
2. Solution : "j'ai créé un [type] gratuit qui [bénéfice]"
3. Preuve : capture d'écran + résultat
4. CTA : "Écris [MOT] en DM"`,
  };
  return instructions[priceRange || ""] || "";
}

async function callAI(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Trop de requêtes, réessaie dans un moment.");
    if (response.status === 402) throw new Error("Crédits épuisés, ajoute des crédits pour continuer.");
    const t = await response.text();
    console.error("AI gateway error:", response.status, t);
    throw new Error("Erreur du service IA");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}
