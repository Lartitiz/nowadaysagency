import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyEditorialReview, carouselEditorialFields, carouselEditorialSequence, CAROUSEL_EDITORIAL_REVIEW_PROMPT } from "./carousel-editorial-review.ts";
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
Deno.test("séquence : photo sans texte, overlay et schéma gardent leur place, sans exposer les médias", () => {
  const draft = { carousel: { slides: [
    { role: "contexte", slide_type: "photo_full", photo_url: "private-photo", photo_index: 1 },
    { role: "explication", slide_type: "photo_integrated", title: "Un choix", overlay_text: "Son effet", visual_schema: { type: "timeline", steps: [{ label: "Étape" }] } },
  ], caption: { body: "Légende autonome" } } };
  const before = JSON.stringify(draft);
  assertEquals(carouselEditorialSequence(draft), [
    { slide_id: "carousel.slides.0", position: 1, role: "contexte", slide_type: "photo_full", field_ids: [] },
    { slide_id: "carousel.slides.1", position: 2, role: "explication", slide_type: "photo_integrated", field_ids: ["carousel.slides.1.title", "carousel.slides.1.overlay_text", "carousel.slides.1.visual_schema.steps.0.label"] },
  ]);
  assertEquals(JSON.stringify(draft), before);
  assertEquals(carouselEditorialSequence({ caption: "Sans slides" }), []);
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
Deno.test("révision : keep sans tableau vide reste une conservation explicite", () => {
  const review = editReview();
  delete review.reviews[0].edits;
  const result = applyEditorialReview(doc, JSON.stringify(review));
  assertEquals(result.status, "reviewed");
  assertEquals(result.doc.slides[0].title, doc.slides[0].title);
  assertEquals(result.doc.slides[0].body, "Les demandes se contredisent.");
});
Deno.test("registre : schéma enveloppé dans data inclut ses textes, pas ses coordonnées", () => {
  assertEquals(carouselEditorialFields({ slides: [{ visual_schema: { type: "flowchart", data: { start: "Question", branches: [{ condition: "Oui", result: "Vérifier" }], x: 12 } } }] }).map(f => f.text), ["Question", "Oui", "Vérifier"]);
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
  const previousFetch = globalThis.fetch, key = Deno.env.get("OPENAI_API_KEY");
  const calls: any[] = [];
  Deno.env.set("OPENAI_API_KEY", "test-no-network");
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
    assertEquals(_url, "https://api.openai.com/v1/responses");
    calls.push(JSON.parse(String(init?.body)));
    let input: any;
    try { input = JSON.parse(response); } catch { input = { reviews: [] }; }
    return Promise.resolve(new Response(JSON.stringify({ model: "gpt-6-astra", status: "completed", output: [{ type: "function_call", name: "review_carousel_fields", arguments: JSON.stringify(input) }], usage: { input_tokens: 1, output_tokens: 1 } })));
  }) as typeof fetch;
  try { await run(calls); } finally {
    globalThis.fetch = previousFetch;
    if (key === undefined) Deno.env.delete("OPENAI_API_KEY"); else Deno.env.set("OPENAI_API_KEY", key);
  }
}
Deno.test("relecture globale : retouches coordonnées, une seule requête, structure et source intactes", async () => {
  const draft = { slides: [
    { role: "observation", title: "Le soutien exprimé", body: "Le message exprime du soutien.", slide_type: "text_only", photo_index: null },
    { role: "question", title: "La question ouverte", body: "Le message exprime du soutien. Le rôle reste à expliquer.", slide_type: "text_only", photo_index: null },
    { role: "application", title: "Mon métier", body: "Je regarde le rôle et les engagements.", slide_type: "photo_integrated", photo_index: 1 },
  ], caption: { body: "Source : https://example.com/article" } };
  const response = cleanReview(draft as any);
  for (const [id, before, after] of [
    ["slides.1.body", draft.slides[1].body, "Ce soutien laisse une question ouverte : quel rôle la personne prend-elle en charge ?"],
    ["slides.2.body", draft.slides[2].body, "Pour comprendre ce rôle, je regarde les engagements annoncés."],
  ]) Object.assign(response.reviews.find((r: any) => r.field_id === id), {
    decision: "edit", reason: "Relie la question laissée ouverte à son développement, sans nouveau fait", edits: [{ before, after }],
  });
  await mockReview(JSON.stringify(response), async calls => {
    const output = JSON.parse(await applyCorrectionPassCarousel(JSON.stringify(draft), { semanticReview: true, currentBrief: "FIL CONFIRMÉ À PRÉSERVER : soutien, rôle, engagements" }));
    assertEquals(calls.length, 1);
    assertStringIncludes(calls[0].instructions, "RELECTURE DE L'ENSEMBLE AVANT LES CHAMPS");
    const message = calls[0].input.find((item: any) => item.role === "user");
    const payload = JSON.stringify(message);
    assertStringIncludes(payload, "SÉQUENCE DES SLIDES");
    assertStringIncludes(payload, "FIL CONFIRMÉ À PRÉSERVER");
    for (const role of ["observation", "question", "application"]) assertStringIncludes(payload, role);
    assertEquals(output.editorial_review.status, "reviewed");
    assertEquals(output.editorial_review.edits, 2);
    assertEquals(output.slides.map((s: any) => ({ ...s, body: null })), draft.slides.map(s => ({ ...s, body: null })));
    assertEquals(output.caption, draft.caption);
    assertEquals(output.slides[1].body.startsWith("Ce soutien laisse une question ouverte"), true);
    assertEquals(output.slides[2].body.startsWith("Pour comprendre ce rôle"), true);
  });
});
Deno.test("intégration correction : court, sans source, sans alerte regex, un seul appel structuré", async () => {
  const draft = { slides: [{ body: "Les demandes se contredisent. Et c'est là que tout se joue." }] };
  await mockReview(JSON.stringify(editReview(draft as any)), async calls => {
    const output = JSON.parse(await applyCorrectionPassCarousel(JSON.stringify(draft), { semanticReview: true }));
    assertEquals(calls.length, 1);
    assertEquals(output.slides[0].body, "Les demandes se contredisent.");
    assertEquals(output.editorial_review.status, "reviewed");
    assertStringIncludes(calls[0].instructions, "transition emphatique");
    assertEquals(calls[0].reasoning, { effort: "medium" });
    assertEquals(calls[0].store, false);
    assertEquals(calls[0].temperature, undefined);
    assertEquals(calls[0].tool_choice, { type: "function", name: "review_carousel_fields" });
    assertEquals(output.editorial_review.model, "gpt-6-astra");
    assertEquals(output.editorial_review.total_usage, { input_tokens: 1, output_tokens: 1, total_tokens: 2 });
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

Deno.test("brief actuel : ses limites sont séparées du contexte général de marque", async () => {
  const draft = { slides: [{ body: "Porte-savon en céramique, 18 euros." }] };
  await mockReview(JSON.stringify(cleanReview(draft as any)), async calls => {
    await applyCorrectionPassCarousel(JSON.stringify(draft), { semanticReview: true,
      sourceContext: "La marque possède une boutique en ligne.", currentBrief: "Porte-savon : aucune disponibilité communiquée. Ton descriptif." });
    const message = calls[0].input[0].content;
    assertStringIncludes(message, "BRIEF ACTUEL PRIORITAIRE");
    assertStringIncludes(message, "aucune disponibilité communiquée");
    assertStringIncludes(message, "Une information déclarée absente dans CE brief reste absente");
    assertEquals(message.indexOf("BRIEF ACTUEL PRIORITAIRE") > message.indexOf("REPÈRES SOURCE"), true);
  });
});

for (const failure of ["missing-key", "network", "wrong-model", "incomplete"]) Deno.test(`Astra ${failure} : conserve le brouillon, statut explicite, aucun fallback`, async () => {
  const previousFetch = globalThis.fetch, key = Deno.env.get("OPENAI_API_KEY");
  let calls = 0;
  if (failure === "missing-key") Deno.env.delete("OPENAI_API_KEY"); else Deno.env.set("OPENAI_API_KEY", "test-only");
  globalThis.fetch = (async () => {
    calls++;
    if (failure === "network") throw new Error("Private provider error must not escape");
    return new Response(JSON.stringify({ model: failure === "wrong-model" ? "gpt-other" : "gpt-6-astra", status: "incomplete" }));
  }) as typeof fetch;
  try {
    const output = JSON.parse(await applyCorrectionPassCarousel(JSON.stringify(doc), { semanticReview: true }));
    assertEquals(output.slides, doc.slides);
    assertEquals(output.caption, doc.caption);
    assertEquals(output.editorial_review.status, "unavailable");
    assertEquals(output.editorial_review.model, null);
    assertEquals(output.editorial_review.requested_model, "gpt-6-astra");
    assertEquals(calls, failure === "missing-key" ? 0 : 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (key === undefined) Deno.env.delete("OPENAI_API_KEY"); else Deno.env.set("OPENAI_API_KEY", key);
  }
});

Deno.test("Astra : seconde passe garde le brouillon de comparaison et cumule seulement son usage", async () => {
  await mockReview(JSON.stringify(cleanReview()), async calls => {
    const first = await applyCorrectionPassCarousel(JSON.stringify(doc), { semanticReview: true });
    const second = JSON.parse(await applyCorrectionPassCarousel(first, { semanticReview: true, reviewBaseline: JSON.stringify(doc) }));
    assertStringIncludes(calls[1].input[0].content, "BROUILLON AVANT RELECTURE");
    assertEquals(second.editorial_review.total_usage, { input_tokens: 2, output_tokens: 2, total_tokens: 4 });
    assertEquals(second.slides, doc.slides);
    // A new first pass must not inherit an unrelated previous usage count.
    const fresh = JSON.parse(await applyCorrectionPassCarousel(first, { semanticReview: true }));
    assertEquals(fresh.editorial_review.total_usage.total_tokens, 2);
  });
});
