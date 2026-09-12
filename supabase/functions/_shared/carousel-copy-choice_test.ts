import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyIndependentCopy, chooseCarouselCopy } from "./carousel-copy-choice.ts";
import { carouselEditorialFields } from "./carousel-editorial-review.ts";

const ctx = { currentBrief: "Porte-savon acheté chez un fournisseur, 18 euros, trois rainures, 11 × 8 cm. Je pose le savon dessus après usage.", authoredText: "", sourceContext: "18 euros, trois rainures, 11 × 8 cm", constraints: {}, isLinkedIn: false };
const doc = { slides: [{ slide_number: 1, title: "Le porte-savon", body: "18 euros, 11 × 8 cm, trois rainures.", photo_index: 2, photo_layout: "left_photo" }, { slide_number: 2, title: "Après usage", body: "Je pose le savon dessus." }], caption: { body: "Le porte-savon coûte 18 euros." } };
const payload = (d: any, replacements: Record<string, string> = {}) => JSON.stringify({ fields: carouselEditorialFields(d).map(f => ({ field_id: f.id, contribution: "Fait fourni et utile", text: replacements[f.id] ?? f.text })) });

Deno.test("copie indépendante : seule la prose change, données photo conservées", () => {
  const result = applyIndependentCopy(doc, payload(doc, { "slides.0.title": "Un porte-savon à 18 euros" }), ctx);
  assert(result);
  assertEquals(result.slides[0].photo_index, 2);
  assertEquals(result.slides[0].photo_layout, "left_photo");
  assertEquals(doc.slides[0].title, "Le porte-savon");
});
for (const [label, replacements] of Object.entries({ missing_source_number: { "slides.0.body": "18 euros, trois rainures." }, new_number: { "slides.1.body": "Il sèche en 5 minutes." }, empty_title: { "slides.0.title": "" }, too_long: { "slides.1.body": "mot ".repeat(51) } })) {
  Deno.test(`copie indépendante rejetée : ${label}`, () => assertEquals(applyIndependentCopy(doc, payload(doc, replacements), ctx), null));
}
Deno.test("copie indépendante : couverture exacte et IDs uniques exigés", () => {
  const p = JSON.parse(payload(doc)); p.fields[0].field_id = p.fields[1].field_id;
  assertEquals(applyIndependentCopy(doc, JSON.stringify(p), ctx), null);
  p.fields.pop(); assertEquals(applyIndependentCopy(doc, JSON.stringify(p), ctx), null);
});
Deno.test("copie indépendante : schéma et accroche choisie verrouillés", () => {
  const d = structuredClone(doc) as any;
  d.slides[0].visual_schema = { type: "quote_big", quote: "Citation source" };
  assertEquals(applyIndependentCopy(d, payload(d, { "slides.0.visual_schema.quote": "Autre phrase" }), ctx), null);
  assertEquals(applyIndependentCopy(doc, payload(doc, { "slides.0.title": "Autre titre" }), { ...ctx, constraints: { selected_hook: "Le porte-savon" } }), null);
});
Deno.test("copie indépendante : aparté fourni protégé même sans guillemets dans la sortie", () => {
  const d = { slides: [{ slide_number: 1, title: "Mes lunettes", body: "Voilà, voilà. Mes lunettes étaient sur ma tête." }] };
  assertEquals(applyIndependentCopy(d, payload(d, { "slides.0.body": "Elles étaient sur ma tête." }), { ...ctx, currentBrief: "Garder « Voilà, voilà. Mes lunettes étaient sur ma tête. »" }), null);
});
for (const swap of [false, true]) Deno.test(`sélection : candidat aveugle, ordre A/B=${swap}, deux appels bornés`, async () => {
  let calls = 0;
  const call = async (options: any) => {
    calls++;
    assertEquals(options.abortTimeoutMs, 45000);
    if (calls === 1) {
      assertEquals(options.tool.name, "write_carousel_copy");
      assert(!options.messages[0].content.includes("Le porte-savon coûte 18 euros."));
      return payload(doc, { "slides.1.title": "Poser le savon après usage" });
    }
    assertEquals(options.tool.name, "choose_carousel_copy");
    return JSON.stringify({ choice: swap ? "A" : "B", issues_a: [], issues_b: [], reason: "Le titre décrit le geste fourni" });
  };
  const result = JSON.parse(await chooseCarouselCopy(JSON.stringify(doc), ctx, call as any, swap));
  assertEquals(calls, 2);
  assertEquals(result.editorial_selection.status, "alternative-selected");
  assertEquals(result.slides[1].title, "Poser le savon après usage");
});
for (const failure of ["invalid", "timeout", "neither"]) Deno.test(`sélection : texte récupérable conservé si ${failure}`, async () => {
  let calls = 0;
  const call = async () => { calls++; if (failure === "timeout") throw Error("timeout"); if (failure === "invalid") return "{}"; return calls === 1 ? payload(doc) : JSON.stringify({ choice: "neither", issues_a: ["défaut"], issues_b: ["défaut"], reason: "Pas de gagnant clair" }); };
  const result = JSON.parse(await chooseCarouselCopy(JSON.stringify(doc), ctx, call as any));
  assertEquals(result.slides, doc.slides);
  assertEquals(result.caption, doc.caption);
  assertEquals(result.editorial_selection.status, failure === "invalid" ? "candidate-invalid" : failure === "timeout" ? "unavailable" : "no-clear-winner");
});
