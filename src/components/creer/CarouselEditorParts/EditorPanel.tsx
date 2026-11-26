// Panneau à onglets (26/11/2026, maquette validée par Laetitia). Avant, l'éditeur avait
// deux panneaux sans rapport : le mode simple (trois blocs) et « Plus d'outils » (calques,
// onglets Élément / Slide / Carrousel, listes de boutons). Passer de l'un à l'autre
// changeait toute la logique. Maintenant : un seul panneau, une colonne d'icônes, un sujet
// affiché à la fois (Texte, Photo, Mise en page, Couleurs, Ajouter, Calques).
// - Le panneau suit ce qu'on touche sur la slide : un texte ouvre « Texte », une photo
//   « Photo », une forme ou une icône « Couleurs » (sauf depuis « Calques », où l'on choisit
//   justement des éléments).
// - Les réglages pointus de l'ancien « Plus d'outils » sont sous la partie simple de
//   l'onglet de l'élément choisi, dans leurs sections repliables d'origine.
// - « Demander un changement à l'IA » reste collé en bas sur ordinateur (SlideRedoDialog.tsx
//   s'y affiche) ; sur téléphone, c'est un onglet de plus.
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ImageIcon, Layers, LayoutTemplate, LockKeyhole, Palette, PlusCircle, Sparkles, Type } from "lucide-react";
import { editorialVeilAlpha, listLayers, setEditorialVeilAlpha, setVeilAlpha, veilAlpha, type EditorElement } from "@/lib/carousel-editor";
import type { CarouselStylesApi } from "@/hooks/use-carousel-styles";
import { LayersPanel, MultiSelectPanel } from "@/components/creer/CarouselEditorParts/LayersPanel";
import { AddSettings, ADD_TILE, LayoutSettings, ThemeGallery } from "@/components/creer/CarouselEditorParts/SlideSettings";
import { range } from "@/components/creer/CarouselEditorParts/panel-controls";
import { TextSettings } from "@/components/creer/CarouselEditorParts/TextSettings";
import { BlockSettings, PhotoSettings } from "@/components/creer/CarouselEditorParts/ElementSettings";
import { AllSlidesPanel, SavedStylesPanel } from "@/components/creer/CarouselEditorParts/AllSlidesPanel";
import { SimpleParts } from "@/components/creer/CarouselEditorParts/SimplePanel";
import { IconPicker } from "@/components/creer/CarouselEditorParts/IconPicker";
import { addIcon, brandInk } from "@/components/creer/CarouselEditorParts/editor-icons";
import { OPEN_FONT_EVENT } from "@/components/creer/CarouselEditorParts/editor-mode";
import { SLIDE_ASK_SLOT } from "@/components/creer/CarouselEditorParts/SlideRedoDialog";

export type PanelTab = "texte" | "photo" | "page" | "couleurs" | "ajouter" | "calques" | "ia";

const TABS: [PanelTab, string, typeof Type][] = [
  ["texte", "Texte", Type],
  ["photo", "Photo", ImageIcon],
  ["page", "Mise en page", LayoutTemplate],
  ["couleurs", "Couleurs", Palette],
  ["ajouter", "Ajouter", PlusCircle],
];

type Without<T, K extends string> = Omit<T, K>;
type Props =
  & Without<ComponentProps<typeof SimpleParts>, "part" | "fontOpen" | "setFontOpen">
  & ComponentProps<typeof LayersPanel>
  & ComponentProps<typeof MultiSelectPanel>
  & Without<ComponentProps<typeof TextSettings>, "element" | "advanced">
  & Without<ComponentProps<typeof PhotoSettings>, "element" | "advanced">
  & Without<ComponentProps<typeof BlockSettings>, "element">
  & Without<ComponentProps<typeof AllSlidesPanel>, "element">
  & Without<ComponentProps<typeof SavedStylesPanel>, "element" | "savedStyles">
  & Without<ComponentProps<typeof AddSettings>, "iconPicker">
  & ComponentProps<typeof LayoutSettings>
  & ComponentProps<typeof ThemeGallery>
  & {
    /** Classes du cadre (place dans la grille de l'éditeur, collé sous la ligne d'outils). */
    className: string;
    savedStyles?: CarouselStylesApi;
    ungroupSelection: () => void;
  };

/** Onglet de l'élément choisi : c'est là que ses réglages pointus s'affichent. */
const tabOf = (element: EditorElement | undefined): PanelTab | null =>
  !element || element.role === "background" ? null : element.kind === "text" ? "texte" : element.kind === "photo" ? "photo" : "couleurs";

export function EditorPanel(p: Props) {
  const { element, slide, group, selectOne, elements } = p;
  const [tab, setTab] = useState<PanelTab>("texte");
  const [fontOpen, setFontOpen] = useState(false);
  // Le panneau suit ce qu'on touche sur la slide.
  const follows = tabOf(element);
  useEffect(() => {
    if (follows) setTab((t) => (t === "calques" || t === follows ? t : follows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element?.id]);
  // Le « … » de la barre posée sur la slide ouvre la police du texte choisi.
  useEffect(() => {
    const openFont = () => {
      setTab("texte");
      // Après la fermeture du menu « … » (sinon il reprend le focus et referme la liste).
      window.setTimeout(() => setFontOpen(true), 150);
    };
    window.addEventListener(OPEN_FONT_EVENT, openFont);
    return () => window.removeEventListener(OPEN_FONT_EVENT, openFont);
  }, []);
  const open = (next: PanelTab) => {
    setTab(next);
    // « Photo » : la photo de la slide est choisie d'office, ses réglages sont là tout de suite.
    if (next === "photo" && element?.kind !== "photo") {
      const first = elements.find((e) => e.kind === "photo");
      if (first) selectOne(first.id);
    }
  };
  // Sur ordinateur, la demande à l'IA est collée en bas : l'onglet « IA » n'existe que sur téléphone.
  const shown: PanelTab = tab === "ia" ? "texte" : tab;
  const elementLocked = !!element && !!listLayers(slide.html).find((l) => l.id === element.id)?.locked;
  const css = p.css;

  const simple = (part: "texte" | "photo" | "couleurs") => (
    <SimpleParts part={part} canvasApi={p.canvasApi} changeSlide={p.changeSlide} commit={p.commit} css={css} document={p.document} documentFonts={p.documentFonts} element={element} elements={elements}
      fill={p.fill} fillAlpha={p.fillAlpha} fillHex={p.fillHex} filterValue={p.filterValue} fontOpen={fontOpen} fontQuery={p.fontQuery} onAddPhoto={p.onAddPhoto} onOpenStudio={p.onOpenStudio} palette={p.palette}
      pickFont={p.pickFont} selectOne={selectOne} setFilter={p.setFilter} setFitId={p.setFitId} setFontOpen={setFontOpen} setFontQuery={p.setFontQuery} setPhotoOpen={p.setPhotoOpen} slide={slide} style={p.style} />
  );

  // Réglages pointus de l'élément choisi (l'ancien onglet « Élément » de « Plus d'outils »), dans leurs sections d'origine.
  const advanced: ReactNode = element && follows === shown && !slide.locked && (
    <fieldset disabled={elementLocked} className="min-w-0 space-y-3 disabled:opacity-50" data-testid="panel-advanced">
      <p className="border-t pt-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Réglages avancés</p>
      {element.kind === "text" && (
        <TextSettings advanced changeSlide={p.changeSlide} css={css} documentFonts={p.documentFonts} element={element} fontQuery={p.fontQuery} pickFont={p.pickFont} setFitId={p.setFitId} setFontQuery={p.setFontQuery} slide={slide} style={p.style} textShadowOn={p.textShadowOn} />
      )}
      {element.kind === "photo" && (
        <PhotoSettings advanced borderControls={p.borderControls} canvasApi={p.canvasApi} coord={p.coord} css={css} element={element} filterValue={p.filterValue} measured={p.measured} setFilter={p.setFilter} style={p.style} />
      )}
      {element.editorialVeil &&
        range("Intensité du voile derrière le texte", editorialVeilAlpha(slide.html) ?? 0.9, 0.05, 1, (n) => p.changeSlide(setEditorialVeilAlpha(slide, n), `${slide.id}-editorial-veil`), 0.05)}
      {element.role === "veil" &&
        range("Intensité du voile", veilAlpha(Object.entries(css).map(([k, v]) => `${k}:${v}`).join(";")) ?? 0.85, 0.05, 1, (n) => p.changeSlide(setVeilAlpha(slide, element.id, n), `${slide.id}-${element.id}-veil`), 0.05)}
      {element.kind !== "photo" && element.role !== "veil" && (
        <BlockSettings applyBlockPreset={p.applyBlockPreset} blockPresets={p.blockPresets} borderControls={p.borderControls} coord={p.coord} css={css} element={element} fill={p.fill} fillAlpha={p.fillAlpha} fillHex={p.fillHex} measured={p.measured} rotate={p.rotate} rotation={p.rotation} style={p.style} />
      )}
      {element.frame && (
        <Button variant="outline" size="sm" onClick={() => p.remove(element.id)}>
          Retirer le fond (garder le texte)
        </Button>
      )}
      <AllSlidesPanel applyAll={p.applyAll} commit={p.commit} css={css} document={p.document} element={element} />
      {p.savedStyles && (
        <SavedStylesPanel applySaved={p.applySaved} element={element} saveStyle={p.saveStyle} savedStyles={p.savedStyles} setStyleName={p.setStyleName} styleKind={p.styleKind} styleName={p.styleName} />
      )}
    </fieldset>
  );

  const tabButton = (id: PanelTab, label: string, Icon: typeof Type, extra = "") => (
    <button key={id} type="button" role="tab" id={`panel-tab-${id}`} aria-selected={tab === id} aria-controls="panel-content" onClick={() => open(id)}
      className={`flex min-w-[3.6rem] shrink-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center text-[10.5px] font-medium leading-tight text-muted-foreground hover:text-foreground aria-selected:bg-background aria-selected:text-primary aria-selected:shadow-sm aria-selected:ring-1 aria-selected:ring-primary/25 ${extra}`}>
      <Icon size={19} aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <div className={`${p.className} md:grid md:grid-cols-[4.5rem_minmax(0,1fr)] md:overflow-hidden md:rounded-xl md:border md:bg-card`} data-testid="editor-panel" data-tab={tab}>
      <div role="tablist" aria-label="Réglages de la slide" className="flex gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 md:flex-col md:overflow-visible md:rounded-none md:border-r md:p-1.5">
        {TABS.map(([id, label, Icon]) => tabButton(id, label, Icon))}
        {tabButton("ia", "Demander à l’IA", Sparkles, "text-primary md:hidden")}
        {tabButton("calques", "Calques", Layers, "md:mt-auto")}
      </div>
      <div className="flex min-h-0 min-w-0 flex-col">
        <div id="panel-content" role="tabpanel" aria-labelledby={`panel-tab-${shown}`} className={`min-h-0 min-w-0 flex-1 space-y-3 pt-3 md:overflow-y-auto md:p-3 ${tab === "ia" ? "max-md:hidden" : ""}`}>
          {slide.locked && (
            <div role="status" className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
              <span className="flex items-center gap-1.5"><LockKeyhole size={13} /> Slide verrouillée : déverrouille-la pour la modifier.</span>
              <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={() => p.changeSlide({ ...slide, locked: false })}>Déverrouiller</Button>
            </div>
          )}
          {group.length > 1 && !slide.locked && (
            <MultiSelectPanel canvasApi={p.canvasApi} copySelection={p.copySelection} group={group} groupSelection={p.groupSelection} removeMany={p.removeMany} selectOne={selectOne} selected={p.selected} />
          )}
          {element && !slide.locked && elementLocked && (
            <div role="status" className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
              <span className="flex items-center gap-1.5"><LockKeyhole size={13} /> Élément verrouillé.</span>
              <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={() => p.lockElement(element.id, false)}>Déverrouiller</Button>
            </div>
          )}
          {element?.name === "groupe" && !slide.locked && (
            <Button size="sm" variant="outline" className="w-full" onClick={p.ungroupSelection} title="⌘⇧G">
              Dégrouper
            </Button>
          )}
          {shown === "calques" ? (
            <LayersPanel changeSlide={p.changeSlide} group={group} layers={p.layers} lockElement={p.lockElement} remove={p.remove} removedLayers={p.removedLayers} selectAdd={p.selectAdd} selectOne={selectOne} selected={p.selected} setSelected={p.setSelected} slide={slide} />
          ) : (
            <fieldset disabled={slide.locked} className="min-w-0 space-y-3 disabled:opacity-50">
              {shown === "texte" && simple("texte")}
              {shown === "photo" && simple("photo")}
              {shown === "page" && <LayoutSettings changeLayout={p.changeLayout} changeSlide={p.changeSlide} layoutPreviews={p.layoutPreviews} slide={slide} />}
              {shown === "couleurs" && (
                <>
                  {simple("couleurs")}
                  <div className="space-y-1.5" data-testid="panel-themes">
                    <p className="text-xs font-semibold">Thème du carrousel</p>
                    <ThemeGallery applyCarouselTheme={p.applyCarouselTheme} themes={p.themes} />
                  </div>
                </>
              )}
              {shown === "ajouter" && (
                <AddSettings addReady={p.addReady} changeSlide={p.changeSlide} clipboard={p.clipboard} hasClip={p.hasClip} onOpenStudio={p.onOpenStudio} paste={p.paste} selectOne={selectOne} setSelected={p.setSelected} slide={slide}
                  iconPicker={<IconPicker tile={ADD_TILE} disabled={slide.locked} onPick={(name, svg) => {
                    const out = addIcon(slide, name, svg, brandInk(p.palette));
                    if (!out.id) return;
                    p.changeSlide(out.slide);
                    selectOne(out.id);
                  }} />} />
              )}
              {advanced}
            </fieldset>
          )}
        </div>
        {/* « Demander un changement à l'IA » s'affiche ici (SlideRedoDialog.tsx) : collé en bas sur ordinateur, onglet « IA » sur téléphone. */}
        <div id={SLIDE_ASK_SLOT} className={`empty:hidden md:max-h-[60%] md:shrink-0 md:overflow-y-auto md:border-t md:border-primary/25 md:bg-primary/[0.03] md:p-2.5 ${tab === "ia" ? "max-md:pt-3" : "max-md:hidden"}`} />
      </div>
    </div>
  );
}
