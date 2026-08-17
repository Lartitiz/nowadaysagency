// Normalise les champs liste d'un guide de voix venant de l'IA ou de la BDD.
// L'edge generate-voice-guide normalise désormais avant d'enregistrer, mais des
// lignes voice_guides antérieures peuvent contenir une chaîne "a, b, c" là où le
// front attend un tableau (crash .map() vu en prod le 17/08) — on re-normalise
// donc aussi à la lecture.

const GUIDE_ARRAY_FIELDS = [
  "tone_keywords",
  "do_say",
  "dont_say",
  "words_to_use",
  "words_to_avoid",
  "emotions_to_create",
] as const;

export function normalizeVoiceGuide<T extends Record<string, any>>(guide: T): T {
  const out: Record<string, any> = { ...guide };
  for (const field of GUIDE_ARRAY_FIELDS) {
    const value = out[field];
    if (value == null) {
      out[field] = [];
    } else if (Array.isArray(value)) {
      out[field] = value.map((v) => (typeof v === "string" ? v : String(v)));
    } else {
      out[field] = String(value)
        .split(/\r?\n|[,;•·]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return out as T;
}
