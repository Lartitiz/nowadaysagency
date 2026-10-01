import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { matchFinalPhotos } from "./final-photo-match.ts";
import { progressionReceipt } from "../_shared/carousel-progression.ts";
import { invalidateProgressionReceipt, progressionMaterial } from "../_shared/carousel-editorial-snapshot.ts";
const fixture = () => ({
  slides: [
    { slide_type: "photo_full", photo_index: 1, overlay_text: "Les cerises peintes sur les bols accompagnent les repas.", visual_anchor: "Pot rose" },
    { slide_type: "photo_integrated", photo_index: 2, body: "Un objet familier prend sa place dans le quotidien." },
    { slide_type: "text_only", photo_index: null, body: "Les souvenirs se construisent aussi par l'usage." },
  ], caption: { body: "Un propos suivi." }, structure_warnings: ["Un conseil éditorial"],
});
const options = () => ({ body: { photos: [{ base64: "cG90", libraryContext: "Pot rose" }, { base64: "Ym9scw==", context: "Mes bols", libraryContext: "Cerises" }] }, startedAt: Date.now(), usage: {}, emitStatus() {} });
const proposals = () => [
  { slide: 1, photo: 2, relation: "literal", reason: "Les cerises sont visibles sur les bols.", directive: "Les véritables bols ornés de cerises." },
  { slide: 2, photo: 1, relation: "ambient", reason: "La pièce accompagne une idée sur les objets familiers.", directive: "Une pièce dans un intérieur quotidien." },
];
const accepted = () => proposals().map(a => ({ slide: a.slide, photo: a.photo, accepted: true, reason: a.reason }));

Deno.test("une directive vide ne bloque pas les photos contrôlées indépendamment", async () => {
  let calls = 0;
  const result = await matchFinalPhotos(fixture(), { ...options(), call: async () =>
    JSON.stringify({ assignments: calls++ ? accepted() : proposals().map((a, i) => i ? a : { ...a, directive: "" }) }) });
  assertEquals(calls, 2);
  assertEquals(result.slides.map((s: any) => s.photo_index), [2, 1, null]);
  assert(result.slides[0].photo_directive.includes("cerises"));
  assertEquals(result.photo_review.verdict, "acceptable");
});

for (const inconsistent of [
  { photo: null, relation: "literal" },
  { photo: 2, relation: "missing" },
  { photo: 2, relation: "unknown" },
]) Deno.test(`une relation incohérente isole la slide sans valider sa photo : ${JSON.stringify(inconsistent)}`, async () => {
  let calls = 0;
  const result = await matchFinalPhotos(fixture(), { ...options(), call: async (o) => {
    if (!calls++) return JSON.stringify({ assignments: proposals().map((a, i) => i ? a : { ...a, ...inconsistent, directive: "" }) });
    const data = JSON.parse((o.messages[0].content as any[])[0].text);
    assertEquals(data.assignments[0].photo, null);
    assertEquals(data.assignments[0].relation, "missing");
    return JSON.stringify({ assignments: accepted().map((a, i) => i ? a : { ...a, photo: null, accepted: true }) });
  } });
  assertEquals(calls, 2);
  assertEquals(result.slides.map((s: any) => s.photo_index), [null, 1, null]);
  assertEquals(result.photo_review.execution_status, "completed");
  assertEquals(result.photo_review.verdict, "needs_images");
  assertEquals(result.photo_review.issues.length, 1);
});

Deno.test("récit final : bols à cerises au bon passage, ambiance permise, pixels et textes dans les deux passes", async () => {
  const doc: any = fixture(); doc.progression_review = { ...await progressionReceipt(doc, "completed"), verdict: "acceptable" };
  const before = structuredClone(doc), opts = options(); let calls = 0;
  const result = await matchFinalPhotos(doc, { ...opts, call: async (o, sink) => {
    const content: any[] = o.messages[0].content as any[];
    assertEquals(content.filter(c => c.type === "image").map(c => c.source.data), ["cG90", "Ym9scw=="]);
    assert(content[0].text.includes(doc.slides[0].overlay_text));
    assert(!content[0].text.includes("visual_anchor"));
    assertEquals(o.tool?.name, calls ? "verifier_associations" : "choisir_photos");
    assertEquals(o.maxRetries, 0);
    assert((o.abortTimeoutMs || 0) <= 45000);
    const schema: any = o.tool?.input_schema;
    assertEquals(schema.properties.assignments.items.properties.slide.enum, [1, 2]);
    assertEquals(schema.properties.assignments.items.properties.photo.enum, [1, 2, null]);
    assertEquals(JSON.parse(content[0].text).required_photo_slides, [1, 2]);
    if (sink) sink.total_tokens = 7;
    return JSON.stringify({ assignments: calls++ ? accepted() : proposals() });
  } });
  assertEquals(calls, 2); assertEquals(opts.usage, { input_tokens: 0, output_tokens: 0, total_tokens: 14 });
  assertEquals(result.slides.map((s: any) => s.photo_index), [2, 1, null]);
  assertEquals(result.slides.map((s: any) => s.overlay_text || s.body), doc.slides.map((s: any) => s.overlay_text || s.body));
  assertEquals(result.caption, doc.caption); assertEquals(doc, before);
  assertEquals(result.slides[0].visual_anchor, undefined);
  assertEquals(result.photo_review.verdict, "acceptable");
  assertEquals(result.progression_review.reviewed_material, progressionMaterial(result));
  assertEquals(invalidateProgressionReceipt(result), result);
  assert(!JSON.stringify(result).includes("Ym9scw=="));
});

Deno.test("le diagnostic distingue troncature de sélection et réponse de vérification incomplète sans exposer le contenu", async () => {
  const truncated = await matchFinalPhotos(fixture(), { ...options(), call: async () => {
    throw Object.assign(new Error("private provider response"), { status: 422 });
  } });
  assertEquals(truncated.photo_review.reason, "selection-provider-422");
  assert(!JSON.stringify(truncated).includes("private provider response"));
  let calls = 0;
  const invalidReview = await matchFinalPhotos(fixture(), { ...options(), call: async () =>
    JSON.stringify({ assignments: calls++ ? accepted().slice(0, 1) : proposals() }) });
  assertEquals(invalidReview.photo_review.reason, "verification-coverage");
  assertEquals(invalidReview.photo_review.verdict, null);
});

Deno.test("budget réduit partagé entre les deux passes sans lancer une sélection limitée à une seconde", async () => {
  const opts = options(); opts.startedAt -= 240000;
  let calls = 0;
  const result = await matchFinalPhotos(fixture(), { ...opts, call: async (o) => {
    if (!calls) assert((o.abortTimeoutMs || 0) > 13000 && (o.abortTimeoutMs || 0) <= 14000);
    assertEquals(o.maxRetries, 0);
    return JSON.stringify({ assignments: calls++ ? accepted() : proposals() });
  } });
  assertEquals(result.photo_review.verdict, "acceptable");
});

Deno.test("vérification indépendante refuse l'image contradictoire sans substituer la première photo", async () => {
  let calls = 0;
  const result = await matchFinalPhotos(fixture(), { ...options(), call: async () => JSON.stringify({ assignments: calls++ ? accepted().map((a, i) => i ? a : { ...a, accepted: false, reason: "Ce sont des fleurs, pas des cerises." }) : proposals() }) });
  assertEquals(result.slides.map((s: any) => s.photo_index), [null, 1, null]);
  assert(result.slides[0].photo_directive);
  assertEquals(result.photo_review.verdict, "needs_images");
  assert(result.structure_warnings.some((s: string) => s.includes("Slide 1 : image à choisir")));
});

for (const failure of ["missing", "duplicate", "out-of-range", "review-incomplete", "transport"]) Deno.test(`aucune validation trompeuse : ${failure}`, async () => {
  let calls = 0;
  const result = await matchFinalPhotos(fixture(), { ...options(), call: async () => {
    if (failure === "transport") throw new Error("offline");
    let rows: any[] = calls++ ? accepted() : proposals();
    if (calls === 1) {
      if (failure === "missing") rows = rows.slice(0, 1);
      if (failure === "duplicate") rows = [rows[0], rows[0]];
      if (failure === "out-of-range") rows[0].photo = 9;
    } else {
      if (failure === "review-incomplete") rows.pop();
    }
    return JSON.stringify({ assignments: rows });
  } });
  assertEquals(result.slides.map((s: any) => s.photo_index), [null, null, null]);
  assertEquals(result.photo_review.verdict, null);
  assertEquals(result.photo_review.execution_status, "unavailable");
});

for (const changed of [null, 1, 9]) Deno.test(`une photo modifiée par le vérificateur est refusée seule : ${changed}`, async () => {
  let calls = 0;
  const result = await matchFinalPhotos(fixture(), { ...options(), call: async () => JSON.stringify({
    assignments: calls++ ? accepted().map((a, i) => i ? a : { ...a, photo: changed, accepted: true }) : proposals(),
  }) });
  assertEquals(result.slides.map((s: any) => s.photo_index), [null, 1, null]);
  assertEquals(result.photo_review.execution_status, "completed");
  assertEquals(result.photo_review.verdict, "needs_images");
  assertEquals(result.photo_review.issues.length, 1);
});

Deno.test("une acceptation non booléenne est refusée sans perdre les autres contrôles", async () => {
  let calls = 0;
  const result = await matchFinalPhotos(fixture(), { ...options(), call: async () => JSON.stringify({
    assignments: calls++ ? accepted().map((a, i) => i ? a : { ...a, accepted: "true" }) : proposals(),
  }) });
  assertEquals(result.slides.map((s: any) => s.photo_index), [null, 1, null]);
  assertEquals(result.photo_review.verdict, "needs_images");
});

for (const missing of ["pixels", "time"]) Deno.test(`absence de ${missing} : brouillon conservé et images à choisir`, async () => {
  const opts = options(); if (missing === "pixels") opts.body.photos = []; else opts.startedAt -= 268000;
  const result = await matchFinalPhotos(fixture(), { ...opts, call: () => { throw new Error("must not call"); } });
  assertEquals(result.slides.map((s: any) => s.photo_index), [null, null, null]);
  assertEquals(result.photo_review.execution_status, "skipped");
});

Deno.test("modification ultérieure du texte ou de la photo invalide le reçu visuel", async () => {
  let calls = 0;
  const result = await matchFinalPhotos(fixture(), { ...options(), call: async () => JSON.stringify({ assignments: calls++ ? accepted() : proposals() }) });
  for (const change of [{ photo_index: 1 }, { overlay_text: "Un nouveau propos" }]) {
    const edited = { ...result, slides: result.slides.map((s: any, i: number) => i ? s : { ...s, ...change }) };
    const checked = invalidateProgressionReceipt(edited);
    assertEquals(checked.photo_review.execution_status, "stale");
    assertEquals(checked.photo_review.verdict, null);
    assert(checked.structure_warnings.some((s: string) => s.includes("Vérifie leurs associations")));
  }
});
