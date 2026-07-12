import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceMinFontSize } from "./font-size-guard.ts";

Deno.test("bump un body sous le plancher", () => {
  const { html, fixes } = enforceMinFontSize(
    '<p data-pptx-editable="body" style="font-size:26px;color:#333">Texte</p>',
  );
  assertEquals(fixes, 1);
  assertEquals(html.includes("font-size:30px"), true);
});

Deno.test("ne touche pas une taille au-dessus du plancher", () => {
  const src = '<p data-pptx-editable="body" style="font-size:38px;color:#333">Texte</p>';
  const { html, fixes } = enforceMinFontSize(src);
  assertEquals(fixes, 0);
  assertEquals(html, src);
});

Deno.test("ne touche pas un élément sans data-pptx-editable (décor)", () => {
  const src = '<span aria-hidden="true" style="font-size:20px;opacity:0.2">"</span>';
  const { html, fixes } = enforceMinFontSize(src);
  assertEquals(fixes, 0);
  assertEquals(html, src);
});

Deno.test("plancher par rôle : title 34, caption 24", () => {
  const { html, fixes } = enforceMinFontSize(
    '<h3 data-pptx-editable="title" style="font-size:28px">T</h3>' +
      '<p data-pptx-editable="caption" style="font-size:22px">C</p>' +
      '<p data-pptx-editable="caption" style="font-size:26px">OK</p>',
  );
  assertEquals(fixes, 2);
  assertEquals(html.includes("font-size:34px"), true);
  assertEquals(html.includes("font-size:24px"), true);
  assertEquals(html.includes("font-size:26px"), true);
});

Deno.test("sans font-size inline : hérite, non jugé", () => {
  const src = '<p data-pptx-editable="body" style="color:#333">Texte</p>';
  const { html, fixes } = enforceMinFontSize(src);
  assertEquals(fixes, 0);
  assertEquals(html, src);
});

Deno.test("valeur décimale et autres déclarations préservées", () => {
  const { html, fixes } = enforceMinFontSize(
    '<p data-pptx-editable="subtitle" style="margin:0;font-size:26.5px;line-height:1.4">S</p>',
  );
  assertEquals(fixes, 1);
  assertEquals(html.includes("margin:0;font-size:30px;line-height:1.4"), true);
});

Deno.test("letter-spacing n'est pas confondu avec font-size", () => {
  const src =
    '<p data-pptx-editable="body" style="font-size:32px;letter-spacing:2px">B</p>';
  const { html, fixes } = enforceMinFontSize(src);
  assertEquals(fixes, 0);
  assertEquals(html, src);
});

Deno.test("html vide", () => {
  const { html, fixes } = enforceMinFontSize("");
  assertEquals(html, "");
  assertEquals(fixes, 0);
});

import { enforceGlobalMinFontSize } from "./font-size-guard.ts";

Deno.test("overlay sous plancher (32) → bump", () => {
  const { html, fixes } = enforceMinFontSize(
    '<p data-pptx-editable="overlay" style="font-size:24px;color:#FFF">Sur photo</p>',
  );
  assertEquals(fixes, 1);
  assertEquals(html.includes("font-size:32px"), true);
});

Deno.test("global : bump tout élément sans rôle sous le plancher", () => {
  const { html, fixes } = enforceGlobalMinFontSize(
    '<p style="font-size:16px;color:#333">Corps</p><h1 style="font-size:56px">T</h1>',
  );
  assertEquals(fixes, 1);
  assertEquals(html.includes("font-size:20px"), true);
  assertEquals(html.includes("font-size:56px"), true);
});

Deno.test("global : aria-hidden et opacity < 0.7 exemptés", () => {
  const src =
    '<span aria-hidden="true" style="font-size:14px">"</span>' +
    '<p style="font-size:15px;opacity:0.5">watermark</p>';
  const { html, fixes } = enforceGlobalMinFontSize(src);
  assertEquals(fixes, 0);
  assertEquals(html, src);
});

Deno.test("global : plancher paramétrable", () => {
  const { html, fixes } = enforceGlobalMinFontSize('<p style="font-size:24px">x</p>', 28);
  assertEquals(fixes, 1);
  assertEquals(html.includes("font-size:28px"), true);
});
