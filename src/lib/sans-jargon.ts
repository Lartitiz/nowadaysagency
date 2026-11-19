/**
 * « CTA » → « appel à l'action » dans un texte écrit par l'IA (19/11/2026).
 *
 * Une cliente n'a pas compris « CTA » dans son diagnostic de fin
 * d'onboarding. La consigne de l'IA l'interdit, mais une consigne reste une
 * probabilité : ce filet déterministe garantit que le mot n'atteint jamais
 * l'écran, et il corrige aussi les diagnostics déjà enregistrés.
 *
 * ⚠️ Copie exacte dans supabase/functions/deep-diagnostic/jargon.ts (le
 * serveur ne peut pas importer src/). Le test sans-jargon.test.ts vérifie que
 * les deux donnent le même résultat.
 */

const PLURAL_DETS = new Set(["les", "des", "tes", "ses", "vos", "nos", "mes", "leurs", "ces", "plusieurs", "quelques"]);
const SWAP: Record<string, string> = { ta: "ton", sa: "son", ma: "mon", une: "un", aucune: "aucun", ce: "cet" };

function keepCase(model: string, word: string): string {
  return model[0] === model[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word;
}

const RE = /(?:\b([A-Za-zÀ-ÿ]+)\s+|\b([dD])['’])?\bCTA(s?)\b/g;

export function sansJargon(text: string): string {
  if (!text || !/CTA|call[- ]to[- ]action/i.test(text)) return text;
  const normalized = text.replace(/\bcall[- ]to[- ]action(s?)\b/gi, (_m, s: string) => `CTA${s}`);
  const out = normalized.replace(RE, (_m, word: string | undefined, elided: string | undefined, s: string) => {
    if (elided) {
      return `${keepCase(elided, "d")}'${s ? "appels" : "appel"} à l'action`;
    }
    if (!word) return s ? "appels à l'action" : "appel à l'action";
    const w = word.toLowerCase();
    const plural = s === "s" || PLURAL_DETS.has(w);
    const noun = plural ? "appels à l'action" : "appel à l'action";
    if (w === "bouton" || w === "boutons") return `${word} d'action`;
    if (w === "le" || w === "la") return `${keepCase(word, "l")}'${noun}`;
    if (w === "de") return `${keepCase(word, "d")}'${noun}`;
    if (w === "du") return `${keepCase(word, "de")} l'${noun}`;
    if (SWAP[w] && !plural) return `${keepCase(word, SWAP[w])} ${noun}`;
    return `${word} ${noun}`;
  });
  // Mot en début de phrase : majuscule.
  return out.replace(/(^|[.!?]\s+|\n\s*)(appels? à l'action)/g, (_m, p: string, a: string) => p + a[0].toUpperCase() + a.slice(1));
}

/** Applique sansJargon à toutes les chaînes d'un objet (diagnostic complet). */
export function sansJargonDeep<T>(value: T): T {
  if (typeof value === "string") return sansJargon(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => sansJargonDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sansJargonDeep(v);
    return out as T;
  }
  return value;
}
