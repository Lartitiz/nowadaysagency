export function parseAIResponse<T = any>(raw: string): T {
  // Tentative 1 : parse direct
  try {
    return JSON.parse(raw);
  } catch {}

  // Tentative 2 : nettoyer les backticks markdown
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {}

  // Tentative 3 : extraire le premier objet JSON
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }

  // Tentative 4 : extraire le premier array JSON
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {}
  }

  throw new Error("L'IA a renvoyé un format inattendu. Réessaie !");
}
