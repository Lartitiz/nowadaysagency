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

export const QUESTIONS_COURTES_RETRY = `Certaines questions sont trop longues ou portent des parenthèses. Réécris les mêmes questions, dans le même ordre et le même format : 25 mots environ et jamais plus de 30 chacune, une seule question (pas de seconde question accrochée par « et »), sans parenthèses ni liste d'options. Garde ce qu'elles demandent de précis, le vocabulaire du métier et les détails du sujet : raccourcis la forme, pas le fond. Garde le tutoiement.`;

export const QUESTIONS_OUVERTES_RETRY = `Certaines questions se répondent par oui ou non (« Y a-t-il… ? », « Tu as… ? », « Est-ce que… ? »). Réécris-les en question ouverte qui demande directement le cas, le moment ou le détail (« Quelle question de tes clientes revient le plus… ? »), dans le même ordre et le même format, 30 mots au plus. Ne change pas les autres questions. Garde le tutoiement.`;

// Question fermée (15/11/2026, vue par la sonde ❓ du matin) : la proposition qui porte le « ? »
// commence comme un oui/non. « Peux-tu raconter… » n'en est pas une (invitation polie).
const DEBUT_FERME = /^(tu (as|connais|fais|utilises|te souviens|aurais|veux|préfères|souhaites)|as-tu|aurais-tu|connais-tu|est-ce qu|y a-t-il|il y a|existe-t-il)(\s|\b)/i;
export function questionFermee(q: string): boolean {
  const avant = String(q || "").split("?")[0] ?? "";
  const morceaux = avant.split(/[,:;.]/).map((m) => m.trim());
  // « tu veux partir de A, ou de B ? » : la proposition qui porte le « ? » est celle d'avant le « ou ».
  while (morceaux.length > 1 && /^ou\s/i.test(morceaux[morceaux.length - 1])) morceaux.pop();
  return DEBUT_FERME.test(morceaux[morceaux.length - 1] ?? "") || inversionSansMotInterrogatif(avant);
}

// 25/11/2026 (rejeu à l'écran) : « Cette visite pièce par pièce met-elle en avant une rénovation
// que tu as menée toi-même… ? ». Verbe-sujet inversés sans mot interrogatif avant = oui/non.
// « Peux-tu raconter… » reste une invitation.
const INVERSION = /(\p{L}+)-(tu|t-il|t-elle|t-on|il|elle|on|ils|elles)(?![\p{L}])/iu;
const MOT_INTERROGATIF = /(^|[^\p{L}])(qu['’]|que|quel(le)?s?|lequel|laquelle|lesquel(le)?s|comment|pourquoi|combien|quand|où|quoi|qui)(?![\p{L}])/iu;
const INVITATION = /^(peux|pourrais|saurais)$/i;
function inversionSansMotInterrogatif(avant: string): boolean {
  const m = avant.match(INVERSION);
  if (!m || INVITATION.test(m[1])) return false;
  return !MOT_INTERROGATIF.test(avant.slice(0, m.index));
}

/** Vrai si au moins une question de la réponse JSON se répond par oui ou non. */
export function questionsFermees(content: string): boolean {
  return questionsDe(content).some((q: any) => questionFermee(q?.question || ""));
}

function nbMots(text: string): number {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

/** Vrai si une question est trop longue, porte une parenthèse ou pose deux questions. */
export function questionTropLongue(question: string): boolean {
  const q = String(question || "");
  return nbMots(q) > QUESTION_MAX_MOTS || /[()]/.test(q) || deuxQuestionsEnUne(q);
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

const INTERROGATIF = /(^|[^\p{L}])(qu['’]est-ce|qu['’]as-tu|quel(le)?s?|lequel|laquelle|lesquel(le)?s|comment|pourquoi|combien|où|quoi)(?![\p{L}])|\p{L}-(tu|t-il|t-elle|t-on|il|elle|on|ils|elles)(?![\p{L}])/iu;
/** Vrai si le texte porte un mot ou une tournure qui interroge (« comment », « quel », « fais-tu »…). */
export function aUnInterrogatif(text: string): boolean {
  return INTERROGATIF.test(String(text || ""));
}

// Deux questions sous un seul « ? » (répétition du 25/11/2026) : « …, et veux-tu… ? ».
const SECONDE_QUESTION = /[,;]?\s+(et|puis|mais)\s+(qu['’]est-ce|qu['’]as-tu|ce qu['’e]|ce qui|((pour|à|de|dans|avec|sur|par|en)\s+)?(quel(le)?s?|quoi|qui)|comment|pourquoi|combien|\p{L}+-tu)(?![\p{L}])/iu;
/** Vrai si la question en pose deux : deux « ? », ou une seconde question accrochée par « et ». */
export function deuxQuestionsEnUne(q: string): boolean {
  const text = String(q || "");
  if ((text.match(/\?/g) || []).length > 1) return true;
  const m = text.match(SECONDE_QUESTION);
  return !!m && aUnInterrogatif(text.slice(0, m.index));
}

/**
 * Coupe la seconde question accrochée à la première (25/11/2026, rejeu à l'écran : la relance
 * ne les séparait pas) : « …quelle vérification as-tu faite en premier, et qu'est-ce qui t'a
 * fait poursuivre ou stopper ? » → « …quelle vérification as-tu faite en premier ? ». Sans IA.
 * Ne touche qu'une question à un seul « ? » dont la première partie interroge déjà.
 */
export function couperSecondeQuestion(q: string): string {
  const text = String(q || "");
  if ((text.match(/\?/g) || []).length !== 1 || !/\?\s*$/.test(text)) return q;
  const m = text.match(SECONDE_QUESTION);
  if (!m) return q;
  const avant = text.slice(0, m.index);
  if (!aUnInterrogatif(avant) || avant.trim().split(/\s+/).length < 6) return q;
  return `${avant.replace(/[\s,;]+$/, "")} ?`;
}

/** Défaut qu'on ne montre jamais : la question vouvoie (donc mélange « tu » et « vous ») ou porte deux « ? ». */
function questionFautive(q: any): boolean {
  return hasVouvoiement(`${q?.question || ""}\n${q?.placeholder || ""}`) || (String(q?.question || "").match(/\?/g) || []).length > 1;
}

/**
 * Dernier filet, sans IA (25/11/2026) : quand la relance ne règle pas tout, chaque question prend
 * la version relancée de même rang si elle a moins de défauts (vouvoiement, deux « ? », trop
 * longue, oui/non) ; une question qui vouvoie encore ou porte deux « ? » est retirée. Une question
 * en moins vaut mieux qu'une question qui dit « votre » et « veux-tu ». Si toutes sont fautives,
 * on les garde (l'écran ne reste pas vide).
 */
/** Nombre de défauts d'une question ; le vouvoiement et les deux « ? » pèsent plus que tout le reste. */
function defauts(q: any): number {
  const texte = String(q?.question || "");
  return (questionFautive(q) ? 10 : 0) + (questionTropLongue(texte) ? 1 : 0) + (questionFermee(texte) ? 1 : 0);
}

export function garderQuestionsSaines(content: string, relance = ""): string {
  let parsed: any;
  try { parsed = JSON.parse(content); } catch { return content; }
  const cle = Array.isArray(parsed?.questions) ? "questions" : Array.isArray(parsed?.follow_up_questions) ? "follow_up_questions" : null;
  if (!cle) return content;
  const autres = questionsDe(relance);
  const memeForme = autres.length === parsed[cle].length;
  // Question par question : la version relancée de même rang si elle a moins de défauts.
  const choisies = parsed[cle].map((q: any, i: number) => (memeForme && autres[i]?.question && defauts(autres[i]) < defauts(q) ? autres[i] : q));
  const saines = choisies.filter((q: any) => !questionFautive(q));
  const gardees = saines.length ? saines : choisies;
  if (gardees.length === parsed[cle].length && gardees.every((q: any, i: number) => q === parsed[cle][i])) return content;
  console.log(JSON.stringify({ event: "questions_filet", avant: parsed[cle].length, apres: gardees.length }));
  return JSON.stringify({ ...parsed, [cle]: gardees });
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
  // 25/11/2026 : « Pense à ta première opération : qu'est-ce qui t'a surprise, le prix, le
  // délai ou le notaire ? » devenait « Pense à ta première opération ? ». La question vit
  // après les deux-points : on ne coupe que si ce qui reste en est encore une.
  if (!aUnInterrogatif(avant)) return q;
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
    const coupee = couperSecondeQuestion(couperListeOptions(q.question));
    if (coupee === q.question) return q;
    change = true;
    return { ...q, question: coupee };
  });
  return change ? JSON.stringify(parsed) : content;
}

/**
 * Une relance au plus (carousel-ai et, depuis le 14/11/2026, creative-flow) quand une question vouvoie, reste trop longue, en pose deux ou se répond par oui/non.
 * `ask` reçoit la consigne de correction ; une relance en échec, ou qui ne
 * règle rien, garde les premières questions plutôt que de tout perdre.
 */
export async function relancerQuestionsSiBesoin(content: string, ask: (consigne: string) => Promise<string>): Promise<string> {
  content = couperListesDesQuestions(content);
  const vouvoie = questionsVouvoient(content);
  const longues = questionsTropLongues(content);
  const fermees = questionsFermees(content);
  if (!vouvoie && !longues && !fermees) return content;
  const consigne = [vouvoie ? QUESTIONS_TUTOIEMENT_RETRY : "", longues ? QUESTIONS_COURTES_RETRY : "", fermees ? QUESTIONS_OUVERTES_RETRY : ""].filter(Boolean).join("\n");
  let retried = "";
  try {
    retried = couperListesDesQuestions(await ask(consigne));
    if (retried && !questionsVouvoient(retried) && (!longues || !questionsTropLongues(retried)) && (!fermees || !questionsFermees(retried))) {
      console.log(JSON.stringify({ event: "questions_relance", vouvoie, longues, fermees, corrige: true }));
      return retried;
    }
  } catch (_) { /* on garde la première version */ }
  console.log(JSON.stringify({ event: "questions_relance", vouvoie, longues, fermees, corrige: false }));
  return garderQuestionsSaines(content, retried);
}
