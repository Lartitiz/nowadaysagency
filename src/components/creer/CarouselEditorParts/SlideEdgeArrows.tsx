// Flèches rondes sur les bords de la slide, comme sur Instagram (retour d'une
// cliente en rendez-vous, 19/11/2026 : difficile de passer d'une slide à
// l'autre). Le parent les cache dès qu'un élément est choisi, pour ne pas gêner
// ses poignées ; masquées dans les photos de référence (e2e-visite/fige-replay.ts).
import { ChevronLeft, ChevronRight } from "lucide-react";

export function SlideEdgeArrows({ active, count, goTo }: { active: number; count: number; goTo: (index: number) => void }) {
  if (count < 2) return null;
  const arrows = [
    { label: "Slide précédente", delta: -1, off: active === 0, side: "left-2", icon: <ChevronLeft size={20} />, testId: "slide-edge-prev" },
    { label: "Slide suivante", delta: 1, off: active >= count - 1, side: "right-2", icon: <ChevronRight size={20} />, testId: "slide-edge-next" },
  ];
  return (
    <>
      {arrows.filter((a) => !a.off).map((a) => (
        <button key={a.testId} type="button" aria-label={a.label} title={a.label} data-testid={a.testId} onClick={() => goTo(active + a.delta)}
          className={`absolute top-1/2 z-10 -translate-y-1/2 ${a.side} flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-md backdrop-blur-sm transition hover:scale-105 hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary`}>
          {a.icon}
        </button>
      ))}
    </>
  );
}
