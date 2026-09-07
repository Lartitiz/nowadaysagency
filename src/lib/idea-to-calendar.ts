// Ce qu'une idée emporte quand on la POSE au calendrier (« Poser au calendrier »
// depuis /idees, glisser-déposer ou planification mobile depuis le panneau).
//
// Avant, seul `content_draft` (texte brut) partait : une série de stories
// rangée en idée arrivait au calendrier sans ses stories. On reconstruit
// maintenant le même détail que Créer (`story_sequence_detail`, compteurs
// stories, accroche) à partir de `content_data`, quelle que soit son origine :
//  - résultat brut de génération (`result.raw`, via « Garder en idée »)
//  - charge utile de « Remettre en idée » (Calendar.buildIdeaPayloadFromPost)
//  - simple texte (`content_draft`) sans données structurées
import { buildCalendarContent } from "@/features/creer/build-calendar-content";

export interface IdeaForCalendar {
  titre: string;
  angle?: string | null;
  format?: string | null;
  canal?: string | null;
  objectif?: string | null;
  notes?: string | null;
  content_draft?: string | null;
  content_data?: unknown;
  series_id?: string | null;
  episode_number?: number | null;
}

export interface CalendarPostFromIdea {
  theme: string;
  angle: string | null;
  canal: string;
  objectif: string | null;
  format: string | null;
  notes: string | null;
  status: "idea" | "drafting";
  content_draft: string | null;
  accroche: string | null;
  story_sequence_detail: unknown | null;
  stories_count: number | null;
  stories_structure: string | null;
  stories_objective: string | null;
  media_urls: string[] | null;
  series_id: string | null;
  episode_number: number | null;
}

/** Format de `saved_ideas` → format « Créer » compris par buildCalendarContent. */
export function ideaFormatToCreerFormat(format: string | null | undefined): string | null {
  switch ((format || "").toLowerCase()) {
    case "story":
    case "story_serie":
      return "story";
    case "carousel":
    case "carrousel":
    case "post_carrousel":
      return "carousel";
    case "post":
    case "post_photo":
    case "post_texte":
      return "post";
    case "reel":
    case "linkedin":
    case "newsletter":
    case "pinterest_visual":
    case "pinterest_photo":
      return format!.toLowerCase();
    case "pinterest":
    case "pinterest_inspiration":
      return "pinterest_visual";
    case "":
    case "actu":
      return null;
    default:
      return format!.toLowerCase();
  }
}

/** Titre sans l'emoji de rangement (« 📱 Mon sujet » → « Mon sujet »). */
export function cleanIdeaTitle(titre: string): string {
  return (titre || "").replace(/^[\p{Extended_Pictographic}️\s]+/u, "").trim() || titre;
}

function parseData(data: unknown): Record<string, any> | null {
  let d: unknown = data;
  if (typeof d === "string") {
    try { d = JSON.parse(d); } catch { return null; }
  }
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  return Object.keys(d as object).length > 0 ? (d as Record<string, any>) : null;
}

function isPlainText(s: string | null | undefined): s is string {
  const t = (s || "").trim();
  return t.length > 0 && !t.startsWith("{") && !t.startsWith("[");
}

export function buildCalendarPostFromIdea(idea: IdeaForCalendar): CalendarPostFromIdea {
  const base: CalendarPostFromIdea = {
    theme: cleanIdeaTitle(idea.titre),
    angle: idea.angle || null,
    canal: idea.canal || "instagram",
    objectif: idea.objectif || null,
    format: idea.format || null,
    notes: idea.notes || null,
    status: "idea",
    content_draft: null,
    accroche: null,
    story_sequence_detail: null,
    stories_count: null,
    stories_structure: null,
    stories_objective: null,
    media_urls: null,
    series_id: idea.series_id ?? null,
    episode_number: idea.episode_number ?? null,
  };

  const data = parseData(idea.content_data);
  const plainDraft = isPlainText(idea.content_draft) ? idea.content_draft.trim() : null;

  // 1. Charge utile de « Remettre en idée » : on restitue tel quel.
  if (data && (data.story_sequence_detail || data.carousel || data.media_urls || data.accroche || data.content)) {
    const detail = data.story_sequence_detail ?? (data.carousel ? { type: "carousel", ...data.carousel } : null);
    const stories = Array.isArray(detail?.stories) ? detail.stories : null;
    const draft = plainDraft || (typeof data.content === "string" && data.content.trim() ? data.content.trim() : null);
    return {
      ...base,
      status: draft || detail ? "drafting" : "idea",
      content_draft: draft,
      accroche: typeof data.accroche === "string" && data.accroche.trim() ? data.accroche.trim() : null,
      story_sequence_detail: detail,
      stories_count: stories ? (data.stories_count ?? stories.length) : null,
      stories_structure: stories ? (data.stories_structure ?? detail.structure_label ?? detail.structure_type ?? null) : null,
      stories_objective: stories ? (data.stories_objective ?? idea.objectif ?? null) : null,
      media_urls: Array.isArray(data.media_urls) && data.media_urls.length > 0 ? data.media_urls : null,
    };
  }

  // 2. Résultat brut de génération (« Garder en idée ») : même fabrique que Créer.
  const creerFormat = ideaFormatToCreerFormat(idea.format);
  if (data && creerFormat) {
    const { contentDraft, accroche, storyDetail } = buildCalendarContent(creerFormat, data);
    const draft = (contentDraft || "").trim() || plainDraft;
    if (draft || storyDetail) {
      const stories = creerFormat === "story" ? (data.stories || data.sequences) : null;
      return {
        ...base,
        status: "drafting",
        content_draft: draft || null,
        accroche: (accroche || "").trim() || null,
        story_sequence_detail: storyDetail ?? null,
        stories_count: Array.isArray(stories) ? (data.total_stories || stories.length) : null,
        stories_structure: Array.isArray(stories) ? (data.structure_label || data.structure_type || null) : null,
        stories_objective: Array.isArray(stories) ? (idea.objectif || null) : null,
      };
    }
  }

  // 3. Simple texte.
  if (plainDraft) {
    return { ...base, status: "drafting", content_draft: plainDraft, accroche: plainDraft.split("\n")[0]?.slice(0, 200) || null };
  }

  return base;
}
