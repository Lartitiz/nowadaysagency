// Déplacé à l'identique depuis _shared/format-briefs.ts (lot 1 du découpage, 14/10/2026,
// docs/robustesse/gros-fichiers.md fiche 10). format-briefs.ts le réexporte.
// Transverse (post, reel, stories) : c'est buildGeneratePrompt qui l'ajoute, aucun brief ne l'importe.

import { LIVED_CASE_FIRST, NEWS_FEELING_FIRST, type CaseMode } from "../lived-case.ts";

/**
 * Prise de position et profondeur pour les posts Instagram, reels et stories
 * (même contrat que le carrousel depuis #1292). La réécriture du 12/09 avait
 * rendu la conviction « facultative » sans rien dire de la position : les
 * contenus d'opinion sortaient lisses (idée abstraite, émotion tue, précautions
 * inutiles, devoir final).
 */
export function positionDepthBlock(format: "caption" | "reel" | "stories", hasNews = false, livedCase: boolean | CaseMode = false): string {
  // Actu + ressenti fourni (05/10/2026) : une seule consigne, son ressenti porte le contenu.
  const newsFeeling = livedCase === "news_feeling";
  const ownCase = livedCase === true || livedCase === "own_case";
  const ending = format === "stories"
    ? "FIN : la position assumée, ou une question simple (sondage, question ouverte) qui découle de la séquence."
    : "FIN : la position assumée, ou une question simple à laquelle on répond en un commentaire.";
  return `══ PROFONDEUR ET PRISE DE POSITION ══
Sauf tutoriel, liste pratique, coulisses ou présentation d'offre demandés, ce contenu défend une position. Tire-la de l'angle choisi, de l'accroche, des réponses de la personne, de ses convictions et de ses combats de marque, puis assume-la en première personne au lieu de la diluer dans une distinction abstraite ou un concept. Une idée forte de l'angle (un parallèle, une comparaison, une formule qui fait réagir) reste le fil du contenu.
${ownCase ? LIVED_CASE_FIRST : newsFeeling ? NEWS_FEELING_FIRST : "Creuse sous le sujet : ce qu'il révèle quand il en touche un (norme sociale, injonction faite aux femmes ou aux indépendantes, rapport de pouvoir, mécanisme du métier). Pour un sujet de société, un « on » ou un « nous » collectif peut porter cette lecture."}
Nomme les émotions concrètes que ce sujet soulève couramment (peur du jugement, honte, fatigue, colère) comme une expérience partagée, jamais comme le diagnostic de la personne qui lit (« tu as peur », « tu n'oses pas »).
Une opinion n'a pas besoin de source ; un fait, un chiffre ou un vécu, si. Une nuance assumée (« ça peut aussi être un vrai choix ») renforce la position. Une précaution sur ce que le texte n'affirme pas l'affaiblit : n'écris ni « sans garantie », ni « hypothèse de travail », ni « je n'affirme rien sur l'algorithme ». Une accroche provocante n'est pas désamorcée par une excuse (« ok je suis peut-être un peu too much »).
${hasNews && !newsFeeling ? "ACTUALITÉ : l'angle choisi est la THÈSE du contenu. L'actu est le déclencheur : raconte-la, puis défends ce que la personne en pense ; le pont vers son métier sert cette thèse, il ne la remplace pas.\n" : ""}${ending} Pas de devoir à faire pour conclure (« cette semaine, essaie de… », « ton exercice : … »).`;
}
