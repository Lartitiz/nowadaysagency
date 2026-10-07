import { useEffect, useRef } from "react";
import { Check, Loader2 } from "lucide-react";

/** Slide en brouillon envoyée par carousel-ai pendant l'écriture (évènement SSE `draft`). */
export interface DraftSlide {
  n: number;
  title: string;
  text: string;
}

const STEPS = ["Écriture", "Relecture", "Enchaînement des slides"] as const;
const STAGE_STEP: Record<string, number> = { writing: 0, correcting: 1, checking: 2 };

/**
 * SLIDES EN BROUILLON (07/10/2026) : un carrousel de 13-14 slides mettait
 * ~3 min à s'afficher d'un bloc. Les slides apparaissent maintenant au fil de
 * l'écriture, grisées et non modifiables (la relecture peut encore les
 * changer), avec les vraies étapes du serveur. Le texte relu les remplace.
 */
export function CarouselDraftPreview({ slides, stage }: { slides: DraftSlide[]; stage?: string | null }) {
  // L'étape ne recule jamais : une correction APRÈS la vérification du fil
  // est une reprise de l'enchaînement, pas un retour à la relecture.
  const reached = useRef(0);
  const current = Math.max(reached.current, STAGE_STEP[stage ?? ""] ?? 0);
  useEffect(() => { reached.current = current; }, [current]);
  const fixingThread = current === 2 && stage === "correcting";

  const message = current === 0
    ? `J'écris ton carrousel… ${slides.length} slide${slides.length > 1 ? "s" : ""} écrite${slides.length > 1 ? "s" : ""}`
    : current === 1
      ? "Je relis ton texte pour gommer les tournures d'IA…"
      : fixingThread
        ? "J'ajuste l'enchaînement entre les slides…"
        : "Je vérifie que les slides s'enchaînent…";

  return (
    <div className="space-y-4 animate-fade-in" data-testid="carousel-draft-preview">
      <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground min-w-0" role="status" aria-live="polite">{message}</p>
          <span className="ml-auto text-2xs font-medium rounded-full px-2.5 py-0.5 bg-amber-100 text-amber-900">
            Brouillon, sera relu
          </span>
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

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" aria-label="Slides en cours d'écriture">
        {slides.map((s, i) => (
          <li
            key={s.n}
            className={`aspect-[4/5] rounded-lg p-2.5 overflow-hidden animate-fade-in ${i === 0
              ? "bg-primary/85 text-primary-foreground flex flex-col justify-end"
              : "border border-dashed border-border bg-background/60 text-muted-foreground"}`}
          >
            {i > 0 && <span className="block text-2xs text-muted-foreground/70 mb-1">{s.n}</span>}
            {s.title && <p className={`font-medium leading-snug line-clamp-4 ${i === 0 ? "text-sm" : "text-xs text-foreground/70"}`}>{s.title}</p>}
            {s.text && i > 0 && <p className="mt-1 text-2xs leading-snug line-clamp-5">{s.text}</p>}
          </li>
        ))}
        {current === 0 && (
          <li className="aspect-[4/5] rounded-lg border border-dashed border-border bg-secondary/40 animate-pulse flex items-center justify-center text-xs text-muted-foreground" aria-hidden="true">
            {slides.length + 1}
          </li>
        )}
      </ul>
    </div>
  );
}
