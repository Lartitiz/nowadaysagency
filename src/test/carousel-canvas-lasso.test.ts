// Lasso qui part d'autour de la slide (Loom du 28/11/2026).
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { lassoHits, startsOuterLasso } from "@/components/creer/CarouselEditorParts/canvas-lasso";

const rectOf = (el: HTMLElement, r: { left: number; top: number; width: number; height: number }) => {
  el.getBoundingClientRect = () =>
    ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => r }) as DOMRect;
};

describe("startsOuterLasso", () => {
  const zone = document.createElement("div");
  const slide = document.createElement("div");
  const empty = document.createElement("div");
  const button = document.createElement("button");
  const label = document.createElement("span");
  button.appendChild(label);
  zone.append(slide, empty, button);
  document.body.appendChild(zone);

  it("part du vide autour de la slide, à la souris", () => {
    expect(startsOuterLasso({ button: 0, pointerType: "mouse", target: empty }, slide)).toBe(true);
  });
  it("pas au doigt (glisser fait défiler), ni clic droit", () => {
    expect(startsOuterLasso({ button: 0, pointerType: "touch", target: empty }, slide)).toBe(false);
    expect(startsOuterLasso({ button: 2, pointerType: "mouse", target: empty }, slide)).toBe(false);
  });
  it("pas depuis un bouton (vignettes, flèches) ni depuis la slide elle-même", () => {
    expect(startsOuterLasso({ button: 0, pointerType: "mouse", target: label }, slide)).toBe(false);
    expect(startsOuterLasso({ button: 0, pointerType: "mouse", target: slide }, slide)).toBe(false);
  });
});

describe("lassoHits", () => {
  it("choisit les éléments touchés, jamais la photo plein cadre, le voile ou un élément verrouillé", () => {
    const doc = document.implementation.createHTMLDocument("slide");
    doc.body.innerHTML = `<div data-editor-id="fond">
      <div data-editor-id="titre">Titre</div>
      <div data-editor-id="texte">Texte</div>
      <div data-editor-id="loin">Loin</div>
      <div data-editor-id="verrou" data-editor-locked>Verrou</div>
      <div data-editor-id="voile" data-injected-scrim></div></div>`;
    const get = (id: string) => doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`)!;
    rectOf(get("titre"), { left: 100, top: 100, width: 400, height: 80 });
    rectOf(get("texte"), { left: 100, top: 300, width: 400, height: 80 });
    rectOf(get("loin"), { left: 100, top: 1100, width: 400, height: 80 });
    rectOf(get("verrou"), { left: 100, top: 200, width: 400, height: 80 });
    rectOf(get("fond"), { left: 0, top: 0, width: 1080, height: 1350 });
    rectOf(get("voile"), { left: 0, top: 0, width: 1080, height: 1350 });
    // Rectangle qui commence hors de la slide (coordonnées négatives) et la traverse.
    expect(lassoHits(doc, -50, -50, 600, 400)).toEqual(["titre", "texte"]);
  });
});
