import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyEditorialReview, carouselEditorialFields, CAROUSEL_EDITORIAL_REVIEW_PROMPT } from "./carousel-editorial-review.ts";
import { applyCorrectionPassCarousel } from "./correction-pass.ts";
import { analyzeCarouselRedac, applyGuardedCarouselCorrection } from "./redac-gate.ts";

const doc = { slides: [{ title: "Les retours sur la maquette", body: "Les demandes se contredisent. Et c'est là que tout se joue.", photo_index: 2, photo_url: "https://example.com/photo", template: "liste", points: ["Une réponse commune", "Un arbitrage explicite"], visual_schema: { type: "timeline", steps: [{ label: "Retours", desc: "Choisir entre les demandes" }], color: "pink" } }], caption: { body: "J'attends votre réponse commune.", hashtags: ["design"] } };
const cleanReview = (d = doc): any => ({ reviews: carouselEditorialFields(d).map(f => ({ field_id: f.id, decision: "keep", reason: "information utile", edits: [] })) });
function editReview(d = doc, before = " Et c'est là que tout se joue.", after = "") {
  const result = cleanReview(d);
  Object.assign(result.reviews.find((r: any) => r.field_id === "slides.0.body"), { decision: "edit", reason: "emphase répétant le problème déjà décrit", edits: [{ before, after }] });
  return result;
}

Deno.test("registre : texte visible complet, aucun champ technique ni hashtag", () => {
  const ids = carouselEditorialFields(doc).map(f => f.id);
  assertEquals(ids, ["slides.0.title", "slides.0.body", "slides.0.points.0", "slides.0.points.1", "slides.0.visual_schema.steps.0.label", "slides.0.visual_schema.steps.0.desc", "caption.body"]);
  const extra = { carousel: { slides: [{ hook: "Hook", text: "Texte", kicker: "Pastille", detail: "Détail", big_number: "35", attribution: "Auteur", cta_label: "Voir", overlay_text: "Photo", visual_schema: { type: "matrix_2x2", x_axis: { left: "Facile", right: "Difficile" } } }], caption: { hook: "Légende" } }, instagram_caption: "Ancienne légende" };
  assertEquals(carouselEditorialFields(extra).length, 12);
});
Deno.test("révision locale : supprime le seul extrait ciblé, garde photos/structure/ponctuation", () => {
  const original = JSON.stringify(doc);
  const result = applyEditorialReview(doc, JSON.stringify(editReview()));
  assertEquals(result.status, "reviewed");
  assertEquals(result.edits, 1);
  assertEquals(result.doc.slides[0].body, "Les demandes se contredisent.");
  assertEquals({ ...result.doc.slides[0], body: doc.slides[0].body }, doc.slides[0]);
  assertEquals(result.doc.caption, doc.caption);
  assertEquals(JSON.stringify(doc), original);
});
Deno.test("révision : une décision keep conserve chaque caractère", () => {
  assertEquals(applyEditorialReview(doc, JSON.stringify(cleanReview())).doc, doc);
});
for (const [name, mutate] of Object.entries({
  omission: (r: any): void => { r.reviews.pop(); },
  duplication: (r: any): void => { r.reviews[1] = r.reviews[0]; },
  field_invented: (r: any): void => { r.reviews[0].field_id = "__proto__.polluted"; },
  unknown_decision: (r: any): void => { r.reviews[0].decision = "rewrite"; },
  keep_with_edit: (r: any): void => { r.reviews[0].edits.push({ before: "retours", after: "avis" }); },
  missing_reason: (r: any): void => { r.reviews[0].reason = ""; },
  absent_excerpt: (r: any): void => { r.reviews[1].edits[0].before = "Absent du texte"; },
  overlap: (r: any): void => { r.reviews[1].edits.push({ before: "là que tout", after: "" }); },
})) Deno.test(`révision invalide ${name} : aucun patch appliqué`, () => {
  const review = editReview(); mutate(review);
  const result = applyEditorialReview(doc, JSON.stringify(review));
  assertEquals(result.status, "invalid"); assertEquals(result.doc, doc);
});
Deno.test("révision : extrait ambigu ou sortie tronquée conservés", () => {
  const draft = { ...doc, slides: [{ ...doc.slides[0], body: "Même phrase. Même phrase." }] };
  assertEquals(applyEditorialReview(draft, JSON.stringify(editReview(draft, "Même phrase.", ""))).status, "invalid");
  assertEquals(applyEditorialReview(doc, '{"reviews":[').doc, doc);
});
Deno.test("révision : citation source verrouillée", () => {
  const draft = { ...doc, slides: [{ ...doc.slides[0], body: "« Chaque personne compte. » Voici le groupe." }] };
  const result = applyEditorialReview(draft, JSON.stringify(editReview(draft, "« Chaque personne compte. » ", "")), "Citation à conserver : Chaque personne compte.");
  assertEquals(result.error, "locked-quote"); assertEquals(result.doc, draft);
});
Deno.test("révision : schéma et titre obligatoires ne deviennent pas vides", () => {
  for (const id of ["slides.0.title", "slides.0.visual_schema.steps.0.label"]) {
    const review = cleanReview();
    const entry = review.reviews.find((r: any) => r.field_id === id);
    Object.assign(entry, { decision: "edit", edits: [{ before: carouselEditorialFields(doc).find(f => f.id === id)!.text, after: "" }] });
    assertEquals(applyEditorialReview(doc, JSON.stringify(review)).error, "empty-required-field");
  }
});

async function mockReview(response: string, run: (calls: any[]) => Promise<void>) {
  const previousFetch = globalThis.fetch, key = Deno.env.get("ANTHROPIC_API_KEY");
  const calls: any[] = [];
  Deno.env.set("ANTHROPIC_API_KEY", "test-no-network");
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    let input: any;
    try { input = JSON.parse(response); } catch { input = { reviews: [] }; }
    return Promise.resolve(new Response(JSON.stringify({ content: [{ type: "tool_use", id: "test", name: "review_carousel_fields", input }], stop_reason: "tool_use", usage: { input_tokens: 1, output_tokens: 1 } })));
  }) as typeof fetch;
  try { await run(calls); } finally {
    globalThis.fetch = previousFetch;
    if (key === undefined) Deno.env.delete("ANTHROPIC_API_KEY"); else Deno.env.set("ANTHROPIC_API_KEY", key);
  }
}
Deno.test("intégration correction : court, sans source, sans alerte regex, un seul appel structuré", async () => {
  const draft = { slides: [{ body: "Les demandes se contredisent. Et c'est là que tout se joue." }] };
  await mockReview(JSON.stringify(editReview(draft as any)), async calls => {
    const output = JSON.parse(await applyCorrectionPassCarousel(JSON.stringify(draft), { semanticReview: true }));
    assertEquals(calls.length, 1);
    assertEquals(output.slides[0].body, "Les demandes se contredisent.");
    assertEquals(output.editorial_review.status, "reviewed");
    assertStringIncludes(JSON.stringify(calls[0].system), "transition emphatique");
  });
});
Deno.test("intégration correction : réponse invalide ne devient jamais une réussite", async () => {
  await mockReview("Réécriture opaque", async () => {
    const output = JSON.parse(await applyCorrectionPassCarousel(JSON.stringify(doc), { semanticReview: true }));
    assertEquals(output.slides, doc.slides);
    assertEquals(output.editorial_review.status, "invalid");
  });
});
Deno.test("intégration garde : prix sourcé conservé et révision rejetée explicitement", async () => {
  const draft = { ...doc, slides: [{ ...doc.slides[0], body: "Le bol coûte 35 euros. Disponible à Lyon." }] };
  await mockReview(JSON.stringify(editReview(draft, "Le bol coûte 35 euros. ", "")), async () => {
    const output = JSON.parse(await applyGuardedCarouselCorrection(JSON.stringify(draft), { inputText: "Le bol coûte 35 euros à Lyon.", correction: { semanticReview: true } }));
    assertEquals(output.slides, draft.slides);
    assertEquals(output.editorial_review.status, "rejected");
  });
});
Deno.test("contrat : privilégie le sens et protège les contrastes utiles", () => {
  assertStringIncludes(CAROUSEL_EDITORIAL_REVIEW_PROMPT, "quelle que soit leur formulation ou leur ponctuation");
  assertStringIncludes(CAROUSEL_EDITORIAL_REVIEW_PROMPT, "indice versus preuve");
  assertStringIncludes(CAROUSEL_EDITORIAL_REVIEW_PROMPT, "aucune obligation de trouver un défaut");
});

Deno.test("garde : chiffres dans légende legacy et carrousel imbriqué restent contrôlés", () => {
  for (const d of [
    { slides: [], caption: "Livraison en 9 jours." },
    { carousel: { slides: [], instagram_caption: "Livraison en 9 jours." } },
  ]) assertEquals(analyzeCarouselRedac(d, new Set()).fabricatedNumbers.length, 1);
});
Deno.test("révision : liens existants protégés", () => {
  const draft = { ...doc, slides: [{ ...doc.slides[0], body: "Voir https://example.com/offre pour les détails." }] };
  assertEquals(applyEditorialReview(draft, JSON.stringify(editReview(draft, "https://example.com/offre", "mon site"))).error, "removed-link");
});
Deno.test("transport : tiret source préservé pour les correspondances exactes", async () => {
  const draft = { ...doc, slides: [{ ...doc.slides[0], body: "Un retour — une décision. Voilà la magie." }] };
  await mockReview(JSON.stringify(editReview(draft, "Un retour — une décision. Voilà la magie.", "Un retour — une décision.")), async () => {
    const output = JSON.parse(await applyCorrectionPassCarousel(JSON.stringify(draft), { semanticReview: true }));
    assertEquals(output.slides[0].body, "Un retour — une décision.");
    assertEquals(output.editorial_review.status, "reviewed");
  });
});
