// La barre flottante ne doit jamais cacher le texte qu'on modifie (03/10/2026).
import { describe, expect, it } from "vitest";
import { placeToolbar } from "@/lib/carousel-editor";

const canvas = { width: 540, height: 675 };
const bar = { width: 500, height: 96 }; // barre sur deux lignes

describe("floating toolbar placement", () => {
  it("goes above the element when its real height fits there", () => {
    const pos = placeToolbar({ left: 40, top: 300, width: 400, height: 120 }, bar, canvas);
    expect(pos.top + bar.height).toBeLessThanOrEqual(300);
  });

  it("goes below when a two-line bar would not fit above", () => {
    // 60 px au-dessus : une barre de 48 px tenait, celle de 96 px non.
    const box = { left: 40, top: 60, width: 400, height: 200 };
    const pos = placeToolbar(box, bar, canvas);
    expect(pos.top).toBeGreaterThanOrEqual(box.top + box.height);
  });

  it("moves below as the text above grows upward out of room", () => {
    const short = placeToolbar({ left: 40, top: 200, width: 400, height: 80 }, bar, canvas);
    const grown = placeToolbar({ left: 40, top: 90, width: 400, height: 190 }, bar, canvas);
    expect(short.top + bar.height).toBeLessThanOrEqual(200);
    expect(grown.top).toBeGreaterThanOrEqual(280);
  });

  it("sticks to the freest edge when the text fills the slide", () => {
    // Plus de place libre au-dessus (80 px) qu'en dessous (35 px) : en haut.
    const low = placeToolbar({ left: 0, top: 80, width: 540, height: 560 }, bar, canvas);
    expect(low.top).toBe(4);
    // Plus de place en dessous (95 px) qu'au-dessus (20 px) : en bas.
    const high = placeToolbar({ left: 0, top: 20, width: 540, height: 560 }, bar, canvas);
    expect(high.top).toBe(675 - 96 - 4);
    const highest = placeToolbar({ left: 0, top: 60, width: 540, height: 610 }, bar, canvas);
    expect(highest.top).toBe(4);
  });

  it("stays inside the slide horizontally with its real width", () => {
    const pos = placeToolbar({ left: 300, top: 400, width: 200, height: 50 }, bar, canvas);
    expect(pos.left + bar.width).toBeLessThanOrEqual(canvas.width - 4);
  });
});
