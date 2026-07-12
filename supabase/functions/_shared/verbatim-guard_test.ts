import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { enforceAnchoredText, ensureAnchor, ensurePptxEditable, normalizeForCompare } from "./verbatim-guard.ts";

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

// ─── ensureAnchor : pose de l'ancre manquante (slides à visual_schema) ───

Deno.test("ensureAnchor : ancre déjà présente → present, HTML inchangé", () => {
  const html = slide("Ma checklist anti-burnout");
  const { html: out, status } = ensureAnchor(html, "title", "Ma checklist anti-burnout");
  assertEquals(status, "present");
  assertEquals(out, html);
});

Deno.test("ensureAnchor : ancre absente, texte identique → posée sur l'élément", () => {
  const html = `<div style="width:1080px"><h2 style="font-size:64px">Ma checklist anti-burnout</h2><ul><li>Dormir</li></ul></div>`;
  const { html: out, status } = ensureAnchor(html, "title", "Ma checklist anti-burnout");
  assertEquals(status, "added");
  assertStringIncludes(out, `<h2 style="font-size:64px" data-slide-text="title">Ma checklist anti-burnout</h2>`);
});

Deno.test("ensureAnchor : candidats imbriqués → le plus petit (élément direct) gagne", () => {
  const html = `<div class="wrap"><div class="card"><h1>Le titre</h1></div></div>`;
  const { html: out, status } = ensureAnchor(html, "title", "Le titre");
  assertEquals(status, "added");
  assertStringIncludes(out, `<h1 data-slide-text="title">Le titre</h1>`);
  assertEquals(out.includes(`<div class="wrap" data-slide-text`), false);
});

Deno.test("ensureAnchor : comparaison via normalizeForCompare (nbsp, apostrophe courbe)", () => {
  const html = `<h2>Je n&rsquo;ai jamais su&nbsp;vendre</h2>`;
  const { status } = ensureAnchor(html, "title", "Je n'ai jamais su vendre");
  assertEquals(status, "added");
});

Deno.test("ensureAnchor : spans internes conservés (texte agrégé identique)", () => {
  const html = `<h1>Ma <span style="color:#FB3D80">checklist</span> anti-burnout</h1>`;
  const { html: out, status } = ensureAnchor(html, "title", "Ma checklist anti-burnout");
  assertEquals(status, "added");
  assertStringIncludes(out, `<h1 data-slide-text="title">Ma <span style="color:#FB3D80">checklist</span> anti-burnout</h1>`);
});

Deno.test("ensureAnchor : texte introuvable (réécrit) → unmatched, HTML inchangé", () => {
  const html = `<h1>Un tout autre titre</h1>`;
  const { html: out, status } = ensureAnchor(html, "title", "Ma checklist anti-burnout");
  assertEquals(status, "unmatched");
  assertEquals(out, html);
});

Deno.test("ensureAnchor : ne réquisitionne pas l'ancre d'un autre champ", () => {
  // Le body porte déjà son ancre et son texte égale le title source (cas limite).
  const html = `<p data-slide-text="body">Même texte</p><h1>Même texte</h1>`;
  const { html: out, status } = ensureAnchor(html, "title", "Même texte");
  assertEquals(status, "added");
  assertStringIncludes(out, `<h1 data-slide-text="title">Même texte</h1>`);
  assertStringIncludes(out, `<p data-slide-text="body">Même texte</p>`);
});

Deno.test("ensureAnchor : HTML ou source vides → unmatched, aucun crash", () => {
  assertEquals(ensureAnchor("", "title", "x").status, "unmatched");
  assertEquals(ensureAnchor("<h1>x</h1>", "title", "").status, "unmatched");
  assertEquals(ensureAnchor("<h1>x</h1>", "title", "  ").status, "unmatched");
});

Deno.test("ensureAnchor : le style/script n'est jamais candidat", () => {
  const html = `<style>.t{color:red}</style><h1>.t{color:red}</h1>`;
  const { html: out, status } = ensureAnchor(html, "title", ".t{color:red}");
  assertEquals(status, "added");
  assertStringIncludes(out, `<h1 data-slide-text="title">`);
  assertStringIncludes(out, `<style>.t{color:red}</style>`);
});

Deno.test("ensureAnchor puis enforceAnchoredText : l'ancre posée est vue fidèle", () => {
  const html = `<h2>Ma checklist anti-burnout</h2>`;
  const { html: anchored } = ensureAnchor(html, "title", "Ma checklist anti-burnout");
  const { fixes } = enforceAnchoredText(anchored, [{ field: "title", text: "Ma checklist anti-burnout" }]);
  assertEquals(fixes, []);
});

// ─── ensureAnchor + ensurePptxEditable : overlay des slides PHOTO ───
// Cas de la cliente : slide "photo_full" dont l'overlay a été RENDU visible mais
// SANS ancre (le modèle l'oublie ~régulièrement, cf. télémétrie carousel-visual).
// Sans réparation : édition live no-op + export/Canva qui perd le texte.

const photoFull = (inner: string) =>
  `<div style="width:1080px;height:1350px;background-image:url(data:image/jpeg;base64,AAAA);background-size:cover;position:relative;">` +
  `<div style="position:absolute;bottom:80px;left:80px;right:80px;">` +
  `<p style="color:#fff;font-size:64px;text-shadow:0 4px 16px rgba(0,0,0,.6)">${inner}</p>` +
  `</div></div>`;

Deno.test("ensureAnchor overlay : pose l'ancre sur l'élément direct du texte (spans + ellipse)", () => {
  const html = photoFull(
    `<span style="text-decoration:underline">Solidays</span> et <span style="text-decoration:underline">Garorock</span> annulés en pleine <span style="text-decoration:underline">canicule</span>…`,
  );
  const { html: out, status } = ensureAnchor(html, "overlay", "Solidays et Garorock annulés en pleine canicule…");
  assertEquals(status, "added");
  // L'ancre va sur le <p> direct, pas sur un div conteneur.
  assertStringIncludes(out, `<p style="color:#fff;font-size:64px;text-shadow:0 4px 16px rgba(0,0,0,.6)" data-slide-text="overlay">`);
  assertEquals(out.includes(`background-image:url(data:image/jpeg;base64,AAAA);background-size:cover;position:relative;" data-slide-text`), false);
});

Deno.test("ensureAnchor overlay : mismatch d'ellipse toléré via normalizeForCompare (… ≡ ...)", () => {
  const html = photoFull(`Solidays et Garorock annulés en pleine canicule…`);
  // Le JSON overlay_text emploie 3 points ASCII, le rendu une vraie ellipse : doit matcher.
  const { status } = ensureAnchor(html, "overlay", "Solidays et Garorock annulés en pleine canicule...");
  assertEquals(status, "added");
});

Deno.test("ensurePptxEditable : ajoute l'annotation d'export sur l'ancre overlay", () => {
  const html = photoFull(`Solidays et Garorock annulés en pleine canicule…`);
  const { html: anchored } = ensureAnchor(html, "overlay", "Solidays et Garorock annulés en pleine canicule…");
  const out = ensurePptxEditable(anchored, "overlay");
  assertStringIncludes(out, `data-slide-text="overlay"`);
  assertStringIncludes(out, `data-pptx-editable="overlay"`);
});

Deno.test("ensurePptxEditable : idempotent (annotation déjà présente → inchangé)", () => {
  const html = `<p data-slide-text="overlay" data-pptx-editable="overlay">Texte</p>`;
  assertEquals(ensurePptxEditable(html, "overlay"), html);
});

Deno.test("ensurePptxEditable : pas d'ancre → HTML inchangé", () => {
  const html = `<p>Texte non ancré</p>`;
  assertEquals(ensurePptxEditable(html, "overlay"), html);
});
