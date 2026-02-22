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

    const { objective, price_range, time_available, face_cam, subject, is_launch, branding_context, type, pre_gen_answers } = await req.json();

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
      const systemPrompt = buildDailyPrompt(branding_context);
      const response = await callAI(LOVABLE_API_KEY, systemPrompt, "Génère mes 5 stories du quotidien.");
      return new Response(JSON.stringify({ content: response }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Main generation
    const systemPrompt = buildMainPrompt({ objective, price_range, time_available, face_cam, subject, is_launch, branding_context, gardeFouAlerte, pre_gen_answers });
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

// ───────────────────────────────────────────────
// PROMPTS
// ───────────────────────────────────────────────

function buildDailyPrompt(brandingContext: string): string {
  return `Tu es experte en création de stories Instagram pour des solopreneuses créatives et engagées.

ANTI-SLOP : JAMAIS de "Dans un monde où", "N'hésitez pas", "Plongeons dans", "En outre", "Cela étant dit", "Force est de constater", "Il convient de", tirets cadratins. SI DÉTECTÉ, RÉÉCRIRE.

${brandingContext || ""}

Génère 5 stories du quotidien personnalisées. Aujourd'hui on est ${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}.

Les 5 stories suivent cette structure :
1. 🌅 L'ouverture : ce qu'elle fait / sa journée (connexion)
2. ☀️ L'observation : un truc lié à son expertise (éducation)
3. ☀️ La question : demander l'avis (engagement + sticker)
4. 🌙 Le conseil : un tip actionnable en 1 story (valeur)
5. 🌙 La clôture : mot de fin ou teaser demain (continuité)

HOOK STORY 1 — RÈGLES :
La story 1 décide de TOUT. 24% de l'audience part après.
Le hook doit arrêter le swipe en 1-2 secondes.
- Hook principal : 8-15 mots max, 1 phrase, pas 2
- Doit créer l'identification OU la curiosité immédiate

Réponds en JSON strict :
{
  "structure_type": "quotidien",
  "structure_label": "5 stories du quotidien",
  "total_stories": 5,
  "estimated_time": "10 min",
  "stickers_used": ["..."],
  "garde_fou_alerte": null,
  "personal_tip": null,
  "stories": [
    {
      "number": 1,
      "timing": "matin",
      "timing_emoji": "🌅",
      "role": "Ouverture",
      "format": "texte_fond",
      "format_label": "📝 Texte sur fond coloré",
      "text": "...",
      "hook_options": null,
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
}

interface MainPromptParams {
  objective: string;
  price_range?: string;
  time_available: string;
  face_cam: string;
  subject?: string;
  is_launch: boolean;
  branding_context?: string;
  gardeFouAlerte: string | null;
  pre_gen_answers?: { vecu?: string; energy?: string; message_cle?: string };
}

function buildMainPrompt(p: MainPromptParams): string {
  const priceBlock = p.objective === "vente" && p.price_range ? `\n- Gamme de prix : ${p.price_range}` : "";
  const launchBlock = p.is_launch ? "\n- Phase : LANCEMENT (orienter vers vente + preuve sociale)" : "\n- Phase : croisière";

  // Pre-gen answers integration
  let preGenBlock = "";
  if (p.pre_gen_answers && (p.pre_gen_answers.vecu || p.pre_gen_answers.energy || p.pre_gen_answers.message_cle)) {
    preGenBlock = `

L'UTILISATRICE A PARTAGÉ :
${p.pre_gen_answers.vecu ? `- Vécu récent : "${p.pre_gen_answers.vecu}"` : ""}
${p.pre_gen_answers.energy ? `- Énergie souhaitée : ${p.pre_gen_answers.energy}` : ""}
${p.pre_gen_answers.message_cle ? `- Message clé : "${p.pre_gen_answers.message_cle}"` : ""}

INTÈGRE dans la séquence stories :
- Le vécu récent est PARFAIT pour la story 1 (hook) ou la story 2 (identification). C'est du contenu ultra-authentique.
- L'énergie guide le ton de TOUTE la séquence :
  🔥 Punchy = phrases courtes, affirmations, rythme rapide
  🫶 Intime = face cam, ton doux, confidence
  📚 Pédago = structure claire, tips concrets
  😄 Drôle = auto-dérision, observations du quotidien
  😤 Coup de gueule doux = position affirmée mais bienveillante
- Le message clé doit apparaître dans la story 4 ou 5 (le climax ou la conclusion), formulé dans ses mots à elle
- NE CHANGE PAS le sens de ses mots, juste la structure si nécessaire
`;
  } else {
    preGenBlock = `

L'utilisatrice n'a pas fourni d'éléments personnels.
Génère normalement. Ajoute un champ "personal_tip" dans le JSON :
"Tes stories seront 10x plus engageantes avec un truc vécu. Ajoute un moment perso dans la story 1 ou 2 avant de publier."
`;
  }

  return `Tu es experte en création de stories Instagram pour des solopreneuses créatives et engagées (mode, artisanat, bien-être, design, coaching).

ANTI-SLOP : JAMAIS de "Dans un monde où", "N'hésitez pas", "Plongeons dans", "En outre", "Cela étant dit", "Force est de constater", "Il convient de", tirets cadratins (—). SI DÉTECTÉ, RÉÉCRIRE.

AVANT DE RÉDIGER, RÉFLÉCHIS EN INTERNE (ne montre PAS) : Quel est le problème ? Quelle émotion ? Quelle accroche est la MEILLEURE ? Mon output a-t-il du slop ?

ANALOGIES VISUELLES :
Intègre au moins 1 analogie visuelle concrète dans la séquence.
L'analogie doit être du QUOTIDIEN (cuisine, maison, route, nature, objets courants).
Pas d'analogies abstraites. L'audience doit pouvoir "voir" l'image mentalement.

${p.branding_context || ""}
${preGenBlock}

DEMANDE :
- Objectif : ${p.objective}${priceBlock}
- Temps disponible : ${p.time_available}
- Face cam : ${p.face_cam}
- Sujet : ${p.subject || "au choix selon la ligne éditoriale"}${launchBlock}

STRUCTURES DISPONIBLES (choisis la plus adaptée) :
- journal_bord : Connexion, 3-5 stories
- probleme_solution : Éducation, 4-6 stories
- storytime : Connexion, 5-8 stories
- vente_douce : Vente, 5-7 stories
- faq_live : Vente/Éducation, 5-8 stories
- build_in_public : Connexion, 3-5 stories
- micro_masterclass : Éducation, 6-10 stories
- teasing : Amplification, 3-5 stories

CORRESPONDANCE objectif x temps :
- Connexion + 5min → journal_bord | + 15min → build_in_public | + 30min → storytime
- Éducation + 5min → 1-2 stories astuce | + 15min → probleme_solution | + 30min → micro_masterclass
- Vente + 5min → 1-2 stories mention | + 15min → vente_douce | + 30min → séquence complète 7-10
- Engagement + 5min → sondage+question 2 stories | + 15min → quiz+question 3-5
- Amplification + 5min → repartage+question 2 | + 15min → teasing 3-5

${p.objective === "vente" ? getVenteInstructions(p.price_range) : ""}

HOOK STORY 1 — RÈGLES :

La story 1 décide de TOUT. 24% de l'audience part après.
Le hook doit arrêter le swipe en 1-2 secondes.

SELON LE FORMAT DE LA STORY 1 :

Si format = texte sur fond :
- Hook principal : 8-15 mots max
- 1 phrase. Pas 2.
- Doit créer l'identification OU la curiosité immédiate
- Le sondage/sticker complète le hook (pas l'inverse)

Si format = face cam :
- Hook oral : 5-10 mots max
- Dicible en 2 secondes sans reprendre sa respiration
- Ton conversationnel : "Bon, faut qu'on parle de..."
- Sous-titres OBLIGATOIRES (60-80% regardent sans le son)

Si format = visuel/photo :
- Text overlay : 3-8 mots en gros
- L'image fait le travail visuel, le texte fait l'accroche

POUR LA STORY 1, GÉNÈRE 2 OPTIONS DE HOOK dans le champ "hook_options" :
- Option A : hook court (le plus percutant, 5-10 mots)
- Option B : hook développé (pour celles qui préfèrent contextualiser, 10-15 mots)

TYPES DE HOOKS STORIES :
1. Interpellation directe : "Toi qui postes sans stratégie."
2. Confidence : "Faut que je te parle d'un truc."
3. Question qui pique : "Tu sais pourquoi personne like ?"
4. Constat choc : "3 likes et ta mère."
5. Teaser : "Ce que j'ai appris la semaine dernière."
6. Analogie flash : "Ta com' ressemble à un CV sans photo."

GARDE-FOUS OBLIGATOIRES :
1. Max 10 stories par séquence
2. TOUJOURS au moins 1 sticker interactif (DM>Question>Sondage>Slider>Lien)
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
  "garde_fou_alerte": ${p.gardeFouAlerte ? `"${p.gardeFouAlerte}"` : "null"},
  "personal_tip": null,
  "stories": [
    {
      "number": 1,
      "timing": "matin",
      "timing_emoji": "🌅",
      "role": "Hook",
      "format": "texte_fond",
      "format_label": "📝 Texte sur fond coloré",
      "text": "...",
      "hook_options": {
        "option_a": {
          "text": "[hook court 5-10 mots]",
          "word_count": 7,
          "label": "Court et percutant"
        },
        "option_b": {
          "text": "[hook développé 10-15 mots]",
          "word_count": 13,
          "label": "Contextualisé"
        }
      },
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

IMPORTANT :
- Seule la story 1 a "hook_options". Les autres stories ont "hook_options": null
- Le champ "text" de la story 1 contient le hook option_a par défaut
- Pas de markdown dans les valeurs JSON

Réponds UNIQUEMENT avec le JSON, rien d'autre.`;
}

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
      model: "google/gemini-2.5-flash",
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
