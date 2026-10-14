// Lot E3-5 (14/10/2026) : onglet « Élément » du panneau de réglages (photo et
// bloc), déplacé à l'identique depuis CarouselEditor.tsx. Les valeurs de
// l'éditeur arrivent en props, sous leur nom d'origine.
import type { MutableRefObject, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { photoShapeOf, type EditorElement } from "@/lib/carousel-editor";
import { numberOr, type CanvasApi, type CanvasBox } from "@/components/creer/CarouselEditorParts/canvas-geometry";
import { PanelSection, PhotoShapePicker } from "@/components/creer/CarouselEditorParts/PanelBits";
import { range } from "@/components/creer/CarouselEditorParts/panel-controls";

/** Style de bloc tout fait (un clic au lieu de six réglages). */
export interface BlockPreset {
  label: string;
  styles: Record<string, string>;
  fill?: [string, number];
}

/** Photo choisie : affichage, cadrage, zoom, opacité, cadre, retouche. */
export function PhotoSettings({ borderControls, canvasApi, coord, css, element, filterValue, measured, setFilter, style }: {
  borderControls: ReactNode;
  canvasApi: MutableRefObject<CanvasApi | null>;
  coord: (key: "left" | "top") => number;
  css: Record<string, string>;
  element: EditorElement;
  filterValue: (name: string, fallback: number) => number;
  measured: CanvasBox | null;
  setFilter: (change: Partial<Record<"brightness" | "contrast" | "saturate", number>>) => void;
  style: (styles: Record<string, string>, key?: string) => void;
}) {
  return (
    <>
                <PanelSection title="Photo" defaultOpen>
                <label className="block text-xs">
                  Affichage de la photo
                  <select
                    aria-label="Affichage de la photo"
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={css["object-fit"] === "contain" || css["background-size"] === "contain" ? "contain" : "cover"}
                    onChange={(e) => style({
                      "object-fit": e.target.value,
                      "background-size": e.target.value,
                      "background-repeat": "no-repeat",
                      "object-position": "50% 50%",
                      "background-position": "50% 50%",
                      "--editor-zoom": "1",
                      "--editor-base-transform": "",
                      transform: "none",
                    })}
                  >
                    <option value="cover">Remplir le cadre</option>
                    <option value="contain">Voir toute la photo</option>
                  </select>
                </label>
                {range(
                  "Cadrage horizontal",
                  numberOr(
                    (
                      css["object-position"] ||
                      css["background-position"] ||
                      "50% 50%"
                    ).split(" ")[0],
                    50,
                  ),
                  0,
                  100,
                  (n) => {
                    const y =
                      (
                        css["object-position"] ||
                        css["background-position"] ||
                        "50% 50%"
                      ).split(" ")[1] || "50%";
                    style({
                      "object-position": `${n}% ${y}`,
                      "background-position": `${n}% ${y}`,
                    });
                  },
                )}
                {range(
                  "Cadrage vertical",
                  numberOr(
                    (
                      css["object-position"] ||
                      css["background-position"] ||
                      "50% 50%"
                    ).split(" ")[1],
                    50,
                  ),
                  0,
                  100,
                  (n) => {
                    const x = (
                      css["object-position"] ||
                      css["background-position"] ||
                      "50% 50%"
                    ).split(" ")[0];
                    style({
                      "object-position": `${x} ${n}%`,
                      "background-position": `${x} ${n}%`,
                    });
                  },
                )}
                {range(
                  "Zoom photo",
                  Number(css["--editor-zoom"]) || 1,
                  1,
                  3,
                  (n) => canvasApi.current?.zoomPhoto(element.id, n),
                  0.05,
                )}
                {range(
                  "Opacité photo",
                  css.opacity ? Number(css.opacity) : 1,
                  0.2,
                  1,
                  (n) => style({ opacity: String(n) }),
                  0.05,
                )}
                </PanelSection>
                <PanelSection title="Cadre de la photo">
                {measured && (measured.width < 1075 || measured.height < 1345) && (
                  <>
                        {range("Position horizontale", coord("left"), -500, 1080, (n) => style({ position: css.position || "absolute", left: `${n}px` }))}
                    {range("Position verticale", coord("top"), -500, 1350, (n) => style({ position: css.position || "absolute", top: `${n}px` }))}
                    {range("Largeur du cadre", parseFloat(css.width) || Math.round(measured.width), 60, 1080, (n) => style({ width: `${n}px` }))}
                    {range("Hauteur du cadre", parseFloat(css.height) || Math.round(measured.height), 60, 1350, (n) => style({ height: `${n}px` }))}
                  </>
                )}
                {measured && (measured.width < 1075 || measured.height < 1345) && (
                  <PhotoShapePicker current={photoShapeOf(css["border-radius"])} onPick={(radius) => style({ "border-radius": radius, overflow: "hidden" })} />
                )}
                {range("Arrondi des coins", Math.min(200, parseFloat(css["border-radius"] || css["border-top-left-radius"]) || 0), 0, 200, (n) => style({ "border-radius": `${n}px`, overflow: "hidden" }))}
                </PanelSection>
                <PanelSection title="Retouche de la photo">
                {range("Luminosité", filterValue("brightness", 1), 0.5, 1.5, (n) => setFilter({ brightness: n }), 0.05)}
                {range("Contraste", filterValue("contrast", 1), 0.5, 1.5, (n) => setFilter({ contrast: n }), 0.05)}
                {range("Saturation", filterValue("saturate", 1), 0, 2, (n) => setFilter({ saturate: n }), 0.05)}
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" aria-pressed={filterValue("saturate", 1) === 0} onClick={() => setFilter({ saturate: filterValue("saturate", 1) === 0 ? 1 : 0 })}>
                    Noir et blanc
                  </Button>
                  {css.filter && (
                    <Button size="sm" variant="ghost" onClick={() => style({ filter: "" })}>
                      Photo d’origine
                    </Button>
                  )}
                </div>
                {measured && (measured.width < 1075 || measured.height < 1345) && borderControls}
                </PanelSection>
    </>
  );
}

/** Bloc choisi (texte, forme, cadre) : position, taille, styles tout faits, bordure, ombre, rotation, fond. */
export function BlockSettings({ applyBlockPreset, blockPresets, borderControls, coord, css, element, fill, fillAlpha, fillHex, measured, rotate, rotation, style }: {
  applyBlockPreset: (preset: BlockPreset) => void;
  blockPresets: BlockPreset[];
  borderControls: ReactNode;
  coord: (key: "left" | "top") => number;
  css: Record<string, string>;
  element: EditorElement;
  fill: (hex: string, alpha: number) => unknown;
  fillAlpha: number;
  fillHex: string;
  measured: CanvasBox | null;
  rotate: (n: number) => void;
  rotation: number;
  style: (styles: Record<string, string>, key?: string) => void;
}) {
  return (
    <>
                <PanelSection title="Position et taille">
                {range(
                  "Position horizontale",
                  coord("left"),
                  -500,
                  1080,
                  (n) =>
                    style({
                      position:
                        css.position === "absolute" ? "absolute" : "relative",
                      left: `${n}px`,
                    }),
                )}
                {range(
                  "Position verticale",
                  coord("top"),
                  -500,
                  1350,
                  (n) =>
                    style({
                      position:
                        css.position === "absolute" ? "absolute" : "relative",
                      top: `${n}px`,
                    }),
                )}
                {range(
                  "Largeur du bloc",
                  parseFloat(css.width) || Math.round(measured?.width || 800),
                  60,
                  1080,
                  (n) => style({ width: `${n}px`, "max-width": "none", ...(css.right ? { right: "auto" } : {}) }),
                )}
                {element.kind === "shape" &&
                  range(
                    "Hauteur du bloc",
                    parseFloat(css[element.frame ? "min-height" : "height"]) || Math.round(measured?.height || 300),
                    40,
                    1350,
                    (n) => style({ [element.frame ? "min-height" : "height"]: `${n}px` }),
                  )}
                </PanelSection>
                <PanelSection title="Style du bloc" defaultOpen>
                {element.role !== "glass" && (
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Styles de bloc tout faits">
                    {blockPresets.map((preset) => (
                      <Button key={preset.label} size="sm" variant="outline" className="h-7 text-2xs" onClick={() => applyBlockPreset(preset)}>
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                )}
                <details className="space-y-3 text-xs">
                  <summary className="cursor-pointer py-1 font-medium">Personnaliser (bordure, ombre, fond, rotation)</summary>
                  <div className="space-y-3 pt-2">
                {range("Arrondi des coins", parseFloat(css["border-radius"] || css["border-top-left-radius"]) || 0, 0, 200, (n) => style({ "border-radius": `${n}px` }))}
                {borderControls}
                {element.role !== "glass" && range("Rotation", rotation, -180, 180, rotate)}
                {!!rotation && (
                  <p className="text-2xs text-muted-foreground">
                    La rotation apparaît sur l’image publiée ; dans l’export PowerPoint, un texte tourné reste droit.
                  </p>
                )}
                <label className="flex items-center justify-between text-xs">
                  Fond du bloc
                  <input
                    aria-label="Fond du bloc"
                    type="color"
                    value={fillHex}
                    onChange={(e) => fill(e.target.value, fillAlpha || 1)}
                  />
                </label>
                {range(
                  "Opacité du fond",
                  fillAlpha,
                  0,
                  1,
                  (n) => fill(fillHex, n),
                  0.05,
                )}
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" onClick={() => fill(fillHex, 0)}>
                    Fond transparent
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-pressed={css["z-index"] === "30"}
                    onClick={() =>
                      style(
                        css["z-index"] === "30"
                          ? { "z-index": "" }
                          : { "z-index": "30", ...(css.position ? {} : { position: "relative" }) },
                      )
                    }
                  >
                    {css["z-index"] === "30" ? "Remettre à sa place" : "Premier plan"}
                  </Button>
                </div>
                  </div>
                </details>
                </PanelSection>
    </>
  );
}
