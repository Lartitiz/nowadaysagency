import { useEffect, useRef } from "react";

interface Props {
  result: { raw: any };
  overlayHtml: string | null;
}

export default function PinterestPhotoBriefResult({ result, overlayHtml }: Props) {
  const r = result?.raw || {};
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (overlayHtml && containerRef.current) {
      containerRef.current.innerHTML = overlayHtml;
    }
  }, [overlayHtml]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Title & Description */}
      {r.title && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">📌 {r.title}</p>
          {r.description && (
            <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
          )}
        </div>
      )}

      {/* Overlay preview */}
      {overlayHtml && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="relative mx-auto" style={{ width: "100%", maxWidth: 400, aspectRatio: "2/3" }}>
            <div
              ref={containerRef}
              className="w-full h-full"
              style={{ transform: "scale(1)", transformOrigin: "top left" }}
            />
          </div>
        </div>
      )}

      {/* Photo Brief */}
      {r.photo_brief && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">📷 Brief photo</p>
          <div className="space-y-1.5">
            {r.photo_brief.what && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Sujet :</span> {r.photo_brief.what}
              </p>
            )}
            {r.photo_brief.framing && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Cadrage :</span> {r.photo_brief.framing}
              </p>
            )}
            {r.photo_brief.lighting && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Lumière :</span> {r.photo_brief.lighting}
              </p>
            )}
            {r.photo_brief.props && r.photo_brief.props.length > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Accessoires :</span> {r.photo_brief.props.join(", ")}
              </p>
            )}
            {r.photo_brief.colors && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Couleurs :</span> {r.photo_brief.colors}
              </p>
            )}
            {r.photo_brief.mood && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Ambiance :</span> {r.photo_brief.mood}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
