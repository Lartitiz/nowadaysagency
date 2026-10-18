// Lot E3-4 (14/10/2026) : onglets « Slide » et « Carrousel » du panneau de
// réglages, déplacés à l'identique depuis CarouselEditor.tsx (les valeurs de
// l'éditeur arrivent en props, sous leur nom d'origine).
import type { MutableRefObject } from "react";
import { Button } from "@/components/ui/button";
import { ImagePlus, Info } from "lucide-react";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import { addPhotoFrame, addShapeElement, addTextElement, carouselThemes, positionPhotoText, PRESETS, restyleSlide, type ClipboardElement, type EditorSlide, type LayoutVariant, type PresetKind } from "@/lib/carousel-editor";
import { PanelSection, SlideThumb } from "@/components/creer/CarouselEditorParts/PanelBits";
import { toHex } from "@/components/creer/CarouselEditorParts/panel-controls";

/** Onglet « Slide » : ajouter un élément, mise en page, texte sur la photo, fond. */
export function SlideTabSettings({ addReady, changeLayout, changeSlide, clipboard, hasClip, layoutPreviews, onAddPhoto, onOpenStudio, paste, selectOne, setPhotoOpen, setSelected, slide }: {
  addReady: (kind: PresetKind) => void;
  changeLayout: (variant: LayoutVariant) => void;
  changeSlide: (next: EditorSlide, key?: string) => void;
  clipboard: MutableRefObject<{ from: string; items: ClipboardElement[] }>;
  hasClip: boolean;
  layoutPreviews: { variant: LayoutVariant; label: string; preview: { html: string } }[];
  onAddPhoto?: (photo: PhotoItem) => number;
  onOpenStudio?: (slideId: string) => void;
  paste: () => void;
  selectOne: (id: string | null) => void;
  setPhotoOpen: (open: boolean) => void;
  setSelected: (id: string | null) => void;
  slide: EditorSlide;
}) {
  return (
    <>
            <PanelSection title="Ajouter" defaultOpen>
            <div className="grid grid-cols-2 gap-2">
              {hasClip && (
                <Button
                  variant="outline"
                  size="sm"
                  className="col-span-2"
                  onClick={paste}
                  title="⌘/Ctrl + V"
                >
                  Coller {clipboard.current.items.length > 1 ? `les ${clipboard.current.items.length} éléments copiés` : "l’élément copié"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => changeSlide(addTextElement(slide))}
              >
                Ajouter un texte
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const out = addShapeElement(slide);
                  if (!out.id) return;
                  changeSlide(out.slide);
                  setSelected(out.id);
                }}
              >
                Ajouter une forme
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="col-span-2"
                onClick={() => {
                  const out = addPhotoFrame(slide);
                  if (!out.id) return;
                  changeSlide(out.slide);
                  selectOne(out.id);
                }}
              >
                <ImagePlus size={14} className="mr-1" />
                Ajouter un cadre photo
              </Button>
            </div>
            <label className="block text-xs">
              Ajouter un élément tout fait
              <select
                aria-label="Ajouter un élément tout fait"
                className="mt-1 w-full rounded border bg-background p-2"
                value=""
                onChange={(e) => e.target.value && addReady(e.target.value as PresetKind)}
              >
                <option value="">Flèche, numéro, pastille, ligne…</option>
                {PRESETS.map((p) => (
                  <option key={p.kind} value={p.kind}>{p.label}</option>
                ))}
              </select>
            </label>
            {onOpenStudio && <Button variant="outline" size="sm" className="w-full" disabled={slide.locked} onClick={() => onOpenStudio(slide.id)}>Créer / remplacer avec le Studio</Button>}
            {onAddPhoto && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setPhotoOpen(true)}
              >
                <ImagePlus size={14} className="mr-1" />
                Ajouter / changer la photo
              </Button>
            )}
            </PanelSection>
            <PanelSection title="Mise en page de la slide" defaultOpen>
            <LayoutGallery changeLayout={changeLayout} layoutPreviews={layoutPreviews} slide={slide} />
            {slide.html.includes("data-photo-text-layout") && (
              <label className="block text-xs">
                Texte sur la photo
                <select
                  aria-label="Texte sur la photo"
                  className="mt-1 w-full rounded border bg-background p-2"
                  value={slide.data.overlay_position === "center" ? "center" : String(slide.data.overlay_position || "").startsWith("top") ? "top_left" : "bottom_left"}
                  onChange={(e) => changeSlide(positionPhotoText(slide, e.target.value as "top_left" | "bottom_left" | "center"))}
                >
                  <option value="top_left">En haut</option>
                  <option value="bottom_left">En bas</option>
                  <option value="center">Au centre</option>
                </select>
              </label>
            )}
            <label className="flex items-center justify-between text-xs">
              Fond de la slide
              <input
                aria-label="Fond de la slide"
                type="color"
                value={toHex(
                  (
                    new DOMParser().parseFromString(slide.html, "text/html")
                      .body.firstElementChild as HTMLElement
                  )?.style.backgroundColor,
                  "#faf7f2",
                )}
                onChange={(e) =>
                  changeSlide(
                    restyleSlide(slide, { "background-color": e.target.value }),
                    `background-${slide.id}`,
                  )
                }
              />
            </label>
            </PanelSection>
    </>
  );
}

/** Onglet « Carrousel » : thèmes appliqués à toutes les slides. */
export function CarouselThemeSettings({ applyCarouselTheme, themes }: {
  applyCarouselTheme: (themeId: string) => void;
  themes: ReturnType<typeof carouselThemes>;
}) {
  return (
    <>
            <PanelSection title="Thème du carrousel" defaultOpen>
              <ThemeGallery applyCarouselTheme={applyCarouselTheme} themes={themes} />
            </PanelSection>
    </>
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
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Mises en page">
        {layoutPreviews.map((l) => (
          <button
            key={l.variant}
            type="button"
            disabled={slide.locked}
            onClick={() => changeLayout(l.variant)}
            className={`rounded-lg border p-1 text-center text-2xs hover:border-primary disabled:opacity-50 ${slide.data.layout_variant === l.variant ? "border-primary ring-1 ring-primary" : ""}`}
            aria-label={`Mise en page ${l.label}`}
          >
            <SlideThumb html={l.preview.html} />
            <span className="mt-0.5 block leading-tight">{l.label}</span>
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
