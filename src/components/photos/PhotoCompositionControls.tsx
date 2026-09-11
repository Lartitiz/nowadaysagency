import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PHOTO_FORMATS, cleanRecipe, type PhotoRecipe, type PhotoFormat } from "@/lib/photo-composition";

export function PhotoCompositionControls({ recipe, onChange, disabled = false }: {
  recipe: PhotoRecipe; onChange: (recipe: PhotoRecipe) => void; disabled?: boolean;
}) {
  const id = useId();
  const change = (value: Partial<PhotoRecipe>) => onChange(cleanRecipe({ ...recipe, ...value }));
  const direction = (value: Partial<PhotoRecipe["direction"]>) => change({ direction: { ...recipe.direction, ...value } });
  const range = (label: string, key: string, value: number, min: number, max: number, step: number, update: (n: number) => void) => <div className="space-y-1">
    <label htmlFor={`${id}-${key}`} className="flex justify-between text-sm"><span>{label}</span><span>{Math.round(value * 100)} %</span></label>
    <input id={`${id}-${key}`} className="w-full accent-primary min-h-8" type="range" min={min} max={max} step={step} value={value} onChange={e => update(Number(e.target.value))} />
  </div>;
  return <fieldset disabled={disabled} className="space-y-4 disabled:opacity-60">
    <div className="space-y-1"><label htmlFor={`${id}-format`} className="text-sm">Format</label>
      <select id={`${id}-format`} className="w-full min-h-10 rounded-md border bg-background px-2 text-sm" value={recipe.format} onChange={e => {
        const format = e.target.value as PhotoFormat; change({ format, width: PHOTO_FORMATS[format].width, height: PHOTO_FORMATS[format].height });
      }}>{Object.entries(PHOTO_FORMATS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select>
    </div>
    {recipe.format === "banner" && <div className="grid grid-cols-2 gap-2">
      <label className="text-sm">Largeur (px)<Input type="number" min={320} max={2400} value={recipe.width} onChange={e => change({ width: Number(e.target.value) })} /></label>
      <label className="text-sm">Hauteur (px)<Input type="number" min={320} max={2400} value={recipe.height} onChange={e => change({ height: Number(e.target.value) })} /></label>
    </div>}
    <div className="flex items-center gap-3"><label htmlFor={`${id}-background`} className="text-sm">Fond et marges</label>
      <input id={`${id}-background`} type="color" className="h-9 w-12 rounded border" value={recipe.direction.background} onChange={e => direction({ background: e.target.value })} />
    </div>
    {range("Marge autour de la photo", "margin", recipe.direction.padding, 0, 0.2, 0.01, padding => direction({ padding }))}
    <div className="grid grid-cols-2 gap-2">
      <label className="text-sm">Placement horizontal<select className="mt-1 w-full min-h-10 rounded border bg-background px-2 text-sm" value={recipe.direction.horizontal} onChange={e => direction({ horizontal: Number(e.target.value) })}>
        <option value={0}>À gauche</option><option value={0.5}>Au centre</option><option value={1}>À droite</option></select></label>
      <label className="text-sm">Placement vertical<select className="mt-1 w-full min-h-10 rounded border bg-background px-2 text-sm" value={recipe.direction.vertical} onChange={e => direction({ vertical: Number(e.target.value) })}>
        <option value={0}>En haut</option><option value={0.5}>Au centre</option><option value={1}>En bas</option></select></label>
    </div>
    <div className="space-y-1"><label htmlFor={`${id}-text-position`} className="text-sm">Espace pour le texte</label>
      <select id={`${id}-text-position`} className="w-full min-h-10 rounded border bg-background px-2 text-sm" value={recipe.direction.textPosition} onChange={e => direction({ textPosition: e.target.value as PhotoRecipe["direction"]["textPosition"] })}>
        <option value="none">Sans espace réservé</option><option value="top">Au-dessus de la photo</option><option value="bottom">Sous la photo</option>
      </select>
    </div>
    {recipe.direction.textPosition !== "none" && <div className="space-y-2">
      <label htmlFor={`${id}-text`} className="text-sm">Texte du visuel, modifiable</label>
      <Textarea id={`${id}-text`} value={recipe.text} maxLength={240} placeholder="Tu peux aussi laisser cet espace vide." onChange={e => change({ text: e.target.value })} />
      <label className="flex items-center gap-3 text-sm">Couleur du texte<input type="color" className="h-9 w-12 rounded border" value={recipe.direction.textColor} onChange={e => direction({ textColor: e.target.value })} /></label>
    </div>}
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium min-h-7">Ajuster la lumière</summary>
      <p className="my-2 text-xs text-muted-foreground">Ces réglages modifient aussi les couleurs du produit. Compare avec ta source.</p>
      {range("Exposition", "exposure", recipe.exposure, -1, 1, 0.05, exposure => change({ exposure }))}
      {range("Contraste", "contrast", recipe.contrast, 0.8, 1.2, 0.02, contrast => change({ contrast }))}
      <Button type="button" size="sm" variant="ghost" className="text-foreground" onClick={() => change({ exposure: 0, contrast: 1 })}>Rétablir la lumière d’origine</Button>
    </details>
    {recipe.crop && <details open className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Détail réellement visible</summary>
      <p className="my-2 text-xs text-muted-foreground">Choisis une zone de la source. Aucun détail absent ne sera ajouté.</p>
      {range("Départ horizontal", "crop-x", recipe.crop.x, 0, 0.9, 0.01, x => change({ crop: { ...recipe.crop!, x } }))}
      {range("Départ vertical", "crop-y", recipe.crop.y, 0, 0.9, 0.01, y => change({ crop: { ...recipe.crop!, y } }))}
      {range("Largeur du détail", "crop-w", recipe.crop.width, 0.1, 1 - recipe.crop.x, 0.01, width => change({ crop: { ...recipe.crop!, width } }))}
      {range("Hauteur du détail", "crop-h", recipe.crop.height, 0.1, 1 - recipe.crop.y, 0.01, height => change({ crop: { ...recipe.crop!, height } }))}
    </details>}
  </fieldset>;
}
