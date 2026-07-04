import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { enforceTextContrast } from "./contrast-guard.ts";

// Reproduction exacte du bug prod (audit 04/07) : items d'une carte sombre
// écrits dans la couleur du fond de la carte.
Deno.test("noir sur carte noire → réécrit en clair", () => {
  const html =
    `<div style="background:#FFFFFF;padding:60px">` +
    `<div style="background:#1C1C20;border-radius:12px;padding:36px">` +
    `<p style="font-size:24px;color:#1C1C20;line-height:1.6">Formules d'argile précises</p>` +
    `</div></div>`;
  const { html: fixed, fixes } = enforceTextContrast(html);
  assertEquals(fixes, 1);
  assertStringIncludes(fixed, "color:#FFFFFF");
  assertEquals(fixed.includes("color:#1C1C20"), false);
});

Deno.test("punchline timeline (carte dark, texte dark) → clair ; caption taupe intacte", () => {
  const html =
    `<div style="background:#F6F4F0">` +
    `<div style="background:#1C1C20;border-radius:12px;padding:28px">` +
    `<p style="font-size:22px;font-weight:600;color:#C9BFB2;margin:0">Aujourd'hui</p>` +
    `<p style="font-size:22px;color:#1C1C20;line-height:1.5">Ce mot efface 27 millénaires.</p>` +
    `</div></div>`;
  const { html: fixed, fixes } = enforceTextContrast(html);
  assertEquals(fixes, 1);
  assertStringIncludes(fixed, "color:#C9BFB2"); // contraste ~3.4 : voulu, non touché
  assertStringIncludes(fixed, "color:#FFFFFF");
});

Deno.test("texte sombre sur carte claire → intact", () => {
  const html =
    `<div style="background:#F6F4F0">` +
    `<div style="background:#FFFFFF;padding:40px">` +
    `<p style="color:#1C1C20;font-size:28px">Texte normal parfaitement lisible</p>` +
    `</div></div>`;
  const { fixes } = enforceTextContrast(html);
  assertEquals(fixes, 0);
});

Deno.test("blanc sur blanc → réécrit en sombre", () => {
  const html = `<div style="background:#FFFFFF"><p style="color:#FFFFFF">Invisible</p></div>`;
  const { html: fixed, fixes } = enforceTextContrast(html);
  assertEquals(fixes, 1);
  assertStringIncludes(fixed, "color:#1C1C20");
});

Deno.test("chiffre géant décoratif (opacity 0.15) → laissé tel quel", () => {
  const html =
    `<div style="background:#F6F4F0">` +
    `<p style="font-size:200px;color:#F6F4F0;opacity:0.15">01</p>` +
    `</div>`;
  const { fixes } = enforceTextContrast(html);
  assertEquals(fixes, 0);
});

Deno.test("fond gradient → checks suspendus (zéro faux positif)", () => {
  const html =
    `<div style="background:linear-gradient(180deg,#1C1C20,#000)">` +
    `<p style="color:#1C1C20">Sur gradient, on ne juge pas</p>` +
    `</div>`;
  const { fixes } = enforceTextContrast(html);
  assertEquals(fixes, 0);
});

Deno.test("badge pilule blanc sur fond primaire sombre → intact", () => {
  const html =
    `<div style="background:#F6F4F0">` +
    `<span style="background:#1C1C20;color:#FFFFFF;border-radius:100px;padding:8px 24px">IDÉES REÇUES</span>` +
    `</div>`;
  const { fixes } = enforceTextContrast(html);
  assertEquals(fixes, 0);
});

Deno.test("background-color n'est pas confondu avec color", () => {
  const html = `<div style="background-color:#1C1C20"><p style="color:#F6F4F0">Clair sur sombre, ok</p></div>`;
  const { fixes } = enforceTextContrast(html);
  assertEquals(fixes, 0);
});

Deno.test("imbrication : le texte se compare à la carte, pas à la slide", () => {
  // Slide claire, carte sombre, sous-div sans fond : le texte hérite du fond CARTE.
  const html =
    `<div style="background:#F6F4F0">` +
    `<div style="background:#1C1C20;padding:20px"><div>` +
    `<p style="color:#2C2420">Quasi noir sur noir, hérité</p>` +
    `</div></div></div>`;
  const { html: fixed, fixes } = enforceTextContrast(html);
  assertEquals(fixes, 1);
  assertStringIncludes(fixed, "color:#FFFFFF");
});

Deno.test("html vide ou sans styles → inchangé", () => {
  assertEquals(enforceTextContrast("").fixes, 0);
  assertEquals(enforceTextContrast("<div><p>hello</p></div>").fixes, 0);
});
