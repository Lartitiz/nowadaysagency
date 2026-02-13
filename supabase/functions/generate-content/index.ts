import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { type, format, sujet, profile } = await req.json();

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "suggest") {
      systemPrompt = `Tu es un·e expert·e en stratégie de contenu Instagram pour des solopreneuses éthiques.

Profil de l'utilisatrice :
- Activité : ${profile.activite}
- Cible : ${profile.cible}
- Piliers de contenu : ${(profile.piliers || []).join(", ")}

Propose exactement 5 idées de sujets de posts Instagram, adaptées à son activité et sa cible. Chaque idée doit être formulée comme un sujet concret et spécifique (pas vague), en une phrase.

Varie les angles : un sujet éducatif, un storytelling, un sujet engagé, un sujet pratique, un sujet inspirant.

Réponds uniquement avec les 5 sujets, un par ligne, sans numérotation, sans tiret, sans explication.`;
      userPrompt = "Propose-moi 5 sujets de posts.";
    } else {
      systemPrompt = `Tu es un·e expert·e en création de contenu Instagram. Tu rédiges un post (caption) pour une solopreneuse.

CONTEXTE SUR L'UTILISATRICE :
- Prénom : ${profile.prenom}
- Activité : ${profile.activite}
- Type : ${profile.type_activite}
- Cible : ${profile.cible}
- Problème qu'elle résout : ${profile.probleme_principal}
- Piliers de contenu : ${(profile.piliers || []).join(", ")}
- Ton souhaité : ${(profile.tons || []).join(", ")}

FORMAT DEMANDÉ : ${format}
SUJET : ${sujet}

CONSIGNES DE RÉDACTION STRICTES :

TON ET STYLE :
- Direct et chaleureux, comme une discussion entre ami·es
- Oral assumé : utiliser des expressions comme "bon", "en vrai", "franchement", "j'avoue", "le truc c'est que", "du coup"
- Des apartés entre parenthèses qui cassent le rythme et ajoutent de la personnalité
- Rythmé par contrastes : phrases longues pour dérouler + phrases courtes qui claquent
- Émotionnel sans pathos : vulnérabilité assumée mais toujours dans l'enseignement
- Une pointe d'humour et d'auto-dérision
- Engagé·e et parfois un peu pushy, mais jamais donneur·se de leçons
- Tutoiement systématique
- Écriture inclusive avec point médian (ex : créateur·ices, entrepreneur·es)
- JAMAIS de tiret cadratin, utiliser : ou ;

CE QU'IL FAUT ÉVITER :
- Les phrases artificiellement coupées pour "faire court"
- Le ton corporate ou les formules toutes faites
- Les promesses exagérées type "10K abonnés en 30 jours"
- Le jargon marketing : ROI, tunnel de vente, lead magnet, growth hacking
- Le discours "mindset" ou "abundance"
- Les emojis (sauf si vraiment pertinent, et jamais plus de 2 dans tout le texte)
- Les listes à puces dans le post (c'est un texte fluide, pas un article)

STRUCTURE SELON LE FORMAT :

Si Storytelling : Accroche (moment clé) → Contexte vécu → Retournement/déclic → Leçon applicable
Si Mythe à déconstruire : Le mythe entre guillemets → Pourquoi c'est faux → Preuves/exemples → La vraie leçon
Si Coup de gueule : Affirmation tranchée → Le problème précis → L'impact → L'alternative
Si Enquête/décryptage : Observation intrigante → Contexte → Analyse avec exemples → Ce que ça change
Si Conseil contre-intuitif : Le conseil mainstream → Pourquoi ça ne marche pas → Ton conseil alternatif → Pourquoi ça marche
Si Test grandeur nature : "J'ai testé [X]" → Pourquoi → Résultats honnêtes → Verdict
Si Before/After : Le contraste avant/après → Description honnête → Ce qui a changé → La leçon
Si Histoire cliente : "Elle m'a dit..." → Le blocage → Le déclic → Le résultat → La leçon universelle
Si Regard philosophique : Observation large → Analyse en profondeur → Lien avec la com → Ouverture
Si Surf sur l'actu : L'actu → Ton analyse → Lien avec ton audience → Ta position

PHILOSOPHIE DE FOND (à infuser subtilement, ne pas énoncer explicitement) :
- La communication est un outil d'émancipation, pas de manipulation
- Le beau est légitime et politique, pas superficiel
- Vendre n'est pas manipuler, c'est rendre visible un projet qui mérite de l'être
- Mieux vaut un bon post par semaine que 7 posts vides
- La qualité d'un projet ne suffit pas : il faut savoir le raconter

CONSIGNES FINALES :
- Commence par une accroche forte (pas de "Aujourd'hui je voulais te parler de")
- Longueur : entre 800 et 1500 caractères
- Finis par une ouverture (question ou invitation au dialogue), pas par un CTA commercial
- Donne le texte brut de la caption, sans mise en forme markdown, sans titre, sans indication de format
- Ne mets AUCUNE instruction entre crochets dans le texte final
- Adapte le contenu à l'activité et la cible de l'utilisatrice`;
      userPrompt = `Rédige un post Instagram au format "${format}" sur le sujet : "${sujet}"`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessaie dans un moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits épuisés, ajoute des crédits pour continuer." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("Erreur du service IA");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-content error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
