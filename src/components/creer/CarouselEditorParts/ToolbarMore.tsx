// Chantier D (15/10/2026) : menu « … » de la barre posée sur la slide, en mode
// simple. Chaque action y a son nom écrit (lisible au toucher, sans survol).
// Chantier V (18/10/2026) : « Changer la police » ouvre la liste du panneau simple.
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlignCenter, Copy, CopyPlus, LockKeyhole, MoreHorizontal, Pipette, Type, Underline } from "lucide-react";
import { photoShapeOf } from "@/lib/carousel-editor";
import { isFullBleedBox } from "@/components/creer/CarouselEditorParts/canvas-geometry";
import { PhotoShapePicker } from "@/components/creer/CarouselEditorParts/PanelBits";
import type { SelectionBox } from "@/components/creer/CarouselEditorParts/CanvasToolbar";
import { OPEN_FONT_EVENT } from "@/components/creer/CarouselEditorParts/editor-mode";

export function ToolbarMore({ box, cropId, selected, onAlign, onCopy, onDuplicate, onLock, onPickColor, onShape, onUnderline }: {
  box: SelectionBox;
  cropId: string | null;
  selected: string;
  onAlign: () => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onLock: () => void;
  onPickColor: () => void;
  onShape: (radius: string) => void;
  onUnderline: () => void;
}) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const item = "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Plus d’actions sur l’élément" className="flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 hover:bg-muted">
          <MoreHorizontal size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1" aria-label="Plus d’actions">
        {box.kind === "text" && (
          <>
            <button type="button" className={item} onClick={run(() => window.dispatchEvent(new Event(OPEN_FONT_EVENT)))}><Type size={14} /> Changer la police</button>
            <button type="button" className={item} onClick={run(onUnderline)}><Underline size={14} /> Souligner</button>
            <button type="button" className={item} onClick={run(onAlign)}><AlignCenter size={14} /> Changer l’alignement</button>
          </>
        )}
        {box.kind !== "photo" && (
          <button type="button" className={item} onClick={run(onPickColor)}><Pipette size={14} /> Prendre une couleur à l’écran</button>
        )}
        <button type="button" className={item} onClick={run(onCopy)}><Copy size={14} /> Copier (pour coller ailleurs)</button>
        {box.kind !== "photo" && !box.glass && (
          <button type="button" className={item} onClick={run(onDuplicate)}><CopyPlus size={14} /> Dupliquer</button>
        )}
        <button type="button" className={item} onClick={run(onLock)}><LockKeyhole size={14} /> Verrouiller (il ne bougera plus)</button>
        {box.kind === "photo" && cropId !== selected && !isFullBleedBox(box) && (
          <div className="border-t px-1 pt-2">
            <p className="mb-1 text-2xs text-muted-foreground">Forme du cadre</p>
            <PhotoShapePicker current={photoShapeOf(box.radius)} onPick={onShape} />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
