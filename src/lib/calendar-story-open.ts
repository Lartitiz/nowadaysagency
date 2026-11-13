// « Clique sur une story pour l'ouvrir » depuis la fiche du calendrier
// (13/11/2026) : la fiche note le numéro de la story juste avant d'ouvrir /creer,
// l'éditeur de stories le reprend une seule fois à son ouverture. Pas par l'état
// de navigation : /creer l'efface dès son arrivée, avant d'afficher l'éditeur.
// Pas dans le contenu non plus : il serait enregistré avec les stories.
import { storyVisualOrFallback } from "@/lib/story-visual";

/** Au-delà, la demande est périmée (l'éditeur ne s'est pas ouvert à la suite). */
const PENDING_TTL_MS = 20_000;
let pending: { index: number; at: number } | null = null;

export function requestOpenStory(index: number | null | undefined): void {
  pending = typeof index === "number" && Number.isInteger(index) && index > 0 ? { index, at: Date.now() } : null;
}

/**
 * Story à afficher en premier dans l'éditeur (0 par défaut). La demande sert
 * encore une seconde après la première lecture (double appel des
 * initialisations en mode strict de React), puis elle est oubliée.
 */
export function takeOpenStoryIndex(): number {
  const request = pending;
  if (!request) return 0;
  const now = Date.now();
  if (now - request.at >= PENDING_TTL_MS) { pending = null; return 0; }
  pending = { ...request, at: Math.min(request.at, now - PENDING_TTL_MS + 1_000) };
  return request.index;
}

/** Ce qui reste à préparer : stories face caméra à filmer, fonds photo sans photo posée. */
export function storiesPhotosToTake(stories: any[] | null | undefined): { number: number; directive: string }[] {
  if (!Array.isArray(stories)) return [];
  return stories.flatMap((story: any, index: number) => {
    if (story?.face_cam) return [{ number: index + 1, directive: "te filmer face caméra" }];
    const visual = storyVisualOrFallback(story);
    if (!visual || visual.background !== "photo" || visual.photo_url || visual.photo_id) return [];
    const directive = typeof visual.photo_directive === "string" ? visual.photo_directive.trim() : "";
    return [{ number: index + 1, directive: directive || "une photo pour le fond" }];
  });
}

/** Moment de publication de la séquence (« le soir »), s'il est connu. */
export function storiesPublicationMoment(detail: any): string | null {
  const raw = detail?.publication_time
    || (Array.isArray(detail?.stories) ? detail.stories.find((s: any) => typeof s?.timing === "string" && s.timing.trim())?.timing : null);
  if (typeof raw !== "string" || !raw.trim()) return null;
  const labels: Record<string, string> = { matin: "le matin", midi: "à midi", soir: "le soir" };
  return labels[raw.trim().toLowerCase()] || raw.trim();
}
