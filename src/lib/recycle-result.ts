/** Une réponse de refus n'est jamais un post à copier, planifier ou sauvegarder. */
export function isRecycleRefusal(value: unknown): boolean {
  return typeof value === "string" && /^(?:[#*_]+\s*)?(?:contenu non g[eé]n[eé]r[eé]|je ne peux pas|impossible de r[eé]diger)/i.test(value.trim());
}
