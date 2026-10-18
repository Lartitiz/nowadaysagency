// Lot E3-6 (14/10/2026) : miniatures des slides (ouvrir, glisser pour changer
// l'ordre) et boutons des slides (monter, descendre, ajouter, dupliquer,
// verrouiller, supprimer), déplacés à l'identique depuis CarouselEditor.tsx.
// Chantier W élargi (18/10/2026) : sur ordinateur, une colonne à gauche de la slide
// (comme Google Slides ou Keynote), boutons en bas de la colonne ; sur téléphone,
// une rangée sous la slide.
// Chantier X (18/10/2026) : en mode simple, monter, descendre et dupliquer sous la
// vignette choisie ; l'aide « glisse pour changer l'ordre » écrite (plus seulement
// au survol) ; « Slide supprimée · Annuler » après une suppression.
import { Fragment, type MutableRefObject } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, LockKeyhole, Plus, Trash2, Unlock } from "lucide-react";
import { INSTAGRAM_DIRECT_MAX_IMAGES, instagramTooManyImagesReason } from "@/features/creer/publish-guards";
import { CAROUSEL_MAX_SLIDES, renumberDocument, type CarouselDocument, type EditorSlide } from "@/lib/carousel-editor";
import { HelpTip } from "@/components/creer/CarouselEditorParts/HelpTip";
import { SlideThumb } from "@/components/creer/CarouselEditorParts/PanelBits";

/** Bande des miniatures et boutons des slides. */
export function SlideStrip({ simple = false, active, add, changeSlide, commit, current, document, dragSlide, dropAt, justDragged, move, reorder, setActive, setDragSlide, setDropAt, setSelected, slide, thumbDrag, thumbIndexAt }: {
  /** Mode simple : flèches et dupliquer sous la vignette choisie, verrouiller dans « Plus d'outils ». */
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
  thumbDrag: MutableRefObject<{ from: number; x: number; y: number; moved: boolean } | null>;
  thumbIndexAt: (x: number, y: number) => number;
}) {
  // Boutons de la colonne (ordinateur) : pleine largeur, libellé sur deux lignes si besoin.
  const colButton = "md:h-auto md:w-full md:justify-start md:whitespace-normal md:px-2 md:py-1 md:text-left md:text-2xs md:leading-tight";
  const last = document.slides.length - 1;
  const full = document.slides.length >= CAROUSEL_MAX_SLIDES;
  const remove = () => {
    const removed = slide, at = document.slides.findIndex((s) => s.id === slide.id);
    commit(renumberDocument({ ...document, slides: document.slides.filter((s) => s.id !== slide.id) }));
    setActive(Math.max(0, active - 1));
    setSelected(null);
    toast("Slide supprimée", {
      action: {
        label: "Annuler",
        onClick: () => {
          const doc = current.current;
          if (doc.slides.some((s) => s.id === removed.id) || doc.slides.length >= CAROUSEL_MAX_SLIDES) return;
          const slides = [...doc.slides];
          slides.splice(Math.min(at, slides.length), 0, removed);
          commit(renumberDocument({ ...doc, slides }));
          setActive(Math.min(at, slides.length - 1));
          setSelected(null);
        },
      },
    });
  };
  // Mode simple : petits boutons sous la vignette choisie (à côté, sur téléphone).
  const orderTools = (
    <div className="flex shrink-0 flex-col justify-center gap-0.5 md:flex-row" data-testid="slide-order-tools">
      {([
        ["Monter la slide", () => move(-1), active === 0, <><ArrowLeft size={13} className="md:hidden" /><ArrowUp size={13} className="hidden md:block" /></>],
        ["Descendre la slide", () => move(1), active === last, <><ArrowRight size={13} className="md:hidden" /><ArrowDown size={13} className="hidden md:block" /></>],
        ["Dupliquer la slide", () => add(true), full, <Copy size={13} />],
      ] as const).map(([label, onClick, disabled, icon]) => (
        <Button key={label} size="icon" variant="outline" className="h-6 w-6" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
          {icon}
        </Button>
      ))}
    </div>
  );
  return (
    <>
    <div className="flex flex-col gap-1.5 md:max-h-[var(--editor-room,calc(100vh-15rem))] md:gap-2">
      <div
        className="flex min-w-0 gap-1.5 overflow-x-auto pb-1 md:min-h-0 md:flex-1 md:flex-col md:items-center md:overflow-x-hidden md:overflow-y-auto md:pb-0"
        aria-label="Slides du carrousel"
      >
        {document.slides.map((s, i) => (
          <Fragment key={s.id}>
          <button
            type="button"
            data-thumb={i}
            style={{ touchAction: "none" }}
            onPointerDown={(e) => {
              thumbDrag.current = { from: i, x: e.clientX, y: e.clientY, moved: false };
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = thumbDrag.current;
              if (!d || (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6)) return;
              d.moved = true;
              setDragSlide(d.from);
              setDropAt(Math.min(thumbIndexAt(e.clientX, e.clientY), current.current.slides.length - 1));
            }}
            onPointerUp={(e) => {
              const d = thumbDrag.current;
              thumbDrag.current = null;
              setDragSlide(null);
              setDropAt(null);
              if (d?.moved) {
                justDragged.current = true;
                const at = thumbIndexAt(e.clientX, e.clientY);
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
            <SlideThumb html={s.html} width={56} />
            <span className="block text-center font-semibold leading-tight">
              {i + 1}
              {s.locked ? " 🔒" : ""}
            </span>
          </button>
          {simple && i === active && orderTools}
          </Fragment>
        ))}
      </div>
      {document.slides.length > 1 && (
        <p className="shrink-0 text-2xs leading-tight text-muted-foreground">Glisse une vignette pour changer l’ordre.</p>
      )}
      {/* Boutons des slides, avec l'avertissement « plus de 10 slides » dessous : en bas
          de la colonne sur ordinateur, sous les miniatures sur téléphone. */}
      <div className="flex shrink-0 flex-col gap-1">
      <div className="flex flex-wrap gap-1.5 md:flex-col md:gap-1">
        {!simple && (<>
        <Button
          size="sm"
          variant="outline"
          onClick={() => move(-1)}
          disabled={active === 0}
          aria-label="Monter la slide"
          className={colButton}
        >
          <ArrowLeft size={14} className="md:hidden" /><ArrowUp size={14} className="hidden md:block" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => move(1)}
          disabled={active === last}
          aria-label="Descendre la slide"
          className={colButton}
        >
          <ArrowRight size={14} className="md:hidden" /><ArrowDown size={14} className="hidden md:block" />
        </Button>
        </>)}
        <Button
          size="sm"
          variant="outline"
          disabled={full}
          onClick={() => add()}
          className={colButton}
        >
          <Plus size={14} className="mr-1 shrink-0" />
          Ajouter une slide
        </Button>
        {!simple && (<>
        <Button
          size="sm"
          variant="outline"
          disabled={full}
          onClick={() => add(true)}
          className={colButton}
        >
          <Copy size={14} className="mr-1 shrink-0" />
          Dupliquer
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => changeSlide({ ...slide, locked: !slide.locked })}
          className={colButton}
        >
          {slide.locked ? <Unlock size={14} className="shrink-0" /> : <LockKeyhole size={14} className="shrink-0" />}
          <span className="ml-1">
            {slide.locked ? "Déverrouiller" : "Verrouiller"}
          </span>
        </Button>
        </>)}
        <Button
          size="sm"
          variant="outline"
          disabled={document.slides.length <= 2 || slide.locked}
          className={colButton}
          onClick={remove}
        >
          <Trash2 size={14} className="mr-1 shrink-0" />
          Supprimer la slide
        </Button>
      </div>
      {document.slides.length > INSTAGRAM_DIRECT_MAX_IMAGES && (
        <p className="text-xs text-muted-foreground md:text-2xs md:leading-tight">
          {document.slides.length} slides : au-delà de {INSTAGRAM_DIRECT_MAX_IMAGES}, publie-le depuis l’appli Instagram.{" "}
          <HelpTip label="nombre de slides">{instagramTooManyImagesReason(document.slides.length)}</HelpTip>
        </p>
      )}
      </div>
    </div>
    </>
  );
}
