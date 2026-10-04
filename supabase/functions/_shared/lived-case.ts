// « Ton cas d'abord » (décision de Laetitia, 04/10/2026, audit du carrousel de
// référence « Oui, j'utilise l'IA générative »).
//
// Quand l'utilisatrice donne son propre cas (un prix, un avant/après, une
// émotion qu'elle dit elle-même, ou des réponses développées), son vécu est la
// preuve centrale du contenu : la recherche « creuser le sujet » passe en mode
// appui (au plus un chiffre, seulement s'il appuie une de ses phrases), la
// lecture sociale en « on / nous » et l'histoire de la marque ne sont plus
// servies. Les sujets SANS vécu fourni (actu seule, aucune réponse) gardent la
// recherche de profondeur telle que #1292 l'a rallumée.
//
// Fonctions pures, sans dépendance : testées dans lived-case_test.ts.

/** Seuil de mots des réponses au-delà duquel elles portent du vécu, même sans marqueur. */
export const LIVED_ANSWER_WORDS = 40;

/** Matière éditoriale ajoutée par le front (idée choisie) : ce n'est pas un témoignage personnel. */
const EDITORIAL_MATERIAL_KEY = "Brief éditorial choisi";
const EDITORIAL_MATERIAL_PREFIX = /^\s*MATIÈRE ÉDITORIALE CHOISIE/;
/** Clés qui portent la question ou un identifiant, pas la réponse de l'utilisatrice. */
const NON_ANSWER_KEYS = new Set(["question", "q", "id", "placeholder", "label", "type", "key"]);

export interface LivedCase {
  provided: boolean;
  /** Marqueurs trouvés : montant, avant-apres, emotion, reponses-developpees. */
  reasons: string[];
  /** Réponses de l'utilisatrice (valeurs seules, hors matière éditoriale). */
  answers: string[];
}

/** Réponses de l'utilisatrice, valeurs seules (objet question → réponse, tableau {question, answer}, ou texte). */
export function userAnswerTexts(...values: unknown[]): string[] {
  const out: string[] = [];
  const walk = (value: unknown, key?: string) => {
    if (value === null || value === undefined) return;
    if (typeof value === "string") {
      const v = value.trim();
      if (v && !EDITORIAL_MATERIAL_PREFIX.test(v) && !(key && NON_ANSWER_KEYS.has(key.toLowerCase()))) out.push(v);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === EDITORIAL_MATERIAL_KEY) continue;
        walk(v, k);
      }
    }
  };
  for (const v of values) walk(v);
  return out;
}

const words = (text: string) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

const FIRST_PERSON = /(?<!\p{L})(?:(?:je|moi|mon|ma|mes|me|nous|notre|nos)(?!\p{L})|[jm]['’])/iu;

// « 2 100 € », « 2100€ », « 7 500 euros », « 3 k€ », « € 40 », « 40 balles ».
const AMOUNT = /(?:\d[\d\s  .,]*\s?(?:k\s?)?(?:€|euros?(?!\p{L})|EUR(?!\p{L})|balles(?!\p{L}))|€\s?\d)/iu;

// « avant… aujourd'hui / maintenant / désormais / depuis / après », ou « avant/après ».
const BEFORE_AFTER = /(?:(?<!\p{L})avant(?!\p{L})[^]{0,400}?(?<!\p{L})(?:aujourd['’]hui|maintenant|désormais|depuis|après|à présent)(?!\p{L})|(?<!\p{L})avant\s*\/\s*après(?!\p{L}))/iu;

const EMOTION_WORDS = String.raw`peur|honte|trouille|angoiss\p{L}*|stress\p{L}*|culpabil\p{L}*|fière?|heureuse|heureux|triste|tristesse|colère|fatigu\p{L}*|épuisée?|perdue?|frustr\p{L}*|soulag\p{L}*|gênée?|mal\s+à\s+l['’]aise|déçue?|ravie?|doute|doutes|vertige|panique|inquiète?|inquiétude|dissonance|malaise|énervée?|blessée?|émue?|fierté|joie|soulagement`;
// « j'ai peur », « je suis épuisée », « ça me fait honte », « je me sens perdue », « je culpabilise ».
const EMOTION = new RegExp(
  String.raw`(?<!\p{L})(?:j['’](?:ai|avais|étais)|je\s+(?:suis|me\s+sens|me\s+sentais|ressens|ressentais|vis|vivais)|ça\s+me\s+(?:fait|faisait|rend|rendait|met|mettait)|ce\s+qui\s+me\s+(?:fait|faisait)|ma|mon)\s+(?:(?:un|une|de|du|la|le|vraiment|très|trop|tellement|toujours|encore|souvent|un\s+peu|assez|aussi|en)\s+){0,3}(?:${EMOTION_WORDS})(?!\p{L})|(?<!\p{L})je\s+(?:doute|culpabilise|culpabilisais|flippe|flippais|stresse|stressais|panique|paniquais|ne\s+sais\s+(?:pas|toujours\s+pas)\s+si)(?!\p{L})`,
  "iu",
);

/**
 * Le cas personnel est-il fourni ? `answers` : réponses de l'utilisatrice aux
 * questions d'approfondissement (valeurs) ; `brief` : ce qu'elle a écrit pour CE
 * contenu (sujet, précisions). Jamais l'actu, le branding ni la recherche.
 */
export function detectLivedCase(input: { answers?: string[]; brief?: string[] }): LivedCase {
  const answers = (input.answers || []).filter((a) => typeof a === "string" && a.trim());
  const brief = (input.brief || []).filter((b) => typeof b === "string" && b.trim());
  const all = [...answers, ...brief].join("\n");
  const reasons: string[] = [];
  // Un montant ou un avant/après ne vaut vécu que s'il est dit en première
  // personne dans la même phrase (« Le tout pour 2 100 € » après « je fais… »
  // passe par le paragraphe ; « Meta passe à 9,99 € » seul ne compte pas).
  const units = all.split(/\n+|(?<=[.!?…])\s+/).map((u) => u.trim()).filter(Boolean);
  const paragraphs = all.split(/\n+/).map((u) => u.trim()).filter(Boolean);
  if (units.some((u) => AMOUNT.test(u) && FIRST_PERSON.test(u)) ||
    paragraphs.some((p) => AMOUNT.test(p) && FIRST_PERSON.test(p) && words(p) <= 120)) reasons.push("montant");
  if (paragraphs.some((p) => { const m = p.match(BEFORE_AFTER); return !!m && FIRST_PERSON.test(m[0]); })) reasons.push("avant-apres");
  if (EMOTION.test(all)) reasons.push("emotion");
  if (words(answers.join(" ")) > LIVED_ANSWER_WORDS) reasons.push("reponses-developpees");
  return { provided: reasons.length > 0, reasons, answers };
}

/** Cas personnel d'un appel carousel-ai (réponses d'approfondissement + sujet et précisions). */
export function livedCaseFromCarouselBody(body: any): LivedCase {
  if (!body || typeof body !== "object") return { provided: false, reasons: [], answers: [] };
  return detectLivedCase({
    answers: userAnswerTexts(body.deepening_answers),
    brief: [body.subject, body.subject_details].filter((v) => typeof v === "string"),
  });
}

/** Cas personnel d'un appel creative-flow (réponses, relances, pré-questions + sujet). */
export function livedCaseFromCreativeBody(body: any): LivedCase {
  if (!body || typeof body !== "object") return { provided: false, reasons: [], answers: [] };
  return detectLivedCase({
    answers: userAnswerTexts(body.answers, body.followUpAnswers, body.preGenAnswers ?? body.pre_gen_answers),
    brief: [body.context].filter((v) => typeof v === "string"),
  });
}

/** Règle d'ordre commune à la rédaction (carrousel, posts, reels, stories, LinkedIn). */
export const LIVED_CASE_FIRST = `TON CAS D'ABORD (la personne a donné son propre cas) : le cas personnel fourni (ses chiffres, son avant/après, ce qu'elle ressent, ses mots) est la preuve centrale du contenu, raconté en première personne avec sa voix. La recherche ne remplace aucun passage de ce vécu : au plus UN chiffre de recherche, seulement s'il appuie une phrase de son brief ou de ses réponses, avec sa source. Pas de lecture sociale générale en « on » ou « nous », pas de passage théorique ni de style article à la place de son récit. Son histoire de marque et son parcours ne sont pas racontés : le récit de ce contenu, c'est celui qu'elle vient de donner.`;
