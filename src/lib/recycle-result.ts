/** Une réponse de refus n'est jamais un post à copier, planifier ou sauvegarder. */
export function isRecycleRefusal(value: unknown): boolean {
  return typeof value === "string" && /^(?:[#*_]+\s*)?(?:contenu non g[eé]n[eé]r[eé]|je ne peux pas|impossible de r[eé]diger)/i.test(value.trim());
}

/** Stories recyclées structurées ({ stories: [...] }, 04/10/2026) : rendues
 * comme le flux stories principal (images), plus en prose. */
export function isRecycledStoriesSequence(value: unknown): value is { stories: any[] } {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Array.isArray((value as any).stories) && (value as any).stories.length > 0;
}

/** Texte à copier d'une séquence recyclée : uniquement ce qui se lit sur les
 * stories (même forme que la copie du flux principal), jamais les consignes
 * de photo. */
export function recycledStoriesText(sequence: { stories: any[] }): string {
  return sequence.stories
    .map((s: any, i: number) => {
      const text = String(s?.text ?? s?.texte ?? s?.content ?? "").trim();
      const sticker = s?.sticker?.type ? ` [sticker : ${s.sticker.type}]` : "";
      return text ? `📱 Story ${i + 1}${sticker}\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}
