// Tests unitaires des gardes d'épingle Pinterest (voir pinterest-pin-guards.ts).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DEFAULT_BADGE_BY_PIN_TYPE,
  findPinDataTextMismatches,
  finalizePinHtml,
  normalizePinData,
} from "./pinterest-pin-guards.ts";

Deno.test("normalizePinData: badge dérivé pour chaque type quand absent", () => {
  for (const [type, badge] of Object.entries(DEFAULT_BADGE_BY_PIN_TYPE)) {
    const { pinData, fixes } = normalizePinData({ pin_type: type, main_title: "T", elements: [] }, type);
    assertEquals(pinData.badge_label, badge);
    assertEquals(fixes, ["badge_label"]);
  }
});

Deno.test("normalizePinData: badge et type valides → objet strictement inchangé", () => {
  const input = { pin_type: "avant_apres", badge_label: "Ma transformation", main_title: "T", elements: [{ label: "x" }] };
  const { pinData, fixes } = normalizePinData(input, "avant_apres");
  assertEquals(pinData, input);
  assertEquals(fixes, []);
});

Deno.test("normalizePinData: pin_data absent ou non-objet → renvoyé tel quel", () => {
  assertEquals(normalizePinData(null, "checklist").pinData, null);
  assertEquals(normalizePinData("x", "checklist").pinData, "x");
});

Deno.test("findPinDataTextMismatches: majuscules CSS, entités, accents, balises imbriquées → pas de faux positif", () => {
  const html = `<style>.x{}</style><div><span style="text-transform:uppercase">AVANT</span>` +
    `<h1>Cr&eacute;er sa <b>vitrine</b>&nbsp;Pinterest l&rsquo;&eacute;t&eacute;</h1>` +
    `<p>&#201;tape&#160;clé</p></div>`;
  const pd = { main_title: "Créer sa vitrine Pinterest l’été", elements: [{ label: "Étape clé" }, { label: "avant" }] };
  assertEquals(findPinDataTextMismatches(pd, html), []);
});

Deno.test("findPinDataTextMismatches: libellé absent du HTML → signalé avec le champ", () => {
  const html = "<div><h1>Créer sa vitrine</h1><p>Choisir ses tableaux</p></div>";
  const pd = { main_title: "Créer sa vitrine", elements: [{ label: "Choisir ses tableaux" }, { label: "Épingler chaque semaine" }] };
  const m = findPinDataTextMismatches(pd, html);
  assertEquals(m.length, 1);
  assertEquals(m[0].field, "elements[1].label");
  assertEquals(m[0].missing.sort(), ["chaque", "epingler", "semaine"]);
});

Deno.test("findPinDataTextMismatches: un mot dans le CSS ne compte pas comme affiché", () => {
  const html = "<style>.vitrine{color:red}</style><div>Autre chose</div>";
  assert(findPinDataTextMismatches({ main_title: "vitrine", elements: [] }, html).length === 1);
});

Deno.test("finalizePinHtml: HTML sain → seul le @import est remplacé par un <link>", () => {
  const body = `<div style="background:#FFFFFF;color:#1A1A2E;font-size:32px">Texte</div>`;
  const out = finalizePinHtml(`<style>@import url('https://fonts.googleapis.com/css2?family=X');</style>${body}`, { title: "A", body: "B" }, 20);
  assert(out.html.endsWith(body));
  assertEquals(out.contrastFixes + out.fontFixes, 0);
});
