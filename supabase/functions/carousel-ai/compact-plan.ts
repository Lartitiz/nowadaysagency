// Plan COMPACT du carrousel avec photos (structure_proposal, 09/10/2026).
//
// Mesuré en ligne : 55-64 s pour 3 photos et 10 slides, un seul appel Sonnet
// qui écrivait ~12 Ko de JSON (13 champs par slide). L'essentiel de ce volume
// répétait la même description de photo sur chaque slide qui la portait
// (photo_observation, visual_anchor) et des champs qui se recoupent
// (strategic_note ≈ contribution, image_role ≈ image_relation).
//
// Le modèle décrit donc chaque photo UNE fois (photo_notes) et chaque slide
// garde son photo_index et ce que l'image accompagne (image_relation). Le
// serveur reconstitue ensuite les champs par slide que lisent la rédaction,
// les juges, l'association finale et les visuels : rien ne change en aval.

/** Ce que le modèle écrit une seule fois par photo. */
export const PHOTO_NOTES_FIELD = {
  type: "array",
  description: "Une entrée par photo fournie, décrite une seule fois pour tout le plan.",
  items: {
    type: "object",
    properties: {
      photo_index: { type: "number" },
      observation: { type: "string", description: "Ce qui est visible et ce qui reste ambigu, sans histoire supposée." },
      anchor: { type: "string", description: "Détail visible à préserver dans le cadrage, en quelques mots." },
    },
  },
};

/** Champs d'une slide du plan compact (sans strategic_note, image_role, photo_observation, visual_anchor). */
export const COMPACT_SLIDE_PROPERTIES = {
  slide_number: { type: "number" },
  role: { type: "string" },
  title_suggestion: { type: "string" },
  contribution: { type: "string", description: "Pourquoi cette page à cette position et ce qu'elle apporte au propos." },
  inherits: { type: "string" },
  develops: { type: "string" },
  source_ids: { type: "array", items: { type: "string" } },
  story_beat: { type: "string" },
  image_relation: { type: "string", description: "Ce que la photo accompagne dans le récit, même indirectement, sans dicter le texte." },
  factual_basis: { type: "string", description: "Faits utilisables et leur source (brief/réponses/marque), observations ou interprétation explicitement présentée comme telle. Aucun fait déduit du scénario lui-même." },
  photo_index: { type: ["number", "null"] },
  slide_type: { type: "string" },
  overlay_position: { type: "string", enum: ["top_left", "top_center", "bottom_left", "bottom_center", "center"] },
};

/** Consigne ajoutée au prompt du plan compact : elle prime sur les noms de champs des contrats communs. */
export const COMPACT_PLAN_FORMAT = `FORMAT DE SORTIE COMPACT (prime sur les noms de champs cités plus haut) :
- Décris chaque photo UNE seule fois dans photo_notes : observation (ce qui est visible et ce qui reste ambigu, sans histoire supposée) et anchor (détail visible à préserver dans le cadrage). Ces deux champs tiennent lieu de photo_observation et visual_anchor : ne les répète pas dans les slides.
- Dans chaque slide, contribution dit pourquoi la page est à cette position et ce qu'elle apporte ; elle tient lieu de strategic_note. image_relation dit ce que la photo accompagne ; elle tient lieu d'image_role.
- Une phrase courte par champ, sans redire un autre champ. factual_basis peut citer brièvement plusieurs sources.`;

const ANCHOR_MAX = 120;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Reconstitue les champs par slide attendus en aval à partir du plan compact,
 * puis retire photo_notes. N'écrase jamais un champ déjà renseigné. À appeler
 * APRÈS toute réattribution des photos, pour que l'observation suive la photo
 * réellement posée.
 */
export function expandCompactPlan(result: any): any {
  if (!result || typeof result !== "object" || !Array.isArray(result.slides)) return result;
  const notes = new Map<number, { observation: string; anchor: string }>();
  for (const note of Array.isArray(result.photo_notes) ? result.photo_notes : []) {
    const index = Number(note?.photo_index);
    if (!Number.isInteger(index) || index < 1 || notes.has(index)) continue;
    notes.set(index, { observation: text(note?.observation), anchor: text(note?.anchor) });
  }
  const { photo_notes: _notes, ...rest } = result;
  const slides = result.slides.map((slide: any) => {
    if (!slide || typeof slide !== "object") return slide;
    const next = { ...slide };
    if (!text(next.strategic_note)) {
      next.strategic_note = text(next.contribution) || text(next.develops) || text(next.story_beat) || text(next.title_suggestion) || "Étape du propos";
    }
    if (!text(next.image_role) && text(next.image_relation)) next.image_role = text(next.image_relation);
    const note = notes.get(Number(next.photo_index));
    if (note) {
      if (!text(next.photo_observation) && note.observation) next.photo_observation = note.observation;
      if (!text(next.visual_anchor) && note.anchor) next.visual_anchor = note.anchor.slice(0, ANCHOR_MAX);
    }
    return next;
  });
  return { ...rest, slides };
}
