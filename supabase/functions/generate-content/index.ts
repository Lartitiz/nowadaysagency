import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORE_PRINCIPLES, FRAMEWORK_SELECTION, FORMAT_STRUCTURES, WRITING_RESOURCES } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkAndIncrementUsage } from "../_shared/plan-limiter.ts";
import { callAnthropicSimple, AnthropicError } from "../_shared/anthropic.ts";

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

// buildBrandingContext replaced by shared getUserContext + formatContextForAI

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

    // Anthropic API key checked in shared helper

    // Check plan limits for generation
    const usageCheck = await checkAndIncrementUsage(supabase, user.id, "generation");
    if (!usageCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: usageCheck.error, remaining: 0 }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
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
      const ctx = await getUserContext(supabase, user.id);
      const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.content);
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

      } else if (type === "bio-audit") {
        const bioText = body.bioText || "";
        systemPrompt = `${CORE_PRINCIPLES}\n\nPROFIL DE L'UTILISATRICE :\n${fullContext}\n\nCONSIGNE :\nAnalyse cette bio Instagram et donne un retour structuré.\n\nBIO :\n${bioText}\n\nCritères d'évaluation (chacun sur 20 points) :\n1. Clarté : on comprend quoi/pour qui en 3 secondes ?\n2. Proposition de valeur : pourquoi toi et pas un·e autre ?\n3. Personnalité : on sent une vraie voix, pas un template ?\n4. CTA : il y a une raison claire de cliquer/suivre ?\n5. Technique : lien fonctionnel, mots-clés pertinents, longueur ok ?\n\nTon : direct, bienveillant, concret. Pas de blabla.\nDonne des EXEMPLES de reformulation pour chaque point à améliorer.\n\nRéponds UNIQUEMENT en JSON :\n{"bio_displayed":"la bio telle quelle","score":55,"works_well":[{"point":"...","why":"..."}],"to_improve":[{"point":"...","why":"...","suggestion":"..."}],"missing":[{"point":"...","why":"..."}]}`;
        userPrompt = "Analyse ma bio Instagram.";

      } else if (type === "bio-generator") {
        const bc = body.brandingContext || {};
        const diff = body.differentiation || {};
        const cta = body.ctaInfo || {};
        const diffTypeLabels: Record<string,string> = { parcours: "Son parcours / expertise", valeurs: "Ses valeurs / engagements", methode: "Sa méthode unique", clients: "Ce que ses clients disent", style: "Son style / esthétique" };
        const ctaTypeLabels: Record<string,string> = { freebie: "télécharger une ressource gratuite", rdv: "prendre RDV", boutique: "voir sa boutique / ses offres", newsletter: "s'inscrire à sa newsletter", dm: "envoyer un DM", site: "visiter son site" };

        systemPrompt = `${CORE_PRINCIPLES}

PROFIL DE L'UTILISATRICE :
${fullContext}

CONTEXTE BRANDING (issu du module Branding) :
- Positionnement : ${bc.positioning || "?"}
- Proposition de valeur : ${bc.valueProposition || "?"}
- Cible : ${bc.target || "?"}
- Ton de voix : ${bc.tone || "?"}
- Mots-clés / piliers : ${bc.keywords || "?"}
- Mission : ${bc.mission || "?"}
- Offre : ${bc.offer || "?"}
- Combats : ${bc.combats || "?"}
${bc.story ? `- Histoire : ${bc.story.substring(0, 300)}...` : ""}

DIFFÉRENCIATION :
- Angle choisi : ${diffTypeLabels[diff.type] || diff.type || "?"}
- Détail : ${diff.text || "?"}

CTA SOUHAITÉ :
- Action : ${ctaTypeLabels[cta.type] || cta.type || "?"}
${cta.text ? `- Nom du freebie/newsletter : ${cta.text}` : ""}

CONSIGNE :
Génère 3 propositions de bio Instagram.

RÈGLES :
- 150 caractères MAX par bio complète (la bio entière, toutes lignes incluses)
- 4 lignes max
- Ligne 1 : qui elle est / ce qu'elle fait (avec mot-clé SEO)
- Ligne 2 : sa promesse ou sa différenciation
- Ligne 3 : preuve de crédibilité ou détail humain
- Ligne 4 : CTA avec emoji pointant vers le lien ↓
- Utiliser le ton de l'utilisatrice (pas générique)
- Pas de suite d'emojis en début de chaque ligne
- Des phrases complètes, pas des mots-clés en vrac
- Utilise les MOTS de l'utilisatrice, pas du jargon marketing
- Ne pas commencer par un emoji
- Chaque proposition doit avoir un angle différent :
  · Proposition A : focus promesse (bénéfice client)
  · Proposition B : focus différenciation (ce qui la rend unique)
  · Proposition C : focus personnalité (son style, son énergie)

Réponds UNIQUEMENT en JSON :
{"bios":[{"label":"Focus promesse","bio_text":"ligne1\\nligne2\\nligne3\\nligne4","character_count":142,"pourquoi":"Cette version met en avant le bénéfice pour ta cible."}]}`;
        userPrompt = "Génère 3 versions de bio Instagram pour moi.";

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
        const { bestContent: bc, worstContent: wc, rhythm: rh, objective: obj, successNotes: sn, failNotes: fn, profileUrl: pu, successPostsData, failPostsData, auditTextData: atd } = body;

        // Build structured post descriptions for AI
        let successPostsBlock = "";
        if (successPostsData && successPostsData.length > 0) {
          successPostsBlock = "\nPOSTS QUI MARCHENT (données structurées) :\n" + successPostsData.map((p: any, i: number) => {
            const parts = [`Post ${i + 1}`];
            if (p.format) parts.push(`Format : ${p.format}`);
            if (p.subject) parts.push(`Sujet : "${p.subject}"`);
            const stats = [];
            if (p.likes) stats.push(`likes: ${p.likes}`);
            if (p.saves) stats.push(`saves: ${p.saves}`);
            if (p.shares) stats.push(`partages: ${p.shares}`);
            if (p.comments) stats.push(`commentaires: ${p.comments}`);
            if (p.reach) stats.push(`reach: ${p.reach}`);
            if (stats.length) parts.push(`Stats : ${stats.join(", ")}`);
            return `- ${parts.join(" · ")}`;
          }).join("\n");
        }

        let failPostsBlock = "";
        if (failPostsData && failPostsData.length > 0) {
          failPostsBlock = "\nPOSTS QUI NE MARCHENT PAS (données structurées) :\n" + failPostsData.map((p: any, i: number) => {
            const parts = [`Post ${i + 1}`];
            if (p.format) parts.push(`Format : ${p.format}`);
            if (p.subject) parts.push(`Sujet : "${p.subject}"`);
            const stats = [];
            if (p.likes) stats.push(`likes: ${p.likes}`);
            if (p.saves) stats.push(`saves: ${p.saves}`);
            if (p.shares) stats.push(`partages: ${p.shares}`);
            if (p.comments) stats.push(`commentaires: ${p.comments}`);
            if (p.reach) stats.push(`reach: ${p.reach}`);
            if (stats.length) parts.push(`Stats : ${stats.join(", ")}`);
            return `- ${parts.join(" · ")}`;
          }).join("\n");
        }

        // Build text-based profile data block
        let profileTextBlock = "";
        if (atd) {
          const lines = [];
          if (atd.displayName) lines.push(`- Nom d'affichage : ${atd.displayName}`);
          if (atd.username) lines.push(`- Username : ${atd.username}`);
          if (atd.bio) lines.push(`- Bio :\n${atd.bio}`);
          if (atd.bioLink) lines.push(`- Lien en bio : ${atd.bioLink}`);
          if (atd.photoDescription) lines.push(`- Photo de profil : ${atd.photoDescription}`);
          if (atd.highlights?.length) lines.push(`- Stories à la une : ${atd.highlights.join(", ")} (${atd.highlightsCount || atd.highlights.length} highlights)`);
          if (atd.pinnedPosts?.length) lines.push(`- Posts épinglés :\n${atd.pinnedPosts.map((p: any, i: number) => `  ${i+1}. ${p.description}`).join("\n")}`);
          if (atd.feedDescription) lines.push(`- Description du feed : ${atd.feedDescription}`);
          if (atd.followers) lines.push(`- Nombre d'abonnés : ${atd.followers}`);
          if (atd.postsPerMonth) lines.push(`- Posts publiés ce mois : ${atd.postsPerMonth}`);
          if (atd.frequency) lines.push(`- Fréquence de publication : ${atd.frequency}`);
          if (atd.pillars?.length) lines.push(`- Piliers de contenu : ${atd.pillars.join(", ")}`);
          profileTextBlock = "\nPROFIL INSTAGRAM (saisi par l'utilisatrice) :\n" + lines.join("\n");
        }

        systemPrompt = `${CORE_PRINCIPLES}
${profileTextBlock}

${bc || wc || rh || obj ? `RÉPONSES COMPLÉMENTAIRES :
${bc ? `- Contenus qui marchent le mieux : "${bc}"` : ""}
${wc ? `- Contenus qui ne marchent pas : "${wc}"` : ""}
${rh ? `- Rythme actuel : "${rh}"` : ""}
${obj ? `- Objectif principal : "${obj}"` : ""}` : ""}
${pu ? `- URL du profil : ${pu}` : ""}
${successPostsBlock}
${failPostsBlock}

${brandingContext}

Audite ce profil Instagram. Pour CHAQUE élément, retourne un verdict visuel.

ANALYSE DE PERFORMANCE DES CONTENUS :
- Identifie les POINTS COMMUNS des contenus qui marchent (format, sujet, ton, accroche, présence de visage, longueur...)
- Identifie les POINTS COMMUNS des contenus qui ne marchent pas
- Compare avec les piliers de contenu et le ton définis dans le branding
- Calcule les taux d'engagement si les stats sont fournies
- Identifie minimum 2-3 patterns positifs et 1-2 patterns négatifs
- Le "combo gagnant" est LA combinaison format x angle qui performe le mieux

Score global = moyenne pondérée (photo 10, nom 10, bio 25, feed 15, highlights 15, posts epingles 10, CTA 10, lien 5).

Sois directe mais bienveillante. Compare TOUJOURS avec le branding.

RETOURNE UNIQUEMENT du JSON valide. Pas de texte avant ni apres. Pas de backticks markdown.

REGLES STRICTES :
- NE JAMAIS utiliser de markdown dans le JSON : pas de **gras**, pas de *italique*, pas de backticks. Texte brut UNIQUEMENT.
- Pour la bio, analyse LIGNE PAR LIGNE avec un status par ligne.
- Pour chaque element "improve" ou "critical", donne TOUJOURS un conseil concret et actionnable.
- Pour la bio et le nom, donne TOUJOURS une proposition complete prete a copier.
- Identifie la priorite n1 : l'element qui aura le plus d'impact si ameliore.

Reponds en JSON :
{
  "score_global": 71,
  "resume": "phrase resume de l'audit",
  "visual_audit": {
    "elements": [
      {
        "element": "photo_profil",
        "label": "Photo de profil",
        "status": "ok",
        "current": "Description de ce que tu vois",
        "verdict": "Ton visage est visible, souriant, fond coherent.",
        "conseil": null,
        "proposition": null
      },
      {
        "element": "nom",
        "label": "Nom d'affichage",
        "status": "improve",
        "current": "Le nom actuel",
        "verdict": "Pas optimise pour la recherche Instagram.",
        "conseil": "Ajouter un mot-cle metier dans le nom.",
        "proposition": "Prenom | Activite mot-cle"
      },
      {
        "element": "bio",
        "label": "Bio",
        "status": "improve",
        "current": "La bio complete",
        "verdict": "Positionnement OK mais promesse floue et pas de CTA.",
        "lignes": [
          {"texte": "Premiere ligne de la bio", "status": "ok", "commentaire": "Positionnement clair."},
          {"texte": "Deuxieme ligne", "status": "improve", "commentaire": "Remplace par ta promesse concrete."},
          {"texte": "(absent)", "status": "critical", "commentaire": "Il manque un CTA avec emoji pointant vers le lien."}
        ],
        "conseil": "Ajouter une ligne avec benefice client et CTA.",
        "proposition": "Ligne 1\nLigne 2\nLigne 3\nLigne 4 CTA"
      },
      {
        "element": "feed",
        "label": "Coherence visuelle du feed",
        "status": "ok",
        "current": "Description du feed",
        "verdict": "Identite visuelle forte et reconnaissable.",
        "conseil": "Alterner avec plus de photos de toi (visages = +38% likes).",
        "proposition": null
      },
      {
        "element": "highlights",
        "label": "Stories a la une",
        "status": "critical",
        "current": "Liste des highlights actuels",
        "verdict": "Il manque des highlights strategiques.",
        "conseil": "Ajouter : Qui je suis, Temoignages, Mes offres, Coulisses, Tips.",
        "proposition": null
      },
      {
        "element": "posts_epingles",
        "label": "Posts epingles",
        "status": "improve",
        "current": "Description",
        "verdict": "Tu rates ta vitrine.",
        "conseil": "3 posts : expertise + resultat + storytelling perso.",
        "proposition": null
      },
      {
        "element": "cta",
        "label": "Call to action",
        "status": "improve",
        "current": "Description du CTA actuel",
        "verdict": "Le lien existe mais rien ne donne envie de cliquer.",
        "conseil": "Ajouter une ligne avec emoji et benefice.",
        "proposition": null
      },
      {
        "element": "lien",
        "label": "Lien en bio",
        "status": "ok",
        "current": "Le lien actuel",
        "verdict": "Le lien est present et fonctionnel.",
        "conseil": null,
        "proposition": null
      }
    ],
    "priorite_1": {
      "element": "highlights",
      "message": "Tes stories a la une sont le plus gros levier d'amelioration."
    },
    "resume": {
      "ok_count": 3,
      "improve_count": 4,
      "critical_count": 1
    }
  },
  "sections": {
    "nom": {"score": 70, "summary": {"positives": ["..."], "improvements": ["..."]}, "recommendations": [{"number": 1, "title": "...", "explanation": "...", "example": "..."}], "proposed_version": "..."},
    "bio": {"score": 0, "summary": {"positives": ["..."], "improvements": ["..."]}, "recommendations": [{"number": 1, "title": "...", "explanation": "...", "example": "..."}], "proposed_version": "..."},
    "stories": {"score": 0, "summary": {"positives": ["..."], "improvements": ["..."]}, "recommendations": [{"number": 1, "title": "...", "explanation": "...", "example": "..."}]},
    "epingles": {"score": 0, "summary": {"positives": ["..."], "improvements": ["..."]}, "recommendations": [{"number": 1, "title": "...", "explanation": "...", "example": "..."}]},
    "feed": {"score": 0, "summary": {"positives": ["..."], "improvements": ["..."]}, "recommendations": [{"number": 1, "title": "...", "explanation": "...", "example": "..."}]},
    "edito": {"score": 0, "summary": {"positives": ["..."], "improvements": ["..."]}, "recommendations": [{"number": 1, "title": "...", "explanation": "...", "example": "..."}]}
  },
  "content_analysis": {
    "patterns_positifs": [
      {"number": 1, "title": "...", "explanation": "...", "metric_highlight": "...", "posts_concerned": ["..."]}
    ],
    "patterns_negatifs": [
      {"number": 1, "title": "...", "explanation": "...", "alternative": "..."}
    ]
  },
  "content_dna": [
    {"type": "Storytelling perso", "emoji": "...", "rating": 5, "verdict": "ton_arme"},
    {"type": "Carrousel", "emoji": "...", "rating": 4, "verdict": "continue"}
  ],
  "combo_gagnant": "Carrousel + Storytelling perso",
  "editorial_recommendations": {
    "recommended_mix": {"storytelling": 40, "opinion": 30, "coulisses": 20, "educatif": 10},
    "best_format": "carrousel",
    "best_angle": "storytelling_personnel",
    "best_content_types": ["storytelling", "prise_de_position"],
    "worst_content_types": ["educatif_liste"],
    "reel_advice": "...",
    "general_advice": "..."
  }
}`;
        userPrompt = "Analyse mon profil Instagram et donne-moi un audit complet avec audit visuel annote et analyse de performance des contenus.";

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

      } else if (type === "calendar-quick") {
        const { theme, objectif: calObj, angle: calAngle, format: calFormat, notes: calNotes, launchContext } = body;
        const formatMap: Record<string, string> = {
          post_carrousel: "Carrousel (texte structuré slide par slide : Slide 1, Slide 2, etc.)",
          reel: "Reel (script avec timing : 0-3 sec, 3-10 sec, etc.)",
          post_photo: "Post photo (texte de légende complet)",
          story: "Story (1 story unique)",
          story_serie: "Stories (séquence story par story)",
          live: "Live (plan de session structuré)",
        };
        const formatInstruction = calFormat ? `FORMAT : ${formatMap[calFormat] || calFormat}` : "FORMAT : Carrousel par défaut";

        let launchBlock = "";
        if (launchContext) {
          const lc = launchContext;
          launchBlock = `\nCONTEXTE LANCEMENT :\n- Phase : ${lc.phase || "?"}\n- Chapitre : ${lc.chapter_label || "?"}\n- Phase mentale audience : ${lc.audience_phase || "?"}\n- Objectif du slot : ${lc.objective || "?"}\n- Angle suggéré : ${lc.angle_suggestion || "?"}\n- Offre : "${lc.offer || "?"}"\n- Promesse : "${lc.promise || "?"}"\n- Objections : "${lc.objections || "?"}"\n`;
        }

        systemPrompt = `${CORE_PRINCIPLES}\n\n${FORMAT_STRUCTURES}\n\n${WRITING_RESOURCES}\n\nPROFIL DE L'UTILISATRICE :\n${fullContext}\n\nCONTEXTE DU POST :\n- Thème/sujet : "${theme || "?"}"\n- Objectif : ${calObj || "non précisé"}\n- Angle : ${calAngle || "non précisé"}\n- ${formatInstruction}\n- Notes : "${calNotes || "aucune"}"\n${launchBlock}\nRÈGLES :\n- Écriture inclusive avec point médian\n- JAMAIS de tiret cadratin (—). Utilise : ou ;\n- Le ton correspond au branding de l'utilisatrice\n- Utiliser ses expressions, son vocabulaire\n- Oral assumé mais pas surjoué\n- Phrases fluides et complètes\n- Le contenu a de la valeur même pour celles qui n'achètent pas\n- CTA conversationnel, jamais agressif\n\nGARDE-FOUS ÉTHIQUES :\n- Pas de fausse urgence\n- Pas de shaming\n- Pas de promesses de résultats garantis\n- Pas de FOMO artificiel\n\nGénère le contenu complet, prêt à copier-coller. Réponds avec le texte uniquement.`;
        userPrompt = `Rédige le contenu complet pour ce post sur "${theme || "?"}".`;

      } else {
        return new Response(
          JSON.stringify({ error: "Type de requête non reconnu" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Use claude-opus-4-6 for creative content, claude-sonnet for audit/analysis
    const isAnalysis = type === "instagram-audit" || type === "bio-audit";
    const model = isAnalysis ? "claude-sonnet-4-5-20250929" as const : "claude-opus-4-6" as const;
    const content = await callAnthropicSimple(model, systemPrompt, userPrompt, 0.8, 4096);

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
