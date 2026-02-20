import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  if (profile.offre) lines.push(`- Offre (ce qu'elle vend) : ${profile.offre}`);
  if (profile.croyances_limitantes) lines.push(`- Croyances limitantes de sa cible : ${profile.croyances_limitantes}`);
  if (profile.verbatims) lines.push(`- Verbatims (les mots de ses clientes) : ${profile.verbatims}`);
  if (profile.expressions_cles) lines.push(`- Expressions clés à utiliser : ${profile.expressions_cles}`);
  if (profile.ce_quon_evite) lines.push(`- Ce qu'on évite dans sa com : ${profile.ce_quon_evite}`);
  if (profile.style_communication?.length) lines.push(`- Style de communication : ${profile.style_communication.join(", ")}`);
  return lines.join("\n");
}

async function buildBrandingContext(supabase: any, userId: string): Promise<string> {
  const [stRes, perRes, toneRes, propRes, stratRes] = await Promise.all([
    supabase.from("storytelling").select("step_7_polished").eq("user_id", userId).maybeSingle(),
    supabase.from("persona").select("step_1_frustrations, step_2_transformation, step_3a_objections, step_3b_cliches").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_profile").select("voice_description, combat_cause, combat_fights, combat_alternative, combat_refusals, tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims, channels, mission, offer").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_proposition").select("version_final, version_complete").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_strategy").select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3, creative_concept").eq("user_id", userId).maybeSingle(),
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

  const propValue = propRes.data?.version_final || propRes.data?.version_complete;
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

    // Combats
    const cl: string[] = [];
    if (t.combat_cause) cl.push(`- Sa cause : ${t.combat_cause}`);
    if (t.combat_fights) cl.push(`- Ses combats : ${t.combat_fights}`);
    if (t.combat_alternative) cl.push(`- Ce qu'elle propose à la place : ${t.combat_alternative}`);
    if (t.combat_refusals) cl.push(`- Ce qu'elle refuse : ${t.combat_refusals}`);
    if (cl.length) lines.push(`COMBATS & LIMITES :\n${cl.join("\n")}`);
  }

  // Strategy
  const s = stratRes.data;
  if (s) {
    const sl: string[] = [];
    if (s.pillar_major) sl.push(`- Pilier majeur : ${s.pillar_major}`);
    const minors = [s.pillar_minor_1, s.pillar_minor_2, s.pillar_minor_3].filter(Boolean);
    if (minors.length) sl.push(`- Piliers mineurs : ${minors.join(", ")}`);
    if (s.creative_concept) sl.push(`- Concept créatif : ${s.creative_concept}`);
    if (sl.length) lines.push(`STRATÉGIE DE CONTENU :\n${sl.join("\n")}`);
  }

  if (!lines.length) return "";
  return `\nCONTEXTE DE LA MARQUE :\n${lines.join("\n\n")}\n`;
}

const ACCROCHE_BANK: Record<string, string[]> = {
  visibilite: [
    "Accroche polarisante : affirme une position forte et clivante",
    "Accroche contre-intuitive : commence par le contraire de ce qu'on attend",
    "Accroche frustration : nomme un problème que tout le monde reconnaît",
    "Accroche statistique choc : commence par un chiffre surprenant",
    "Accroche question provocante : pose la question que personne n'ose poser",
  ],
  confiance: [
    "Accroche storytelling : commence par un moment précis (lieu, sensation)",
    "Accroche suspense : commence par la fin et reviens au début",
    "Accroche question ouverte : invite à la réflexion personnelle",
    "Accroche confession : partage un doute ou un échec authentique",
    "Accroche identification : 'Toi aussi tu...' ou 'POV : tu es...'",
  ],
  vente: [
    "Accroche avant/après : montre le contraste entre les deux états",
    "Accroche témoignage : commence par les mots d'une cliente",
    "Accroche permission : autorise ta cible à vouloir ce qu'elle n'ose pas",
    "Accroche résultat : commence par le résultat obtenu",
    "Accroche objection : nomme le frein et démonte-le",
  ],
  credibilite: [
    "Accroche décryptage : 'J'ai analysé...' ou 'J'ai remarqué que...'",
    "Accroche liste : '5 choses que j'ai apprises en...'",
    "Accroche mythe : '\\\"Il faut...\\\" Non.'",
    "Accroche expertise : partage une observation que seul·e un·e expert·e fait",
    "Accroche processus : montre ton framework ou ta méthode",
  ],
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentification requise" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Authentification invalide" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { type, format, sujet, profile, canal, objectif, structure: structureInput, accroche: accrocheInput, angle: angleInput } = await req.json();

    const canalLabel = canal === "linkedin" ? "LinkedIn" : canal === "blog" ? "un article de blog" : canal === "pinterest" ? "Pinterest" : "Instagram";
    const profileBlock = buildProfileBlock(profile || {});

    // Fetch branding context from DB and append to profile block
    const brandingContext = await buildBrandingContext(supabase, user.id);
    const fullContext = profileBlock + (brandingContext ? `\n${brandingContext}` : "");

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "suggest") {
      const objectifInstruction = objectif
        ? `L'objectif choisi est : ${objectif}. Oriente les sujets en conséquence.`
        : "''";
      systemPrompt = `Tu es un·e expert·e en stratégie de contenu ${canalLabel} pour des solopreneuses éthiques.

PROFIL DE L'UTILISATRICE :
${fullContext}

${objectifInstruction}

Propose exactement 5 idées de sujets de posts ${canalLabel}, adaptées à son activité et sa cible. Chaque idée doit être formulée comme un sujet concret et spécifique (pas vague), en une phrase.

Varie les angles : un sujet éducatif, un storytelling, un sujet engagé, un sujet pratique, un sujet inspirant.

Réponds uniquement avec les 5 sujets, un par ligne, sans numérotation, sans tiret, sans explication.`;
      userPrompt = `Propose-moi 5 sujets de posts ${canalLabel}.`;

    } else if (type === "ideas") {
      const formatInstruction = format
        ? `FORMAT SÉLECTIONNÉ : ${format}`
        : "FORMAT SÉLECTIONNÉ : aucun, propose le format le plus adapté pour chaque idée";
      const sujetInstruction = sujet || "aucun, propose des idées variées";

      let accrocheInstruction = "";
      if (objectif && ACCROCHE_BANK[objectif]) {
        const accroches = ACCROCHE_BANK[objectif];
        accrocheInstruction = `\nSTYLES D'ACCROCHES RECOMMANDÉS POUR L'OBJECTIF \"${objectif.toUpperCase()}\" :
${accroches.map((a, i) => `${i + 1}. ${a}`).join("\n")}

Pour chaque idée, propose aussi 2 ACCROCHES concrètes inspirées de ces styles.`;
      }

      const objectifInstruction = objectif
        ? `\nOBJECTIF DE COMMUNICATION : ${objectif} (${objectif === "visibilite" ? "faire découvrir, attirer de nouveaux abonnés" : objectif === "confiance" ? "créer du lien, fidéliser, humaniser" : objectif === "vente" ? "convertir, donner envie d'acheter" : "montrer l'expertise, légitimer"})`
        : "";

      systemPrompt = `Tu es un·e expert·e en stratégie de contenu ${canalLabel} pour des solopreneuses éthiques et créatives.

PROFIL DE L'UTILISATRICE :
${fullContext}

CANAL SÉLECTIONNÉ : ${canalLabel}
${objectifInstruction}

THÈME OU MOT-CLÉ DONNÉ PAR L'UTILISATRICE : ${sujetInstruction}

${formatInstruction}
${accrocheInstruction}

CONSIGNE :
Propose exactement 5 idées de posts ${canalLabel} adaptées à son activité, sa cible, et ses thématiques.

Pour chaque idée, donne :
1. Un TITRE accrocheur
2. Le FORMAT recommandé parmi : Storytelling, Mythe à déconstruire, Coup de gueule, Enquête/décryptage, Conseil contre-intuitif, Test grandeur nature, Before/After, Histoire cliente, Regard philosophique, Surf sur l'actu, Identification / quotidien, Build in public, Analyse en profondeur
3. Un ANGLE ou ACCROCHE possible
${objectif ? `4. 3 ACCROCHES avec chacune 2 versions :
   - Version COURTE (max 15 mots)
   - Version LONGUE (2-4 phrases)` : ""}

RÈGLES :
- Varie les formats
- Varie les angles
- Les idées doivent être SPÉCIFIQUES à son activité
- Le ton doit correspondre au style de communication
- Écriture inclusive avec point médian
- Pas de tiret cadratin
- Pas d'emojis dans les accroches

IMPORTANT : Réponds UNIQUEMENT en JSON :
[
  {
    "titre": "...",
    "format": "...",
    "angle": "..."${objectif ? ',
    "accroches": [{"short": "...", "long": "..."}, {"short": "...", "long": "..."}, {"short": "...", "long": "..."}]' : ""}
  }
]`;
      userPrompt = `Propose-moi 5 idées de posts ${canalLabel}.`;

    } else if (type === "bio") {
      systemPrompt = `Tu es un·e expert·e en personal branding Instagram pour des solopreneuses éthiques et créatives.

PROFIL DE L'UTILISATRICE :
${fullContext}

CONSIGNE :
Génère exactement 2 versions de bio Instagram pour cette utilisatrice.

VERSION 1 : Bio structurée & claire
Format strict ligne par ligne :
- Ligne "nom_profil" : Prénom + mot-clé de l'activité
- Ligne 1 : Ce qu'elle propose (commence par un emoji pertinent)
- Ligne 2 : Ce qui la rend unique (commence par un emoji pertinent)
- Ligne 3 : Appel à l'action (commence par un emoji pertinent, termine par ⤵️)

VERSION 2 : Bio créative & incarnée
Même structure mais avec un ton plus libre, poétique, avec de l'humour ou de la personnalité.

RÈGLES :
- Maximum 150 caractères par ligne
- Écriture inclusive avec point médian
- Pas de hashtags dans la bio
- Pas de tiret cadratin

IMPORTANT : Réponds UNIQUEMENT en JSON :
{
  "structured": {
    "nom_profil": "...",
    "ligne1": "...",
    "ligne2": "...",
    "ligne3": "..."
  },
  "creative": {
    "nom_profil": "...",
    "ligne1": "...",
    "ligne2": "...",
    "ligne3": "..."
  }
}`;
      userPrompt = "Génère 2 versions de bio Instagram pour moi.";

    } else if (type === "launch-ideas") {
      systemPrompt = `Tu es expert·e en stratégie de lancement Instagram pour des solopreneuses éthiques.

PROFIL :
${fullContext}

LANCEMENT :
- Nom : ${profile.launch_name || ""}
- Promesse : ${profile.launch_promise || ""}
- Objections anticipées : ${profile.launch_objections || ""}
- Durée teasing : ${profile.launch_teasing_start || "?"} au ${profile.launch_teasing_end || "?"}
- Durée vente : ${profile.launch_sale_start || "?"} au ${profile.launch_sale_end || "?"}

CONTENUS SÉLECTIONNÉS PAR L'UTILISATRICE : ${(profile.launch_selected_contents || []).join(", ")}

Pour chaque contenu sélectionné, propose :
- 1 accroche (hook) percutante
- 1 suggestion de CTA
- Le format recommandé

Ton direct, chaleureux, oral assumé. Écriture inclusive avec point médian.

IMPORTANT : Réponds UNIQUEMENT en JSON :
[
  {
    "content_type": "...",
    "hook": "...",
    "cta": "...",
    "format": "..."
  }
]`;
      userPrompt = `Génère des idées de contenu pour mon lancement.`;

    } else if (type === "redaction-structure") {
      systemPrompt = `Tu es un·e expert·e en création de contenu ${canalLabel} pour des solopreneuses éthiques et créatives.

PROFIL DE L'UTILISATRICE :
${fullContext}

FORMAT CHOISI : ${format}
SUJET DU POST : ${sujet}

CONSIGNE :
Propose une STRUCTURE DÉTAILLÉE pour ce post, étape par étape.

Pour chaque étape/slide, donne :
- Le rôle de cette partie
- Ce qu'il faut y mettre concrètement
- Un exemple

Sois concrète et actionnable. Écriture inclusive avec point médian.

Réponds en texte structuré lisible.`;
      userPrompt = `Propose-moi une structure détaillée pour un post \"${format}\" sur : \"${sujet}\"`;

    } else if (type === "redaction-accroches") {
      systemPrompt = `Tu es un·e expert·e en copywriting ${canalLabel} pour des solopreneuses éthiques et créatives.

PROFIL DE L'UTILISATRICE :
${fullContext}

FORMAT : ${format}
SUJET : ${sujet}
${objectif ? `OBJECTIF : ${objectif}` : ""}

CONSIGNE :
Propose exactement 3 accroches différentes pour ce post.

Varie les styles :
- Une accroche percutante/polarisante
- Une accroche storytelling/émotionnelle
- Une accroche question/identification

RÈGLES :
- Écriture inclusive avec point médian
- Pas de tiret cadratin
- Pas d'emojis

IMPORTANT : Réponds UNIQUEMENT en JSON :
["accroche 1", "accroche 2", "accroche 3"]`;
      userPrompt = `Propose 3 accroches pour un post \"${format}\" sur \"${sujet}\".`;

    } else if (type === "redaction-draft") {
      systemPrompt = `Tu es un·e expert·e en création de contenu ${canalLabel} pour des solopreneuses éthiques et créatives.

PROFIL DE L'UTILISATRICE :
${fullContext}

FORMAT : ${format}
SUJET : ${sujet}
${structureInput ? `STRUCTURE :\n${structureInput}` : ""}
${accrocheInput ? `ACCROCHE CHOISIE :\n${accrocheInput}` : ""}
${angleInput ? `ANGLE :\n${angleInput}` : ""}

CONSIGNE :
Rédige le post complet, prêt à être publié.

RÈGLES :
- Écriture inclusive avec point médian
- Pas de tiret cadratin
- Le ton doit correspondre au style de l'utilisatrice
- Si elle a des expressions clés, utilise-les naturellement

Réponds avec le texte du post uniquement.`;
      userPrompt = `Rédige le post complet.`;

    } else if (type === "raw") {
      const { prompt } = await req.json().catch(() => ({ prompt: "" }));
      systemPrompt = "Tu es une assistante créative et bienveillante spécialisée dans le personal branding pour des solopreneuses éthiques et créatives. Écriture inclusive avec point médian.";
      userPrompt = (await req.json().catch(() => ({ prompt: "" }))).prompt || "";
      // Actually, re-read the body since we already parsed it
    } else {
      return new Response(
        JSON.stringify({ error: "Type de requête non reconnu" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle "raw" type specially - we already parsed the body above
    if (type === "raw") {
      const bodyData = await req.clone().json().catch(() => ({}));
      systemPrompt = "Tu es une assistante créative et bienveillante spécialisée dans le personal branding pour des solopreneuses éthiques et créatives. Écriture inclusive avec point médian.";
      userPrompt = bodyData.prompt || "";
    }

    const response = await fetch("https://api.lovable.dev/v1/chat/completions", {
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
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
