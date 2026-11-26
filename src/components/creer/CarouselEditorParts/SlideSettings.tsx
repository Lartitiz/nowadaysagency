// Lot E3-4 (14/10/2026) : réglages de la slide (ajouter, mise en page, thèmes).
// Panneau à onglets (26/11/2026, maquette validée par Laetitia) : « Ajouter » et
// « Mise en page » sont deux onglets, en tuiles et en images (avant : des listes
// de boutons et deux listes déroulantes dans l'onglet « Slide » de « Plus d'outils »).
import type { MutableRefObject, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ImagePlus, Info, Shapes, Type } from "lucide-react";
import { addPhotoFrame, addShapeElement, addTextElement, carouselThemes, positionPhotoText, PRESETS, type ClipboardElement, type EditorSlide, type LayoutVariant, type PresetKind } from "@/lib/carousel-editor";
import { SlideThumb } from "@/components/creer/CarouselEditorParts/PanelBits";

/** Tuile de l'onglet « Ajouter » (aussi pour « Ajouter une icône »). */
export const ADD_TILE = "flex h-16 flex-col items-center justify-center gap-1 rounded-xl border bg-background text-xs font-medium hover:border-primary disabled:opacity-50";

/** Onglet « Ajouter » (26/11/2026, maquette validée par Laetitia) : chaque ajout en tuile, les éléments tout faits visibles d'un coup d'œil. */
export function AddSettings({ addReady, changeSlide, clipboard, hasClip, iconPicker, onOpenStudio, paste, selectOne, setSelected, slide }: {
  addReady: (kind: PresetKind) => void;
  changeSlide: (next: EditorSlide, key?: string) => void;
  clipboard: MutableRefObject<{ from: string; items: ClipboardElement[] }>;
  hasClip: boolean;
  iconPicker: ReactNode;
  onOpenStudio?: (slideId: string) => void;
  paste: () => void;
  selectOne: (id: string | null) => void;
  setSelected: (id: string | null) => void;
  slide: EditorSlide;
}) {
  const tile = ADD_TILE;
  return (
    <div className="space-y-3" data-testid="panel-add">
      <div>
        <h3 className="text-sm font-semibold">Ajouter sur la slide</h3>
        <p className="text-2xs text-muted-foreground">L'élément se pose sur la slide : glisse-le ensuite où tu veux.</p>
      </div>
      {hasClip && (
        <Button variant="outline" size="sm" className="w-full" onClick={paste} title="⌘/Ctrl + V">
          Coller {clipboard.current.items.length > 1 ? `les ${clipboard.current.items.length} éléments copiés` : "l’élément copié"}
        </Button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={tile} onClick={() => changeSlide(addTextElement(slide))}>
          <Type size={18} aria-hidden="true" /> Ajouter un texte
        </button>
        <button type="button" className={tile} onClick={() => {
          const out = addPhotoFrame(slide);
          if (!out.id) return;
          changeSlide(out.slide);
          selectOne(out.id);
        }}>
          <ImagePlus size={18} aria-hidden="true" /> Ajouter un cadre photo
        </button>
        <button type="button" className={tile} onClick={() => {
          const out = addShapeElement(slide);
          if (!out.id) return;
          changeSlide(out.slide);
          setSelected(out.id);
        }}>
          <Shapes size={18} aria-hidden="true" /> Ajouter une forme
        </button>
        {iconPicker}
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold">Éléments tout faits</p>
        <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Ajouter un élément tout fait">
          {PRESETS.map((p) => (
            <button key={p.kind} type="button" aria-label={`Ajouter : ${p.label}`} title={p.label} onClick={() => addReady(p.kind)}
              className="flex h-12 flex-col items-center justify-center rounded-lg border bg-background px-0.5 text-center text-[10px] leading-tight text-muted-foreground hover:border-primary hover:text-foreground">
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {onOpenStudio && <Button variant="outline" size="sm" className="w-full" disabled={slide.locked} onClick={() => onOpenStudio(slide.id)}>Créer / remplacer avec le Studio</Button>}
    </div>
  );
}

/** Onglet « Mise en page » : les mises en page en images, et la place du texte sur une photo. */
export function LayoutSettings({ changeLayout, changeSlide, layoutPreviews, slide }: {
  changeLayout: (variant: LayoutVariant) => void;
  changeSlide: (next: EditorSlide, key?: string) => void;
  layoutPreviews: { variant: LayoutVariant; label: string; preview: { html: string } }[];
  slide: EditorSlide;
}) {
  const position = slide.data.overlay_position === "center" ? "center" : String(slide.data.overlay_position || "").startsWith("top") ? "top_left" : "bottom_left";
  return (
    <div className="space-y-3" data-testid="panel-layout">
      <h3 className="text-sm font-semibold">Mise en page de la slide</h3>
      <LayoutGallery changeLayout={changeLayout} layoutPreviews={layoutPreviews} slide={slide} />
      {slide.html.includes("data-photo-text-layout") && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold">Texte sur la photo</p>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Texte sur la photo">
            {([["top_left", "En haut"], ["bottom_left", "En bas"], ["center", "Au centre"]] as const).map(([value, label]) => (
              <Button key={value} size="sm" variant="outline" className="h-8 px-1 text-xs aria-pressed:border-primary aria-pressed:bg-primary/10" aria-pressed={position === value} onClick={() => changeSlide(positionPhotoText(slide, value))}>
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Chantier AB (18/10/2026) : galeries partagées par « Plus d'outils » et le mode
// simple (boutons « Mise en page » et « Thème du carrousel »), sans copie.

/** Les mises en page de la slide (0 crédit) : textes, photo et couleurs gardés. */
export function LayoutGallery({ changeLayout, layoutPreviews, slide }: {
  changeLayout: (variant: LayoutVariant) => void;
  layoutPreviews: { variant: LayoutVariant; label: string; preview: { html: string } }[];
  slide: EditorSlide;
}) {
  return (
    <>
      {/* Deux colonnes (26/11/2026) : à 84 px de large, le texte des aperçus était illisible. */}
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Mises en page">
        {layoutPreviews.map((l) => (
          <button
            key={l.variant}
            type="button"
            disabled={slide.locked}
            onClick={() => changeLayout(l.variant)}
            className={`min-w-0 rounded-lg border p-1 text-center text-2xs hover:border-primary disabled:opacity-50 ${slide.data.layout_variant === l.variant ? "border-primary ring-1 ring-primary" : ""}`}
            aria-label={`Mise en page ${l.label}`}
          >
            <SlideThumb html={l.preview.html} width="fill" />
            <span className="mt-0.5 block text-xs leading-tight">{l.label}</span>
          </button>
        ))}
      </div>
      <p className="flex items-center gap-1 text-2xs text-muted-foreground">
        Textes, photo et couleurs gardés.
        <Info size={12} aria-label="Tous les textes, la photo et les couleurs sont gardés ; les formes et décors ajoutés à la main ne le sont pas. Tu peux annuler." role="img">
          <title>Tous les textes, la photo et les couleurs sont gardés ; les formes et décors ajoutés à la main ne le sont pas. Tu peux annuler.</title>
        </Info>
      </p>
    </>
  );
}

/** Les thèmes appliqués à toutes les slides (sauf photo et verrouillées). */
export function ThemeGallery({ applyCarouselTheme, themes }: {
  applyCarouselTheme: (themeId: string) => void;
  themes: ReturnType<typeof carouselThemes>;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Thèmes">
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => applyCarouselTheme(t.id)}
            className="flex items-center gap-2 rounded-lg border p-2 text-left text-xs hover:border-primary"
            aria-label={`Appliquer le thème ${t.label}`}
          >
            <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-md border" style={{ background: t.background }}>
              <span style={{ color: t.heading, fontWeight: 700, lineHeight: 1 }}>Aa</span>
              <span className="mt-0.5 h-1 w-5 rounded" style={{ background: t.text }} />
            </span>
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-2xs text-muted-foreground">Change toutes les slides (sauf les slides photo).</p>
    </>
  );
}
