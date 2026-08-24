/**
 * Nettoyage déterministe de la dictée vocale (Web Speech API).
 *
 * Pourquoi (bilan hebdo 24/08/2026) : la transcription part telle quelle dans
 * le champ dicté, et pour /creer ce champ EST le sujet du contenu — il devient
 * donc le titre affiché partout ensuite. Trois contenus de la semaine portaient
 * en titre « Je voudrais. Euh. J'ai fait une série sur ça m'énerve, donc j'ai
 * mis ça m'énerve. Les pensions qui m… ». Le moteur transcrit fidèlement les
 * hésitations : c'est à nous de les retirer avant de les afficher.
 *
 * 🔑 Volontairement ÉTROIT, même parti pris que les gardes du redac-gate : ce
 * nettoyage tourne sur du texte que l'utilisatrice n'a pas encore relu, donc
 * une suppression de trop est bien pire qu'un « euh » de reste.
 *
 * CE QUI EST RETIRÉ (aucun de ces cas ne porte de sens) :
 *  - les interjections d'hésitation isolées : euh, heu, hum, hmm, mmh… et leurs
 *    allongements (« euuuh »), avec la ponctuation qu'elles traînent ;
 *  - le bégaiement des seuls mots-outils (« je je », « le le ») ;
 *  - la ponctuation orpheline et les espaces doublés que laisse le retrait.
 *
 * CE QUI N'EST PAS TOUCHÉ, ET POURQUOI : les faux départs (« Je voudrais. »).
 * Aucune règle mécanique ne les distingue d'une vraie phrase courte — « J'adore
 * ça. » a exactement la même forme. Les couper demanderait de comprendre la
 * suite, donc un modèle, donc une décision probabiliste sur du texte que
 * personne n'a relu. On laisse : le champ reste éditable, et le pire cas est
 * une phrase d'amorce, pas une phrase perdue.
 */

/**
 * Hésitations pures : aucune de ces suites de lettres n'est un mot français.
 * 🔑 « ben », « bah » et « eh » en sont volontairement ABSENTS : ce sont bien
 * des hésitations à l'oral, mais « Ben » est aussi un prénom et « eh bien » une
 * locution — la casse ne les départage pas, et le doute suffit à les laisser.
 */
const FILLERS = [
  "euh",
  "heu",
  "hum",
  "hmm",
  "hem",
  "mmh",
  "mmm",
];

/**
 * Un filler isolé, allongements compris (« euuuh », « hmmm »), précédé d'un
 * début/espace/ponctuation et suivi de sa propre ponctuation éventuelle.
 * Les lettres répétables sont doublées dans le motif pour couvrir « euuuh »
 * sans autoriser n'importe quelle suite de lettres.
 */
const FILLER_RE = new RegExp(
  String.raw`(^|[\s,;:.!?…])(?:${FILLERS.map((f) => {
    const [first, ...rest] = f.split("");
    return first + rest.map((c) => `${c}+`).join("");
  }).join("|")})(?=$|[\s,;:.!?…])([\s,;:.…]*)`,
  "gi",
);

/**
 * Remplacement d'un filler. Le point délicat est la ponctuation qui le SUIT :
 * la retirer systématiquement mangeait la fin de phrase (« Bref euh . C'est
 * tout » → « Bref C'est tout »). Elle n'est redondante que si une ponctuation
 * précédait DÉJÀ le filler (« C'est important. Hmm. Vraiment. ») — sinon elle
 * ponctue la phrase et doit rester.
 */
function replaceFiller(_m: string, pre: string, post: string): string {
  if (/[,;:.!?…]/.test(pre)) return pre;
  const punct = post.replace(/\s+/g, "");
  return punct ? `${punct} ` : pre;
}

/**
 * Bégaiement de mots-outils uniquement. « très très » ou « tout tout » sont des
 * intensifs légitimes : la liste ne contient donc que des mots qu'on ne répète
 * jamais volontairement.
 */
const STUTTER_WORDS = [
  "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
  "le", "la", "les", "un", "une", "des", "du", "de",
  "et", "que", "qui", "à", "au", "aux", "en", "mon", "ma", "mes",
];
const STUTTER_RE = new RegExp(
  String.raw`\b(${STUTTER_WORDS.join("|")})(\s+\1\b)+`,
  "gi",
);

/**
 * Nettoie un fragment de dictée. Renvoie une chaîne vide si le fragment
 * n'était QUE de l'hésitation (« Euh. ») — l'appelant ne doit alors rien
 * ajouter au champ.
 */
export function cleanDictation(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) return "";

  let out = raw;
  // Deux passes : « euh euh » laisse un second filler adjacent au premier
  // retrait, que le lookahead de la 1re passe ne peut plus voir.
  out = out.replace(FILLER_RE, replaceFiller).replace(FILLER_RE, replaceFiller);
  out = out.replace(STUTTER_RE, "$1");

  // Ponctuation orpheline laissée par les retraits : « . . » → « . »,
  // « , . » → « . », et espace parasite avant une ponctuation simple.
  out = out.replace(/([,;:.!?…])\s*(?=[,;:.…])/g, "");
  out = out.replace(/\s+([,;:.!?…])/g, "$1");
  out = out.replace(/\s{2,}/g, " ");
  out = out.trim();

  // Un fragment réduit à de la ponctuation n'apporte rien.
  if (!/[\p{L}\p{N}]/u.test(out)) return "";

  // Ponctuation en tête laissée par le retrait d'un filler d'ouverture.
  out = out.replace(/^[\s,;:.!?…]+/, "");

  // Majuscule initiale : on la RÉPARE si le filler retiré la portait
  // (« Euh, je… » → « Je… »), on ne l'INVENTE jamais. La dictée arrive par
  // fragments qui s'ajoutent à la suite du texte déjà saisi : imposer une
  // capitale à chaque fragment en sèmerait en plein milieu des phrases.
  const startedCapitalized = /^\s*[\p{Lu}]/u.test(raw);
  return startedCapitalized ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}
