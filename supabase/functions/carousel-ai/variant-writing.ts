import { CAROUSEL_CONTINUITY, CAROUSEL_SUBSTANCE, CAROUSEL_TITLES } from "./writing-contract.ts";

export const VISUAL_SCHEMA_CONTRACT = `SCHÉMAS : objet {type,...données}, jamais une chaîne descriptive ni un objet data intermédiaire. Zéro à deux schémas maximum, jamais consécutifs. Utilise seulement des valeurs établies et utiles à la slide ; null si les champs ne peuvent pas être remplis. Types et formes conservés :
before_after:{before:{label,items},after:{label,items}} ; comparison:{left:{label,items},right:{label,items}} ; timeline:{steps:[{label,desc}]} ; checklist:{title,items:[{text,checked}]} ; stats:{items:[{number,label}]} ; matrix_2x2:{x_axis:{left,right},y_axis:{bottom,top},quadrants:[{position,label,emoji}]} ; pyramid:{levels:[{label,desc}]} ; equation:{parts:[{label}],result:{label},operator} ; flowchart:{start,branches:[{condition,result}]} ; scale:{left:{label},right:{label},marker:{position,label}} ; icon_grid:{items:[{emoji,label}]} ; story_arc:{steps:[{label,desc}]} ; quote_big:{quote,attribution?,context?} ; objection_response:{objection,response} ; process_visible:{stages:[{label,desc}]} (exactement trois stages, sinon timeline).
Les descriptions restent courtes et lisibles. Les exemples ci-dessus sont des noms de champs, pas du texte à copier. Les schémas sont facultatifs : choisis-les pour expliquer une relation, pas pour imposer une opposition ou une révélation. Garde les vrais contrastes lorsqu'ils clarifient les données.`;

function brief(body: any, isLinkedIn: boolean, confirmed: string): string {
  return `${confirmed}
BRIEF ACTUEL : ${JSON.stringify({ subject: body.subject, details: body.subject_details, description: body.photo_description, objective: body.objective, answers: body.deepening_answers, selected_offer: body.selected_offer, editorial_angle: body.editorial_angle, content_structure: body.content_structure, narrative_thread: body.narrative_thread })}
${body.slide_structure?.length ? `Répartition imposée : ${JSON.stringify(body.slide_structure)}. Conserve exactement ces ${body.slide_structure.length} slides, leur ordre, type et photo_index.` : ""}
${body.slide_count ? `Nombre demandé : exactement ${body.slide_count} slides, sauf structure confirmée de longueur différente qui prime.` : `Sans nombre imposé, cible ${body.carousel_type === "mix" ? 8 : 5} slides, ajuste à la matière et aux photos.`}
${body.content_structure ? "La structure éditoriale choisie est à conserver. Ses rôles orientent le propos sans autoriser de faits ou d'émotions inventés." : "Choisis une progression adaptée à cette demande, sans arc dramatique imposé."}
Canal : ${isLinkedIn ? "LinkedIn. Registre professionnel, vouvoiement par défaut sauf voix contraire. Légende optionnelle (gérée aussi par un appel dédié)." : "Instagram. Registre demandé ; à défaut, accessible et chaleureux. Fournis une légende fidèle au sujet."}
${CAROUSEL_SUBSTANCE}
${CAROUSEL_CONTINUITY}
${CAROUSEL_TITLES}
La légende a les champs hook, body, cta, hashtags. Elle peut être concise : aucun minimum à meubler, aucun envers du décor inventé. CTA vide si inutile ou non demandé. Trois hashtags pertinents maximum ; ne suggère aucune fabrication, origine ou propriété absente.
`;
}

export function photoWritingPrompt(body: any, isLinkedIn: boolean, confirmed: string): string {
  return `Rédige le texte d'un carrousel PHOTO, avec les photos choisies en fond.
${brief(body, isLinkedIn, confirmed)}
Les photos sont numérotées depuis 1. Une photo peut se répéter pour porter plusieurs étapes du propos, même lorsqu'elle ne montre qu'une partie du sujet. Respecte l'ordre et les story_beat confirmés. Ne prétends pas que la photo illustre un événement ou identifie une personne sans information fournie. Les textes peuvent expliquer un geste visible, développer une méthode, raconter une expérience fournie ou exprimer un point de vue ; ils ne doivent pas se réduire à des légendes indépendantes.

CONTRAT VISUEL
overlay_text : une phrase naturelle, généralement 5-25 mots, maximum 28 ; couverture maximum 12. Une photo qui se suffit peut avoir overlay_text:null. Le texte reste le récit ou l'explication, pas une suite de mots-clés. Ne remplis pas chaque champ facultatif.
overlay_style : narratif, sensoriel, minimal ou technique, selon la matière. overlay_position : bottom_left, bottom_center, top_left, top_center ou center.
Gabarits conservés : couverture (première slide), profonde (prose, défaut), etiquette (label court), chiffre (big_number sourcé), liste (points courts), etape (step_number), citation (verbatim fourni, attribution), finale (dernière slide).
La finale peut terminer une explication ou proposer une action pertinente ; ce gabarit n'impose pas de question. cta_label:null si aucune invitation. kicker et detail sont facultatifs, ils servent la lecture sans doubler le texte. Une slide sans texte n'a pas de template.
visual_anchor : détail visible dans la photo, utile à sa composition. photo_description et note restent des indications techniques ; aucune prose nouvelle ne doit être cachée dans ces champs.

Retourne un objet JSON avec carousel_type:"photo", chosen_angle:{title,description}, slides et caption.
Chaque slide contient slide_number, role, photo_index, photo_description, overlay_text, overlay_position, overlay_style, template, kicker, detail, points, big_number, step_number, attribution, cta_label, visual_anchor, note. Utilise null pour les champs facultatifs inapplicables, pas de placeholders ni de chiffres illustratifs. Les rôles décrivent ce que font les slides ; aucune révélation, émotion ou action obligatoire.`;
}

export function mixWritingPrompt(body: any, isLinkedIn: boolean, confirmed: string, textFirst: string): string {
  return `Rédige un carrousel MIXTE : photos et slides design participent au même propos.
${brief(body, isLinkedIn, confirmed)}
CONTRAT DE COMPOSITION
Types : photo_full (photo plein écran, overlay_text 5-20 mots), photo_integrated (photo et texte, title/body), text_only (title/body, sans photo).
photo_integrated accepte photo_layout:top_photo,left_photo,right_photo,card_photo,banner_photo.
Sans répartition imposée : commence en photo_full, termine en text_only, ${body.text_first ? "deux à quatre slides photo au maximum (pas de ratio imposé en texte-d'abord)" : "au moins la moitié des slides avec photo"} ; alterne les types sans trois slides identiques consécutives. Une photo peut se répéter et on conserve les photos pertinentes. Une répartition confirmée prime sur ces préférences. La fin en text_only n'impose pas de CTA.
Les photos sont numérotées depuis 1. Respecte les photo_index et layouts confirmés. photo_index:null sur text_only. Les overlays complètent le sujet et l'image ; une description utile est autorisée. Le texte peut expliquer ce que la photo ne montre pas sans inventer une scène.
body : maximum ${isLinkedIn ? 80 : 50} mots, sans minimum ; conserve les détails et nuances utiles. Un titre n'est pas nécessairement une mini-accroche. Un schéma n'est utile que s'il explique un processus, une comparaison ou des données disponibles : 0 à 2 maximum, jamais consécutifs. visual_schema:null à défaut ; si présent, un objet typé, jamais une description sous forme de chaîne.
${VISUAL_SCHEMA_CONTRACT}
${textFirst}
Retourne un objet JSON avec carousel_type:"mix", chosen_angle:{title,description}, slides et caption.
Chaque slide : slide_number, slide_type, photo_index, role, puis les champs propres au type. photo_full : overlay_text, overlay_position, overlay_style. photo_integrated : photo_layout,title,body. text_only : title,body,visual_schema. Pour les slides photo : visual_anchor et note, ainsi que photo_directive/photo_query_en/library_photo_index/news_entity quand le mode texte-d'abord le demande. Aucun placeholder ni auto-note de qualité.
`;
}

export const NEWS_WRITING = `
ACTUALITÉ : conserve le fait déclencheur et sa source comme point d'entrée visible. Situe les faits nécessaires avant le point de vue. La réaction personnelle et le lien métier suivent l'angle choisi, sans désaccord, décalage ni quota d'opinions imposés. Ne transforme pas le branding en souvenir de lecture ou en expérience client. Si une information manque, ne fabrique pas de généralisation qui ressemble à un fait. Les photos choisies sont un support illustratif, pas une preuve de l'événement. Préserve la nuance et la position exprimées par la personne.
`;
