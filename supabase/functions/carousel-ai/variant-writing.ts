import { PHOTO_NARRATIVE_CONTRACT } from "./photo-narrative.ts";
import { carouselLengthPrompt } from "../_shared/carousel-length.ts";
import { photoReadingContract, CAROUSEL_CONTINUITY, CAROUSEL_FACTS, CAROUSEL_TITLES, carouselStructureGuide, carouselSubstance } from "./writing-contract.ts";
import { livedCaseFromCarouselBody, LIVED_CASE_FIRST, NEWS_FEELING_FIRST } from "../_shared/lived-case.ts";

// Les SCHÉMAS (visual_schema) ne sont plus demandés à la rédaction depuis le
// 03/10/2026 : un étage séparé les décide sur le texte final
// (_shared/schema-formatting.ts). Ne pas réintroduire de consigne de schéma ici.
export const NO_SCHEMA_IN_WRITING = "visual_schema:null sur chaque slide : les schémas sont décidés après la rédaction, à partir du texte final. Développe donc tout le propos dans title et body.";

/**
 * Réponses de l'utilisatrice mises en avant (« Ton cas d'abord », 04/10/2026) :
 * elles arrivaient en une ligne JSON au milieu du brief, sans rien qui dise
 * qu'elles portent sa preuve. La matière éditoriale choisie (idée) reste dans le
 * brief JSON : ce n'est pas un témoignage personnel.
 */
export function userAnswersBlock(body: any): string {
  const answers = body?.deepening_answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return typeof answers === "string" && answers.trim() ? `\nRÉPONSES DE LA PERSONNE (sa matière, avec ses mots) :\n${JSON.stringify(answers.trim())}\n` : "";
  }
  const own = Object.entries(answers).filter(([k, v]) => k !== "Brief éditorial choisi" && typeof v === "string" && v.trim());
  if (!own.length) return "";
  const mode = livedCaseFromCarouselBody(body).mode;
  const label = mode === "own_case" ? "SON CAS PERSONNEL (ses réponses : la preuve centrale de ce carrousel, à raconter avec ses mots)"
    : mode === "news_feeling" ? "SON RESSENTI SUR L'ACTU (ses réponses : le cœur de ce carrousel, à porter avec ses mots)"
    : "RÉPONSES DE LA PERSONNE (sa matière, avec ses mots)";
  const rule = mode === "own_case" ? LIVED_CASE_FIRST : mode === "news_feeling" ? NEWS_FEELING_FIRST : "";
  return `
${label} :
${own.map(([q, a]) => `- ${JSON.stringify(q)} → ${JSON.stringify(String(a).trim())}`).join("\n")}
${rule ? rule + "\n" : ""}`;
}

function briefAnswersRest(body: any): unknown {
  const answers = body?.deepening_answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return undefined;
  const material = answers["Brief éditorial choisi"];
  return typeof material === "string" && material.trim() ? { "Brief éditorial choisi": material } : undefined;
}

function brief(body: any, isLinkedIn: boolean, confirmed: string): string {
  const answersBlock = userAnswersBlock(body);
  const answersInJson = answersBlock ? briefAnswersRest(body) : body.deepening_answers;
  return `${confirmed}
BRIEF ACTUEL : ${JSON.stringify({ subject: body.subject, details: body.subject_details, description: body.photo_description, objective: body.objective, answers: answersInJson, selected_offer: body.selected_offer, editorial_angle: body.editorial_angle, content_structure: body.content_structure, scenario_origin: body.scenario_origin, proposed_or_validated_thread: body.narrative_thread })}${answersBlock}
${body.slide_structure?.length ? `Répartition imposée : ${JSON.stringify(body.slide_structure)}. Conserve exactement ces ${body.slide_structure.length} slides, leur ordre, type et photo_index.` : ""}
${carouselLengthPrompt(body)}
${body.content_structure ? "La structure éditoriale choisie est à conserver. Ses rôles orientent le propos sans autoriser de faits ou d'émotions inventés." : "Choisis une progression adaptée à cette demande, sans arc dramatique imposé."}
Canal : ${isLinkedIn ? "LinkedIn. Registre professionnel, vouvoiement par défaut sauf voix contraire. Légende optionnelle (gérée aussi par un appel dédié)." : "Instagram. Registre demandé ; à défaut, accessible et chaleureux. Fournis une légende fidèle au sujet."}
${carouselSubstance(livedCaseFromCarouselBody(body).mode)}
${CAROUSEL_CONTINUITY}
${CAROUSEL_TITLES}
La légende a les champs hook, body, cta, hashtags. Elle peut être concise : aucun minimum à meubler, aucun envers du décor inventé. CTA vide si inutile ou non demandé. Trois hashtags pertinents maximum ; ne suggère aucune fabrication, origine ou propriété absente.
`;
}

/** Mise en page du carrousel photo décidée APRÈS l'écriture (04/10/2026). */
export const PHOTO_LAYOUT_AFTER_WRITING = "La mise en page (gabarit, chiffre mis en avant, liste, étape, citation) est décidée après la rédaction, à partir du texte final : écris tout ce qui doit être lu dans overlay_text, en toutes lettres (un chiffre, une énumération ou un propos rapporté y figurent tels quels).";

// Mixte (04/10/2026) : la disposition (photo_layout, overlay_position,
// overlay_style) est choisie après l'écriture par _shared/mix-layout-formatting.ts.
// slide_type et photo_index restent à la rédaction : ils décident quel champ
// porte le texte (overlay court ou title/body) et donc la structure du récit.
export const MIX_LAYOUT_AFTER_WRITING = "La disposition (place de la photo, position et style du texte) est décidée après la rédaction, à partir du texte final : tu ne la renseignes pas.";

export function photoWritingPrompt(body: any, isLinkedIn: boolean, confirmed: string): string {
  return `Rédige le texte d'un carrousel PHOTO, avec les photos choisies en fond.
${brief(body, isLinkedIn, confirmed)}
${PHOTO_NARRATIVE_CONTRACT}
Les photos sont numérotées depuis 1. Une photo peut se répéter pour porter plusieurs étapes du propos, même lorsqu'elle ne montre qu'une partie du sujet. Respecte l’ordre et les intentions effectivement validés ; vérifie les story_beat automatiques contre les faits. Ne prétends pas que la photo illustre un événement ou identifie une personne sans information fournie. Les textes peuvent expliquer un geste visible, développer une méthode, raconter une expérience fournie ou exprimer un point de vue ; ils ne doivent pas se réduire à des légendes indépendantes.

Écris les overlay_text comme les paragraphes successifs d'un même texte, avec leur lien de sens avant d'ajouter les kickers. Une suite de rubriques tirées du profil (matière, formes, technique, inspirations, usage) ne suffit pas : choisis une relation précise à faire comprendre, développe-la dans les pages prévues et termine ce développement. Ne déduis pas une chronologie de fabrication de l'ordre des photos. Les titres et les gabarits accompagnent ce texte sans le découper en notices indépendantes. La rédaction prépare une version concise avec ses détails en légende ; le rendu conserve ensuite ce texte final à l’identique.

CONTRAT VISUEL
overlay_text : un passage naturel ; sur la couverture, l'accroche seule (10 mots maximum), son sous-titre éventuel dans detail, kicker:null. Préserve les transitions et nuances indispensables. Une phrase courte convient quand elle suffit ; ne transforme pas une explication en slogan pour tenir sur la photo. Le gabarit doit s’adapter au texte. Une photo qui se suffit peut avoir overlay_text:null. Le texte reste le récit ou l'explication, pas une suite de mots-clés. Ne remplis pas chaque champ facultatif.
overlay_style : narratif, sensoriel, minimal ou technique, selon la matière. overlay_position : bottom_left, bottom_center, top_left, top_center ou center.
${PHOTO_LAYOUT_AFTER_WRITING}
La dernière slide peut terminer une explication ou proposer une action pertinente ; elle n'impose pas de question. cta_label:null si aucune invitation. kicker (titre court de la slide) et detail sont facultatifs, ils servent la lecture sans doubler le texte.
Choisis overlay_position dans une zone dégagée, en protégeant le visage, le geste, l’objet et les détails utiles ; respecte une position confirmée. Une répétition de photo ne demande aucun zoom automatique.
visual_anchor : détail visible dans la photo, utile à sa composition. photo_description et note restent des indications techniques ; aucune prose nouvelle ne doit être cachée dans ces champs.

${photoReadingContract(body)}

Retourne un objet JSON avec fil:{arrivee,etapes} en première clé (arrivee = proposition précise développée, pas thème ou parcours de photos ; etapes = chemin qui la fait comprendre), puis carousel_type:"photo", chosen_angle:{title,description}, slides et caption.
Chaque slide contient slide_number, role, photo_index, photo_description, overlay_text, overlay_position, overlay_style, kicker, detail, cta_label, visual_anchor, note. Utilise null pour les champs facultatifs inapplicables, pas de placeholders ni de chiffres illustratifs. Les rôles décrivent ce que font les slides ; aucune révélation, émotion ou action obligatoire.`;
}

export function textWritingPrompt(body: any, isLinkedIn: boolean, confirmed: string): string {
  return `Rédige un carrousel TEXTE avec des suggestions visuelles séparées.
${brief(body, isLinkedIn, confirmed)}
${carouselLengthPrompt(body)}
${body.chosen_angle ? `Angle choisi à conserver : ${JSON.stringify(body.chosen_angle)}.` : ""}
${body.selected_hook ? `Accroche choisie par la personne : ${JSON.stringify(body.selected_hook)}. Conserve-la sur la première slide.` : ""}
${body.content_structure ? `Structure choisie à conserver : ${body.content_structure}.` : carouselStructureGuide(body.carousel_type)}
${CAROUSEL_FACTS}
${NO_SCHEMA_IN_WRITING}
Contrat : une idée principale par slide, title et body en prose adaptée au registre demandé ; sur la couverture, title = l'accroche (10 mots maximum) et body = un sous-titre facultatif de 12 mots maximum, ou vide. Les titres descriptifs et la numérotation d'étapes sont autorisés. Le champ role nomme la fonction réelle (présentation, caractéristique, usage, étape, argument, nuance, récit, etc.), sans imposer de bascule ni de révélation.
Retourne un objet JSON avec fil:{arrivee,etapes} en première clé (arrivee = proposition précise développée, pas thème ou parcours de photos ; etapes = chemin qui la fait comprendre), puis carousel_type, chosen_angle:{title,description}, slides, caption, quality_check:{} et publishing_tip:"". N'invente aucun conseil de performance ou moment optimal pour publier.
Chaque slide contient slide_number (entier depuis 1), role, title, body, visual_suggestion (composition, ambiance ou illustration dans ce champ technique), visual_schema (null), word_count (nombre réel de mots du texte). Aucun contenu éditorial supplémentaire dans les suggestions techniques.
Caption : hook (entrée dans le sujet, pas de nouvelle anecdote), body (complément ou résumé fidèle), cta (vide si inutile), hashtags (liste de trois mots-clés pertinents maximum). Aucun minimum de longueur et aucune posture d'expert ajoutée au ton demandé.`;
}

export function mixWritingPrompt(body: any, isLinkedIn: boolean, confirmed: string, textFirst: string): string {
  return `Rédige un carrousel MIXTE : photos et slides design participent au même propos.
${brief(body, isLinkedIn, confirmed)}
${PHOTO_NARRATIVE_CONTRACT}
CONTRAT DE COMPOSITION
Types : photo_full (photo plein écran, overlay_text généralement 15-45 mots selon la matière ; sur la couverture : l'accroche seule, 10 mots maximum, sous-titre facultatif dans detail), photo_integrated (photo et texte, title/body), text_only (title/body, sans photo).
${MIX_LAYOUT_AFTER_WRITING}
Sans répartition imposée : commence en photo_full (la couverture est une photo plein cadre), termine en text_only, ${body.text_first ? "deux à quatre slides photo au maximum (pas de ratio imposé en texte-d'abord)" : "au moins la moitié des slides avec photo"} ; alterne les types sans trois slides identiques consécutives. Une photo peut se répéter et on conserve les photos pertinentes. Une répartition confirmée prime sur ces préférences. La fin en text_only n'impose pas de CTA.
Les photos sont numérotées depuis 1. Respecte les photo_index confirmés. photo_index:null sur text_only. Le changement de type de slide ne change pas de mode d'écriture : overlay_text poursuit la même explication que les title/body voisins. Rédige d'abord cette prose continue, puis répartis-la dans les champs. Une description visible n'est utile que si elle explique ce que cet exemple apporte au propos en cours ; nommer les objets, couleurs ou motifs sans ce lien ne constitue pas une étape du récit. visual_anchor garde la description technique pour la composition, il ne remplace pas le passage public. Le texte peut expliquer ce que la photo ne montre pas sans inventer une scène. Une pause visuelle brute demandée reste sans texte.
body : longueur adaptée au développement, sans minimum ni plafond universel ; conserve les détails et nuances utiles. Un titre n'est pas nécessairement une mini-accroche. ${NO_SCHEMA_IN_WRITING}
${textFirst}
Retourne un objet JSON avec fil:{arrivee,etapes} en première clé (arrivee = proposition précise développée, pas thème ou parcours de photos ; etapes = chemin qui la fait comprendre), puis carousel_type:"mix", chosen_angle:{title,description}, slides et caption.
Chaque slide : slide_number, slide_type, photo_index, role, puis les champs propres au type. photo_full : overlay_text (et detail, sous-titre facultatif, sur la couverture seulement). photo_integrated : title,body. text_only : title,body,visual_schema (null). Pour les slides photo : visual_anchor et note, ainsi que photo_directive/photo_query_en/library_photo_index/news_entity quand le mode texte-d'abord le demande. Aucun placeholder ni auto-note de qualité.
`;
}

export const NEWS_WRITING = `
ACTUALITÉ : conserve le fait déclencheur et sa source comme point d'entrée visible. Situe les faits nécessaires avant le point de vue. Le cas d'actualité reste le sujet jusqu'à la dernière slide : la réaction personnelle et ce que la personne en tire pour son activité s'articulent au fil de l'analyse, en repartant chaque fois du cas, jamais dans une rubrique finale annoncée par son titre. Une réserve sur ce que la source permet d'affirmer tient dans la phrase où elle sert ; elle ne fait pas une slide à part. L'angle choisi (accroche et développement) est la thèse du carrousel : garde son idée forte et prends position à partir d'elle, avec la réaction personnelle et le lien métier qui en découlent. Ne transforme pas le branding en souvenir de lecture ou en expérience client. Si une information manque, ne fabrique pas de généralisation qui ressemble à un fait. Les photos choisies sont un support illustratif, pas une preuve de l'événement. Préserve la nuance et la position exprimées par la personne. Les limites de la source qualifient les affirmations concernées au moment où elles apparaissent ; ne les efface pas pour fluidifier le récit et n'invente aucune mesure ou omission. N'impose aucun lien commercial. Termine de préférence par une question simple, facile à répondre en commentaire (un chiffre, un oui ou non, un choix entre deux), reliée à la position défendue.
`;

/** Phrase d'ordre de NEWS_WRITING sans ressenti fourni : l'actu reste le sujet jusqu'au bout. */
export const NEWS_ORDER = "Le cas d'actualité reste le sujet jusqu'à la dernière slide : la réaction personnelle et ce que la personne en tire pour son activité s'articulent au fil de l'analyse, en repartant chaque fois du cas, jamais dans une rubrique finale annoncée par son titre.";
const NEWS_ENDING = "Termine de préférence par une question simple, facile à répondre en commentaire (un chiffre, un oui ou non, un choix entre deux), reliée à la position défendue.";

/**
 * Consigne d'actu selon la matière (05/10/2026, « l'actu déclenche, ton ressenti
 * porte le contenu ») : sans réponse, NEWS_WRITING tel quel ; avec son ressenti,
 * une seule consigne d'ordre (actu posée vite et juste, puis son ressenti jusqu'à
 * la fin) au lieu de « l'actu reste le sujet jusqu'à la dernière slide ».
 */
export function newsWriting(body: any): string {
  if (livedCaseFromCarouselBody(body).mode !== "news_feeling") return NEWS_WRITING;
  return NEWS_WRITING
    .replace(NEWS_ORDER, "L'actualité ouvre le contenu, posée vite et juste ; ensuite son ressenti, sa position et ce que ça dit de son métier portent la suite jusqu'à la fin (règle « L'ACTU DÉCLENCHE, SON RESSENTI PORTE LE CONTENU »), jamais dans une rubrique finale annoncée par son titre.")
    .replace(NEWS_ENDING, "Termine sur sa position ou sur une question simple, facile à répondre en commentaire (un chiffre, un oui ou non, un choix entre deux), reliée à cette position.");
}
