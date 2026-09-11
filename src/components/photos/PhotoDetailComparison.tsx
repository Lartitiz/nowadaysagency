import { useState } from "react";

/** Local inspection only: no generation, upload, or modification of either image. */
export default function PhotoDetailComparison({ original, proposal }: { original: string; proposal: string }) {
  const [zoom, setZoom] = useState(100);
  return <details className="rounded-lg border p-3 space-y-3">
    <summary className="cursor-pointer text-sm font-medium">Comparer les détails avec l’originale</summary>
    <p className="text-xs text-muted-foreground">Vérifie la forme, les couleurs, les motifs et les petits détails. Une mise en scène générée peut modifier le produit ; garde-la seulement si elle lui est fidèle.</p>
    <label className="flex items-center gap-3 text-sm">Zoom : {zoom} %
      <input aria-label="Zoom de comparaison" type="range" min="100" max="300" step="25" value={zoom} onChange={e => setZoom(Number(e.target.value))} className="min-w-0 flex-1" />
    </label>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {[{ src: original, label: "Originale : détails" }, { src: proposal, label: "Proposition : détails" }].map(image => <div key={image.label}>
        <p className="text-xs font-medium mb-1">{image.label}</p>
        <div className="h-72 overflow-auto bg-muted/30 rounded border">
          <img src={image.src} alt={image.label} style={{ width: `${zoom}%`, maxWidth: "none" }} />
        </div>
      </div>)}
    </div>
  </details>;
}
