import { Check, Loader2 } from "lucide-react";

/** Script du reel tel qu'écrit, avant relecture (évènement SSE `draft` de creative-flow). */
export interface ReelDraft {
  /** Accroche : celle choisie par la cliente dès le départ, puis celle du brouillon. */
  hook: string;
  sections: { timing?: string; texte_parle?: string; texte_overlay?: string }[];
}

const STEPS = ["Accroche", "Script scène par scène", "Relecture"] as const;

/**
 * REEL EN BROUILLON (13/11/2026). Laetitia : 1 à 2 minutes devant un
 * téléphone vide, « au temps perçu, ça fait trop long ». Comme le carrousel :
 * l'accroche choisie s'affiche tout de suite dans le téléphone, puis les scènes
 * arrivent dès que le script est écrit, grisées et signalées « Brouillon » pendant
 * la relecture finale. Le script relu les remplace.
 */
export function ReelDraftPreview({ draft, stage }: { draft: ReelDraft; stage?: string | null }) {
  const sections = draft.sections.filter((s) => (s.texte_parle || s.texte_overlay || "").trim());
  const hasScript = sections.length > 0;
  const current = hasScript ? 2 : draft.hook ? 1 : 0;
  const message = hasScript
    ? "Je relis ton script pour gommer les tournures d'IA…"
    : "J'écris ton script scène par scène…";
  const hookShown = draft.hook || sections[0]?.texte_overlay || "";

  return (
    <div className="space-y-4 animate-fade-in" data-testid="reel-draft-preview">
      <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground min-w-0" role="status" aria-live="polite">{message}</p>
          {hasScript && (
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

      <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
        <div
          className="w-32 shrink-0 aspect-[9/16] rounded-2xl bg-primary/10 border border-border flex items-center justify-center p-3 overflow-hidden"
          aria-label="Aperçu de l'accroche du reel"
          data-testid="reel-draft-phone"
        >
          {hookShown ? (
            <p className="text-sm font-semibold leading-snug text-center text-foreground line-clamp-[8] animate-fade-in">{hookShown}</p>
          ) : (
            <div className="w-full space-y-2" aria-hidden="true">
              <div className="h-2.5 rounded bg-secondary animate-pulse" />
              <div className="h-2.5 rounded bg-secondary animate-pulse w-3/4 mx-auto" />
            </div>
          )}
        </div>

        {hasScript ? (
          <ol className="flex-1 min-w-0 w-full space-y-2" aria-label="Scènes du reel en brouillon" data-testid="reel-draft-scenes">
            {sections.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-muted-foreground animate-fade-in"
                style={{ animationDelay: `${i * 180}ms`, animationFillMode: "backwards" }}
              >
                <span className="block text-2xs text-muted-foreground/70 mb-0.5">
                  Scène {i + 1}{s.timing ? ` · ${s.timing}` : ""}
                </span>
                {s.texte_parle && <p className="text-xs leading-snug">{s.texte_parle}</p>}
                {s.texte_overlay && <p className="text-2xs mt-1 text-muted-foreground/80">À l'écran : {s.texte_overlay}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex-1 min-w-0 w-full space-y-2" aria-hidden="true" data-testid="reel-draft-skeleton">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-dashed border-border px-3 py-2 space-y-1.5">
                <div className="h-2 w-16 rounded bg-secondary animate-pulse" />
                <div className="h-2.5 rounded bg-secondary animate-pulse" style={{ width: `${90 - i * 12}%` }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Accroche choisie par la cliente (objet du tool `proposer_hooks` ou texte), pour l'afficher dès le départ. */
export function chosenHookText(selectedHook: unknown): string {
  if (typeof selectedHook === "string") return selectedHook.trim();
  const text = (selectedHook as { text?: unknown } | null)?.text;
  return typeof text === "string" ? text.trim() : "";
}
