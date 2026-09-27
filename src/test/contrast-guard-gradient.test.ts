import { describe, expect, it } from "vitest";
import { enforceTextContrast } from "../../supabase/functions/_shared/contrast-guard";

// Contraste WCAG entre deux hex 6.
function lum(hex: string) {
  const c = [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const colorOf = (html: string) => html.match(/data-pptx-editable="caption" style="[^"]*?(?<![a-z-])color:(#[0-9A-Fa-f]{6})/)![1];

// Visite du 26/09/2026, slide 7 du carrousel hybride (gabarit « split ») :
// légende #FFECF0 posée sur le haut CLAIR d'une bande terracotta dégradée.
const splitSlide = (top: string, bottom: string) =>
  `<div style="background:#FFFFFF;width:1080px;height:1350px;position:relative">` +
  `<div style="position:absolute;left:0;top:0;width:475px;height:1350px;background:linear-gradient(180deg,${top} 0%,${bottom} 100%)">` +
  `<span data-pptx-editable="caption" style="position:absolute;left:40px;top:60px;font-size:32px;color:#FFECF0">savons en séchage</span>` +
  `</div>` +
  `<p data-pptx-editable="body" style="position:absolute;left:560px;top:390px;color:#1C1C20">Texte principal</p>` +
  `</div>`;

describe("garde de contraste — légende sur fond dégradé (gabarit split)", () => {
  it("reproduit le bug : avant, la légende est à ~2,4:1 sur le haut clair", () => {
    expect(ratio("#FFECF0", "#D98A6A")).toBeLessThan(3);
  });

  it("réécrit la légende pour tenir ≥ 3:1 sur TOUT le dégradé", () => {
    const { html, fixes } = enforceTextContrast(splitSlide("#D98A6A", "#A0522D"));
    expect(fixes).toBe(1);
    const c = colorOf(html);
    expect(ratio(c, "#D98A6A")).toBeGreaterThanOrEqual(3);
    expect(ratio(c, "#A0522D")).toBeGreaterThanOrEqual(3);
    // Le texte principal (foncé sur blanc) n'est pas touché.
    expect(html).toContain('data-pptx-editable="body" style="position:absolute;left:560px;top:390px;color:#1C1C20"');
  });

  it("dégradé trop étendu (clair ET sombre) : cartouche uni derrière la légende", () => {
    const { html, fixes } = enforceTextContrast(splitSlide("#D4876A", "#8E3B20"));
    expect(fixes).toBe(1);
    const tag = html.match(/<span data-pptx-editable="caption" style="([^"]*)"/)![1];
    const text = tag.match(/(?<![a-z-])color:(#[0-9A-Fa-f]{6})/)![1];
    const backing = tag.match(/background-color:(#[0-9A-Fa-f]{6})/)![1];
    expect(ratio(text, backing)).toBeGreaterThanOrEqual(4.5);
  });

  it("légende déjà lisible sur un dégradé sombre → intacte", () => {
    const { fixes } = enforceTextContrast(splitSlide("#7A2E14", "#4A1A0A"));
    expect(fixes).toBe(0);
  });

  it("fond uni : seuil historique 1.6 inchangé (taupe doux sur papier non touché)", () => {
    const html = `<div style="background:#F6F4F0"><p style="color:#B5A999">doux voulu</p></div>`;
    expect(ratio("#B5A999", "#F6F4F0")).toBeGreaterThan(1.6);
    expect(ratio("#B5A999", "#F6F4F0")).toBeLessThan(3);
    expect(enforceTextContrast(html).fixes).toBe(0);
  });
});
