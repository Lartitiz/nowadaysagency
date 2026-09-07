/**
 * Aperçu d'une frame de story : le HTML 1080×1920 du renderer (story-visual),
 * mis à l'échelle dans une iframe isolée. Partagé entre l'atelier (StoryResult)
 * et la section « Stories » de la charte.
 */
export default function StoryFramePreview({
  html,
  title,
  width = 150,
  className = "",
}: {
  html: string;
  title: string;
  /** Largeur affichée en px ; la hauteur suit le 9:16. */
  width?: number;
  className?: string;
}) {
  return (
    <div
      // self-start : sans lui, un flex parent étire le cadre à la hauteur de la
      // colonne voisine (align-items: stretch) et l'aperçu dépasse son 9:16.
      className={`relative overflow-hidden rounded-lg border border-border shrink-0 self-start ${className}`}
      style={{ width, aspectRatio: "1080 / 1920" }}
    >
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
          transform: `scale(${width / 1080})`,
          transformOrigin: "top left",
          border: "none",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
