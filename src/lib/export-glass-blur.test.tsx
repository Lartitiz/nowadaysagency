// Verre dépoli : la copie floutée par CSS doit être remplacée avant capture
// (html2canvas-pro ignore filter:blur). jsdom n'a pas de canvas : on vérifie
// que l'export ne casse jamais et que les slides sans verre sont intactes.
import { describe, expect, it } from "vitest";
import { bakeGlassBlur } from "./export-glass-blur";

describe("bakeGlassBlur", () => {
  it("ne touche à rien sans verre dépoli", async () => {
    document.body.innerHTML = `<div data-pptx-photo="1" style="background-image:url(data:image/png;base64,AAAA)"></div>`;
    expect(await bakeGlassBlur(document.body, 50)).toBe(0);
    expect(document.body.innerHTML).toContain('data-pptx-photo="1"');
  });

  it("ne bloque jamais l'export si l'image ne se charge pas : la copie reste en place", async () => {
    document.body.innerHTML = `<div data-photo-glass-blur="1" style="background-image:url(https://invalid.test/x.jpg);filter:blur(28px)"></div>`;
    expect(await bakeGlassBlur(document.body, 50)).toBe(0);
    const el = document.querySelector<HTMLElement>("[data-photo-glass-blur]")!;
    expect(el.style.filter).toBe("blur(28px)");
  });
});
