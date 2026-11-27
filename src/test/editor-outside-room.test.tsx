import { afterEach, describe, expect, it } from "vitest";
import { outsideRoom } from "@/components/creer/CarouselEditorParts/EditorLayout";

function el(html: string, rect: Partial<DOMRect>): HTMLElement {
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  const node = wrap.firstElementChild as HTMLElement;
  node.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...rect }) as DOMRect;
  document.body.appendChild(node);
  return node;
}

describe("outsideRoom : place de la barre d'outils hors de la slide", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("la place du dessous s'arrête aux vignettes (27/11/2026 : la barre d'une photo les recouvrait)", () => {
    const slide = el("<div></div>", { top: 110, bottom: 557 });
    el('<div data-testid="result-actions"></div>', { top: 660, bottom: 720, height: 60 });
    // Comme dans SlideStrip : la liste est en `display: contents`, son rectangle est vide.
    const list = el('<div class="contents" aria-label="Slides du carrousel"></div>', {});
    for (const top of [565, 565]) {
      const b = document.createElement("button");
      b.getBoundingClientRect = () => ({ top, bottom: top + 70, left: 0, right: 0, width: 50, height: 70, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
      list.appendChild(b);
    }
    expect(outsideRoom(slide).below).toBe(8);
  });

  it("sans vignettes dessous, la place va jusqu'à la barre « Publier »", () => {
    const slide = el("<div></div>", { top: 110, bottom: 557 });
    el('<div data-testid="result-actions"></div>', { top: 660, bottom: 720, height: 60 });
    const list = el('<div class="contents" aria-label="Slides du carrousel"></div>', {});
    const b = document.createElement("button"); // vignette à côté de la slide, pas dessous
    b.getBoundingClientRect = () => ({ top: 120, bottom: 190, left: 0, right: 0, width: 50, height: 70, x: 0, y: 120, toJSON: () => ({}) }) as DOMRect;
    list.appendChild(b);
    expect(outsideRoom(slide).below).toBe(103);
  });
});
