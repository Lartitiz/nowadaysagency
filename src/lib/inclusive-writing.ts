// La fiche de marque n'a pas de case « écriture inclusive » : on la déduit des
// textes de ton et de voix. Choix de Laetitia du 13/11/2026 : la checklist de
// l'éditeur ne pose la question du point médian qu'aux personnes dont la fiche
// en parle (une marchande de biens ne doit pas se la voir imposer).
const VOICE_FIELDS = [
  "tone_description", "tone_style", "tone_register", "tone_do", "tone_dont",
  "voice_description", "key_expressions", "things_to_avoid", "tone_keywords",
] as const;

const INCLUSIVE_PATTERN = /inclusi|point[\s-]*m[ée]dian|épicène|epicene/i;

export function brandWantsInclusiveWriting(brand: Record<string, unknown> | null | undefined): boolean {
  if (!brand) return false;
  return VOICE_FIELDS.some((field) => {
    const value = brand[field];
    if (value == null) return false;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return INCLUSIVE_PATTERN.test(text);
  });
}
