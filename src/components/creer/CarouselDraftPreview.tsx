import { useEffect, useRef } from "react";
import { Check, Loader2 } from "lucide-react";

/** Slide en brouillon envoyée par carousel-ai pendant l'écriture (évènement SSE `draft`). */
export interface DraftSlide {
  n: number;
  title: string;
  text: string;
  /** Photo déjà décidée pour cette slide (1 = première photo envoyée). */
  photo?: number;
}

const STEPS = ["Écriture", "Relecture", "Enchaînement des slides"] as const;
const STAGE_STEP: Record<string, number> = { writing: 0, correcting: 1, checking: 2 };

/**
 * SLIDES EN BROUILLON (07/10/2026) : un carrousel de 13-14 slides mettait
 * ~3 min à s'afficher d'un bloc. Les slides apparaissent maintenant au fil de
 * l'écriture, grisées et non modifiables (la relecture peut encore les
 * changer), avec les vraies étapes du serveur. Le texte relu les remplace.
 */
/**
 * PLAN ENVISAGÉ (08/10/2026) : le rédacteur réfléchit ~50 s avant sa 1re
 * slide. D'ici là, `outline` (titres prévus par un appel court) occupe
 * l'écran, signalé « peut changer » ; les vraies slides le remplacent.
 */
/**
 * Carrousels photo et mixte (08/10/2026) : quand la photo d'une slide est déjà
 * décidée (plan validé), elle apparaît en fond de la carte. Sinon texte seul :
 * le choix des photos se fait après l'écriture.
 */
export function CarouselDraftPreview({ slides, outline, stage, photos }: { slides: DraftSlide[]; outline?: string[]; stage?: string | null; photos?: { preview?: string }[] }) {
  // L'étape ne recule jamais : une correction APRÈS la vérification du fil
  // est une reprise de l'enchaînement, pas un retour à la relecture.
  const reached = useRef(0);
  const current = Math.max(reached.current, STAGE_STEP[stage ?? ""] ?? 0);
  useEffect(() => { reached.current = current; }, [current]);
  const fixingThread = current === 2 && stage === "correcting";
  const planOnly = slides.length === 0 && (outline?.length ?? 0) > 0;

  const message = planOnly
    ? "Je réfléchis à ton carrousel… voici le plan envisagé"
    : current === 0
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
            {planOnly ? "Plan envisagé, peut changer" : "Brouillon, sera relu"}
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

      {planOnly ? (
        <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" aria-label="Plan envisagé du carrousel" data-testid="carousel-outline">
          {outline!.map((title, i) => (
            <li key={i} className="aspect-[4/5] rounded-lg p-2.5 overflow-hidden border border-dashed border-border bg-secondary/30 text-muted-foreground animate-fade-in">
              <span className="block text-2xs text-muted-foreground/70 mb-1">{i + 1}</span>
              <p className="text-xs leading-snug line-clamp-5">{title}</p>
            </li>
          ))}
        </ol>
      ) : (
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" aria-label="Slides en cours d'écriture">
        {slides.map((s, i) => {
          const photo = s.photo ? photos?.[s.photo - 1]?.preview : undefined;
          return photo ? (
            <li key={s.n} className="relative aspect-[4/5] rounded-lg overflow-hidden animate-fade-in bg-muted" data-testid="draft-slide-photo">
              <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" aria-hidden="true" />
              <div className="relative h-full p-2.5 flex flex-col justify-end text-white">
                {i > 0 && <span className="block text-2xs text-white/70 mb-1">{s.n}</span>}
                {s.title && <p className={`font-medium leading-snug line-clamp-4 ${i === 0 ? "text-sm" : "text-xs"}`}>{s.title}</p>}
                {s.text && i > 0 && <p className="mt-1 text-2xs leading-snug line-clamp-5 text-white/85">{s.text}</p>}
              </div>
            </li>
          ) : (
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
          );
        })}
        {current === 0 && (
          <li className="aspect-[4/5] rounded-lg border border-dashed border-border bg-secondary/40 animate-pulse flex items-center justify-center text-xs text-muted-foreground" aria-hidden="true">
            {slides.length + 1}
          </li>
        )}
      </ul>
      )}
    </div>
  );
}
