// Lot E3-5 (14/10/2026) : onglet « Élément » du panneau de réglages (texte,
// photo, bloc), déplacé à l'identique depuis CarouselEditor.tsx. Les valeurs
// de l'éditeur arrivent en props, sous leur nom d'origine ; l'état tapé (recherche
// de police) reste dans CarouselEditor pour survivre au changement d'onglet.
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlignCenter, AlignLeft, AlignRight, ChevronDown } from "lucide-react";
import { GOOGLE_FONTS, googleFontUrl, listDocumentFonts, patchElement, setEmphasis, type EditorElement, type EditorSlide } from "@/lib/carousel-editor";
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
                  <Popover onOpenChange={(open) => {
                    // Aperçu : les polices Google se chargent dans la page à l'ouverture.
                    if (!open || window.document.querySelector("link[data-font-preview]")) return;
                    const link = window.document.createElement("link");
                    link.rel = "stylesheet";
                    link.href = googleFontUrl(GOOGLE_FONTS.map((f) => f.family));
                    link.setAttribute("data-font-preview", "true");
                    window.document.head.append(link);
                  }}>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="outline" aria-label="Choisir une police" className="h-8 w-full justify-between font-normal">
                        <span className="truncate" style={{ fontFamily: css["font-family"] || undefined }}>
                          {(css["font-family"] || "").split(",")[0].replace(/['"]/g, "").trim() || "Police du thème"}
                        </span>
                        <ChevronDown size={14} aria-hidden="true" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-2">
                      <input
                        aria-label="Chercher une police"
                        placeholder="Chercher (ex. Playfair)"
                        value={fontQuery}
                        onChange={(e) => setFontQuery(e.target.value)}
                        className="mb-2 w-full rounded border bg-background px-2 py-1 text-xs"
                      />
                      <div className="max-h-72 space-y-0.5 overflow-auto" role="listbox" aria-label="Polices">
                        {[
                          ...documentFonts.map((f) => ({ label: f.label, value: f.value, family: undefined as string | undefined, tag: "Ton carrousel" })),
                          ...["Arial, sans-serif", "Georgia, serif", "Verdana, sans-serif", "Trebuchet MS, sans-serif"].map((f) => ({ label: f.split(",")[0], value: f, family: undefined as string | undefined, tag: "Classique" })),
                          ...GOOGLE_FONTS.map((f) => ({
                            label: f.family,
                            value: `'${f.family}', ${f.kind === "serif" ? "serif" : f.kind === "script" ? "cursive" : "sans-serif"}`,
                            family: f.family as string | undefined,
                            tag: { serif: "Serif", sans: "Sans", display: "Affiche", script: "Manuscrite" }[f.kind],
                          })),
                        ]
                          .filter((f) => f.label.toLowerCase().includes(fontQuery.toLowerCase()))
                          .map((f) => (
                            <button
                              key={`${f.tag}-${f.value}`}
                              type="button"
                              role="option"
                              aria-selected={(css["font-family"] || "") === f.value || (!!f.family && (css["font-family"] || "").includes(f.family))}
                              onClick={() => pickFont(f.value, f.family)}
                              className="flex w-full items-baseline justify-between rounded px-2 py-1.5 text-left hover:bg-muted aria-selected:bg-primary/10"
                            >
                              <span style={{ fontFamily: f.value, fontSize: 18 }}>{f.label}</span>
                              <span className="text-2xs text-muted-foreground">{f.tag}</span>
                            </button>
                          ))}
                      </div>
                    </PopoverContent>
                  </Popover>
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
