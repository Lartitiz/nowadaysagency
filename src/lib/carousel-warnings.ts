/**
 * Tri des avertissements d'un carrousel pour l'écran résultat (passe compte
 * neuf du 10/10) : le serveur verse dans `structure_warnings` à la fois les
 * vrais manques (nombre de slides, conclusion vide, image à choisir…) et les
 * constats BRUTS du juge final du fil (`progression_review.issues`, jargon
 * interne écrit pour la réparation automatique). Affichés ensemble sous
 * « à compléter avant de le publier », ces constats contredisaient le
 * « Contrôle rédactionnel : 100/100 ».
 *
 * - blocking : ce qu'il faut vraiment compléter ;
 * - suggestions : pistes de relecture courtes, en mots simples, facultatives.
 *
 * `receipt.issues` reste intact côté serveur : la réparation s'en sert.
 */

const PROGRESSION_FAILED = "Le contrôle final du fil n’a pas abouti. Relis l’enchaînement des slides avant de publier.";
const TEXT_EDITED = "Le texte a changé depuis sa relecture. Vérifie le fil avant de publier.";
const PHOTOS_EDITED = "Le texte ou les photos ont changé depuis leur vérification. Vérifie leurs associations avant de publier.";

/** Message de relecture → libellé court affiché en suggestion. */
const RELABEL: Record<string, string> = {
  [PROGRESSION_FAILED]: "L’enchaînement des slides n’a pas pu être relu jusqu’au bout : jette un œil au fil avant de publier.",
  [TEXT_EDITED]: "Tu as modifié le texte : relis l’enchaînement des slides avant de publier.",
  [PHOTOS_EDITED]: "Tu as modifié le texte ou les photos : vérifie que chaque photo va bien avec sa slide.",
};

const DEFECT_LABEL: Record<string, string> = {
  unclear_idea: "l’idée principale gagnerait à être plus nette",
  promise: "la promesse du début n’est pas tout à fait tenue",
  juxtaposition: "les idées sont posées côte à côte, sans lien entre elles",
  repetition: "redit ce qui a déjà été dit",
  rupture: "le passage depuis la slide d’avant est un peu brusque",
  ending: "la fin découle mal de ce qui précède",
  unsupported: "la phrase généralise ou affirme un peu trop",
  voice: "une tournure ne sonne pas tout à fait comme toi",
  omission: "il manque une petite explication pour suivre",
  raw_photo_text: "cette photo devait rester sans texte",
};

const slideNumber = (id: unknown): number | null => {
  const n = Number(String(id ?? "").split(".")[1]);
  return Number.isInteger(n) ? n + 1 : null;
};

const slidesLabel = (nums: number[]): string =>
  nums.length > 1 ? `Slides ${nums.slice(0, -1).join(", ")} et ${nums.at(-1)}` : `Slide ${nums[0]}`;

const quote = (excerpt: unknown): string => {
  const text = typeof excerpt === "string" ? excerpt.replace(/\s+/g, " ").trim() : "";
  if (!text) return "";
  return ` (« ${text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text} »)`;
};

/** Constats du juge (reçu à jour seulement) → libellés courts, dédoublonnés. */
function judgeSuggestions(receipt: any): string[] {
  const report = receipt?.report;
  if (receipt?.execution_status !== "completed" || !report) return [];
  const out: string[] = [];
  if (report.trajectory?.kind === "descriptive_catalogue") {
    out.push("Le carrousel décrit plusieurs choses sans dérouler une idée : tu peux relier les slides par un fil.");
  }
  for (const d of Array.isArray(report.defects) ? report.defects : []) {
    const nums = (Array.isArray(d?.slide_ids) ? d.slide_ids : []).map(slideNumber).filter((n: number | null): n is number => n != null);
    const label = DEFECT_LABEL[d?.type] || "un passage mérite une relecture";
    out.push(nums.length ? `${slidesLabel(nums)} : à relire, ${label}${quote(d?.excerpt)}.` : `À relire : ${label}.`);
  }
  for (const b of Array.isArray(report.boundaries) ? report.boundaries : []) {
    if (b?.kind !== "rupture") continue;
    const from = slideNumber(b.from), to = slideNumber(b.to);
    if (from && to) out.push(`Slides ${from} → ${to} : à relire, le passage de l’une à l’autre est un peu brusque.`);
  }
  if (report.verdict === "insufficient_evidence") {
    out.push("Une affirmation importante mérite d’être vérifiée avant de publier.");
  }
  return [...new Set(out)];
}

export function splitCarouselWarnings(doc: any): { blocking: string[]; suggestions: string[] } {
  const all: string[] = (Array.isArray(doc?.structure_warnings) ? doc.structure_warnings : [])
    .filter((w: unknown): w is string => typeof w === "string" && !!w.trim());
  const receipt = doc?.progression_review;
  const judge = new Set<string>(Array.isArray(receipt?.issues) ? receipt.issues : []);
  const repeats = new Set<string>(Array.isArray(doc?.photo_review?.repeat_warnings) ? doc.photo_review.repeat_warnings : []);
  const blocking: string[] = [];
  const suggestions: string[] = [];
  let judgeShown = false;
  for (const w of all) {
    if (judge.has(w)) { judgeShown = true; continue; }
    if (RELABEL[w]) suggestions.push(RELABEL[w]);
    else if (repeats.has(w) || /^La photo \d+ revient sur \d+ slides/.test(w)) suggestions.push(w);
    else blocking.push(w);
  }
  // Seulement si le serveur les avait affichés : un reçu « sans objet »
  // (Photos brutes) ou périmé ne doit pas les faire réapparaître.
  if (judgeShown) {
    const derived = judgeSuggestions(receipt);
    suggestions.unshift(...(derived.length ? derived : ["Quelques passages méritent une relecture avant de publier."]));
  }
  return { blocking: [...new Set(blocking)], suggestions: [...new Set(suggestions)] };
}
