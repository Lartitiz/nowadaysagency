// Fin de la création d'un carrousel (26/11/2026, test filmé de Laetitia, maquette
// validée) : l'outil montrait une vue en liste, puis basculait tout seul dans
// l'éditeur (« je pensais devoir cliquer »). Ici, les slides écrites restent à
// l'écran pendant la mise en page, puis « Ton carrousel est prêt » et un bouton.
// Rien ne bascule tout seul.
//
// Seulement pour une création vue en direct sur cet écran : un carrousel rouvert
// (Mes idées, rechargement de page) s'affiche tout de suite comme avant. Si la
// mise en page ne part pas ou échoue, l'écran habituel revient avec son message.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Laps laissé à la mise en page automatique pour démarrer après l'arrivée du texte. */
export const READY_GATE_GRACE_MS = 2500;

interface GateSlide { title?: string; body?: string; overlay_text?: string; photo_index?: number | null }

export function gateSlides(raw: { slides?: GateSlide[] } | null | undefined) {
  return (raw?.slides || []).map((s, i) => ({
    n: i + 1,
    title: (s?.title || s?.overlay_text || "").trim(),
    text: (s?.body || "").trim(),
    photo: Number.isInteger(s?.photo_index) ? (s!.photo_index as number) : undefined,
  }));
}

export function useCarouselReadyGate({
  format, generating, raw, visualCount, visualLoading, visualsError, photos,
}: {
  format: string;
  generating: boolean;
  raw: { slides?: GateSlide[] } | null | undefined;
  visualCount: number;
  visualLoading: boolean;
  visualsError?: string | null;
  photos?: { preview?: string }[];
}): ReactNode {
  // Une écriture vue ici arme le sas ; le clic sur le bouton (ou un abandon) le désarme.
  const armed = useRef(false);
  const [, rerender] = useState(0);
  const [graceOver, setGraceOver] = useState(false);
  if (generating && !armed.current) armed.current = true;

  const hasText = !generating && !!raw?.slides?.length;
  useEffect(() => {
    if (generating) { setGraceOver(false); return; }
    if (!hasText || !armed.current) return;
    const t = setTimeout(() => setGraceOver(true), READY_GATE_GRACE_MS);
    return () => clearTimeout(t);
  }, [generating, hasText]);

  if (format !== "carousel" || !armed.current || !hasText) return null;
  const slides = gateSlides(raw);
  const ready = visualCount > 0;
  const waiting = !ready && (visualLoading || !graceOver) && !visualsError;
  // Pas de texte à montrer (photos brutes), mise en page pas partie ou en échec : écran habituel.
  if (!slides.some((s) => s.title || s.text) || (!ready && !waiting)) {
    if (graceOver || visualsError) armed.current = false;
    return null;
  }
  const open = () => { armed.current = false; rerender((n) => n + 1); };

  return (
    <div className="space-y-4 py-4 animate-fade-in" data-testid="carousel-ready-gate">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        {ready ? <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />}
        <p className={`min-w-0 font-medium text-foreground ${ready ? "text-base" : "text-sm"}`} role="status" aria-live="polite">
          {ready ? `Ton carrousel est prêt · ${slides.length} slide${slides.length > 1 ? "s" : ""}` : "Je mets en page tes slides…"}
        </p>
        {ready && (
          <Button onClick={open} className="ml-auto" data-testid="carousel-ready-open" autoFocus>Ouvrir mon carrousel</Button>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Les slides de ton carrousel">
        {slides.map((s, i) => {
          const photo = s.photo !== undefined ? photos?.[s.photo - 1]?.preview : undefined;
          return photo ? (
            <li key={s.n} className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted">
              <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" aria-hidden="true" />
              <div className="relative flex h-full flex-col justify-end p-2.5 text-white">
                {s.title && <p className="text-xs font-medium leading-snug line-clamp-4">{s.title}</p>}
                {s.text && <p className="mt-1 text-2xs leading-snug text-white/85 line-clamp-5">{s.text}</p>}
              </div>
            </li>
          ) : (
            <li key={s.n} className={`aspect-[4/5] overflow-hidden rounded-lg p-2.5 ${i === 0 ? "flex flex-col justify-end bg-primary text-primary-foreground" : "border border-border bg-card text-foreground/80"}`}>
              {i > 0 && <span className="mb-1 block text-2xs text-muted-foreground/70">{s.n}</span>}
              {s.title && <p className={`font-medium leading-snug line-clamp-4 ${i === 0 ? "text-sm" : "text-xs text-foreground"}`}>{s.title}</p>}
              {s.text && i > 0 && <p className="mt-1 text-xs leading-snug line-clamp-6">{s.text}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
