// Les prompts internes de génération (carousel-ai) utilisent des noms de code en
// MAJUSCULES_AVEC_UNDERSCORES (DEPTH_LAYER, ANTI_SLOP, …). Le modèle les recopie
// parfois tels quels dans les champs « note » / « rationale » qui sont AFFICHÉS à
// l'utilisatrice (« C'est la slide DEPTH_LAYER, celle qui… »). On les retire de
// façon déterministe avant affichage — indépendant du comportement du modèle.

// Vocabulaire interne connu (à étendre si de nouveaux codes apparaissent dans les prompts).
const INTERNAL_TOKENS = [
  "DEPTH_LAYER_DUAL",
  "DEPTH_LAYER",
  "ANTI_SLOP",
  "ANTI_FABRICATED_STORYTELLING",
  "EDITORIAL_ANGLES_REFERENCE",
  "CHAIN_OF_THOUGHT",
  "PREGEN_INJECTION_RULES",
  "EMBEDDED_EDUCATION",
  "SLIDE_TITLE_RULES",
];

const TOKEN_ALT = INTERNAL_TOKENS.join("|");

// Mentions entre parenthèses : « (cf. DEPTH_LAYER) », « (DEPTH_LAYER_DUAL) »
const PAREN_RE = new RegExp(`\\s*\\((?:cf\\.?\\s*)?(?:${TOKEN_ALT})\\)`, "gi");
// « la slide DEPTH_LAYER » / « le bloc ANTI_SLOP » → on enlève juste le code
const LABELLED_RE = new RegExp(`\\b(slide|bloc|couche|layer)\\s+(?:${TOKEN_ALT})\\b`, "gi");
// Occurrences résiduelles du code seul
const BARE_RE = new RegExp(`\\b(?:${TOKEN_ALT})\\b`, "gi");

export function sanitizeInternalLabels(text: string | null | undefined): string {
  if (!text) return "";
  let out = String(text);
  out = out.replace(PAREN_RE, "");
  out = out.replace(LABELLED_RE, (_m, kind) => `${kind} clé`);
  out = out.replace(BARE_RE, "");
  // Nettoyage des artefacts laissés par les suppressions.
  // NB : on ne touche pas à l'espace avant : ; ! ? (typographie française correcte).
  out = out
    .replace(/\s+([,.])/g, "$1") // espace avant virgule / point (incorrect en FR)
    .replace(/,\s*,/g, ",") // virgules doublées
    .replace(/\(\s*\)/g, "") // parenthèses vides
    .replace(/\s{2,}/g, " ") // espaces multiples
    .trim();
  return out;
}
