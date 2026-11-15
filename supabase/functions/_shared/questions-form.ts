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
// matière concrète demandée, jamais de oui/non. Premier essai en ligne
// (« 30 mots au plus ») : 32 à 38 mots, listes d'options et deux questions
// en une → cible 15-25 mots, un seul point d'interrogation, pas de liste.
//
// Ce bloc se place EN DERNIER dans le prompt système des questions (carrousel :
// carousel-ai/questions-address.ts ; autres formats : creative-flow
// prompts/assist.ts et formats/photo.ts). Le carrousel relance une fois si une
// question reste trop longue (`questionsTropLongues`).

export const QUESTION_MAX_MOTS = 32;

export const QUESTIONS_FORM_RULES = `

══ FORME DES QUESTIONS : LISIBLES ET CREUSÉES ══
L'utilisatrice lit chaque question seule, souvent sur son téléphone. Elle doit la comprendre du premier coup ET avoir envie d'y répondre avec sa vraie matière. Une question courte mais générale ne sert à rien : la précision passe avant la brièveté.
- Vise 15 à 25 mots, jamais plus de 30. Une phrase suffit le plus souvent ; une courte phrase de contexte avant la question est permise quand elle aide.
- Un seul point d'interrogation : une seule question par question, pas de seconde question ajoutée (« Et qu'est-ce que… ? », « Dis-moi aussi… »).
- Cette question va chercher une matière concrète que seule l'utilisatrice peut donner : un chiffre, un moment précis, une phrase entendue, une étape de sa méthode, une erreur fréquente qu'elle voit, un choix qu'elle a fait et pourquoi.
- Utilise le vocabulaire de son métier et un aspect précis du sujet. Une question qui irait à n'importe quel sujet ou à n'importe quelle utilisatrice est invalide.
- Jamais de question à laquelle on répond par oui ou non (« Tu as un exemple ? », « Tu as un cas réel ? »). Demande directement l'exemple ou le cas.
- Pas de parenthèses. Pas de liste d'options à cocher (« une lecture, une réaction ou une fiche ? ») : pose la question ouverte, elle trouvera sa réponse.
- Les questions se complètent : chacune creuse un endroit différent du sujet, sans se répéter.
- L'exemple de réponse (placeholder) tient en 15 mots au plus et montre une réponse concrète, propre au sujet.
Trop lourd : « Ce post doit-il rester sur le principe général (la saison fixe le prix) ou s'appuyer sur un cas réel que tu as vécu, avec ses chiffres ? »
Trop vague : « Tu as un cas réel à raconter pour illustrer ça ? »
Trop chargée : « Qu'est-ce qui t'a décidée à te lancer : un burn-out, une rencontre ou une formation ? Et qu'est-ce que ça a changé ? »
Lisible et creusée : « Pense à ta dernière opération bloquée par un lot : qu'est-ce qui a fini par débloquer la revente ? »
Ces exemples parlent d'un autre sujet : ne les recopie pas, trouve les mots du sujet courant.`;

export const QUESTIONS_COURTES_RETRY = `Certaines questions sont trop longues ou portent des parenthèses. Réécris les mêmes questions, dans le même ordre et le même format : 25 mots environ et jamais plus de 30 chacune, une seule question, sans parenthèses ni liste d'options. Garde ce qu'elles demandent de précis, le vocabulaire du métier et les détails du sujet : raccourcis la forme, pas le fond. Garde le tutoiement.`;

function nbMots(text: string): number {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

/** Vrai si une question est trop longue, porte une parenthèse ou pose deux questions. */
export function questionTropLongue(question: string): boolean {
  const q = String(question || "");
  return nbMots(q) > QUESTION_MAX_MOTS || /[()]/.test(q) || (q.match(/\?/g) || []).length > 1;
}

/** Questions d'une réponse JSON : `questions` (premier tour) ou `follow_up_questions` (suivi de creative-flow). */
export function questionsDe(content: string): any[] {
  let parsed: any;
  try { parsed = JSON.parse(content); } catch { return []; }
  if (Array.isArray(parsed?.questions)) return parsed.questions;
  if (Array.isArray(parsed?.follow_up_questions)) return parsed.follow_up_questions;
  return [];
}

/** Vrai si au moins une question de la réponse JSON est trop longue. */
export function questionsTropLongues(content: string): boolean {
  return questionsDe(content).some((q: any) => questionTropLongue(q?.question || ""));
}

/** Vrai si le texte vouvoie, hors citations entre guillemets (« … » ou "…"). */
export function hasVouvoiement(text: string): boolean {
  const outsideQuotes = String(text || "").replace(/«[^»]*»/g, " ").replace(/"[^"]*"/g, " ").replace(/“[^”]*”/g, " ");
  return /(^|[^\p{L}])(vous|votre|vos)(?![\p{L}])/iu.test(outsideQuotes);
}

export const QUESTIONS_TUTOIEMENT_RETRY = "Tu as vouvoyé l'utilisatrice. Réécris exactement les mêmes questions en la tutoyant (« ta », « tu », « tes »), sans rien changer d'autre, avec le même format.";


/** Vrai si au moins une question ou un exemple de réponse vouvoie. */
export function questionsVouvoient(content: string): boolean {
  return questionsDe(content).some((q: any) => hasVouvoiement(`${q?.question || ""}\n${q?.placeholder || ""}`));
}

/**
 * Coupe la liste de choix qui finit une question (15/11/2026, vue par la sonde ❓) :
 * « …qu'est-ce qui t'a fait basculer : une réaction, une cliente, ou une lecture ? »
 * → « …qu'est-ce qui t'a fait basculer ? ». Sans IA. Les exemples restent dans le placeholder.
 * Ne touche qu'une fin « : a, b ou c ? » (au moins une virgule et un « ou »).
 */
export function couperListeOptions(q: string): string {
  const m = String(q || "").match(/^(.*\S)\s*:\s*([^:?]+)\?\s*$/s);
  if (!m) return q;
  const [, avant, liste] = m;
  if (!/,/.test(liste) || !/(^|\s)ou\s/i.test(liste)) return q;
  if (avant.trim().split(/\s+/).length < 6) return q;
  return `${avant.replace(/[\s,;]+$/, "")} ?`;
}

/** Applique couperListeOptions à chaque question d'une réponse JSON ; rend le texte tel quel s'il n'est pas lisible. */
export function couperListesDesQuestions(content: string): string {
  let parsed: any;
  try { parsed = JSON.parse(content); } catch { return content; }
  const cle = Array.isArray(parsed?.questions) ? "questions" : Array.isArray(parsed?.follow_up_questions) ? "follow_up_questions" : null;
  if (!cle) return content;
  let change = false;
  parsed[cle] = parsed[cle].map((q: any) => {
    if (!q || typeof q.question !== "string") return q;
    const coupee = couperListeOptions(q.question);
    if (coupee === q.question) return q;
    change = true;
    return { ...q, question: coupee };
  });
  return change ? JSON.stringify(parsed) : content;
}

/**
 * Une relance au plus (carousel-ai et, depuis le 14/11/2026, creative-flow) quand une question vouvoie ou reste trop longue.
 * `ask` reçoit la consigne de correction ; une relance en échec, ou qui ne
 * règle rien, garde les premières questions plutôt que de tout perdre.
 */
export async function relancerQuestionsSiBesoin(content: string, ask: (consigne: string) => Promise<string>): Promise<string> {
  content = couperListesDesQuestions(content);
  const vouvoie = questionsVouvoient(content);
  const longues = questionsTropLongues(content);
  if (!vouvoie && !longues) return content;
  const consigne = [vouvoie ? QUESTIONS_TUTOIEMENT_RETRY : "", longues ? QUESTIONS_COURTES_RETRY : ""].filter(Boolean).join("\n");
  try {
    const retried = couperListesDesQuestions(await ask(consigne));
    if (retried && !questionsVouvoient(retried) && (!longues || !questionsTropLongues(retried))) {
      console.log(JSON.stringify({ event: "questions_relance", vouvoie, longues, corrige: true }));
      return retried;
    }
  } catch (_) { /* on garde la première version */ }
  console.log(JSON.stringify({ event: "questions_relance", vouvoie, longues, corrige: false }));
  return content;
}
