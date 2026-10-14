// Consigne de rédaction finale (étape `generate`) de creative-flow : choix du
// brief par format, structures et ressources exclues par format, JSON de sortie,
// contexte de lancement. Déplacée À L'IDENTIQUE depuis index.ts (fiche 3,
// lot C, 14/10/2026), qui la réexporte. Fait encore 2 lectures en base pour les
// stories (garde-fou vente, catalogue photos) : à sortir dans formats/stories.ts
// au lot F. Touche TOUS les formats : voir docs/creation-contenu/CARTE.md.

import { currentContentContract } from "../../_shared/editorial-voice.ts";
import { FORMAT_STRUCTURES, WRITING_RESOURCES, CHAIN_OF_THOUGHT, ANTI_BIAS, PREGEN_INJECTION_RULES, VISUAL_ANALOGIES } from "../../_shared/copywriting-prompts.ts";
import { type AudienceAddress } from "../../_shared/audience-address.ts";
import { livedCaseFromCreativeBody, LIVED_CASE_FIRST, NEWS_FEELING_FIRST } from "../../_shared/lived-case.ts";
import { carouselBrief, reelBrief, storiesBrief, linkedinBrief, pinterestBrief, newsletterBrief, photoCaptionBrief, captionBrief, positionDepthBlock } from "../../_shared/format-briefs.ts";
import { isFactualFictionalLinkedInBrief } from "../formats/linkedin.ts";

export async function buildGeneratePrompt(params: {
  supabase: any;
  userId: string;
  workspace_id?: string | null;
  body: any;
  COMMON_PREFIX: string;
  context: string;
  contentType?: string | null;
  editorialFormat?: string | null | undefined;
  editorialFormatLabel?: string | null;
  angle: any;
  answers?: any[];
  followUpAnswers?: any[];
  calendarBlock: string;
  objectiveBlock: string;
  newsContextBlock: string;
  preGenBlock: string;
  effectiveObjective?: string | null | undefined;
  pinterest_link?: string | null | undefined;
  pinterest_board?: string | null | undefined;
  variation?: boolean | null;
  previousContent?: string | null;
  isCarousel: boolean;
  isReel: boolean;
  isStories: boolean;
  isLinkedIn: boolean;
  isPinterest: boolean;
  isNewsletter: boolean;
  isPhotoMode: boolean;
  /** Tu ou vous de la fiche de marque : remplace les consignes d'adresse figées des stories (04/10/2026). */
  audienceAddress?: AudienceAddress | null;
}): Promise<{ systemPrompt: string; userPrompt: string; storiesPhotoCatalog: { index: number; id: string; description: string; preferred?: boolean }[] }> {
  const {
    supabase, userId, workspace_id, body, COMMON_PREFIX, context, contentType, editorialFormat, editorialFormatLabel,
    angle, answers, followUpAnswers, calendarBlock, objectiveBlock, newsContextBlock, preGenBlock, effectiveObjective,
    pinterest_link, pinterest_board, variation, previousContent,
    isCarousel, isReel, isStories, isLinkedIn, isPinterest, isNewsletter, isPhotoMode,
  } = params;

  let storiesPhotoCatalog: { index: number; id: string; description: string; preferred?: boolean }[] = [];

  const answersBlock = answers?.length
    ? answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n")
    : "";

  if (isLinkedIn && !isPhotoMode && isFactualFictionalLinkedInBrief(context)) {
    return {
      systemPrompt: `Tu écris en français un court post LinkedIn factuel sur un exemple explicitement fictif. Le brief et les réponses éventuelles sont tes seules sources. Ignore le profil de marque, les angles, le calendrier et les objectifs externes. Commence par indiquer que l'exemple est fictif, puis présente seulement les caractéristiques affirmées dans le brief. Si la source contient quatre faits, quatre faits suffisent : le texte doit rester court. N'ajoute ni contexte de test, ni exercice de communication, ni commentaire sur la rédaction, ni morale ou conseil. Ne transforme pas les interdictions du brief en une liste de propriétés absentes. Ne déduis ni commande, ni disponibilité, ni fabrication, ni intention personnelle. Un mode de retrait n'implique pas que l'objet est « disponible » : formule seulement « retrait uniquement dans… » si c'est le fait fourni. N'écris à la première personne que si la source contient des propos personnels à reprendre. Réponds uniquement en JSON valide : {"content":"post complet avec phrase d'ouverture","accroche":"copie exacte de la première ligne de content","format":"linkedin","pillar":"","objectif":"","personal_tip":null}.`,
      userPrompt: `BRIEF FACTUEL FICTIF :\n${context}${answersBlock ? `\n\nPRÉCISIONS DE L'UTILISATRICE :\n${answersBlock}` : ""}\n\nRédige le post LinkedIn sur le sujet du brief, sans reprendre ses consignes de contrôle dans le post.`,
      storiesPhotoCatalog,
    };
  }
  const followUpBlock = followUpAnswers?.length
    ? "\n\nQUESTIONS D'APPROFONDISSEMENT :\n" + followUpAnswers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n")
    : "";

  // Format variables (isLinkedIn, isCarousel, etc.) are defined in outer scope

  // Build format-specific depth instructions
  let depthMandate = "";
  let storiesGardeFouAlerte: string | null = null;
  if (isCarousel) {
    depthMandate = carouselBrief();
  } else if (isReel) {
    depthMandate = reelBrief({
      effectiveObjective,
      face_cam: body.face_cam,
      time_available: body.time_available,
      is_launch: body.is_launch,
      selected_hook: body.selected_hook,
      pre_gen_answers: body.pre_gen_answers,
      subject: context,
      editorial_angle: body.editorial_angle,
      content_structure: body.content_structure,
      inspiration_context: body.inspiration_context,
    });
  } else if (isStories) {
    // Garde-fou : 3 séquences vente sur 7 jours (migré depuis stories-ai)
    if (effectiveObjective === "vente") {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const gardeFouCol = workspace_id ? "workspace_id" : "user_id";
      const gardeFouVal = workspace_id || userId;
      const { count } = await supabase
        .from("stories_sequences")
        .select("id", { count: "exact", head: true })
        .eq(gardeFouCol, gardeFouVal)
        .eq("objective", "vente")
        .gte("created_at", sevenDaysAgo);
      if ((count ?? 0) >= 3) {
        storiesGardeFouAlerte = "⚠️ Tes stories récentes sont très orientées vente. Reviens à de la connexion ou de l'éducation pour maintenir la confiance. Ratio sain : 80% connexion/éducation, 20% vente.";
      }
    }
    // Catalogue bibliothèque (lot B) : l'IA écrit la séquence en SACHANT
    // quelles photos existent (descriptions écrites par photo-describe à
    // l'upload). Index courts dans le prompt (jamais d'UUID : trop long,
    // risque de recopie erronée) ; la résolution index → id se fait après
    // le parse, côté edge, de façon déterministe.
    // Lot D : les photos CHOISIES à l'étape format (preferred_photo_ids)
    // passent en tête du catalogue, marquées « chosen » — le brief les
    // traite en priorité absolue et le post-parse garantit leur placement.
    {
      const catCol = workspace_id ? "workspace_id" : "user_id";
      const catVal = workspace_id || userId;
      const rawPreferred = (body as Record<string, unknown>).preferred_photo_ids;
      const preferredIds: string[] = Array.isArray(rawPreferred)
        ? rawPreferred.filter((x: unknown): x is string => typeof x === "string").slice(0, 10)
        : [];
      const { data: catRows, error: catErr } = await supabase
        .from("user_photos")
        .select("id, description")
        .eq(catCol, catVal)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(60);
      if (catErr) {
        // Jamais bloquant : sans catalogue, la génération garde le
        // comportement historique (directives seules).
        console.warn("[creative-flow] catalogue photos illisible:", catErr.message);
      }
      type CatRow = { id: string; description: string | null };
      const rows = (catRows || []) as CatRow[];
      // Les préférées passent MÊME sans description (photo fraîchement
      // uploadée, describe encore en cours) ; le reste doit être décrit.
      const preferredRows = preferredIds
        .map((id) => rows.find((r) => r.id === id))
        .filter((r): r is CatRow => !!r);
      const otherRows = rows
        .filter(
          (r) =>
            !preferredIds.includes(r.id) &&
            typeof r.description === "string" &&
            r.description.trim().length > 0,
        )
        .slice(0, Math.max(0, 40 - preferredRows.length));
      storiesPhotoCatalog = [...preferredRows, ...otherRows].map((r, i) => ({
        index: i + 1,
        id: r.id,
        description:
          typeof r.description === "string" && r.description.trim().length > 0
            ? r.description.trim()
            : "photo choisie par l'utilisatrice (pas encore décrite)",
        preferred: preferredIds.includes(r.id),
      }));
    }
    depthMandate = storiesBrief({
      objective: effectiveObjective,
      price_range: body.price_range,
      time_available: body.time_available,
      face_cam: body.face_cam,
      is_launch: body.is_launch,
      gardeFouAlerte: storiesGardeFouAlerte,
      pre_gen_answers: body.pre_gen_answers,
      subject: context,
      audienceAddress: params.audienceAddress ?? null,
      photo_catalog: storiesPhotoCatalog.map(({ index, description, preferred }) => ({
        index,
        description,
        chosen: preferred || undefined,
      })),
    });
  } else if (isLinkedIn) {
    depthMandate = linkedinBrief(editorialFormat ?? null);
  } else if (isPinterest) {
    depthMandate = pinterestBrief(pinterest_link ?? null, pinterest_board ?? null);
  } else if (isNewsletter) {
    depthMandate = newsletterBrief();
  } else if (isPhotoMode) {
    depthMandate = photoCaptionBrief(body.photo_description);
  } else {
    depthMandate = captionBrief(effectiveObjective ?? null);
  }
  // Posts (hors légende photo), reels et stories défendent une position (#1292 pour le carrousel).
  const positionFormat = isReel ? "reel" : isStories ? "stories"
    : (!isCarousel && !isLinkedIn && !isPinterest && !isNewsletter && !isPhotoMode) ? "caption" : null;
  // « Ton cas d'abord » (04/10/2026) : avec un cas personnel fourni, la lecture
  // sociale en « on / nous » laisse la place à son vécu, preuve centrale.
  // Actu (05/10/2026) : l'accroche de l'IA n'est jamais un vécu ; avec ses
  // réponses, « l'actu déclenche, son ressenti porte le contenu ».
  const caseMode = livedCaseFromCreativeBody(body).mode;
  if (positionFormat) depthMandate += `\n\n${positionDepthBlock(positionFormat, !!newsContextBlock, caseMode)}`;
  else if (isLinkedIn && caseMode === "own_case") depthMandate += `\n\n${LIVED_CASE_FIRST}`;
  else if (isLinkedIn && caseMode === "news_feeling") depthMandate += `\n\n${NEWS_FEELING_FIRST}`;

  let systemPrompt = `${COMMON_PREFIX}

${ANTI_BIAS}

${isLinkedIn || isPinterest || isNewsletter || isStories ? "" : FORMAT_STRUCTURES}

${isLinkedIn || isPinterest || isStories ? "" : WRITING_RESOURCES}

${isLinkedIn || isPinterest || isNewsletter || isStories ? "" : VISUAL_ANALOGIES}

${angle ? `ANGLE CHOISI :
- Titre : ${angle.title}
- Structure : ${(angle.structure || []).join(" → ")}
- Ton : ${angle.tone}` : "Pas d'angle spécifique choisi. Choisis le meilleur angle pour le sujet."}

SUJET DE L'UTILISATRICE :
"""
${context}
"""
Le contenu DOIT parler de ce sujet. Les réponses aux questions ci-dessous enrichissent le sujet mais ne le remplacent pas.

CANAL : ${contentType || "Post Instagram"}
${editorialFormatLabel ? `FORMAT ÉDITORIAL : ${editorialFormatLabel}` : ""}
${angle?.format_livraison ? `FORMAT DE LIVRAISON : ${angle.format_livraison}` : ""}

${depthMandate}

RÉPONSES DE L'UTILISATRICE :
${answersBlock}
${followUpBlock}
${calendarBlock}${objectiveBlock}${newsContextBlock}
${preGenBlock}

RÈGLE ANTI-FABRICATION :
N'invente JAMAIS une anecdote, un cas client ou un chiffre que l'utilisatrice n'a pas écrit.
Pas de vécu fourni → angle expert : décryptage, constat décalé, prise de position.

${PREGEN_INJECTION_RULES}

═══════════════════════════════════════════════════
PROFONDEUR (RÈGLE ABSOLUE)
═══════════════════════════════════════════════════

Tu ne fais JAMAIS de contenu de surface. Chaque contenu doit donner au lecteur quelque chose qu'il ne savait pas, qu'il n'avait pas vu comme ça, ou qu'il n'aurait pas formulé aussi bien.

Profondeur = au moins UN de ces éléments dans chaque contenu :
1. Un EXEMPLE CONCRET (pas "par exemple, imagine que..." mais une vraie situation, un vrai cas, un vrai chiffre)
2. Un MÉCANISME EXPLIQUÉ (le "pourquoi" derrière le "quoi" : pourquoi ça marche, pourquoi on se trompe, pourquoi c'est contre-intuitif)
3. Une NUANCE qui surprend (le "oui, mais" ou le "sauf que" qui empêche le contenu d'être un conseil générique)
4. Un LIEN INATTENDU (connecter le sujet à un domaine auquel personne n'avait pensé)

Si ton contenu pourrait être écrit par n'importe quel compte de la même niche, c'est pas assez profond. Ce qui le rend unique, c'est le point de vue, les exemples, et les nuances de l'utilisatrice.

Les gens scrollent les contenus qui DISENT des choses qu'ils savaient déjà.
Ils s'arrêtent sur les contenus qui leur font VOIR les choses autrement.

═══════════════════════════════════════════════════
SELF-CHECK (fais-le en interne avant de répondre)
═══════════════════════════════════════════════════

Avant de retourner le JSON, vérifie :
1. Est-ce que le contenu a au moins 1 exemple concret ? (pas une généralité)
2. Est-ce que l'accroche est assez forte pour stopper le scroll ?
3. Est-ce que j'ai utilisé les MOTS de l'utilisatrice (ses réponses, ses expressions) ?
4. Est-ce que le contenu dit quelque chose de SPÉCIFIQUE (qu'on ne pourrait pas copier-coller pour un autre sujet) ?
5. Est-ce que la longueur respecte le format demandé ?
6. Est-ce que le contenu passe le test du café (lisible à voix haute sans sonner robot) ?
Si une réponse est NON, RÉÉCRIS avant de retourner.

═══════════════════════════════════════════════════
DERNIÈRES VÉRIFICATIONS (À APPLIQUER APRÈS RÉDACTION)
═══════════════════════════════════════════════════

${CHAIN_OF_THOUGHT}

ANTI-SLOP FINAL — Relis ton output et vérifie :
1. Contient-il un marqueur IA banni (rafale de phrases courtes, "Et là tout a basculé", storytelling fabriqué) ? → Réécris la phrase.
2. Chaque phrase ajoute-t-elle une information NOUVELLE ? → Supprime toute redondance.
3. Pourrais-tu dire ce texte à voix haute à une amie sans que ça sonne bizarre ? → Simplifie ce qui coince.
4. Le texte fait-il la bonne longueur ? Si tu peux dire la même chose en moins de mots → Coupe.
Retourne UNIQUEMENT la version finale corrigée.

${variation && previousContent ? `
═══════════════════════════════════════════════════
MODE RÉÉCRITURE : VERSION ALTERNATIVE
═══════════════════════════════════════════════════

L'utilisatrice a déjà reçu cette version et veut AUTRE CHOSE :
"""
${previousContent.slice(0, 2000)}
"""

Tu DOIS proposer une version SIGNIFICATIVEMENT DIFFÉRENTE :
- Accroche DIFFÉRENTE : pas la même reformulée, une AUTRE approche (si la v1 commençait par une question, commence par une affirmation choc ; si la v1 était un constat, commence par une anecdote)
- Point d'entrée DIFFÉRENT dans le sujet (si la v1 partait du problème, pars de la solution ; si la v1 était éducative, sois émotionnelle)
- Le message central reste cohérent mais l'angle d'attaque change
- Ne fais PAS une variation cosmétique (mêmes idées avec d'autres mots). Fais une VRAIE alternative.
` : ""}
${isStories ? "Rédige la séquence en suivant le FORMAT et les GARDE-FOUS ci-dessus." : "Rédige le contenu en suivant les INSTRUCTIONS DE RÉDACTION FINALE ci-dessus."}
Le contenu doit être PRÊT À POSTER (pas un brouillon).
${currentContentContract([context, answersBlock, followUpBlock].filter(Boolean).join("\n"))}

${isReel || isStories ? `` : isNewsletter ? `Un email part en TEXTE BRUT : aucune valeur ne doit contenir de markdown (**gras**, *italique*, ## titres) — les astérisques s'afficheraient tels quels chez le lecteur. Pour un aparté, utilise des parenthèses.

Réponds UNIQUEMENT en JSON :
{
  "subject": "objet de l'email (max 50 caractères, accrocheur, jamais 'Newsletter #N')",
  "preview_text": "texte de preview (40-90 caractères, situe le sujet si l'objet est allusif, fidèle au corps)",
  "content": "corps complet de la newsletter : situation identifiable dans les premières phrases, même sans lire l'objet (avec \\n\\n entre paragraphes)",
  "accroche": "première phrase du corps",
  "cta_suggestion": "suggestion de CTA doux si pertinent, sinon null",
  "format": "newsletter",
  "pillar": "...",
  "objectif": "...",
  "personal_tip": "conseil d'incarnation SEULEMENT si demandé plus haut, sinon null"
}` : `Réponds UNIQUEMENT en JSON :
{
  "content": "...",
  "accroche": "...",
  "format": "...",
  "pillar": "...",
  "objectif": "...",
  "personal_tip": "conseil d'incarnation SEULEMENT si demandé plus haut, sinon null"
}`}`;
  // Inject launch context for stories AND reels (preserved from stories-ai / reels-ai)
  if ((isStories || isReel) && body.launch_context) {
    const lc = body.launch_context;
    systemPrompt += `\n\nCONTEXTE LANCEMENT :\n- Phase : ${lc.phase || "?"}\n- Chapitre : ${lc.chapter_label || "?"}\n- Phase mentale audience : ${lc.audience_phase || "?"}\n- Objectif du slot : ${lc.objective || "?"}\n- Angle suggéré : ${lc.angle_suggestion || "?"}\nCONSIGNE : adapte le contenu à cette phase du lancement. Un contenu de phase "vente" n'a pas le même ton qu'un contenu de phase "teasing".`;
  }
  const userPrompt = "Rédige mon contenu à partir de mes réponses et de l'angle choisi.";

  return { systemPrompt, userPrompt, storiesPhotoCatalog };
}
