import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function buildBrandingContext(supabase: any, userId: string): Promise<string> {
  const [stRes, perRes, toneRes, propRes, stratRes, editoRes] = await Promise.all([
    supabase.from("storytelling").select("step_7_polished").eq("user_id", userId).maybeSingle(),
    supabase.from("persona").select("step_1_frustrations, step_2_transformation, step_3a_objections, step_3b_cliches").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_profile").select("voice_description, combat_cause, combat_fights, combat_alternative, combat_refusals, tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims, channels, mission, offer").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_proposition").select("version_final, version_bio").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_strategy").select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3, creative_concept").eq("user_id", userId).maybeSingle(),
    supabase.from("instagram_editorial_line").select("main_objective, objective_details, posts_frequency, stories_frequency, time_available, pillars, preferred_formats, do_more, stop_doing, free_notes").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const lines: string[] = [];
  const story = stRes.data?.step_7_polished;
  if (story) lines.push(`HISTOIRE :\n${story}`);

  const p = perRes.data;
  if (p) {
    const pl: string[] = [];
    if (p.step_1_frustrations) pl.push(`- Frustrations : ${p.step_1_frustrations}`);
    if (p.step_2_transformation) pl.push(`- Transformation rêvée : ${p.step_2_transformation}`);
    if (p.step_3a_objections) pl.push(`- Objections : ${p.step_3a_objections}`);
    if (p.step_3b_cliches) pl.push(`- Clichés : ${p.step_3b_cliches}`);
    if (pl.length) lines.push(`CLIENTE IDÉALE :\n${pl.join("\n")}`);
  }

  const propValue = propRes.data?.version_final || propRes.data?.version_bio;
  if (propValue) lines.push(`PROPOSITION DE VALEUR :\n${propValue}`);

  const t = toneRes.data;
  if (t) {
    const tl: string[] = [];
    if (t.voice_description) tl.push(`- Comment elle parle : ${t.voice_description}`);
    const reg = [t.tone_register, t.tone_level, t.tone_style].filter(Boolean).join(" - ");
    if (reg) tl.push(`- Registre : ${reg}`);
    if (t.tone_humor) tl.push(`- Humour : ${t.tone_humor}`);
    if (t.tone_engagement) tl.push(`- Engagement : ${t.tone_engagement}`);
    if (t.key_expressions) tl.push(`- Expressions clés : ${t.key_expressions}`);
    if (t.things_to_avoid) tl.push(`- Ce qu'on évite : ${t.things_to_avoid}`);
    if (t.target_verbatims) tl.push(`- Verbatims de la cible : ${t.target_verbatims}`);
    if (tl.length) lines.push(`TON & STYLE :\n${tl.join("\n")}`);

    const cl: string[] = [];
    if (t.combat_cause) cl.push(`- Sa cause : ${t.combat_cause}`);
    if (t.combat_fights) cl.push(`- Ses combats : ${t.combat_fights}`);
    if (t.combat_alternative) cl.push(`- Ce qu'elle propose à la place : ${t.combat_alternative}`);
    if (t.combat_refusals) cl.push(`- Ce qu'elle refuse : ${t.combat_refusals}`);
    if (cl.length) lines.push(`COMBATS & LIMITES :\n${cl.join("\n")}`);
  }

  const s = stratRes.data;
  if (s) {
    const sl: string[] = [];
    if (s.pillar_major) sl.push(`- Pilier majeur : ${s.pillar_major}`);
    const minors = [s.pillar_minor_1, s.pillar_minor_2, s.pillar_minor_3].filter(Boolean);
    if (minors.length) sl.push(`- Piliers mineurs : ${minors.join(", ")}`);
    if (s.creative_concept) sl.push(`- Concept créatif : ${s.creative_concept}`);
    if (sl.length) lines.push(`STRATÉGIE DE CONTENU :\n${sl.join("\n")}`);
  }

  // Editorial line
  const e = editoRes.data;
  if (e) {
    const el: string[] = [];
    if (e.main_objective) el.push(`- Objectif principal : ${e.main_objective}`);
    if (e.posts_frequency) el.push(`- Rythme : ${e.posts_frequency} posts/semaine${e.stories_frequency ? ` + stories ${e.stories_frequency}` : ""}`);
    const pillars = e.pillars as any[];
    if (pillars?.length) {
      el.push(`- Piliers :`);
      pillars.forEach((pi: any) => {
        el.push(`  • ${pi.name} : ${pi.percentage}%${pi.description ? ` — ${pi.description}` : ""}`);
      });
    }
    const formats = e.preferred_formats as string[];
    if (formats?.length) el.push(`- Formats préférés : ${formats.join(", ")}`);
    if (e.do_more) el.push(`- Faire plus de : ${e.do_more}`);
    if (e.stop_doing) el.push(`- Arrêter de : ${e.stop_doing}`);
    if (e.free_notes) el.push(`- Notes : ${e.free_notes}`);
    if (el.length) lines.push(`LIGNE ÉDITORIALE INSTAGRAM :\n${el.join("\n")}`);
  }

  if (!lines.length) return "";
  return `\nCONTEXTE DE LA MARQUE :\n${lines.join("\n\n")}\n`;
}

function buildProfileBlock(profile: any): string {
  const lines = [
    `- Prénom : ${profile.prenom || "?"}`,
    `- Activité : ${profile.activite || "?"}`,
    `- Type : ${profile.type_activite || "?"}`,
    `- Cible : ${profile.cible || "?"}`,
    `- Problème qu'elle résout : ${profile.probleme_principal || "?"}`,
    `- Thématiques : ${(profile.piliers || []).join(", ") || "?"}`,
    `- Ton souhaité : ${(profile.tons || []).join(", ") || "?"}`,
  ];
  if (profile.mission) lines.push(`- Mission : ${profile.mission}`);
  if (profile.offre) lines.push(`- Offre : ${profile.offre}`);
  if (profile.expressions_cles) lines.push(`- Expressions clés : ${profile.expressions_cles}`);
  if (profile.ce_quon_evite) lines.push(`- Ce qu'on évite : ${profile.ce_quon_evite}`);
  return lines.join("\n");
}

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    const { step, contentType, context, profile, angle, answers, followUpAnswers, content: currentContent, adjustment } = body;

    const profileBlock = profile ? buildProfileBlock(profile) : "";
    const brandingContext = await buildBrandingContext(supabase, user.id);
    const fullContext = profileBlock + (brandingContext ? `\n${brandingContext}` : "");

    let systemPrompt = "";
    let userPrompt = "";

    if (step === "angles") {
      systemPrompt = `Tu es directrice de création dans une agence de communication éthique. Tu proposes des ANGLES ÉDITORIAUX, pas du contenu rédigé. Tu penses en termes de direction créative.

TYPE DE CONTENU : ${contentType}
CONTEXTE : ${context}

PROFIL DE L'UTILISATRICE :
${fullContext}

Propose exactement 3 angles éditoriaux DIFFÉRENTS.

Pour chaque angle :
1. TITRE : 2-5 mots, évocateur (pas "Option 1")
2. PITCH : 2-3 phrases qui expliquent l'approche et pourquoi ça fonctionne
3. STRUCTURE : le squelette du contenu en 4-5 étapes
4. TON : l'énergie et le registre émotionnel de cet angle

RÈGLES :
- Les 3 angles doivent être VRAIMENT différents (pas 3 variations du même)
- Un angle peut être surprenant ou inattendu
- Pense à des angles que l'utilisatrice n'aurait pas trouvés seule
- Reste cohérent avec son ton & style
- Ne rédige RIEN. Pas d'exemple de phrases. Juste la direction.
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin

Réponds UNIQUEMENT en JSON :
{
  "angles": [
    {
      "title": "...",
      "pitch": "...",
      "structure": ["étape 1", "étape 2", "étape 3", "étape 4"],
      "tone": "..."
    }
  ]
}`;
      userPrompt = `Propose-moi 3 angles éditoriaux pour : ${context}`;

    } else if (step === "questions") {
      systemPrompt = `L'utilisatrice a choisi cet angle pour son contenu :
- Type : ${contentType}
- Angle : ${angle.title}
- Structure : ${(angle.structure || []).join(" → ")}
- Ton : ${angle.tone}

PROFIL DE L'UTILISATRICE :
${fullContext}

Pose exactement 3 questions pour récupérer SA matière première. Ces questions doivent extraire des anecdotes, des réflexions, des émotions PERSONNELLES qui rendront le contenu unique et impossible à reproduire par une IA seule.

RÈGLES :
- Questions OUVERTES (pas oui/non)
- Questions SPÉCIFIQUES à l'angle choisi (pas génériques)
- Demande des scènes, des moments, des détails concrets
- Une question peut demander une opinion tranchée ou une conviction
- Le ton des questions est chaleureux et curieux (comme une amie qui s'intéresse vraiment)
- Chaque question a un placeholder qui donne un mini-exemple de réponse pour inspirer
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin

Réponds UNIQUEMENT en JSON :
{
  "questions": [
    {
      "question": "...",
      "placeholder": "..."
    }
  ]
}`;
      userPrompt = `Pose-moi des questions pour créer mon contenu avec l'angle "${angle.title}".`;

    } else if (step === "follow-up") {
      const answersBlock = answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n");
      systemPrompt = `L'utilisatrice a répondu à ces questions :
${answersBlock}

Lis ses réponses. Identifie le détail le plus intéressant, le plus singulier, ou le plus émotionnel. Pose 1-2 questions de suivi pour creuser CE détail spécifique.

Le but : aller chercher le truc que personne d'autre ne pourrait dire. L'anecdote, le ressenti, la conviction qui rend ce contenu UNIQUE.

RÈGLES :
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin
- Ton chaleureux et curieux

Réponds UNIQUEMENT en JSON :
{
  "follow_up_questions": [
    {
      "question": "...",
      "placeholder": "...",
      "why": "..."
    }
  ]
}`;
      userPrompt = "Pose-moi des questions d'approfondissement basées sur mes réponses.";

    } else if (step === "generate") {
      const answersBlock = answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n");
      const followUpBlock = followUpAnswers?.length
        ? "\n\nQUESTIONS D'APPROFONDISSEMENT :\n" + followUpAnswers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n")
        : "";

      systemPrompt = `ANGLE CHOISI :
- Titre : ${angle.title}
- Structure : ${(angle.structure || []).join(" → ")}
- Ton : ${angle.tone}

RÉPONSES DE L'UTILISATRICE :
${answersBlock}
${followUpBlock}

PROFIL DE L'UTILISATRICE :
${fullContext}

Rédige le contenu en suivant ces règles :

1. UTILISE SES MOTS : reprends les expressions exactes de ses réponses. Si elle dit "j'ai flippé", écris "j'ai flippé", pas "j'ai ressenti de l'appréhension"
2. SUIS LA STRUCTURE de l'angle choisi
3. ÉCRIS DANS SON TON (registre, expressions clés, ce qu'elle évite)
4. L'ACCROCHE doit être un hook fort qui arrête le scroll
5. Le contenu doit être PRÊT À POSTER (pas un brouillon)
6. Longueur adaptée au format recommandé

Écriture inclusive avec point médian.
JAMAIS de tiret cadratin (—). Utilise : ou ;

Réponds UNIQUEMENT en JSON :
{
  "content": "...",
  "accroche": "...",
  "format": "...",
  "pillar": "...",
  "objectif": "..."
}`;
      userPrompt = "Rédige mon contenu à partir de mes réponses et de l'angle choisi.";

    } else if (step === "adjust") {
      systemPrompt = `CONTENU ACTUEL :
"""
${currentContent}
"""

AJUSTEMENT DEMANDÉ : ${adjustment}

PROFIL DE L'UTILISATRICE :
${fullContext}

Réécris le contenu avec l'ajustement demandé. Garde la structure, les anecdotes et les mots de l'utilisatrice. Change UNIQUEMENT ce qui est lié à l'ajustement.

Écriture inclusive avec point médian.
JAMAIS de tiret cadratin.

Réponds UNIQUEMENT en JSON :
{
  "content": "..."
}`;
      userPrompt = `Ajuste le contenu : ${adjustment}`;

    } else {
      return new Response(JSON.stringify({ error: "Step non reconnu" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.85,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessaie dans un moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits épuisés, ajoute des crédits pour continuer." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("Oups, l'IA n'a pas pu générer. Réessaie dans un instant.");
    }

    const result = await response.json();
    const rawContent = result.choices?.[0]?.message?.content || "";

    // Try to parse JSON from the response
    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = { raw: rawContent }; }
      } else {
        parsed = { raw: rawContent };
      }
    }

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("creative-flow error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erreur inconnue" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
