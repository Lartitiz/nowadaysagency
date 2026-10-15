// Lot E3-6 (14/10/2026) : miniatures des slides (ouvrir, glisser pour changer
// l'ordre) et boutons des slides (monter, descendre, ajouter, dupliquer,
// verrouiller, supprimer), déplacés à l'identique depuis CarouselEditor.tsx.
import type { MutableRefObject } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Copy, LockKeyhole, Plus, Trash2, Unlock } from "lucide-react";
import { INSTAGRAM_DIRECT_MAX_IMAGES, instagramTooManyImagesReason } from "@/features/creer/publish-guards";
import { CAROUSEL_MAX_SLIDES, renumberDocument, type CarouselDocument, type EditorSlide } from "@/lib/carousel-editor";
import { HelpTip } from "@/components/creer/CarouselEditorParts/HelpTip";
import { SlideThumb } from "@/components/creer/CarouselEditorParts/PanelBits";

/** Bande des miniatures et boutons des slides. */
export function SlideStrip({ simple = false, active, add, changeSlide, commit, current, document, dragSlide, dropAt, justDragged, move, reorder, setActive, setDragSlide, setDropAt, setSelected, slide, thumbDrag, thumbIndexAt }: {
  /** Mode simple : flèches, dupliquer et verrouiller passent dans « Plus d'outils ». */
  simple?: boolean;
  active: number;
  add: (duplicate?: boolean) => void;
  changeSlide: (next: EditorSlide, key?: string) => void;
  commit: (next: CarouselDocument, key?: string) => void;
  current: MutableRefObject<CarouselDocument>;
  document: CarouselDocument;
  dragSlide: number | null;
  dropAt: number | null;
  justDragged: MutableRefObject<boolean>;
  move: (delta: number) => void;
  reorder: (from: number, to: number) => void;
  setActive: (index: number) => void;
  setDragSlide: (index: number | null) => void;
  setDropAt: (index: number | null) => void;
  setSelected: (id: string | null) => void;
  slide: EditorSlide;
  thumbDrag: MutableRefObject<{ from: number; x: number; moved: boolean } | null>;
  thumbIndexAt: (x: number) => number;
}) {
  return (
    <>
      <div
        className="flex gap-1.5 overflow-x-auto pb-1"
        aria-label="Slides du carrousel"
      >
        {document.slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            data-thumb={i}
            style={{ touchAction: "none" }}
            onPointerDown={(e) => {
              thumbDrag.current = { from: i, x: e.clientX, moved: false };
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = thumbDrag.current;
              if (!d || (!d.moved && Math.abs(e.clientX - d.x) < 6)) return;
              d.moved = true;
              setDragSlide(d.from);
              setDropAt(Math.min(thumbIndexAt(e.clientX), current.current.slides.length - 1));
            }}
            onPointerUp={(e) => {
              const d = thumbDrag.current;
              thumbDrag.current = null;
              setDragSlide(null);
              setDropAt(null);
              if (d?.moved) {
                justDragged.current = true;
                const at = thumbIndexAt(e.clientX);
                reorder(d.from, at > d.from ? at - 1 : at);
              }
            }}
            onPointerCancel={() => {
              thumbDrag.current = null;
              setDragSlide(null);
              setDropAt(null);
            }}
            onClick={() => {
              if (justDragged.current) {
                justDragged.current = false;
                return;
              }
              setActive(i);
              setSelected(null);
            }}
            aria-label={`Sélectionner la slide ${i + 1}`}
            aria-pressed={i === active}
            title="Clique pour ouvrir, glisse pour changer l’ordre"
            className={`relative shrink-0 cursor-grab rounded-lg border p-0.5 text-2xs ${i === active ? "border-primary ring-2 ring-primary/40" : "bg-background"} ${dragSlide === i ? "opacity-50" : ""} ${dropAt === i && dragSlide !== i ? "outline outline-2 outline-offset-2 outline-primary" : ""}`}
          >
            <SlideThumb html={s.html} width={48} />
            <span className="block text-center font-semibold leading-tight">
              {i + 1}
              {s.locked ? " 🔒" : ""}
            </span>
          </button>
        ))}
      </div>
      {document.slides.length > INSTAGRAM_DIRECT_MAX_IMAGES && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {document.slides.length} slides : au-delà de {INSTAGRAM_DIRECT_MAX_IMAGES}, publie-le depuis l’appli Instagram.
          <HelpTip label="nombre de slides">{instagramTooManyImagesReason(document.slides.length)}</HelpTip>
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {!simple && (<>
        <Button
          size="sm"
          variant="outline"
          onClick={() => move(-1)}
          disabled={active === 0}
          aria-label="Monter la slide"
        >
          <ArrowLeft size={14} />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => move(1)}
          disabled={active === document.slides.length - 1}
          aria-label="Descendre la slide"
        >
          <ArrowRight size={14} />
        </Button>
        </>)}
        <Button
          size="sm"
          variant="outline"
          disabled={document.slides.length >= CAROUSEL_MAX_SLIDES}
          onClick={() => add()}
        >
          <Plus size={14} className="mr-1" />
          Ajouter une slide
        </Button>
        {!simple && (<>
        <Button
          size="sm"
          variant="outline"
          disabled={document.slides.length >= CAROUSEL_MAX_SLIDES}
          onClick={() => add(true)}
        >
          <Copy size={14} className="mr-1" />
          Dupliquer
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => changeSlide({ ...slide, locked: !slide.locked })}
        >
          {slide.locked ? <Unlock size={14} /> : <LockKeyhole size={14} />}
          <span className="ml-1">
            {slide.locked ? "Déverrouiller" : "Verrouiller"}
          </span>
        </Button>
        </>)}
        <Button
          size="sm"
          variant="outline"
          disabled={document.slides.length <= 2 || slide.locked}
          onClick={() => {
            commit(
              renumberDocument({
                ...document,
                slides: document.slides.filter((s) => s.id !== slide.id),
              }),
            );
            setActive(Math.max(0, active - 1));
            setSelected(null);
          }}
        >
          <Trash2 size={14} className="mr-1" />
          Supprimer la slide
        </Button>
      </div>
    </>
  );
}
