// Forme des questions de l'étape « Précisions » de /creer : courtes et simples.
//
// 12/11/2026 : Laetitia trouvait l'écran difficile à lire. Une vraie question
// du carrousel faisait 33 mots, avec une parenthèse et deux options reliées par
// « ou » : « Ce carrousel doit-il rester sur l'idée générale (le lot bloquant
// fixe la durée de portage) ou t'appuyer sur une opération réelle que tu as
// menée, avec ses chiffres anonymisés ? ». La consigne disait seulement
// « 1-2 phrases max ».
//
// Ce bloc se place EN DERNIER dans le prompt système des questions (carrousel :
// carousel-ai/questions-address.ts ; autres formats : creative-flow
// prompts/assist.ts et formats/photo.ts). Le carrousel relance une fois si une
// question reste trop longue (`questionsTropLongues`).

export const QUESTION_MAX_MOTS = 22;

export const QUESTIONS_FORM_RULES = `

══ FORME DES QUESTIONS (PRIORITAIRE : LISIBILITÉ) ══
L'utilisatrice lit chaque question seule, souvent sur son téléphone. Elle doit la comprendre du premier coup, sans relire.
- Une seule phrase de 20 mots au plus.
- Une seule chose demandée par question : pas deux options reliées par « ou », pas deux demandes reliées par « et ».
- Mots de tous les jours. Pas de parenthèses. Reprends un mot du sujet si besoin, jamais le titre entier du sujet.
- L'exemple de réponse (placeholder) tient en 15 mots au plus.
Trop lourd : « Ce post doit-il rester sur le principe général (la saison fixe le prix) ou s'appuyer sur un cas réel que tu as vécu, avec ses chiffres ? »
Lisible : « Tu as un cas réel à raconter pour illustrer ça ? »`;

export const QUESTIONS_COURTES_RETRY = `Certaines questions sont trop longues ou trop compliquées. Réécris les mêmes questions, dans le même ordre et le même format : une phrase de 20 mots au plus chacune, sans parenthèses, une seule chose demandée, des mots de tous les jours. Garde le tutoiement.`;

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
