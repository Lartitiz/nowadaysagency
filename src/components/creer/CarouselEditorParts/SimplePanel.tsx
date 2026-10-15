// Chantier D (15/10/2026) : panneau du mode simple (par défaut). Quatre
// réglages seulement : le texte, la photo, la couleur et la police. Tout le
// reste est à un clic, dans « Plus d'outils » (le panneau complet).
// Sur téléphone, quatre gros boutons sous la slide ouvrent chacun leur partie.
import { useState, type MutableRefObject } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Palette, Pencil, SlidersHorizontal, Type } from "lucide-react";
import { addTextElement, patchElement, restyleSlide, type EditorElement, type EditorSlide, type listDocumentFonts } from "@/lib/carousel-editor";
import type { CanvasApi } from "@/components/creer/CarouselEditorParts/canvas-geometry";
import { FontPicker } from "@/components/creer/CarouselEditorParts/FontPicker";
import { HelpTip } from "@/components/creer/CarouselEditorParts/HelpTip";
import { range, toHex } from "@/components/creer/CarouselEditorParts/panel-controls";

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

export function SimplePanel({ canvasApi, changeSlide, css, documentFonts, element, elements, fill, fillAlpha, fillHex, filterValue, fontQuery, onAddPhoto, onMore, palette, pickFont, selectOne, setFilter, setFitId, setFontQuery, setPhotoOpen, slide, style }: {
  canvasApi: MutableRefObject<CanvasApi | null>;
  changeSlide: (next: EditorSlide, key?: string) => void;
  css: Record<string, string>;
  documentFonts: ReturnType<typeof listDocumentFonts>;
  element: EditorElement | undefined;
  elements: EditorElement[];
  fill: (hex: string, alpha: number) => unknown;
  fillAlpha: number;
  fillHex: string;
  filterValue: (name: string, fallback: number) => number;
  fontQuery: string;
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
}) {
  // Téléphone : la partie ouverte par un des 4 gros boutons (ordinateur : tout est visible).
  const [shown, setShown] = useState<Part | null>(null);
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
        {text ? "Texte choisi" : photo ? "Photo choisie" : element ? "Forme choisie" : "Touche un texte ou une photo sur la slide pour le modifier."}
        <HelpTip label="modifier la slide">
          Touche un élément pour le choisir, puis glisse-le pour le déplacer. « Écrire » (ou un double-clic) change un texte
          directement sur la slide. Tes retouches ne coûtent aucun crédit, et « Annuler » revient en arrière. Calques, mises
          en page, thèmes, position, ombre et retouche photo sont dans « Plus d'outils ».
        </HelpTip>
      </p>
      <fieldset disabled={locked} className="min-w-0 space-y-2 disabled:opacity-50">
        <div className={sectionClass("texte", shown)}>
          <p className="text-xs font-semibold">Texte</p>
          {text ? (
            <>
              <Textarea
                aria-label="Texte sélectionné"
                value={text.text}
                rows={3}
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
          ) : (
            <p className="text-2xs text-muted-foreground">Touche un texte sur la slide, ou ajoutes-en un.</p>
          )}
          <Button size="sm" variant="outline" className="w-full" onClick={() => changeSlide(addTextElement(slide))}>
            Ajouter un texte
          </Button>
        </div>
        <div className={sectionClass("photo", shown)}>
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
          <p className="text-xs font-semibold">Couleur</p>
          {text ? (
            <Swatches colors={palette} current={toHex(css.color, "#222222")} label="Couleur du texte" onPick={(hex) => style({ color: hex })} />
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
        <div className={sectionClass("police", shown)}>
          <p className="text-xs font-semibold">Police</p>
          {text ? (
            <FontPicker css={css} documentFonts={documentFonts} fontQuery={fontQuery} pickFont={pickFont} setFontQuery={setFontQuery} />
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
