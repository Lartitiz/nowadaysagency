import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { enforceAnchoredText, normalizeForCompare } from "./verbatim-guard.ts";

const slide = (inner: string, field = "title", tag = "h1") =>
  `<div style="width:1080px"><${tag} data-slide-text="${field}" style="color:#111">${inner}</${tag}></div>`;

Deno.test("texte fidèle → HTML inchangé", () => {
  const html = slide("Le piège n°1 des créatrices");
  const { html: out, fixes } = enforceAnchoredText(html, [{ field: "title", text: "Le piège n°1 des créatrices" }]);
  assertEquals(out, html);
  assertEquals(fixes, []);
});

Deno.test("spans d'accent internes fidèles → inchangé", () => {
  const html = slide(`Le <span style="color:#FB3D80">piège</span> n°1`);
  const { fixes } = enforceAnchoredText(html, [{ field: "title", text: "Le piège n°1" }]);
  assertEquals(fixes, []);
});

Deno.test("variantes neutres (nbsp, apostrophe courbe, ellipse, entités) → inchangé", () => {
  const html = slide("Je n&rsquo;ai jamais su&nbsp;vendre...");
  const { fixes } = enforceAnchoredText(html, [{ field: "title", text: "Je n'ai jamais su vendre…" }]);
  assertEquals(fixes, []);
});

Deno.test("casse perdue (MAJUSCULES → minuscules) → réinjecté", () => {
  const html = slide("À éviter : l'été où tu crées");
  const src = "À ÉVITER : L'ÉTÉ OÙ TU CRÉES";
  const { html: out, fixes } = enforceAnchoredText(html, [{ field: "title", text: src }]);
  assertEquals(fixes, ["title"]);
  assertStringIncludes(out, "À ÉVITER : L'ÉTÉ OÙ TU CRÉES");
});

Deno.test("émojis retirés du texte → réinjecté", () => {
  const html = slide("Le piège n°1 des créatrices");
  const src = "🔥 Le piège n°1 des créatrices 🔥";
  const { html: out, fixes } = enforceAnchoredText(html, [{ field: "title", text: src }]);
  assertEquals(fixes, ["title"]);
  assertStringIncludes(out, "🔥 Le piège n°1 des créatrices 🔥");
});

Deno.test("tiret cadratin remplacé par virgule → réinjecté", () => {
  const html = slide("« Je n'ai jamais su vendre. », moi, en 2021");
  const src = "« Je n'ai jamais su vendre. » — moi, en 2021";
  const { html: out, fixes } = enforceAnchoredText(html, [{ field: "title", text: src }]);
  assertEquals(fixes, ["title"]);
  assertStringIncludes(out, "» — moi, en 2021");
});

Deno.test("body éclaté (fragment seul dans l'ancre) → réinjecté complet", () => {
  const html = slide("1 000 € de CA en plus par mois.", "body", "p");
  const src = "3,5 ans pour comprendre ça. 1 000 € de CA en plus par mois.";
  const { html: out, fixes } = enforceAnchoredText(html, [{ field: "body", text: src }]);
  assertEquals(fixes, ["body"]);
  assertStringIncludes(out, "3,5 ans pour comprendre ça. 1 000 € de CA en plus par mois.");
});

Deno.test("réinjection : échappement HTML + sauts de ligne", () => {
  const html = slide("autre chose", "body", "p");
  const src = "A < B & C\nligne 2";
  const { html: out } = enforceAnchoredText(html, [{ field: "body", text: src }]);
  assertStringIncludes(out, "A &lt; B &amp; C<br>ligne 2");
});

Deno.test("imbrication du même tag (div dans div) → contenu délimité juste", () => {
  const html = `<div data-slide-text="body"><div>fragment</div></div><div>après</div>`;
  const src = "texte complet attendu";
  const { html: out, fixes } = enforceAnchoredText(html, [{ field: "body", text: src }]);
  assertEquals(fixes, ["body"]);
  assertStringIncludes(out, `<div data-slide-text="body">texte complet attendu</div><div>après</div>`);
});

Deno.test("ancre absente ou source vide → aucun crash, aucun fix", () => {
  const html = slide("titre", "title");
  assertEquals(enforceAnchoredText(html, [{ field: "body", text: "x" }]).fixes, []);
  assertEquals(enforceAnchoredText(html, [{ field: "title", text: "" }]).fixes, []);
  assertEquals(enforceAnchoredText("", [{ field: "title", text: "x" }]).fixes, []);
});

Deno.test("title et body corrigés indépendamment", () => {
  const html = `<div><h2 data-slide-text="title">titre modifié</h2><p data-slide-text="body">Corps fidèle.</p></div>`;
  const { fixes } = enforceAnchoredText(html, [
    { field: "title", text: "TITRE SOURCE" },
    { field: "body", text: "Corps fidèle." },
  ]);
  assertEquals(fixes, ["title"]);
});

Deno.test("normalizeForCompare : nbsp/espaces multiples/NFC", () => {
  assertEquals(normalizeForCompare("73 %  des   ventes"), "73 % des ventes");
});
