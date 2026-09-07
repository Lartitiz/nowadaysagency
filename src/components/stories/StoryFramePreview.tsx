import { useLayoutEffect, useRef, useState } from "react";

/**
 * Aperçu d'une frame de story : le HTML 1080×1920 du renderer (story-visual),
 * mis à l'échelle dans une iframe isolée. Partagé entre l'atelier (StoryResult)
 * et la section « Stories » de la charte.
 *
 * Deux modes : largeur fixe en px (atelier), ou `fluid` = prend toute la
 * largeur disponible et se met à l'échelle avec elle (cartes de la charte :
 * une largeur fixe débordait des cartes étroites, retour Laetitia 07/09).
 * L'échelle fluide est mesurée par ResizeObserver : un `scale(calc(100cqw /
 * 1080))` n'est pas valide (scale attend un nombre, pas une longueur).
 */
export default function StoryFramePreview({
  html,
  title,
  width = 150,
  fluid = false,
  className = "",
}: {
  html: string;
  title: string;
  /** Largeur affichée en px (ignorée si fluid) ; la hauteur suit le 9:16. */
  width?: number;
  /** true = occupe la largeur du parent et se met à l'échelle avec elle. */
  fluid?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);

  useLayoutEffect(() => {
    if (!fluid || !ref.current) return;
    const el = ref.current;
    const update = () => setMeasured(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fluid]);

  const w = fluid ? measured : width;

  return (
    <div
      ref={ref}
      // self-start : sans lui, un flex parent étire le cadre à la hauteur de la
      // colonne voisine (align-items: stretch) et l'aperçu dépasse son 9:16.
      className={`relative overflow-hidden rounded-lg border border-border shrink-0 self-start ${fluid ? "w-full min-w-0 flex-1" : ""} ${className}`}
      style={{ width: fluid ? undefined : width, aspectRatio: "1080 / 1920" }}
    >
      {w > 0 && (
        <iframe
          srcDoc={html}
          title={title}
          sandbox="allow-same-origin"
          loading="lazy"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "1080px",
            height: "1920px",
            transform: `scale(${w / 1080})`,
            transformOrigin: "top left",
            border: "none",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
