import { PHOTO_NARRATIVE_CONTRACT } from "./photo-narrative.ts";
import { carouselLengthPrompt } from "../_shared/carousel-length.ts";
import { photoReadingContract, CAROUSEL_CONTINUITY, CAROUSEL_FACTS, CAROUSEL_SUBSTANCE, CAROUSEL_TITLES, carouselStructureGuide } from "./writing-contract.ts";

// Les SCHÉMAS (visual_schema) ne sont plus demandés à la rédaction depuis le
// 03/10/2026 : un étage séparé les décide sur le texte final
// (_shared/schema-formatting.ts). Ne pas réintroduire de consigne de schéma ici.
export const NO_SCHEMA_IN_WRITING = "visual_schema:null sur chaque slide : les schémas sont décidés après la rédaction, à partir du texte final. Développe donc tout le propos dans title et body.";

function brief(body: any, isLinkedIn: boolean, confirmed: string): string {
  return `${confirmed}
BRIEF ACTUEL : ${JSON.stringify({ subject: body.subject, details: body.subject_details, description: body.photo_description, objective: body.objective, answers: body.deepening_answers, selected_offer: body.selected_offer, editorial_angle: body.editorial_angle, content_structure: body.content_structure, scenario_origin: body.scenario_origin, proposed_or_validated_thread: body.narrative_thread })}
${body.slide_structure?.length ? `Répartition imposée : ${JSON.stringify(body.slide_structure)}. Conserve exactement ces ${body.slide_structure.length} slides, leur ordre, type et photo_index.` : ""}
${carouselLengthPrompt(body)}
${body.content_structure ? "La structure éditoriale choisie est à conserver. Ses rôles orientent le propos sans autoriser de faits ou d'émotions inventés." : "Choisis une progression adaptée à cette demande, sans arc dramatique imposé."}
Canal : ${isLinkedIn ? "LinkedIn. Registre professionnel, vouvoiement par défaut sauf voix contraire. Légende optionnelle (gérée aussi par un appel dédié)." : "Instagram. Registre demandé ; à défaut, accessible et chaleureux. Fournis une légende fidèle au sujet."}
${CAROUSEL_SUBSTANCE}
${CAROUSEL_CONTINUITY}
${CAROUSEL_TITLES}
La légende a les champs hook, body, cta, hashtags. Elle peut être concise : aucun minimum à meubler, aucun envers du décor inventé. CTA vide si inutile ou non demandé. Trois hashtags pertinents maximum ; ne suggère aucune fabrication, origine ou propriété absente.
`;
}

/** Mise en page du carrousel photo décidée APRÈS l'écriture (04/10/2026). */
export const PHOTO_LAYOUT_AFTER_WRITING = "La mise en page (gabarit, chiffre mis en avant, liste, étape, citation) est décidée après la rédaction, à partir du texte final : écris tout ce qui doit être lu dans overlay_text, en toutes lettres (un chiffre, une énumération ou un propos rapporté y figurent tels quels).";

export function photoWritingPrompt(body: any, isLinkedIn: boolean, confirmed: string): string {
  return `Rédige le texte d'un carrousel PHOTO, avec les photos choisies en fond.
${brief(body, isLinkedIn, confirmed)}
${PHOTO_NARRATIVE_CONTRACT}
Les photos sont numérotées depuis 1. Une photo peut se répéter pour porter plusieurs étapes du propos, même lorsqu'elle ne montre qu'une partie du sujet. Respecte l’ordre et les intentions effectivement validés ; vérifie les story_beat automatiques contre les faits. Ne prétends pas que la photo illustre un événement ou identifie une personne sans information fournie. Les textes peuvent expliquer un geste visible, développer une méthode, raconter une expérience fournie ou exprimer un point de vue ; ils ne doivent pas se réduire à des légendes indépendantes.

Écris les overlay_text comme les paragraphes successifs d'un même texte, avec leur lien de sens avant d'ajouter les kickers. Une suite de rubriques tirées du profil (matière, formes, technique, inspirations, usage) ne suffit pas : choisis une relation précise à faire comprendre, développe-la dans les pages prévues et termine ce développement. Ne déduis pas une chronologie de fabrication de l'ordre des photos. Les titres et les gabarits accompagnent ce texte sans le découper en notices indépendantes. La rédaction prépare une version concise avec ses détails en légende ; le rendu conserve ensuite ce texte final à l’identique.

CONTRAT VISUEL
overlay_text : un passage naturel ; couverture maximum 12. Préserve les transitions et nuances indispensables. Une phrase courte convient quand elle suffit ; ne transforme pas une explication en slogan pour tenir sur la photo. Le gabarit doit s’adapter au texte. Une photo qui se suffit peut avoir overlay_text:null. Le texte reste le récit ou l'explication, pas une suite de mots-clés. Ne remplis pas chaque champ facultatif.
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
Contrat : une idée principale par slide, title et body en prose adaptée au registre demandé ; body peut être vide sur la couverture. Les titres descriptifs et la numérotation d'étapes sont autorisés. Le champ role nomme la fonction réelle (présentation, caractéristique, usage, étape, argument, nuance, récit, etc.), sans imposer de bascule ni de révélation.
Retourne un objet JSON avec fil:{arrivee,etapes} en première clé (arrivee = proposition précise développée, pas thème ou parcours de photos ; etapes = chemin qui la fait comprendre), puis carousel_type, chosen_angle:{title,description}, slides, caption, quality_check:{} et publishing_tip:"". N'invente aucun conseil de performance ou moment optimal pour publier.
Chaque slide contient slide_number (entier depuis 1), role, title, body, visual_suggestion (composition, ambiance ou illustration dans ce champ technique), visual_schema (null), word_count (nombre réel de mots du texte). Aucun contenu éditorial supplémentaire dans les suggestions techniques.
Caption : hook (entrée dans le sujet, pas de nouvelle anecdote), body (complément ou résumé fidèle), cta (vide si inutile), hashtags (liste de trois mots-clés pertinents maximum). Aucun minimum de longueur et aucune posture d'expert ajoutée au ton demandé.`;
}

export function mixWritingPrompt(body: any, isLinkedIn: boolean, confirmed: string, textFirst: string): string {
  return `Rédige un carrousel MIXTE : photos et slides design participent au même propos.
${brief(body, isLinkedIn, confirmed)}
${PHOTO_NARRATIVE_CONTRACT}
CONTRAT DE COMPOSITION
Types : photo_full (photo plein écran, overlay_text généralement 15-45 mots selon la matière), photo_integrated (photo et texte, title/body), text_only (title/body, sans photo).
photo_integrated accepte photo_layout:top_photo,left_photo,right_photo,card_photo,banner_photo.
Sans répartition imposée : commence en photo_full, termine en text_only, ${body.text_first ? "deux à quatre slides photo au maximum (pas de ratio imposé en texte-d'abord)" : "au moins la moitié des slides avec photo"} ; alterne les types sans trois slides identiques consécutives. Une photo peut se répéter et on conserve les photos pertinentes. Une répartition confirmée prime sur ces préférences. La fin en text_only n'impose pas de CTA.
Les photos sont numérotées depuis 1. Respecte les photo_index et layouts confirmés. photo_index:null sur text_only. Le changement de type de slide ne change pas de mode d'écriture : overlay_text poursuit la même explication que les title/body voisins. Rédige d'abord cette prose continue, puis répartis-la dans les champs. Une description visible n'est utile que si elle explique ce que cet exemple apporte au propos en cours ; nommer les objets, couleurs ou motifs sans ce lien ne constitue pas une étape du récit. visual_anchor garde la description technique pour la composition, il ne remplace pas le passage public. Le texte peut expliquer ce que la photo ne montre pas sans inventer une scène. Une pause visuelle brute demandée reste sans texte.
body : longueur adaptée au développement, sans minimum ni plafond universel ; conserve les détails et nuances utiles. Un titre n'est pas nécessairement une mini-accroche. ${NO_SCHEMA_IN_WRITING}
${textFirst}
Retourne un objet JSON avec fil:{arrivee,etapes} en première clé (arrivee = proposition précise développée, pas thème ou parcours de photos ; etapes = chemin qui la fait comprendre), puis carousel_type:"mix", chosen_angle:{title,description}, slides et caption.
Chaque slide : slide_number, slide_type, photo_index, role, puis les champs propres au type. photo_full : overlay_text, overlay_position, overlay_style. photo_integrated : photo_layout,title,body. text_only : title,body,visual_schema (null). Pour les slides photo : visual_anchor et note, ainsi que photo_directive/photo_query_en/library_photo_index/news_entity quand le mode texte-d'abord le demande. Aucun placeholder ni auto-note de qualité.
`;
}

export const NEWS_WRITING = `
ACTUALITÉ : conserve le fait déclencheur et sa source comme point d'entrée visible. Situe les faits nécessaires avant le point de vue. Le cas d'actualité reste le sujet jusqu'à la dernière slide : la réaction personnelle et ce que la personne en tire pour son activité s'articulent au fil de l'analyse, en repartant chaque fois du cas, jamais dans une rubrique finale annoncée par son titre. Une réserve sur ce que la source permet d'affirmer tient dans la phrase où elle sert ; elle ne fait pas une slide à part. L'angle choisi (accroche et développement) est la thèse du carrousel : garde son idée forte et prends position à partir d'elle, avec la réaction personnelle et le lien métier qui en découlent. Ne transforme pas le branding en souvenir de lecture ou en expérience client. Si une information manque, ne fabrique pas de généralisation qui ressemble à un fait. Les photos choisies sont un support illustratif, pas une preuve de l'événement. Préserve la nuance et la position exprimées par la personne. Les limites de la source qualifient les affirmations concernées au moment où elles apparaissent ; ne les efface pas pour fluidifier le récit et n'invente aucune mesure ou omission. N'impose aucun lien commercial.
`;
