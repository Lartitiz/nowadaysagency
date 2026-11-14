// Forme des questions de l'étape « Précisions » de /creer : lisibles et creusées.
//
// 12/11/2026 : Laetitia trouvait l'écran difficile à lire. Une vraie question
// du carrousel faisait 33 mots, avec une parenthèse et deux options reliées par
// « ou » : « Ce carrousel doit-il rester sur l'idée générale (le lot bloquant
// fixe la durée de portage) ou t'appuyer sur une opération réelle que tu as
// menée, avec ses chiffres anonymisés ? ». La consigne disait seulement
// « 1-2 phrases max ».
//
// 14/11/2026 : la première version (une phrase de 20 mots, une seule chose
// demandée, exemple « Tu as un cas réel à raconter pour illustrer ça ? ») a
// rendu les questions générales et peu creusées : placée en dernier et marquée
// prioritaire, elle écrasait l'ancrage dans le sujet et le métier, et son
// exemple était exactement la question passe-partout que les consignes
// interdisent. Laetitia : « on les a trop raccourcies, pas assez pertinentes ».
// On garde la lisibilité (pas de parenthèses, pas de choix « A ou B », 30 mots
// au plus) et on rend la profondeur : deux phrases courtes possibles, une
// matière concrète demandée, jamais de oui/non.
//
// Ce bloc se place EN DERNIER dans le prompt système des questions (carrousel :
// carousel-ai/questions-address.ts ; autres formats : creative-flow
// prompts/assist.ts et formats/photo.ts). Le carrousel relance une fois si une
// question reste trop longue (`questionsTropLongues`).

export const QUESTION_MAX_MOTS = 32;

export const QUESTIONS_FORM_RULES = `

══ FORME DES QUESTIONS : LISIBLES ET CREUSÉES ══
L'utilisatrice lit chaque question seule, souvent sur son téléphone. Elle doit la comprendre du premier coup ET avoir envie d'y répondre avec sa vraie matière. Une question courte mais générale ne sert à rien : la précision passe avant la brièveté.
- 30 mots au plus, en une ou deux phrases courtes. La première peut poser le contexte précis du sujet, la seconde pose la question.
- Chaque question va chercher une matière concrète que seule l'utilisatrice peut donner : un chiffre, un moment précis, une phrase entendue, une étape de sa méthode, une erreur fréquente qu'elle voit, un choix qu'elle a fait et pourquoi.
- Utilise le vocabulaire de son métier et un aspect précis du sujet. Une question qui irait à n'importe quel sujet ou à n'importe quelle utilisatrice est invalide.
- Jamais de question à laquelle on répond par oui ou non (« Tu as un exemple ? », « Tu as un cas réel ? »). Demande directement l'exemple ou le cas.
- Pas de parenthèses. Pas de choix entre deux options reliées par « ou » : si deux pistes sont possibles, choisis la plus utile.
- Les questions se complètent : chacune creuse un endroit différent du sujet, sans se répéter.
- L'exemple de réponse (placeholder) tient en 15 mots au plus et montre une réponse concrète, propre au sujet.
Trop lourd : « Ce post doit-il rester sur le principe général (la saison fixe le prix) ou s'appuyer sur un cas réel que tu as vécu, avec ses chiffres ? »
Trop vague : « Tu as un cas réel à raconter pour illustrer ça ? »
Lisible et creusée : « Pense à ta dernière opération bloquée par un lot. Combien de temps la revente a-t-elle été retardée, et qu'est-ce qui l'a débloquée ? »
Ces exemples parlent d'un autre sujet : ne les recopie pas, trouve les mots du sujet courant.`;

export const QUESTIONS_COURTES_RETRY = `Certaines questions sont trop longues ou portent des parenthèses. Réécris les mêmes questions, dans le même ordre et le même format : 30 mots au plus chacune, en une ou deux phrases courtes, sans parenthèses. Garde ce qu'elles demandent de précis, le vocabulaire du métier et les détails du sujet : raccourcis la forme, pas le fond. Garde le tutoiement.`;

function nbMots(text: string): number {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

/** Vrai si une question est trop longue ou porte une parenthèse. */
export function questionTropLongue(question: string): boolean {
  const q = String(question || "");
  return nbMots(q) > QUESTION_MAX_MOTS || /[()]/.test(q);
}

/** Vrai si au moins une question de la réponse JSON `{questions:[…]}` est trop longue. */
export function questionsTropLongues(content: string): boolean {
  let parsed: any;
  try { parsed = JSON.parse(content); } catch { return false; }
  const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  return questions.some((q: any) => questionTropLongue(q?.question || ""));
}
