import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stepHeader, stripDuplicateStepPrefixHtml, stripStepOrderPrefix } from "./format-render.ts";

Deno.test("préfixe d'ordre : seul le repère du même numéro part, jamais un mot ni un autre chiffre", () => {
  for (const t of ["2. Le tour", "2) Le tour", "02 · Le tour", "Étape 2 : Le tour", "ÉTAPE 2 — Le tour", "étape 2 Le tour"]) assertEquals(stripStepOrderPrefix(t, 2), "Le tour", t);
  for (const t of ["2,5 kg de terre", "20 ans d'atelier", "2 000 pièces", "2 – 3 jours", "2.5 kg", "12. Le tour", "Étape 20 : x", "3. Le tour", "Le tour", "Étape 2", "2. "]) assertEquals(stripStepOrderPrefix(t, 2), null, t);
});

Deno.test("en-tête d'étape : le libellé « 2. Tour » ne répète pas le numéro, les autres libellés sont inchangés", () => {
  assert(stepHeader({ index: 2, total: 3, label: "2. tour" }, "#000").includes(">Étape 2 · Tour<"));
  assert(stepHeader({ index: 2, total: 3, label: "le tour" }, "#000").includes(">Étape 2 · Le tour<"));
  assert(stepHeader({ index: 2, total: 3, label: "" }, "#000").includes(">Étape 2<"));
  assert(stepHeader({ index: 2, total: 3, label: "3 couches" }, "#000").includes(">Étape 2 · 3 couches<"));
});

Deno.test("HTML : premier texte après l'étape dessinée, motif SVG sauté, rien d'autre ne bouge", () => {
  const head = stepHeader({ index: 2, total: 3, label: "le tour" }, "#000");
  const svg = `<svg data-photo-format="motif" viewBox="0 0 1000 100"><text x="0" y="40">2. motif</text></svg>`;
  const html = `<div>${head}${svg}<h1 data-slide-text="title">2. Le tour</h1><p data-slide-text="body">2. Autre</p></div>`;
  const out = stripDuplicateStepPrefixHtml(html);
  assert(out.removed);
  assert(out.html.includes(`<h1 data-slide-text="title">Le tour</h1>`) && out.html.includes(">2. Autre<") && out.html.includes(">2. motif<"));
  assertEquals(stripDuplicateStepPrefixHtml(`<div><h1>2. Le tour</h1></div>`).removed, false, "sans étape dessinée : inchangé");
  assertEquals(stripDuplicateStepPrefixHtml(`<div>${head}<h1>3. Le tour</h1></div>`).removed, false, "numéro différent : inchangé");
});
