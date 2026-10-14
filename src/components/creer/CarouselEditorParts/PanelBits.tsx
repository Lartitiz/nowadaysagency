// Lot E3-1 (14/10/2026) : petites briques d'affichage de l'éditeur,
// déplacées à l'identique depuis CarouselEditor.tsx.
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { PHOTO_SHAPES } from "@/lib/carousel-editor";

/**
 * Section repliable du panneau de réglages. Fermée, elle reste dans la page
 * (masquée) ; son état ouvert / fermé est mémorisé par titre.
 */
export function PanelSection({ title, defaultOpen = false, storageKey, icon, children }: { title: string; defaultOpen?: boolean; storageKey?: string; icon?: ReactNode; children: ReactNode }) {
  const key = `carousel-panel:${storageKey || title}`;
  const [open, setOpen] = useState(() => {
    try {
      const saved = window.localStorage.getItem(key);
      return saved === null ? defaultOpen : saved === "1";
    } catch {
      return defaultOpen;
    }
  });
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() =>
          setOpen((o) => {
            try {
              window.localStorage.setItem(key, o ? "0" : "1");
            } catch {
              // Stockage indisponible : l'état reste pour la session.
            }
            return !o;
          })
        }
        className="flex w-full items-center justify-between px-2.5 py-2 text-left text-xs font-semibold hover:bg-muted/50"
      >
        <span className="flex items-center gap-1.5">{icon}{title}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div hidden={!open} className="space-y-3 px-2.5 pb-2.5">
        {children}
      </div>
    </div>
  );
}

/** Miniature réelle d'une slide (rendu du HTML exporté, réduit). */
export function SlideThumb({ html }: { html: string }) {
  const W = 84;
  return (
    <span className="relative block overflow-hidden rounded-md bg-white" style={{ width: W, height: W * 1.25 }} aria-hidden="true">
      <iframe
        title=""
        tabIndex={-1}
        // Comme l'aperçu : pas de scripts ; une origine opaque empêchait certaines slides photo de s'afficher.
        sandbox="allow-same-origin"
        srcDoc={`<!doctype html><html><head><style>html,body{margin:0;width:1080px;height:1350px;overflow:hidden}</style></head><body>${html}</body></html>`}
        style={{ position: "absolute", width: 1080, height: 1350, border: 0, transform: `scale(${W / 1080})`, transformOrigin: "top left", pointerEvents: "none" }}
      />
    </span>
  );
}

/** Choix de la forme d'un cadre photo : un aperçu par forme. */
export function PhotoShapePicker({ current, onPick }: { current: string | null; onPick: (radius: string) => void }) {
  // Le choix s'affiche tout de suite, sans attendre la nouvelle mesure du cadre.
  const [picked, setPicked] = useState(current);
  useEffect(() => setPicked(current), [current]);
  return (
    <div className="flex gap-1" role="group" aria-label="Forme du cadre photo">
      {PHOTO_SHAPES.map((shape) => (
        <button
          key={shape.key}
          type="button"
          aria-pressed={picked === shape.key}
          aria-label={`Forme ${shape.label}`}
          title={shape.label}
          onClick={() => {
            setPicked(shape.key);
            onPick(shape.radius);
          }}
          className="flex w-14 flex-col items-center gap-1 rounded-md p-1 text-2xs hover:bg-muted aria-pressed:bg-primary/15 aria-pressed:font-semibold"
        >
          <span className="block h-10 w-8 bg-primary/60" style={{ borderRadius: shape.radius }} />
          {shape.label}
        </button>
      ))}
    </div>
  );
}
