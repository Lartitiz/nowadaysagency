// Lot E3-2 (14/10/2026) : barre d'outils flottante de l'aperçu (au-dessus de
// l'élément choisi), déplacée à l'identique depuis SlideCanvas dans
// CarouselEditor.tsx. Elle lit les actions du dernier rendu dans `latest`
// (jamais une copie) et agit sur l'aperçu par `tools`.
import { outsideRoom } from "@/components/creer/CarouselEditorParts/EditorLayout";
import { useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Copy, ImagePlus, LockKeyhole, Pipette, Trash2, Unlock } from "lucide-react";
import { photoShapeOf, placeToolbar, type ElementRect, type EditorSlide } from "@/lib/carousel-editor";
import type { QualityIssue } from "@/lib/carousel-quality";
import { isFullBleedBox, type CanvasBox } from "@/components/creer/CarouselEditorParts/canvas-geometry";
import { PhotoShapePicker } from "@/components/creer/CarouselEditorParts/PanelBits";
import { ToolbarMore } from "@/components/creer/CarouselEditorParts/ToolbarMore";

/** Élément choisi tel que mesuré dans l'aperçu (boîte et style utiles à la barre). */
export type SelectionBox = CanvasBox & {
  kind: "photo" | "veil" | "text" | "shape";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  editorial?: boolean;
  glass?: boolean;
  emptyFrame?: boolean;
  radius?: string;
  locked?: boolean;
  /** L'élément verrouillé (lui-même ou son groupe), à déverrouiller. */
  lockedId?: string;
  fontSize?: number;
  align?: string;
};

export default function CanvasToolbar({
  box,
  selected,
  slide,
  dropping,
  scale,
  width,
  issues,
  tools,
  latest,
  fitRef,
  cropId,
  setCropId,
  onReplacePhoto,
  colors,
  editingId,
  simple = false,
  outside = false,
}: {
  box: SelectionBox | null;
  selected: string | null;
  slide: EditorSlide;
  dropping: false | ElementRect | null;
  scale: number;
  width: number;
  issues: (QualityIssue & { rect: ElementRect })[];
  tools: MutableRefObject<{
    format: (styles: Record<string, string>) => boolean;
    startEditing: (id: string) => void;
    finish: () => void;
  }>;
  latest: MutableRefObject<{
    onSelect: (id: string | null) => void;
    onMove: (id: string, styles: Record<string, string>) => void;
    onRemove: (id: string) => void;
    onFill: (id: string, hex: string) => void;
    onDuplicate: (id: string) => void;
    onCopy: () => void;
    onLock?: (id: string, locked: boolean) => void;
  }>;
  fitRef: MutableRefObject<(ids: string | string[]) => void>;
  cropId: string | null;
  setCropId: (id: string | null) => void;
  onReplacePhoto?: () => void;
  colors: string[];
  editingId: string | null;
  /** Mode simple : les actions avancées passent dans le menu « … », chacune avec son nom. */
  simple?: boolean;
  /** La barre peut sortir de la slide (au-dessus ou en dessous) plutôt que de cacher un texte qui la remplit. */
  outside?: boolean;
}) {
  // Barre d'outils flottante au-dessus de l'élément choisi (comme Canva).
  const apply = (word: Record<string, string>, whole: Record<string, string>) => {
    if (!selected) return;
    if (tools.current.format(word)) return;
    tools.current.finish();
    latest.current.onMove(selected, whole);
  };
  const keep = (e: React.MouseEvent) => e.preventDefault(); // garde la sélection dans la slide
  const pickerInput = useRef<HTMLInputElement>(null);
  const applyPicked = (value: string) => {
    if (!selected || !box) return;
    const m = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    const hex = m ? `#${m.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, "0")).join("")}` : value;
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
    if (box.kind === "text") apply({ color: hex }, { color: hex });
    else latest.current.onFill?.(selected, hex);
  };
  const pickColor = async () => {
    const picker = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!picker) {
      // Safari / Firefox : le sélecteur de couleur du système a sa propre pipette.
      pickerInput.current?.click();
      return;
    }
    try {
      const { sRGBHex } = await new picker().open();
      applyPicked(sRGBHex);
    } catch {
      // Pipette annulée (Échap).
    }
  };
  const selectedIssue = issues.find((i) => i.elementId === selected && (i.severity === "error" || i.fix || i.kind === "overflow"));
  // La barre se place là où elle ne cache pas l'élément : au-dessus s'il y a
  // la place, sinon en dessous, sinon du côté le plus libre. Sa vraie taille
  // est mesurée (elle passe sur deux lignes quand la slide est étroite).
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarSize, setToolbarSize] = useState({ w: 300, h: 40 });
  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w !== toolbarSize.w || h !== toolbarSize.h) setToolbarSize({ w, h });
  });
  const toolbarPosition = () =>
    box
      ? placeToolbar(
          { left: box.left * scale, top: box.top * scale, width: box.width * scale, height: box.height * scale },
          { width: toolbarSize.w, height: toolbarSize.h },
          { width, height: width * 1.25 },
          8,
          4,
          outside ? outsideRoom(toolbarRef.current?.parentElement) : undefined,
        )
      : { left: 0, top: 0 };
  const toolButton = "flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-xs font-semibold hover:bg-muted aria-pressed:bg-primary/15";
  const toolbar =
    box && selected && !slide.locked && box.kind !== "veil" && dropping === false ? (
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Barre d’outils de l’élément"
        onMouseDown={keep}
        className="absolute z-10 flex w-max max-w-[calc(100%-8px)] flex-wrap items-center gap-0.5 rounded-lg border bg-background p-1 shadow-lg"
        style={toolbarPosition()}
      >
        {selectedIssue && !box.locked && (
          <button
            type="button"
            className="flex h-8 items-center gap-1 rounded-md bg-amber-100 px-2 text-2xs font-semibold text-amber-900 hover:bg-amber-200"
            title={selectedIssue.message}
            onClick={() => {
              tools.current.finish();
              if (selectedIssue.fix) latest.current.onMove(selected, selectedIssue.fix);
              else if (selectedIssue.kind === "overflow" && box.kind === "text") fitRef.current(selected);
              else latest.current.onSelect(selected);
            }}
          >
            ! {selectedIssue.fix || (selectedIssue.kind === "overflow" && box.kind === "text") ? "Corriger" : "À vérifier"}
          </button>
        )}
        {box.kind === "photo" && !box.locked && cropId !== selected && onReplacePhoto && (
          <button type="button" className={toolButton} onClick={onReplacePhoto} title={box.emptyFrame ? "Mettre une photo dans ce cadre (ou glisse une photo dessus)" : "Mettre une autre photo dans ce cadre (ou glisse une photo dessus)"}>
            <ImagePlus size={14} className="mr-1" /> {box.emptyFrame ? "Ajouter une photo" : "Remplacer"}
          </button>
        )}
        {!simple && box.kind === "photo" && !box.locked && cropId !== selected && !isFullBleedBox(box) && (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className={toolButton} title="Forme du cadre : carré, arrondi, rond, arche…">
                Forme
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2">
              <PhotoShapePicker
                current={photoShapeOf(box.radius)}
                onPick={(radius) => latest.current.onMove(selected, { "border-radius": radius, overflow: "hidden" })}
              />
            </PopoverContent>
          </Popover>
        )}
        {box.kind === "photo" && !box.locked && !box.emptyFrame && cropId !== selected && (
          <button type="button" className={toolButton} onClick={() => setCropId(selected)} title="Recadrer (double-clic sur la photo)">
            Recadrer
          </button>
        )}
        {box.locked && (
          <button type="button" className={toolButton} aria-label="Déverrouiller l’élément" onClick={() => latest.current.onLock?.(box.lockedId || selected, false)}>
            <Unlock size={14} className="mr-1" /> Déverrouiller
          </button>
        )}
        {!box.locked && box.kind === "text" && (
          <>
            <button type="button" className={toolButton} aria-pressed={!!box.bold} aria-label="Gras" title="Gras (sur les mots choisis en écrivant)"
              onClick={() => apply({ "font-weight": "toggle" }, { "font-weight": box.bold ? "400" : "700" })}>B</button>
            <button type="button" className={`${toolButton} italic`} aria-pressed={!!box.italic} aria-label="Italique"
              onClick={() => apply({ "font-style": "toggle" }, { "font-style": box.italic ? "normal" : "italic" })}>I</button>
            {!simple && <button type="button" className={`${toolButton} underline`} aria-pressed={!!box.underline} aria-label="Souligné"
              onClick={() => apply({ "text-decoration": "toggle" }, { "text-decoration": box.underline ? "none" : "underline" })}>U</button>}
            <button type="button" className={toolButton} aria-label="Réduire le texte"
              onClick={() => { tools.current.finish(); latest.current.onMove(selected, { "font-size": `${Math.max(18, Math.round((box.fontSize || 40) - 4))}px` }); }}>A−</button>
            <button type="button" className={toolButton} aria-label="Agrandir le texte"
              onClick={() => { tools.current.finish(); latest.current.onMove(selected, { "font-size": `${Math.min(200, Math.round((box.fontSize || 40) + 4))}px` }); }}>A+</button>
            {!simple && <button type="button" className={toolButton} aria-label="Changer l’alignement"
              title="Alignement"
              onClick={() => { tools.current.finish(); latest.current.onMove(selected, { "text-align": box.align === "left" || box.align === "start" ? "center" : box.align === "center" ? "right" : "left" }); }}>
              {box.align === "center" ? "≡" : box.align === "right" ? "⫶" : "☰"}
            </button>}
          </>
        )}
        {!box.locked && (
          <>
        {box.kind !== "photo" &&
          (simple ? colors.slice(0, 4) : colors).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`${box.kind === "text" ? "Couleur du texte" : "Couleur du fond"} ${c}`}
              title={box.kind === "text" ? (editingId ? "Couleur des mots choisis (ou du texte)" : "Couleur du texte") : "Couleur du fond"}
              className="m-0.5 h-5 w-5 rounded-full border border-black/20"
              style={{ background: c }}
              onClick={() =>
                box.kind === "text"
                  ? apply({ color: c }, { color: c })
                  : latest.current.onFill?.(selected, c)
              }
            />
          ))}
        {box.kind !== "photo" && (
          <>
            {!simple && (
              <button type="button" className={toolButton} aria-label="Pipette : prendre une couleur à l’écran" title="Pipette : prendre une couleur sur la photo ou ailleurs à l’écran" onClick={pickColor}>
                <Pipette size={14} />
              </button>
            )}
            <input
              ref={pickerInput}
              type="color"
              aria-hidden="true"
              tabIndex={-1}
              className="sr-only"
              onChange={(e) => applyPicked(e.target.value)}
            />
          </>
        )}
        {box.kind === "text" && !editingId && (
          <button type="button" className={toolButton} onClick={() => tools.current.startEditing(selected)}>Écrire</button>
        )}
        {box.kind === "text" && editingId && box.editorial && (
          <span className="px-1 text-2xs text-muted-foreground">Mots : utilise la phrase mise en valeur</span>
        )}
        {!simple && <button type="button" className={toolButton} aria-label="Copier l’élément" title="Copier (⌘/Ctrl + C), puis coller ici ou sur une autre slide"
          onClick={() => { tools.current.finish(); latest.current.onCopy(); }}>Copier</button>}
        {!simple && box.kind !== "photo" && !box.glass && (
          <button type="button" className={toolButton} aria-label="Dupliquer l’élément" title="Dupliquer"
            onClick={() => { tools.current.finish(); latest.current.onDuplicate?.(selected); }}><Copy size={14} /></button>
        )}
        <button type="button" className={toolButton} aria-label="Retirer l’élément" title="Retirer"
          onClick={() => { tools.current.finish(); latest.current.onRemove(selected); }}><Trash2 size={14} />{simple && <span className="ml-1">Retirer</span>}</button>
            {!simple && <button type="button" className={toolButton} aria-label="Verrouiller l’élément" title="Verrouiller (⌘⇧L) : il ne bougera plus par erreur"
              onClick={() => { tools.current.finish(); latest.current.onLock?.(selected, true); }}><LockKeyhole size={14} /></button>}
            {simple && (
              <ToolbarMore
                box={box}
                cropId={cropId}
                selected={selected}
                onUnderline={() => apply({ "text-decoration": "toggle" }, { "text-decoration": box.underline ? "none" : "underline" })}
                onAlign={() => { tools.current.finish(); latest.current.onMove(selected, { "text-align": box.align === "left" || box.align === "start" ? "center" : box.align === "center" ? "right" : "left" }); }}
                onPickColor={pickColor}
                onCopy={() => { tools.current.finish(); latest.current.onCopy(); }}
                onDuplicate={() => { tools.current.finish(); latest.current.onDuplicate?.(selected); }}
                onLock={() => { tools.current.finish(); latest.current.onLock?.(selected, true); }}
                onShape={(radius) => latest.current.onMove(selected, { "border-radius": radius, overflow: "hidden" })}
              />
            )}
          </>
        )}
      </div>
    ) : null;
  return toolbar;
}
