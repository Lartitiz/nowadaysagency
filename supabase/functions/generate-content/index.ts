import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORE_PRINCIPLES, FRAMEWORK_SELECTION, FORMAT_STRUCTURES, WRITING_RESOURCES } from "../_shared/copywriting-prompts.ts";

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
    supabase.from("brand_proposition").select("version_final, version_bio").eq("user_id", userId).maybeSingle(),
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
    "Accroche mythe : '\"Il faut...\" Non.'",
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

    const body = await req.json();
    const { type, format, sujet, profile, canal, objectif, structure: structureInput, accroche: accrocheInput, angle: angleInput, prompt: rawPrompt } = body;

    let systemPrompt = "";
    let userPrompt = "";

    // Handle "raw" type early - no profile block needed
    if (type === "raw") {
      systemPrompt = `${CORE_PRINCIPLES}`;
      userPrompt = rawPrompt || "";
    } else {
      const canalLabel = canal === "linkedin" ? "LinkedIn" : canal === "blog" ? "un article de blog" : canal === "pinterest" ? "Pinterest" : "Instagram";
      const profileBlock = buildProfileBlock(profile || {});
      const brandingContext = await buildBrandingContext(supabase, user.id);
      const fullContext = profileBlock + (brandingContext ? `\n${brandingContext}` : "");

      if (type === "suggest") {
        const objectifInstruction = objectif
          ? `L'objectif choisi est : ${objectif}. Oriente les sujets en conséquence.`
          : "";
        systemPrompt = `${CORE_PRINCIPLES}\n\nPROFIL DE L'UTILISATRICE :\n${fullContext}\n\n${objectifInstruction}\n\nPropose exactement 5 idées de sujets de posts ${canalLabel}, adaptées à son activité et sa cible. Chaque idée doit être formulée comme un sujet concret et spécifique (pas vague), en une phrase.\n\nVarie les angles : un sujet éducatif, un storytelling, un sujet engagé, un sujet pratique, un sujet inspirant.\n\nRéponds uniquement avec les 5 sujets, un par ligne, sans numérotation, sans tiret, sans explication.`;
        userPrompt = `Propose-moi 5 sujets de posts ${canalLabel}.`;

      } else if (type === "ideas") {
        // SECTION 1 (principes) + SECTION 2 (frameworks pour les accroches)
        const formatInstruction = format
          ? `FORMAT SÉLECTIONNÉ : ${format}`
          : "FORMAT SÉLECTIONNÉ : aucun, propose le format le plus adapté pour chaque idée";
        const sujetInstruction = sujet || "aucun, propose des idées variées";

        let accrocheInstruction = "";
        if (objectif && ACCROCHE_BANK[objectif]) {
          const accroches = ACCROCHE_BANK[objectif];
          accrocheInstruction = `\nSTYLES D'ACCROCHES RECOMMANDÉS POUR L'OBJECTIF "${objectif.toUpperCase()}" :\n${accroches.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n\nPour chaque idée, propose aussi 2 ACCROCHES concrètes inspirées de ces styles.`;
        }

        const objectifInstruction = objectif
          ? `\nOBJECTIF DE COMMUNICATION : ${objectif} (${objectif === "visibilite" ? "faire découvrir, attirer de nouveaux abonnés" : objectif === "confiance" ? "créer du lien, fidéliser, humaniser" : objectif === "vente" ? "convertir, donner envie d'acheter" : "montrer l'expertise, légitimer"})`
          : "";

        const accrocheJsonPart = objectif
          ? `,\n    "accroches": [{"short": "...", "long": "..."}, {"short": "...", "long": "..."}, {"short": "...", "long": "..."}]`
          : "";

        const accrocheRulePart = objectif
          ? `4. 3 ACCROCHES avec chacune 2 versions :\n   - Version COURTE (max 15 mots)\n   - Version LONGUE (2-4 phrases)`
          : "";

        systemPrompt = `${CORE_PRINCIPLES}

${FRAMEWORK_SELECTION}

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
2. Le FORMAT recommandé
3. Un ANGLE ou ACCROCHE possible
${accrocheRulePart}

RÈGLES :
- Varie les formats
- Varie les angles (chaque idée basée sur un framework différent, sans nommer le framework)
- Les idées doivent être SPÉCIFIQUES à son activité
- Le ton doit correspondre au style de communication
- Pas d'emojis dans les accroches

IMPORTANT : Réponds UNIQUEMENT en JSON :
[
  {
    "titre": "...",
    "format": "...",
    "angle": "..."${accrocheJsonPart}
  }
]`;
        userPrompt = `Propose-moi 5 idées de posts ${canalLabel}.`;

      } else if (type === "bio") {
        // SECTION 1 (règles d'écriture uniquement via CORE_PRINCIPLES)
        systemPrompt = `${CORE_PRINCIPLES}\n\nPROFIL DE L'UTILISATRICE :\n${fullContext}\n\nCONSIGNE :\nGénère exactement 2 versions de bio Instagram pour cette utilisatrice.\n\nVERSION 1 : Bio structurée & claire\nFormat strict ligne par ligne :\n- Ligne "nom_profil" : Prénom + mot-clé de l'activité\n- Ligne 1 : Ce qu'elle propose (commence par un emoji pertinent)\n- Ligne 2 : Ce qui la rend unique (commence par un emoji pertinent)\n- Ligne 3 : Appel à l'action (commence par un emoji pertinent, termine par ⤵️)\n\nVERSION 2 : Bio créative & incarnée\nMême structure mais avec un ton plus libre, poétique, avec de l'humour ou de la personnalité.\n\nRÈGLES :\n- Maximum 150 caractères par ligne\n- Pas de hashtags dans la bio\n\nIMPORTANT : Réponds UNIQUEMENT en JSON :\n{"structured": {"nom_profil": "...", "ligne1": "...", "ligne2": "...", "ligne3": "..."}, "creative": {"nom_profil": "...", "ligne1": "...", "ligne2": "...", "ligne3": "..."}}`;
        userPrompt = "Génère 2 versions de bio Instagram pour moi.";

      } else if (type === "launch-ideas") {
        systemPrompt = `${CORE_PRINCIPLES}\n\nPROFIL :\n${fullContext}\n\nLANCEMENT :\n- Nom : ${(profile || {}).launch_name || ""}\n- Promesse : ${(profile || {}).launch_promise || ""}\n- Objections anticipées : ${(profile || {}).launch_objections || ""}\n\nCONTENUS SÉLECTIONNÉS : ${((profile || {}).launch_selected_contents || []).join(", ")}\n\nPour chaque contenu sélectionné, propose :\n- 1 accroche (hook) percutante\n- 1 suggestion de CTA éthique\n- Le format recommandé\n\nRéponds UNIQUEMENT en JSON :\n[{"content_type": "...", "hook": "...", "cta": "...", "format": "..."}]`;
        userPrompt = "Génère des idées de contenu pour mon lancement.";

      } else if (type === "launch-plan") {
        // SECTION 1 + SECTION 3 (structures) + SECTION 4 (banques pour rédaction)
        const lp = profile || {};
        systemPrompt = `${CORE_PRINCIPLES}

${FORMAT_STRUCTURES}

${WRITING_RESOURCES}

DONNÉES DU LANCEMENT :
- Offre : "${lp.launch_name || ""}"
- Promesse : "${lp.launch_promise || ""}"
- Objections anticipées : "${lp.launch_objections || ""}"
- Lead magnet : "${lp.launch_free_resource || "aucun"}"
- Période de teasing : ${lp.launch_teasing_start || "?"} → ${lp.launch_teasing_end || "?"}
- Période de vente : ${lp.launch_sale_start || "?"} → ${lp.launch_sale_end || "?"}
- Contenus déjà prévus par l'utilisatrice : ${(lp.launch_selected_contents || []).join(", ") || "aucun"}

${brandingContext}

Génère un plan de lancement Instagram en 4 phases :

PHASE 1 : PRÉ-TEASING (1 semaine avant le début du teasing)
- 3-4 contenus
- Objectif : poser le problème, créer la curiosité
- Ne PAS mentionner l'offre

PHASE 2 : TEASING (du ${lp.launch_teasing_start || "?"} au ${lp.launch_teasing_end || "?"})
- 5-7 contenus (mix posts feed + stories)
- Objectif : créer l'attente, donner des indices, engager

PHASE 3 : LANCEMENT / VENTE (du ${lp.launch_sale_start || "?"} au ${lp.launch_sale_end || "?"})
- 7-10 contenus (posts + stories + 1 live si pertinent)
- Objectif : présenter, rassurer, convertir
- INTÉGRER les contenus déjà prévus par l'utilisatrice
- Traiter CHAQUE objection dans au moins 1 contenu

PHASE 4 : POST-LANCEMENT (1 semaine après la fin de la vente)
- 3-4 contenus
- Objectif : remercier, partager les résultats, relancer

Pour CHAQUE contenu :
1. date : la date précise (YYYY-MM-DD)
2. phase : "pre_teasing" / "teasing" / "vente" / "post_lancement"
3. format : "post_carrousel" / "post_photo" / "reel" / "story" / "story_serie" / "live"
4. accroche : la première phrase (hook percutant, utilise les techniques du moteur copywriting)
5. contenu : le texte COMPLET prêt à copier-coller (min 100 mots pour les posts, avec bucket brigades et CTA éthique)
6. objectif : ce que ce contenu doit provoquer (1 phrase)
7. tip : un conseil de création ou de timing (1 phrase)

Réponds en JSON :
{
  "phases": [
    {
      "name": "pre_teasing",
      "label": "Pré-teasing",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "contents": [
        {
          "date": "YYYY-MM-DD",
          "format": "...",
          "accroche": "...",
          "contenu": "...",
          "objectif": "...",
          "tip": "..."
        }
      ]
    }
  ]
}`;
        userPrompt = "Génère mon plan de lancement complet avec tous les contenus.";

      } else if (type === "redaction-structure") {
        // SECTION 1 + SECTION 3 (structures par format)
        systemPrompt = `${CORE_PRINCIPLES}\n\n${FORMAT_STRUCTURES}\n\nPROFIL DE L'UTILISATRICE :\n${fullContext}\n\nFORMAT CHOISI : ${format}\nSUJET DU POST : ${sujet}\n\nPropose une STRUCTURE DÉTAILLÉE pour ce post, étape par étape. Utilise les structures par format ci-dessus comme base.\n\nPour chaque étape/slide, donne :\n- Le rôle de cette partie\n- Ce qu'il faut y mettre concrètement\n- Un exemple\n\nSois concrète et actionnable.\n\nRéponds en texte structuré lisible.`;
        userPrompt = `Propose-moi une structure détaillée pour un post "${format}" sur : "${sujet}"`;

      } else if (type === "redaction-accroches") {
        // SECTION 1 + SECTION 2 (frameworks pour varier les accroches)
        systemPrompt = `${CORE_PRINCIPLES}\n\n${FRAMEWORK_SELECTION}\n\nPROFIL DE L'UTILISATRICE :\n${fullContext}\n\nFORMAT : ${format}\nSUJET : ${sujet}\n${objectif ? `OBJECTIF : ${objectif}` : ""}\n\nPropose exactement 3 accroches différentes pour ce post. Inspire-toi des exemples d'accroches du moteur copywriting mais adapte avec les mots de l'utilisatrice.\n\nVarie les styles :\n- Une accroche percutante/polarisante\n- Une accroche storytelling/émotionnelle\n- Une accroche question/identification\n\nRÈGLES :\n- Pas d'emojis\n- Les accroches doivent tenir dans les 125 premiers caractères\n\nRéponds UNIQUEMENT en JSON :\n["accroche 1", "accroche 2", "accroche 3"]`;
        userPrompt = `Propose 3 accroches pour un post "${format}" sur "${sujet}".`;

      } else if (type === "redaction-draft") {
        // SECTION 1 + SECTION 3 + SECTION 4 (rédaction complète)
        systemPrompt = `${CORE_PRINCIPLES}\n\n${FORMAT_STRUCTURES}\n\n${WRITING_RESOURCES}\n\nPROFIL DE L'UTILISATRICE :\n${fullContext}\n\nFORMAT : ${format}\nSUJET : ${sujet}\n${structureInput ? `STRUCTURE :\n${structureInput}` : ""}\n${accrocheInput ? `ACCROCHE CHOISIE :\n${accrocheInput}` : ""}\n${angleInput ? `ANGLE :\n${angleInput}` : ""}\n\nRédige le post complet, prêt à être publié. Suis les INSTRUCTIONS DE RÉDACTION FINALE du moteur copywriting.\n\nRéponds avec le texte du post uniquement.`;
        userPrompt = "Rédige le post complet.";

      } else if (type === "instagram-audit") {
        const { bestContent: bc, worstContent: wc, rhythm: rh, objective: obj, successNotes: sn, failNotes: fn, profileUrl: pu } = body;
        systemPrompt = `${CORE_PRINCIPLES}

RÉPONSES DE L'UTILISATRICE :
- Contenus qui marchent le mieux : "${bc || "non renseigné"}"
- Contenus qui ne marchent pas : "${wc || "non renseigné"}"
- Rythme actuel : "${rh || "non renseigné"}"
- Objectif principal : "${obj || "non renseigné"}"
${pu ? `- URL du profil : ${pu}` : ""}

CONTENUS QUI ONT BIEN MARCHÉ :
Commentaire de l'utilisatrice : "${sn || "non renseigné"}"
(Des screenshots/PDF de ces contenus ont été fournis en pièces jointes si disponibles)

CONTENUS QUI N'ONT PAS MARCHÉ :
Commentaire de l'utilisatrice : "${fn || "non renseigné"}"
(Des screenshots/PDF de ces contenus ont été fournis en pièces jointes si disponibles)

${brandingContext}

Analyse le profil Instagram et compare avec le branding. Pour chaque section, donne un score /100 et des recommandations CONCRÈTES.

SECTIONS : nom, bio, stories (à la une), epingles (posts épinglés), feed (cohérence visuelle), edito (ligne éditoriale).

ANALYSE DES CONTENUS PERFORMANTS :
- Identifie les POINTS COMMUNS des contenus qui marchent (format, sujet, ton, accroche, présence de visage, longueur...)
- Identifie les POINTS COMMUNS des contenus qui ne marchent pas
- Compare avec les piliers de contenu et le ton définis dans le branding
- Déduis des recommandations concrètes : "Fais plus de [X], arrête [Y], transforme [Z] en [W]"
Intègre cette analyse dans la section "edito" de l'audit.

Score global = moyenne pondérée : Bio 25%, Stories 20%, Épinglés 15%, Nom 10%, Feed 15%, Édito 15%.

Sois directe mais bienveillante. Compare TOUJOURS avec le branding.

Réponds en JSON :
{"score_global": 62, "resume": "...", "sections": {"nom": {"score": 70, "diagnostic": "...", "recommandations": ["..."], "comparaison_branding": "..."}, "bio": {...}, "stories": {...}, "epingles": {...}, "feed": {...}, "edito": {...}}}`;
        userPrompt = "Analyse mon profil Instagram et donne-moi un audit complet.";

      } else if (type === "instagram-nom") {
        systemPrompt = `${CORE_PRINCIPLES}\n\n${brandingContext}\n\nPropose exactement 3 noms de profil Instagram optimisés pour cette utilisatrice. Chaque nom doit contenir un mot-clé lié à son activité pour la recherche (Instagram SEO).\n\nFormats :\n1. [Prénom] | [Activité mot-clé]\n2. [Prénom] | [Bénéfice principal]\n3. [Nom de marque] | [Activité]\n\nRéponds UNIQUEMENT en JSON : ["nom 1", "nom 2", "nom 3"]`;
        userPrompt = "Propose 3 noms de profil Instagram optimisés.";

      } else if (type === "instagram-pinned") {
        // SECTION 1 + SECTION 4 (CTA éthiques pour les posts)
        systemPrompt = `${CORE_PRINCIPLES}\n\n${WRITING_RESOURCES}\n\n${brandingContext}\n\nGénère 3 posts épinglés stratégiques :\n\nPOST 1 : MON HISTOIRE - Basé sur le storytelling, crée un lien émotionnel. (Framework BAB/Storytelling)\nPOST 2 : MON OFFRE - Basé sur la proposition de valeur, donne envie. (Framework PASTOR/AIDA éthique)\nPOST 3 : PREUVE SOCIALE - Témoignage ou résultats concrets. (Framework avant/après)\n\nPour chaque post : accroche forte (125 premiers caractères) + contenu complet avec bucket brigades + CTA éthique + format + objectif.\n\nRéponds en JSON :\n{"post_histoire": {"accroche": "...", "contenu": "...", "format": "...", "objectif": "..."}, "post_offre": {...}, "post_preuve": {...}}`;
        userPrompt = "Génère mes 3 posts épinglés stratégiques.";

      } else if (type === "instagram-edito") {
        systemPrompt = `${CORE_PRINCIPLES}\n\n${brandingContext}\n\nCrée une ligne éditoriale personnalisée. Utilise les recommandations du moteur copywriting sur le mix de contenu (4 visibilité + 4 confiance + 2 vente sur 10 posts).\n\nRéponds en JSON :\n{"main_objective": "...", "recommended_rhythm": "X posts/semaine + Y stories/semaine", "pillar_distribution": {"pilier1": 40, "pilier2": 25, "pilier3": 20, "Perso/coulisses": 15}, "preferred_formats": ["carrousel éducatif", "reel coulisses", "post storytelling"], "stop_doing": "...", "do_more": "..."}`;
        userPrompt = "Crée ma ligne éditoriale Instagram personnalisée.";

      } else if (type === "instagram-edito-pillars") {
        const p = profile;
        systemPrompt = `${CORE_PRINCIPLES}\n\nObjectif : ${p?.objective || "?"}\nRythme : ${p?.posts_frequency || "?"}\nPiliers actuels : ${(p?.pillars || []).join(", ") || "aucun"}\n\nPropose une répartition optimale des piliers de contenu. Le total doit faire 100%. Maximum 5 piliers.\n\nRéponds UNIQUEMENT en JSON :\n{"pillars": [{"name": "...", "description": "...", "percentage": 40, "is_major": true}, ...]}`;
        userPrompt = "Suggère une répartition de piliers.";

      } else if (type === "instagram-edito-formats") {
        const p = profile;
        systemPrompt = `${CORE_PRINCIPLES}\n\nObjectif : ${p?.objective || "?"}\nPiliers : ${(p?.pillars || []).join(", ") || "?"}\nRythme : ${p?.posts_frequency || "?"}\n\nRecommande les formats les plus pertinents parmi cette liste : Carrousel éducatif, Post photo + caption longue, Post photo + caption courte, Reel face cam, Reel montage/transitions, Reel coulisses, Story face cam, Story texte/sondage, Live, Collaboration / post invité.\n\nRéponds UNIQUEMENT en JSON :\n{"formats": ["format1", "format2", ...]}`;
        userPrompt = "Suggère des formats.";

      } else if (type === "instagram-rhythm-adapt") {
        const p = profile;
        systemPrompt = `${CORE_PRINCIPLES}\n\nL'utilisatrice a ${p?.time_available || "?"} par semaine (${p?.available_minutes || 0} minutes).\nSon rythme actuel : ${p?.current_posts || "?"} posts + stories ${p?.current_stories || "?"}.\nFormats préférés : ${(p?.preferred_formats || []).join(", ") || "aucun"}.\nTemps estimé actuel : ~${p?.estimated_minutes || 0} minutes/semaine.\n\nPropose un rythme RÉALISTE qui tient dans son temps disponible.\n\nRéponds en JSON :\n{"suggestion": "Texte lisible avec le plan concret (quels jours, combien de temps par session)", "posts_frequency": "Xx/semaine", "stories_frequency": "label exact parmi: Tous les jours, 3-4x/semaine, 1-2x/semaine, Quand j'ai envie"}`;
        userPrompt = "Adapte mon rythme à mon temps disponible.";

      } else {
        return new Response(
          JSON.stringify({ error: "Type de requête non reconnu" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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
        temperature: 0.8,
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
    const content = result.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("generate-content error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
