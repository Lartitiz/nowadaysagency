// Carte « mince » de la relecture : l'analyse n'a presque rien eu à lire et la
// carte ne fait que reprendre la réponse de départ (vu le 25/10/2026 avec
// « je fais des tasses » : proposition de valeur « Des tasses en céramique
// faites main », offre « Tasses en céramique »). Pour la cible et le ton,
// c'est l'IA qui écrit « Hypothèse : » dans son texte ; pour ces deux cartes,
// c'est l'écran qui le dit, car le serveur écrit leur confiance « medium »
// d'office (diagnostic-enrichment) et ne peut pas servir de signal.
import type { AnalysisResult, SectionKey } from "./types";

const filled = (v: unknown) => typeof v === "string" ? v.trim() !== "" : Array.isArray(v) ? v.length > 0 : v != null;

/** Phrase à afficher sur la carte, ou null si la carte a de la matière. */
export function thinCardHint(key: SectionKey, analysis: AnalysisResult): string | null {
  if (key === "value_proposition") {
    const vp = analysis.value_proposition;
    if (!vp) return null;
    const parts = [vp.key_phrase, vp.problem, vp.solution, vp.differentiator, vp.proofs].filter(filled).length;
    if (parts === 0) return null;
    if (parts === 1 || vp.confidence === "low") return "je n'ai que ta réponse de départ, sans le problème que tu règles ni ce qui te distingue. Ajoute-les avec « Je corrige ».";
    return null;
  }
  if (key === "offers") {
    const offers = analysis.offers?.offers || [];
    if (!offers.length) return null;
    const bare = offers.every((o) => ![o.price, o.description, o.promise, o.target].some(filled));
    if (bare || analysis.offers?.confidence === "low") return "je n'ai que le nom de ton offre, sans prix ni description. Ajoute-les avec « Je corrige ».";
    return null;
  }
  return null;
}
