// Lot E3-5 (14/10/2026) : onglet « Élément » du panneau de réglages (texte,
// photo, bloc), déplacé à l'identique depuis CarouselEditor.tsx. Les valeurs
// de l'éditeur arrivent en props, sous leur nom d'origine ; l'état tapé (recherche
// de police) reste dans CarouselEditor pour survivre au changement d'onglet.
import { Textarea } from "@/components/ui/textarea";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { listDocumentFonts, patchElement, setEmphasis, type EditorElement, type EditorSlide } from "@/lib/carousel-editor";
import { FontPicker } from "@/components/creer/CarouselEditorParts/FontPicker";
import { PanelSection } from "@/components/creer/CarouselEditorParts/PanelBits";
import { range, toHex } from "@/components/creer/CarouselEditorParts/panel-controls";

/** Texte choisi : contenu, taille, police, couleur, alignement, typographie avancée, phrase mise en valeur. */
export function TextSettings({ changeSlide, css, documentFonts, element, fontQuery, pickFont, setFitId, setFontQuery, slide, style, textShadowOn }: {
  changeSlide: (next: EditorSlide, key?: string) => void;
  css: Record<string, string>;
  documentFonts: ReturnType<typeof listDocumentFonts>;
  element: EditorElement;
  fontQuery: string;
  pickFont: (value: string, family?: string) => void;
  setFitId: (id: string | null) => void;
  setFontQuery: (query: string) => void;
  slide: EditorSlide;
  style: (styles: Record<string, string>, key?: string) => void;
  textShadowOn: boolean;
}) {
  return (
    <>
                <PanelSection title="Texte" defaultOpen>
                <Textarea
                  aria-label="Texte sélectionné"
                  value={element.text}
                  rows={3}
                  onChange={(e) => {
                    setFitId(element.id);
                    changeSlide(
                      patchElement(slide, element.id, { text: e.target.value }),
                      `text-${slide.id}-${element.id}`,
                    );
                  }}
                />
                {range(
                  "Taille du texte",
                  parseFloat(css["font-size"]) || 40,
                  18,
                  160,
                  (n) => style({ "font-size": `${n}px` }, "font"),
                )}
                <div className="space-y-1 text-xs">
                  <span>Police</span>
                  <FontPicker css={css} documentFonts={documentFonts} fontQuery={fontQuery} pickFont={pickFont} setFontQuery={setFontQuery} />
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <label className="flex items-center gap-2">
                    Couleur
                    <input
                      aria-label="Couleur du texte"
                      type="color"
                      value={toHex(css.color, "#222222")}
                      onChange={(e) => style({ color: e.target.value })}
                    />
                  </label>
                  <div role="group" aria-label="Alignement du texte" className="flex gap-0.5">
                    {([
                      ["left", AlignLeft, "Aligné à gauche"],
                      ["center", AlignCenter, "Centré"],
                      ["right", AlignRight, "Aligné à droite"],
                    ] as const).map(([value, Icon, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-label={label}
                        title={label}
                        aria-pressed={(css["text-align"] || "left") === value}
                        onClick={() => style({ "text-align": value })}
                        className="rounded p-1.5 hover:bg-muted aria-pressed:bg-primary/15"
                      >
                        <Icon size={14} />
                      </button>
                    ))}
                  </div>
                </div>
                </PanelSection>
                <PanelSection title="Typographie avancée">
                {range(
                  "Interligne",
                  parseFloat(css["line-height"]) < 3
                    ? parseFloat(css["line-height"]) || 1.3
                    : 1.3,
                  1,
                  2,
                  (n) => style({ "line-height": String(n) }),
                  0.1,
                )}
                <label className="block text-xs">
                  Graisse
                  <select
                    aria-label="Graisse"
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={String(parseInt(css["font-weight"], 10) || 400)}
                    onChange={(e) => style({ "font-weight": e.target.value })}
                  >
                    {[["300", "Fine"], ["400", "Normale"], ["500", "Moyenne"], ["600", "Demi-grasse"], ["700", "Grasse"], ["800", "Extra-grasse"]].map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </label>
                {range(
                  "Espacement des lettres",
                  parseFloat(css["letter-spacing"]) || 0,
                  -5,
                  30,
                  (n) => style({ "letter-spacing": n ? `${n}px` : "" }, "spacing"),
                  0.5,
                )}
                <label className="block text-xs">
                  Casse
                  <select
                    aria-label="Casse"
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={css["text-transform"] || "none"}
                    onChange={(e) => style({ "text-transform": e.target.value === "none" ? "" : e.target.value })}
                  >
                    <option value="none">Comme écrit</option>
                    <option value="uppercase">MAJUSCULES</option>
                    <option value="lowercase">minuscules</option>
                    <option value="capitalize">Capitales Initiales</option>
                  </select>
                </label>
                <label className="flex items-center justify-between text-xs">
                  Ombre du texte
                  <input
                    aria-label="Ombre du texte"
                    type="checkbox"
                    checked={textShadowOn}
                    onChange={(e) => style({ "text-shadow": e.target.checked ? "0 2px 10px rgba(0,0,0,0.45)" : "none" })}
                  />
                </label>
                </PanelSection>
                {element.emphasis && !!element.emphasis.choices.length && (
                  <PanelSection title="Phrase mise en valeur" defaultOpen>
                    <label className="block text-xs">
                      Phrase mise en valeur
                      <select
                        aria-label="Phrase mise en valeur"
                        className="mt-1 w-full rounded border bg-background p-2"
                        value={element.emphasis.choices.includes(element.emphasis.sentence) ? element.emphasis.sentence : ""}
                        onChange={(e) => e.target.value && changeSlide(setEmphasis(slide, element.id, { sentence: e.target.value }))}
                      >
                        {!element.emphasis.choices.includes(element.emphasis.sentence) && (
                          <option value="">{element.emphasis.sentence ? "Extrait actuel" : "Choisir une phrase…"}</option>
                        )}
                        {element.emphasis.choices.map((c) => (
                          <option key={c} value={c}>
                            {c.length > 60 ? `${c.slice(0, 60)}…` : c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center justify-between text-xs">
                      Couleur de la phrase mise en valeur
                      <input
                        aria-label="Couleur de la phrase mise en valeur"
                        type="color"
                        value={toHex(element.emphasis.color, toHex(css.color, "#222222"))}
                        onChange={(e) =>
                          changeSlide(
                            setEmphasis(slide, element.id, { color: e.target.value }),
                            `${slide.id}-${element.id}-emphasis`,
                          )
                        }
                      />
                    </label>
                  </PanelSection>
                )}
    </>
  );
}
