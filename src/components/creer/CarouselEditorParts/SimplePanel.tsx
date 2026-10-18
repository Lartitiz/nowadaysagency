// Chantier D (15/10/2026) : panneau du mode simple (par défaut). Quatre
// réglages seulement : le texte, la photo, la couleur et la police. Tout le
// reste est à un clic, dans « Plus d'outils » (le panneau complet).
// Sur téléphone, quatre gros boutons sous la slide ouvrent chacun leur partie.
// Chantier V (18/10/2026) : « Mettre cette police / couleur partout » sous la
// police et les couleurs (même action que « Toutes les slides »), et la police
// remonte au-dessus de la photo quand un texte est choisi (visible sans défiler).
// Chantier AB (18/10/2026) : « Mise en page » et « Thème du carrousel » ouvrent les
// galeries de « Plus d'outils » (mêmes composants) ; « Ajouter une icône » ; la
// couleur d'une icône se change comme celle d'un texte.
import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, LayoutTemplate, Palette, Pencil, SlidersHorizontal, SwatchBook, Type } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addTextElement, patchElement, restyleSlide, type carouselThemes, type CarouselDocument, type LayoutVariant, type EditorElement, type EditorSlide, type listDocumentFonts } from "@/lib/carousel-editor";
import { restyleAllTexts } from "@/components/creer/CarouselEditorParts/AllSlidesPanel";
import type { CanvasApi } from "@/components/creer/CarouselEditorParts/canvas-geometry";
import { FontPicker } from "@/components/creer/CarouselEditorParts/FontPicker";
import { HelpTip } from "@/components/creer/CarouselEditorParts/HelpTip";
import { OPEN_FONT_EVENT } from "@/components/creer/CarouselEditorParts/editor-mode";
import { range, toHex } from "@/components/creer/CarouselEditorParts/panel-controls";
import { LayoutGallery, ThemeGallery } from "@/components/creer/CarouselEditorParts/SlideSettings";
import { IconPicker } from "@/components/creer/CarouselEditorParts/IconPicker";
import { addIcon, brandInk, iconColor, isIcon, setIconColor } from "@/components/creer/CarouselEditorParts/editor-icons";

type Part = "texte" | "photo" | "couleur" | "police";

function Swatches({ colors, current, label, onPick }: { colors: string[]; current: string; label: string; onPick: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Pastilles : ${label}`}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${label} ${c}`}
          aria-pressed={current.toLowerCase() === c.toLowerCase()}
          className="h-7 w-7 rounded-full border border-black/20 aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-1"
          style={{ background: c }}
          onClick={() => onPick(c)}
        />
      ))}
      <label className="flex h-7 items-center gap-1 rounded-full border px-2 text-2xs text-muted-foreground">
        Autre
        <input aria-label={label} type="color" value={current} onChange={(e) => onPick(e.target.value)} className="h-4 w-5 cursor-pointer border-0 bg-transparent p-0" />
      </label>
    </div>
  );
}

const sectionClass = (part: Part, shown: Part | null) =>
  `space-y-2 rounded-lg border p-2.5 ${shown === part ? "" : "hidden"} md:block`;

export function SimplePanel({ applyCarouselTheme, canvasApi, changeLayout, changeSlide, commit, css, document, documentFonts, element, elements, fill, fillAlpha, fillHex, filterValue, fontQuery, layoutPreviews, onAddPhoto, onMore, palette, pickFont, selectOne, setFilter, setFitId, setFontQuery, setPhotoOpen, slide, style, themes }: {
  applyCarouselTheme: (themeId: string) => void;
  canvasApi: MutableRefObject<CanvasApi | null>;
  changeLayout: (variant: LayoutVariant) => void;
  changeSlide: (next: EditorSlide, key?: string) => void;
  commit: (next: CarouselDocument, key?: string) => void;
  css: Record<string, string>;
  document: CarouselDocument;
  documentFonts: ReturnType<typeof listDocumentFonts>;
  element: EditorElement | undefined;
  elements: EditorElement[];
  fill: (hex: string, alpha: number) => unknown;
  fillAlpha: number;
  fillHex: string;
  filterValue: (name: string, fallback: number) => number;
  fontQuery: string;
  layoutPreviews: { variant: LayoutVariant; label: string; preview: { html: string } }[];
  onAddPhoto?: unknown;
  onMore: () => void;
  palette: string[];
  pickFont: (value: string, family?: string) => void;
  selectOne: (id: string | null) => void;
  setFilter: (change: Partial<Record<"brightness" | "contrast" | "saturate", number>>) => void;
  setFitId: (id: string | null) => void;
  setFontQuery: (query: string) => void;
  setPhotoOpen: (open: boolean) => void;
  slide: EditorSlide;
  style: (styles: Record<string, string>, key?: string) => void;
  themes: ReturnType<typeof carouselThemes>;
}) {
  // Téléphone : la partie ouverte par un des 4 gros boutons (ordinateur : tout est visible).
  const [shown, setShown] = useState<Part | null>(null);
  const [fontOpen, setFontOpen] = useState(false);
  const fontSection = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const openFont = () => {
      setShown("police");
      fontSection.current?.scrollIntoView?.({ block: "center" });
      // Après la fermeture du menu « … » (sinon il reprend le focus et referme la liste).
      window.setTimeout(() => setFontOpen(true), 150);
    };
    window.addEventListener(OPEN_FONT_EVENT, openFont);
    return () => window.removeEventListener(OPEN_FONT_EVENT, openFont);
  }, []);
  const text = element?.kind === "text" ? element : undefined;
  const photo = element?.kind === "photo" ? element : undefined;
  const firstText = elements.find((e) => e.kind === "text");
  const firstPhoto = elements.find((e) => e.kind === "photo");
  const slideBackground = toHex(
    (new DOMParser().parseFromString(slide.html, "text/html").body.firstElementChild as HTMLElement | null)?.style.backgroundColor,
    "#faf7f2",
  );
  const open = (part: Part) => {
    setShown((s) => (s === part ? null : part));
    if ((part === "texte" || part === "police") && !text && firstText) selectOne(firstText.id);
    if (part === "photo" && !photo) {
      if (firstPhoto) selectOne(firstPhoto.id);
      else if (onAddPhoto) setPhotoOpen(true);
    }
  };
  const locked = slide.locked;
  const icon = element?.kind === "shape" && isIcon(slide, element.id) ? element : undefined;
  const [gallery, setGallery] = useState<"page" | "theme" | null>(null);
  const galleryButton = (which: "page" | "theme", label: string, Icon: typeof LayoutTemplate, content: ReactNode) => (
    <Popover open={gallery === which} onOpenChange={(next) => setGallery(next ? which : null)}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 px-2 text-xs" disabled={which === "page" && locked}>
          <Icon size={14} aria-hidden="true" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-3" aria-label={label}>
        <p className="text-xs font-semibold">{label}</p>
        {content}
      </PopoverContent>
    </Popover>
  );
  // Police ou couleur du texte choisi sur tous les textes du carrousel, en une étape d'Annuler.
  const many = document.slides.length > 1;
  const everywhere = (styles: Record<string, string>, done: string) => {
    commit(restyleAllTexts(document, styles));
    const kept = document.slides.filter((s) => s.locked).length;
    toast.success(done, {
      description: kept
        ? `${kept > 1 ? `${kept} slides verrouillées gardent` : "1 slide verrouillée garde"} la sienne. Tu peux annuler.`
        : "Tu peux annuler.",
    });
  };
  // Sur la ligne du titre de la section : visible sans défiler, sous la barre « Publier » jamais.
  const sectionTitle = (title: string, everywhereButton?: false | { testId: string; label: string; onClick: () => void; disabled: boolean }) => (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs font-semibold">{title}</p>
      {everywhereButton && (
        <Button data-testid={everywhereButton.testId} size="sm" variant="ghost" className="h-6 px-2 text-2xs" disabled={everywhereButton.disabled} onClick={everywhereButton.onClick}>
          {everywhereButton.label}
        </Button>
      )}
    </div>
  );
  return (
    <div className="min-w-0 space-y-2" aria-label="Réglages simples">
      <div className="grid grid-cols-4 gap-1.5 md:hidden" role="group" aria-label="Que veux-tu changer ?">
        {([
          ["texte", "Texte", Pencil],
          ["photo", "Photo", ImagePlus],
          ["couleur", "Couleur", Palette],
          ["police", "Police", Type],
        ] as const).map(([part, label, Icon]) => (
          <button
            key={part}
            type="button"
            aria-pressed={shown === part}
            onClick={() => open(part)}
            className="flex flex-col items-center gap-0.5 rounded-xl border bg-background py-2 text-xs font-medium aria-pressed:border-primary aria-pressed:bg-primary/10"
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <p className={`items-center gap-1.5 text-xs text-muted-foreground ${shown ? "hidden md:flex" : "flex"}`}>
        {text ? "Texte choisi" : photo ? "Photo choisie" : icon ? "Icône choisie" : element ? "Forme choisie" : "Touche un texte ou une photo sur la slide pour le modifier."}
        {/* Téléphone (W élargi) : les vignettes laissent leur place aux réglages ; ce bouton les rend. */}
        {element && element.role !== "background" && (
          <button type="button" className="ml-auto text-2xs font-medium text-primary underline-offset-2 hover:underline md:hidden" onClick={() => selectOne(null)}>
            Voir les slides
          </button>
        )}
        <HelpTip label="modifier la slide">
          Touche un élément pour le choisir, puis glisse-le pour le déplacer. « Écrire » (ou un double-clic) change un texte
          directement sur la slide. Tes retouches ne coûtent aucun crédit, et « Annuler » revient en arrière. Calques, mises
          en page, thèmes, position, ombre et retouche photo sont dans « Plus d'outils ».
        </HelpTip>
      </p>
      <div className={`gap-1.5 ${shown ? "hidden md:flex" : "flex"}`} role="group" aria-label="Toute la slide">
        {galleryButton("page", "Mise en page", LayoutTemplate, (
          <LayoutGallery changeLayout={(variant) => { changeLayout(variant); setGallery(null); }} layoutPreviews={layoutPreviews} slide={slide} />
        ))}
        {galleryButton("theme", "Thème du carrousel", SwatchBook, (
          <ThemeGallery applyCarouselTheme={(id) => { applyCarouselTheme(id); setGallery(null); }} themes={themes} />
        ))}
      </div>
      <fieldset disabled={locked} className="flex min-w-0 flex-col gap-2 disabled:opacity-50">
        <div className={sectionClass("texte", shown)}>
          <p className="text-xs font-semibold">Texte</p>
          {text ? (
            <>
              <Textarea
                aria-label="Texte sélectionné"
                value={text.text}
                rows={2}
                className="min-h-[60px] text-sm"
                onChange={(e) => {
                  setFitId(text.id);
                  changeSlide(patchElement(slide, text.id, { text: e.target.value }), `text-${slide.id}-${text.id}`);
                }}
              />
              {range("Taille du texte", parseFloat(css["font-size"]) || 40, 18, 160, (n) => style({ "font-size": `${n}px` }, "font"))}
              <div className="flex gap-1" role="group" aria-label="Alignement du texte">
                {([["left", "Gauche"], ["center", "Centre"], ["right", "Droite"]] as const).map(([value, label]) => (
                  <Button key={value} size="sm" variant="outline" className="h-7 flex-1 text-2xs aria-pressed:bg-primary/15" aria-pressed={(css["text-align"] || "left") === value} onClick={() => style({ "text-align": value })}>
                    {label}
                  </Button>
                ))}
              </div>
            </>
          ) : null}
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="outline" className="px-1 text-xs" onClick={() => changeSlide(addTextElement(slide))}>
              Ajouter un texte
            </Button>
            <IconPicker
              disabled={locked}
              onPick={(name, svg) => {
                const out = addIcon(slide, name, svg, brandInk(palette));
                if (!out.id) return;
                changeSlide(out.slide);
                selectOne(out.id);
              }}
            />
          </div>
        </div>
        <div className={`${sectionClass("photo", shown)} ${text ? "order-last" : ""}`}>
          <p className="text-xs font-semibold">Photo</p>
          {onAddPhoto && (
            <Button size="sm" variant="outline" className="w-full" onClick={() => setPhotoOpen(true)}>
              <ImagePlus size={14} className="mr-1" /> {photo || firstPhoto ? "Changer la photo" : "Ajouter une photo"}
            </Button>
          )}
          {photo ? (
            <>
              <div className="flex gap-1" role="group" aria-label="Affichage de la photo">
                {([["cover", "Remplir le cadre"], ["contain", "Voir toute la photo"]] as const).map(([value, label]) => (
                  <Button
                    key={value}
                    size="sm"
                    variant="outline"
                    className="h-7 flex-1 px-1 text-2xs aria-pressed:bg-primary/15"
                    aria-pressed={(css["object-fit"] === "contain" || css["background-size"] === "contain" ? "contain" : "cover") === value}
                    onClick={() => style({ "object-fit": value, "background-size": value, "background-repeat": "no-repeat", "object-position": "50% 50%", "background-position": "50% 50%", "--editor-zoom": "1", "--editor-base-transform": "", transform: "none" })}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {range("Zoom photo", Number(css["--editor-zoom"]) || 1, 1, 3, (n) => canvasApi.current?.zoomPhoto(photo.id, n), 0.05)}
              {range("Luminosité", filterValue("brightness", 1), 0.5, 1.5, (n) => setFilter({ brightness: n }), 0.05)}
              <p className="text-2xs text-muted-foreground">Glisse la photo sur la slide pour la recadrer.</p>
            </>
          ) : (
            !onAddPhoto && <p className="text-2xs text-muted-foreground">Touche une photo sur la slide pour la régler.</p>
          )}
        </div>
        <div className={sectionClass("couleur", shown)}>
          {sectionTitle("Couleur", !!text && many && { testId: "color-everywhere", label: "Mettre cette couleur partout", onClick: () => everywhere({ color: css.color }, "Couleur mise sur tous les textes"), disabled: !css.color })}
          {text ? (
            <Swatches colors={palette} current={toHex(css.color, "#222222")} label="Couleur du texte" onPick={(hex) => style({ color: hex })} />
          ) : icon ? (
            <Swatches colors={palette} current={iconColor(slide, icon.id)} label="Couleur de l’icône" onPick={(hex) => changeSlide(setIconColor(slide, icon.id, hex), `icon-${slide.id}-${icon.id}`)} />
          ) : element?.kind === "shape" && element.role !== "background" && element.role !== "veil" ? (
            <Swatches colors={palette} current={fillHex} label="Fond du bloc" onPick={(hex) => fill(hex, fillAlpha || 1)} />
          ) : (
            <Swatches
              colors={palette}
              current={slideBackground}
              label="Fond de la slide"
              onPick={(hex) => changeSlide(restyleSlide(slide, { "background-color": hex }), `background-${slide.id}`)}
            />
          )}
        </div>
        <div ref={fontSection} className={sectionClass("police", shown)}>
          {sectionTitle("Police", !!text && many && { testId: "font-everywhere", label: "Mettre cette police partout", onClick: () => everywhere({ "font-family": css["font-family"] }, "Police mise sur tous les textes"), disabled: !css["font-family"] })}
          {text ? (
            <FontPicker css={css} documentFonts={documentFonts} fontQuery={fontQuery} open={fontOpen} onOpenChange={setFontOpen} pickFont={(value, family) => {
                // La liste se referme : « Mettre cette police partout » est juste dessous.
                pickFont(value, family);
                setFontOpen(false);
              }} setFontQuery={setFontQuery} />
          ) : (
            <p className="text-2xs text-muted-foreground">Touche un texte sur la slide pour changer sa police.</p>
          )}
        </div>
      </fieldset>
      {locked && <p role="status" className="text-xs">Slide verrouillée : déverrouille-la dans « Plus d'outils » pour la modifier.</p>}
      <Button size="sm" variant="ghost" className="w-full gap-1.5 text-xs" onClick={onMore}>
        <SlidersHorizontal size={14} aria-hidden="true" /> Plus d'outils : calques, mises en page, thèmes…
      </Button>
    </div>
  );
}
