// Lot E3-6 (14/10/2026) : « Toutes les slides » (reporter un élément) et
// « Mes styles » (enregistrer, réappliquer), déplacés à l'identique depuis
// CarouselEditor.tsx. Le nom tapé d'un style reste dans CarouselEditor.
import { Button } from "@/components/ui/button";
import { Bookmark, X } from "lucide-react";
import type { CarouselStylesApi, SavedCarouselStyle } from "@/hooks/use-carousel-styles";
import { ensureFontLink, GOOGLE_FONTS, restyleSlide, type CarouselDocument, type EditorElement } from "@/lib/carousel-editor";
import { PanelSection } from "@/components/creer/CarouselEditorParts/PanelBits";

/** Reporter l'élément choisi (police, couleur, style, position) sur les autres slides. */
export function AllSlidesPanel({ applyAll, commit, css, document, element }: {
  applyAll: (what: { style?: boolean; position?: boolean }) => void;
  commit: (next: CarouselDocument, key?: string) => void;
  css: Record<string, string>;
  document: CarouselDocument;
  element: EditorElement;
}) {
  return (
            <PanelSection title="Toutes les slides">
            {element?.kind === "text" && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  commit({
                    ...document,
                    slides: document.slides.map((s) => {
                      const restyled = restyleSlide(
                        s,
                        Object.fromEntries(
                          ["font-family", "color"]
                            .filter((k) => css[k])
                            .map((k) => [k, css[k]]),
                        ),
                        "texts",
                      );
                      // Une police Google suit sur chaque slide (aperçu et export).
                      const google = GOOGLE_FONTS.find((f) => (css["font-family"] || "").includes(f.family));
                      return google ? ensureFontLink(restyled, google.family) : restyled;
                    }),
                  })
                }
              >
                Police et couleur sur toutes les slides
              </Button>
            )}
            {document.slides.length > 1 && (
              <label className="block text-xs">
                Appliquer à toutes les slides
                <select
                  aria-label="Appliquer à toutes les slides"
                  className="mt-1 w-full rounded border bg-background p-2"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) applyAll({ style: v !== "position", position: v !== "style" });
                  }}
                >
                  <option value="">Reporter cet élément sur les autres slides…</option>
                  <option value="style">Son style (police, taille, couleurs)</option>
                  <option value="position">Sa position et sa largeur</option>
                  <option value="both">Son style et sa position</option>
                </select>
              </label>
            )}
            </PanelSection>
  );
}

/** « Mes styles » : styles enregistrés pour ce type d'élément, à réappliquer ou supprimer. */
export function SavedStylesPanel({ applySaved, element, saveStyle, savedStyles, setStyleName, styleKind, styleName }: {
  applySaved: (saved: SavedCarouselStyle) => void;
  element: EditorElement;
  saveStyle: () => unknown;
  savedStyles: CarouselStylesApi;
  setStyleName: (name: string) => void;
  styleKind: (e: EditorElement) => SavedCarouselStyle["kind"];
  styleName: string;
}) {
  return (
              <div className="space-y-2 rounded-lg border p-2" aria-label="Mes styles">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <Bookmark size={13} /> Mes styles
                </p>
                {savedStyles.list.filter((st) => st.kind === styleKind(element)).length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {savedStyles.list
                      .filter((st) => st.kind === styleKind(element))
                      .map((st) => (
                        <span key={st.id} className="inline-flex items-center rounded-full border bg-background text-2xs">
                          <button
                            type="button"
                            className="flex items-center gap-1 py-1 pl-2 pr-1 hover:text-primary"
                            title="Appliquer ce style"
                            onClick={() => applySaved(st)}
                          >
                            {st.styles.color || st.styles["background-color"] ? (
                              <span className="h-3 w-3 rounded-full border" style={{ background: st.styles.color || st.styles["background-color"] }} />
                            ) : null}
                            {st.name}
                          </button>
                          <button
                            type="button"
                            aria-label={`Supprimer le style ${st.name}`}
                            className="rounded-full p-1 text-muted-foreground hover:text-destructive"
                            onClick={() => savedStyles.remove(st.id)}
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                  </div>
                ) : (
                  <p className="text-2xs text-muted-foreground">
                    Enregistre le style de cet élément pour le réappliquer d’un clic dans tes prochains carrousels.
                  </p>
                )}
                <div className="flex gap-1">
                  <input
                    aria-label="Nom du style"
                    placeholder="Nom (ex. Titre rose)"
                    value={styleName}
                    maxLength={60}
                    onChange={(e) => setStyleName(e.target.value)}
                    className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs"
                  />
                  <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={saveStyle}>
                    Enregistrer ce style
                  </Button>
                </div>
              </div>
  );
}
