/**
 * État d'une idée sauvegardée (`saved_ideas`), dérivé de ses colonnes.
 *
 * Les clés historiques restent stables : todo = idée, in_progress = contenu
 * commencé, created = rattaché au calendrier (pas « généré »).
 * Les vues de la bibliothèque regroupent ces états sans migrer les données.
 */
export type IdeaState = "todo" | "in_progress" | "created";

export interface IdeaStateInput {
  status?: string | null;
  calendar_post_id?: string | null;
  content_draft?: string | null;
  content_data?: unknown;
  format?: string | null;
}

const CREATED_STATUSES = new Set(["planned", "published"]);
const IN_PROGRESS_STATUSES = new Set(["drafting", "ready"]);

function hasContent(idea: IdeaStateInput): boolean {
  if (typeof idea.content_draft === "string" && idea.content_draft.trim().length > 0) return true;
  const data = idea.content_data;
  if (data == null) return false;
  if (typeof data === "string") return data.trim().length > 0;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === "object") return Object.keys(data as object).length > 0;
  return false;
}

export function getIdeaState(idea: IdeaStateInput): IdeaState {
  if (idea.calendar_post_id) return "created";
  if (idea.status && CREATED_STATUSES.has(idea.status)) return "created";
  if (idea.status && IN_PROGRESS_STATUSES.has(idea.status)) return "in_progress";
  // Une actu sauvegardée (newsjacking) porte l'article dans content_data :
  // ce n'est pas un brouillon, c'est un point de départ → « À faire ».
  if (idea.format === "actu") return "todo";
  if (hasContent(idea)) return "in_progress";
  return "todo";
}

export const IDEA_STATE_LABELS: Record<IdeaState, { singular: string; plural: string; tab: string }> = {
  todo: { singular: "idée à développer", plural: "idées à développer", tab: "Idée à développer" },
  in_progress: { singular: "contenu commencé", plural: "contenus commencés", tab: "Contenu commencé" },
  created: { singular: "au calendrier", plural: "au calendrier", tab: "Au calendrier" },
};

/** Une source d'actualité ou un simple statut ne prouve pas un contenu généré. */
export function ideaContentLabel(idea: IdeaStateInput): string {
  if (idea.format === "actu") return "Actu à commenter";
  if (hasContent(idea)) return "Contenu enregistré";
  return getIdeaState(idea) === "in_progress" ? "Brouillon à compléter" : "Idée à développer";
}

/** Une date de calendrier ne prouve pas qu'une publication automatique est activée. */
export function calendarPlacementLabel(formattedDate: string): string {
  return `prévu au calendrier le ${formattedDate}`;
}

/** Libellé lisible d'un format technique (`story_serie` → « Série de stories »). */
export function formatLabel(format: string | null | undefined): string {
  switch ((format || "").toLowerCase()) {
    case "post":
    case "post_photo":
    case "post_texte":
      return "Post";
    case "carousel":
    case "carrousel":
    case "post_carrousel":
      return "Carrousel";
    case "reel":
      return "Reel";
    case "story":
      return "Story";
    case "story_serie":
      return "Série de stories";
    case "linkedin":
      return "Post LinkedIn";
    case "newsletter":
      return "Newsletter";
    case "pinterest":
    case "pinterest_visual":
    case "pinterest_photo":
    case "pinterest_inspiration":
      return "Épingle Pinterest";
    case "actu":
      return "Actu";
    case "":
      return "Contenu";
    default:
      return format!.charAt(0).toUpperCase() + format!.slice(1);
  }
}

/** D'où vient l'idée, en mots simples (ou null si rien à dire). */
export function sourceLabel(sourceModule: string | null | undefined, format?: string | null): string | null {
  if (format === "actu" || sourceModule === "newsjacking") return "actu repérée";
  switch (sourceModule) {
    case "diagnostic":
      return "idée du diagnostic";
    case "content_coaching":
      return "proposée par ta coach";
    case "recycling":
      return "recyclage";
    default:
      return null;
  }
}
