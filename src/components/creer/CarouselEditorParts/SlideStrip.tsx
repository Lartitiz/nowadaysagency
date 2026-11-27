// Lot E3-6 (14/10/2026) : miniatures des slides (ouvrir, glisser pour changer
// l'ordre) et boutons des slides (monter, descendre, ajouter, dupliquer,
// verrouiller, supprimer), déplacés à l'identique depuis CarouselEditor.tsx.
// Chantier W élargi (18/10/2026) : sur ordinateur, une colonne à gauche de la slide
// (comme Google Slides ou Keynote), boutons en bas de la colonne ; sur téléphone,
// une rangée sous la slide.
// Chantier X (18/10/2026) : en mode simple, monter, descendre et dupliquer sous la
// vignette choisie ; l'aide « glisse pour changer l'ordre » écrite (plus seulement
// au survol) ; « Slide supprimée · Annuler » après une suppression.
// Éditeur facile (20/11/2026, maquette validée par Laetitia après le retour d'une
// cliente) : sur ordinateur, toutes les vignettes en une rangée sous la slide (la
// colonne n'en montrait que 4 sur 14) et les boutons des slides dans la ligne du haut
// (`SlideTools`) ; sur téléphone, une slide à la fois : des points sous la slide et
// « Toutes » pour ouvrir les vignettes.
import { useEffect, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, ArrowRight, ChevronDown, Copy, LayoutGrid, LockKeyhole, Plus, Trash2, Unlock } from "lucide-react";
import { INSTAGRAM_DIRECT_MAX_IMAGES, instagramTooManyImagesReason } from "@/features/creer/publish-guards";
import { CAROUSEL_MAX_SLIDES, renumberDocument, type CarouselDocument, type EditorSlide } from "@/lib/carousel-editor";
import { HelpTip } from "@/components/creer/CarouselEditorParts/HelpTip";
import { SlideThumb } from "@/components/creer/CarouselEditorParts/PanelBits";
import { thumbClick, thumbDragHandlers } from "@/components/creer/thumb-reorder";

type StripProps = {
  channel?: "linkedin" | "instagram";
  /** Mode simple : verrouiller reste dans « Plus d'outils ». */
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
};

/** Boutons de la slide ouverte : ajouter, dupliquer, supprimer, déplacer (ligne du haut sur ordinateur, sous les vignettes sur téléphone). */
export function SlideTools({ simple = false, compact = false, menu = false, active, add, changeSlide, commit, current, document, move, setActive, setSelected, slide, className = "" }: StripProps & { className?: string; /** Icônes seules (ligne du haut en mode « Plus d'outils », 26/11/2026) : le nom reste au survol et pour les lecteurs d'écran. */ compact?: boolean; /** Ligne du haut sur ordinateur : flèches + menu « Cette slide ». */ menu?: boolean }) {
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
  const tool = "h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground";
  const name = compact ? "sr-only" : "max-lg:sr-only";
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => () => { setOpen(false); action(); };
  const arrows = (
    <>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" aria-label="Monter la slide" title="Déplacer la slide avant" disabled={active === 0} onClick={() => move(-1)}>
        <ArrowLeft size={14} />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" aria-label="Descendre la slide" title="Déplacer la slide après" disabled={active === last} onClick={() => move(1)}>
        <ArrowRight size={14} />
      </Button>
    </>
  );
  // Ligne du haut (ordinateur, 26/11/2026) : les flèches, puis un seul bouton « Cette slide »
  // qui range dupliquer, verrouiller, supprimer et ajouter, chacun avec son nom écrit.
  // « Ajouter » tout court y disait la même chose que l'onglet « Ajouter » du panneau.
  if (menu) {
    const item = "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted disabled:opacity-40";
    return (
      <div className={`flex shrink-0 items-center gap-0.5 ${className}`} role="group" aria-label="Slide ouverte" data-testid="slide-order-tools">
        {arrows}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className={tool} data-testid="slide-menu">
              {slide.locked && <LockKeyhole size={13} className="shrink-0" aria-label="verrouillée" />} Cette slide <ChevronDown size={13} className="shrink-0" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-1" aria-label="Cette slide">
            <button type="button" className={item} disabled={full} onClick={run(() => add(true))} aria-label="Dupliquer la slide"><Copy size={14} /> Dupliquer</button>
            <button type="button" className={item} disabled={full} onClick={run(() => add())} aria-label="Ajouter une slide"><Plus size={14} /> Ajouter une slide après</button>
            <button type="button" className={item} onClick={run(() => changeSlide({ ...slide, locked: !slide.locked }))}>
              {slide.locked ? <Unlock size={14} /> : <LockKeyhole size={14} />} {slide.locked ? "Déverrouiller" : "Verrouiller"}
            </button>
            <button type="button" className={`${item} text-destructive`} disabled={document.slides.length <= 2 || slide.locked} onClick={run(remove)} aria-label="Supprimer la slide"><Trash2 size={14} /> Supprimer</button>
          </PopoverContent>
        </Popover>
      </div>
    );
  }
  return (
    <div className={`flex shrink-0 items-center gap-0.5 ${className}`} role="group" aria-label="Slide ouverte" data-testid="slide-order-tools">
      <Button size="sm" variant="ghost" className={tool} disabled={full} onClick={() => add()} aria-label="Ajouter une slide" title="Ajouter une slide">
        <Plus size={14} className="shrink-0" /> <span className={name}>Ajouter</span>
      </Button>
      <Button size="sm" variant="ghost" className={tool} disabled={full} onClick={() => add(true)} aria-label="Dupliquer la slide" title="Dupliquer la slide">
        <Copy size={14} className="shrink-0" /> <span className={name}>Dupliquer</span>
      </Button>
      <Button size="sm" variant="ghost" className={tool} disabled={document.slides.length <= 2 || slide.locked} onClick={remove} aria-label="Supprimer la slide" title="Supprimer la slide">
        <Trash2 size={14} className="shrink-0" /> <span className={name}>Supprimer</span>
      </Button>
      {arrows}
      {!simple && (
        <Button size="sm" variant="ghost" className={tool} title={slide.locked ? "Déverrouiller la slide" : "Verrouiller la slide"} onClick={() => changeSlide({ ...slide, locked: !slide.locked })}>
          {slide.locked ? <Unlock size={14} className="shrink-0" /> : <LockKeyhole size={14} className="shrink-0" />}
          <span className={name}>{slide.locked ? "Déverrouiller" : "Verrouiller"}</span>
        </Button>
      )}
    </div>
  );
}

/** Vignettes des slides : une rangée sous la slide (ordinateur) ; des points, et les vignettes à la demande (téléphone). */
export function SlideStrip(props: StripProps) {
  const { channel, active, current, document, dragSlide, dropAt, justDragged, reorder, setActive, setDragSlide, setDropAt, setSelected, thumbDrag, thumbIndexAt, add } = props;
  // Téléphone : les vignettes s'ouvrent avec « Toutes » et se referment au choix d'une slide.
  const [all, setAll] = useState(false);
  // La vignette ouverte reste visible quand on change de slide par les flèches.
  useEffect(() => {
    const thumb = window.document.querySelector<HTMLElement>(`[data-thumb="${active}"]`);
    thumb?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [active]);
  const full = document.slides.length >= CAROUSEL_MAX_SLIDES;
  const open = (i: number) => {
    setActive(i);
    setSelected(null);
  };
  const drag = { thumbDrag, justDragged, setDragSlide, setDropAt, thumbIndexAt, count: () => current.current.slides.length, reorder };
  return (
    <div className="mt-2 flex min-w-0 flex-col items-center gap-1">
      <div className="flex w-full items-center gap-2 md:hidden">
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center" role="group" aria-label="Aller à une slide" data-testid="slide-dots">
          {document.slides.map((s, i) => (
            <button key={s.id} type="button" aria-label={`Aller à la slide ${i + 1}`} aria-current={i === active ? "true" : undefined} onClick={() => open(i)} className="p-1">
              <span className={`block h-2 rounded-full transition-all ${i === active ? "w-5 bg-primary" : "w-2 bg-primary/25"}`} />
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1 px-2 text-xs" aria-expanded={all} aria-label={all ? "Fermer la liste des slides" : "Voir toutes les slides"} data-testid="all-slides-toggle" onClick={() => setAll((a) => !a)}>
          <LayoutGrid size={14} /> {all ? "Fermer" : "Toutes"}
        </Button>
      </div>
      {/* Le « + » est à côté des vignettes, pas dedans : la liste « Slides du carrousel » ne compte que des slides. */}
      <div className={`${all ? "flex" : "hidden"} min-w-0 max-w-full flex-wrap justify-center gap-1.5 p-1 md:flex md:w-fit md:flex-nowrap md:justify-start md:gap-1 md:overflow-x-auto`}>
      <div className="contents" aria-label="Slides du carrousel">
        {document.slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            data-thumb={i}
            style={{ touchAction: "none" }}
            // Glisser pour changer l'ordre : geste commun avec les stories (thumb-reorder.ts).
            {...thumbDragHandlers(drag, i)}
            onClick={thumbClick(drag, () => {
              open(i);
              setAll(false);
            })}
            aria-label={`Sélectionner la slide ${i + 1}`}
            aria-pressed={i === active}
            title="Clique pour ouvrir, glisse pour changer l’ordre"
            className={`relative shrink-0 cursor-grab rounded-lg border p-0.5 text-2xs ${i === active ? "border-primary ring-2 ring-primary/40" : "bg-background"} ${dragSlide === i ? "opacity-50" : ""} ${dropAt === i && dragSlide !== i ? "outline outline-2 outline-offset-2 outline-primary" : ""}`}
          >
            <SlideThumb html={s.html} width={34} />
            <span className={`block text-center leading-tight ${i === active ? "font-semibold text-primary" : "text-muted-foreground"}`}>
              {i + 1}
              {s.locked ? " 🔒" : ""}
            </span>
          </button>
        ))}
      </div>
        <button type="button" disabled={full} onClick={() => add()} aria-label="Ajouter une slide à la suite" title="Ajouter une slide" className="flex h-[47px] w-10 shrink-0 items-center justify-center self-start rounded-lg border border-dashed text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40">
          <Plus size={16} />
        </button>
      </div>
      {/* Les boutons de la slide : avec les vignettes ouvertes sur téléphone. Sur tablette et ordinateur, ils sont
          dans la ligne du haut dans les deux modes (26/11/2026 : la slide reprend la hauteur de leur rangée). */}
      {all && <SlideTools {...props} className="flex-wrap justify-center md:hidden" />}
      {/* Une seule ligne sous les vignettes : elle doit tenir au-dessus de la barre « Publier » (EditorLayout.tsx). */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 text-center text-2xs leading-tight text-muted-foreground">
        {document.slides.length > 1 && (
          <p className={`${all ? "block" : "hidden"} md:block md:[@media(max-height:799px)]:hidden`}>Clique une vignette pour l’ouvrir, glisse-la pour changer l’ordre.</p>
        )}
        {channel !== "linkedin" && document.slides.length > INSTAGRAM_DIRECT_MAX_IMAGES && (
          <p>
            {document.slides.length} slides : au-delà de {INSTAGRAM_DIRECT_MAX_IMAGES}, publie-le depuis l’appli Instagram.{" "}
            <HelpTip label="nombre de slides">{instagramTooManyImagesReason(document.slides.length)}</HelpTip>
          </p>
        )}
      </div>
    </div>
  );
}
