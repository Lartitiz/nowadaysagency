import { Check, Loader2 } from "lucide-react";

/** Stories telles qu'écrites, avant relecture (évènement SSE `draft` de creative-flow, 27/11/2026). */
export interface StoryDraft {
  stories: { number?: number; role?: string; text?: string; sticker?: string }[];
}

const STEPS = ["Écriture des stories", "Relecture"] as const;

/**
 * STORIES EN BROUILLON (27/11/2026). Même idée que le reel : chaque story
 * s'affiche, grisée et signalée « Brouillon », dès qu'elle est écrite, au lieu
 * d'un écran vide jusqu'à la fin. La séquence relue et mise en forme la remplace.
 */
export function StoryDraftPreview({ draft, stage }: { draft: StoryDraft; stage?: string | null }) {
  const stories = draft.stories.filter((s) => (s.text || "").trim());
  const reviewing = stage === "correcting";
  const message = reviewing
    ? "Je relis tes stories pour gommer les tournures d'IA…"
    : stories.length
    ? `J'écris tes stories… (${stories.length} déjà écrite${stories.length > 1 ? "s" : ""})`
    : "J'écris tes stories…";
  const current = reviewing ? 1 : 0;

  return (
    <div className="space-y-4 animate-fade-in" data-testid="story-draft-preview">
      <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground min-w-0" role="status" aria-live="polite">{message}</p>
          {stories.length > 0 && (
            <span className="ml-auto text-2xs font-medium rounded-full px-2.5 py-0.5 bg-amber-100 text-amber-900">
              Brouillon, sera relu
            </span>
          )}
        </div>
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {STEPS.map((label, i) => (
            <li key={label} className={`flex items-center gap-1 ${i === current ? "text-foreground font-medium" : ""}`}>
              {i < current ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> : <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
              {label}
            </li>
          ))}
        </ol>
      </div>

      <ol className="w-full space-y-2" aria-label="Stories en brouillon" data-testid="story-draft-list">
        {stories.map((s, i) => (
          <li
            key={i}
            className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-muted-foreground animate-fade-in"
            style={{ animationFillMode: "backwards" }}
          >
            <span className="block text-2xs text-muted-foreground/70 mb-0.5">
              Story {s.number ?? i + 1}{s.role ? ` · ${s.role}` : ""}
            </span>
            <p className="text-xs leading-snug whitespace-pre-line">{s.text}</p>
            {s.sticker && <p className="text-2xs mt-1 text-muted-foreground/80">Sticker : {s.sticker}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Brouillon suivant : les stories déjà affichées ne reculent jamais
 * (le dernier envoi peut venir d'une lecture plus courte).
 */
export function mergeStoryDraft(prev: StoryDraft | null, next: StoryDraft): StoryDraft {
  return next.stories.length >= (prev?.stories.length ?? 0) ? next : prev!;
}
