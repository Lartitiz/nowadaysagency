// Chantier D (15/10/2026) : réglages simples (le texte, la photo, la couleur, la police).
// Chantier V (18/10/2026) : « Mettre cette police / couleur partout » sous la police et
// les couleurs (même action que « Toutes les slides »).
// Chantier AB (18/10/2026) : la couleur d'une icône se change comme celle d'un texte.
// Éditeur facile (20/11/2026, maquette validée par Laetitia après le retour d'une
// cliente) : chaque texte de la slide dans sa case, toujours visible.
// Panneau à onglets (26/11/2026, maquette validée par Laetitia) : il n'y a plus deux
// panneaux (« simple » et « Plus d'outils ») mais un seul, rangé par sujet. Ce fichier
// donne la partie simple de trois onglets : « Texte » (les cases, puis la taille,
// l'alignement, la police et la couleur du texte choisi), « Photo » et « Couleurs ».
// Les réglages pointus s'affichent dessous (EditorPanel.tsx).
import type { MutableRefObject } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Pencil } from "lucide-react";
import { patchElement, restyleSlide, type CarouselDocument, type EditorElement, type EditorSlide, type listDocumentFonts } from "@/lib/carousel-editor";
import { restyleAllTexts } from "@/components/creer/CarouselEditorParts/AllSlidesPanel";
import type { CanvasApi } from "@/components/creer/CarouselEditorParts/canvas-geometry";
import { FontPicker } from "@/components/creer/CarouselEditorParts/FontPicker";
import { HelpTip } from "@/components/creer/CarouselEditorParts/HelpTip";
import { range, toHex } from "@/components/creer/CarouselEditorParts/panel-controls";
import { iconColor, isIcon, setIconColor } from "@/components/creer/CarouselEditorParts/editor-icons";

export type SimplePart = "texte" | "photo" | "couleurs";

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

export function SimpleParts({ part, canvasApi, changeSlide, commit, css, document, documentFonts, element, elements, fill, fillAlpha, fillHex, filterValue, fontOpen, fontQuery, onAddPhoto, onOpenStudio, palette, pickFont, selectOne, setFilter, setFitId, setFontOpen, setFontQuery, setPhotoOpen, slide, style }: {
  part: SimplePart;
  canvasApi: MutableRefObject<CanvasApi | null>;
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
  /** Liste des polices ouverte (le « … » de la barre posée sur la slide l'ouvre aussi). */
  fontOpen: boolean;
  fontQuery: string;
  onAddPhoto?: unknown;
  onOpenStudio?: (slideId: string) => void;
  palette: string[];
  pickFont: (value: string, family?: string) => void;
  selectOne: (id: string | null) => void;
  setFilter: (change: Partial<Record<"brightness" | "contrast" | "saturate", number>>) => void;
  setFitId: (id: string | null) => void;
  setFontOpen: (open: boolean) => void;
  setFontQuery: (query: string) => void;
  setPhotoOpen: (open: boolean) => void;
  slide: EditorSlide;
  style: (styles: Record<string, string>, key?: string) => void;
}) {
  const text = element?.kind === "text" ? element : undefined;
  const photo = element?.kind === "photo" ? element : undefined;
  const firstPhoto = elements.find((e) => e.kind === "photo");
  const icon = element?.kind === "shape" && isIcon(slide, element.id) ? element : undefined;
  const block = element?.kind === "shape" && !icon && element.role !== "background" && element.role !== "veil" ? element : undefined;
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

  if (part === "photo") {
    return (
      <section aria-label="Photo de cette slide" data-testid="panel-photo" className="space-y-2.5">
        <div>
          <h3 className="text-sm font-semibold">Photo de cette slide</h3>
          <p className="text-2xs text-muted-foreground">{photo ? "Glisse la photo sur la slide pour la recadrer." : firstPhoto ? "Touche la photo sur la slide pour la régler." : "Cette slide n'a pas encore de photo."}</p>
        </div>
        <div className="grid gap-2">
          {!!onAddPhoto && (
            <Button size="sm" variant="outline" className="w-full" onClick={() => setPhotoOpen(true)}>
              <ImagePlus size={14} className="mr-1" /> {photo || firstPhoto ? "Changer la photo" : "Ajouter une photo"}
            </Button>
          )}
          {onOpenStudio && <Button variant="outline" size="sm" className="w-full" disabled={slide.locked} onClick={() => onOpenStudio(slide.id)}>Créer / remplacer avec le Studio</Button>}
        </div>
        {photo && (
          <>
            <div className="flex gap-1" role="group" aria-label="Affichage de la photo">
              {([["cover", "Remplir le cadre"], ["contain", "Voir toute la photo"]] as const).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1 px-1 text-2xs aria-pressed:border-primary aria-pressed:bg-primary/10"
                  aria-pressed={(css["object-fit"] === "contain" || css["background-size"] === "contain" ? "contain" : "cover") === value}
                  onClick={() => style({ "object-fit": value, "background-size": value, "background-repeat": "no-repeat", "object-position": "50% 50%", "background-position": "50% 50%", "--editor-zoom": "1", "--editor-base-transform": "", transform: "none" })}
                >
                  {label}
                </Button>
              ))}
            </div>
            {range("Zoom photo", Number(css["--editor-zoom"]) || 1, 1, 3, (n) => canvasApi.current?.zoomPhoto(photo.id, n), 0.05)}
            {range("Luminosité", filterValue("brightness", 1), 0.5, 1.5, (n) => setFilter({ brightness: n }), 0.05)}
          </>
        )}
      </section>
    );
  }

  if (part === "couleurs") {
    const slideBackground = toHex(
      (new DOMParser().parseFromString(slide.html, "text/html").body.firstElementChild as HTMLElement | null)?.style.backgroundColor,
      "#faf7f2",
    );
    return (
      <section aria-label="Couleurs" data-testid="panel-colors" className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Couleurs</h3>
          <p className="text-2xs text-muted-foreground">Les couleurs de ta marque, prêtes à poser.</p>
        </div>
        {text && (
          <div className="space-y-1.5">
            {sectionTitle("Couleur du texte choisi", many && { testId: "color-everywhere", label: "Mettre cette couleur partout", onClick: () => everywhere({ color: css.color }, "Couleur mise sur tous les textes"), disabled: !css.color })}
            <Swatches colors={palette} current={toHex(css.color, "#222222")} label="Couleur du texte" onPick={(hex) => style({ color: hex })} />
          </div>
        )}
        {icon && (
          <div className="space-y-1.5">
            {sectionTitle("Couleur de l’icône choisie")}
            <Swatches colors={palette} current={iconColor(slide, icon.id)} label="Couleur de l’icône" onPick={(hex) => changeSlide(setIconColor(slide, icon.id, hex), `icon-${slide.id}-${icon.id}`)} />
          </div>
        )}
        {block && (
          <div className="space-y-1.5">
            {sectionTitle("Fond du bloc choisi")}
            <Swatches colors={palette} current={fillHex} label="Fond du bloc" onPick={(hex) => fill(hex, fillAlpha || 1)} />
          </div>
        )}
        <div className="space-y-1.5">
          {sectionTitle("Fond de la slide")}
          <Swatches colors={palette} current={slideBackground} label="Fond de la slide" onPick={(hex) => changeSlide(restyleSlide(slide, { "background-color": hex }), `background-${slide.id}`)} />
        </div>
      </section>
    );
  }

  const texts = elements.filter((e) => e.kind === "text");
  const sizes = texts.map((t) => parseFloat(t.style?.["font-size"] || "0") || 0);
  const titleAt = texts.length > 1 && Math.max(...sizes) > 0 ? sizes.indexOf(Math.max(...sizes)) : -1;
  return (
    <section aria-label="Textes de cette slide" data-testid="slide-texts" className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Pencil size={15} aria-hidden="true" /> Textes de cette slide
        <span className="ml-auto rounded-full bg-success/10 px-2 py-0.5 text-2xs font-medium text-success">Gratuit</span>
        <HelpTip label="modifier la slide">
          Écris dans une case : la slide change tout de suite. Sur la slide, touche un élément pour le choisir, puis
          glisse-le pour le déplacer. Tes retouches ne coûtent aucun crédit, et « Annuler » revient en arrière.
        </HelpTip>
      </h3>
      {!texts.length && <p className="text-xs text-muted-foreground">Cette slide n'a pas encore de texte : l'onglet « Ajouter » en pose un.</p>}
      {texts.map((t, n) => (
        <div key={t.id} className="space-y-1.5">
          <p className="text-2xs text-muted-foreground" aria-hidden="true">{n === titleAt ? "Titre" : texts.length > 2 ? `Texte ${n + 1}` : "Texte"}</p>
          <Textarea
            aria-label={t.id === text?.id ? "Texte sélectionné" : `Texte ${n + 1} de la slide`}
            value={t.text}
            rows={Math.min(4, Math.max(1, Math.ceil(t.text.length / 38)))}
            className={`min-h-0 resize-none text-sm ${t.id === text?.id ? "border-primary ring-2 ring-primary/15" : ""}`}
            onFocus={() => { if (t.id !== text?.id) selectOne(t.id); }}
            onChange={(e) => {
              setFitId(t.id);
              changeSlide(patchElement(slide, t.id, { text: e.target.value }), `text-${slide.id}-${t.id}`);
            }}
          />
          {t.id === text?.id && (
            <div className="space-y-2.5 rounded-lg bg-muted/50 p-2.5" data-testid="text-style">
              <div className="space-y-1">
                {sectionTitle("Police", many && { testId: "font-everywhere", label: "Mettre cette police partout", onClick: () => everywhere({ "font-family": css["font-family"] }, "Police mise sur tous les textes"), disabled: !css["font-family"] })}
                <FontPicker css={css} documentFonts={documentFonts} fontQuery={fontQuery} open={fontOpen} onOpenChange={setFontOpen} pickFont={(value, family) => {
                  // La liste se referme : « Mettre cette police partout » est juste au-dessus.
                  pickFont(value, family);
                  setFontOpen(false);
                }} setFontQuery={setFontQuery} />
              </div>
              {range("Taille du texte", parseFloat(css["font-size"]) || 40, 18, 160, (v) => style({ "font-size": `${v}px` }, "font"))}
              <div className="flex gap-1" role="group" aria-label="Alignement du texte">
                {([["left", "Gauche"], ["center", "Centre"], ["right", "Droite"]] as const).map(([value, label]) => (
                  <Button key={value} size="sm" variant="outline" className="h-7 flex-1 text-2xs aria-pressed:bg-primary/15" aria-pressed={(css["text-align"] || "left") === value} onClick={() => style({ "text-align": value })}>
                    {label}
                  </Button>
                ))}
              </div>
              <div className="space-y-1">
                {sectionTitle("Couleur", many && { testId: "color-everywhere", label: "Mettre cette couleur partout", onClick: () => everywhere({ color: css.color }, "Couleur mise sur tous les textes"), disabled: !css.color })}
                <Swatches colors={palette} current={toHex(css.color, "#222222")} label="Couleur du texte" onPick={(hex) => style({ color: hex })} />
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
