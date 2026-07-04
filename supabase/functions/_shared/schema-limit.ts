// Garde DÉTERMINISTE sur les schémas visuels d'un carrousel.
//
// La règle éditoriale (PR #112/#113, re-confirmée par l'audit live du 04/07) :
// le narratif prime, le schéma est l'exception — MAXIMUM 2 par carrousel,
// JAMAIS deux consécutifs. Le prompt le dit, mais le modèle déborde (observé
// en prod : 3 schémas consécutifs). Même pattern que normalizePhotoIndexes :
// on re-parse le JSON du modèle, on retire les visual_schema excédentaires
// (le premier arrivé gagne), on re-sérialise. En cas de doute (JSON illisible,
// pas de slides), on rend le contenu intact.

export function limitVisualSchemas(content: string): { content: string; stripped: number } {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { content, stripped: 0 };
    const parsed = JSON.parse(jsonMatch[0]);
    const slides = parsed?.slides;
    if (!Array.isArray(slides) || slides.length === 0) return { content, stripped: 0 };

    let kept = 0;
    let prevHadSchema = false;
    let stripped = 0;
    for (const s of slides) {
      if (!s || typeof s !== "object" || !s.visual_schema) {
        prevHadSchema = false;
        continue;
      }
      if (kept >= 2 || prevHadSchema) {
        s.visual_schema = null;
        stripped++;
        prevHadSchema = false;
        continue;
      }
      kept++;
      prevHadSchema = true;
    }

    if (stripped === 0) return { content, stripped: 0 };
    const start = jsonMatch.index ?? 0;
    return {
      content:
        content.slice(0, start) +
        JSON.stringify(parsed) +
        content.slice(start + jsonMatch[0].length),
      stripped,
    };
  } catch {
    return { content, stripped: 0 };
  }
}
