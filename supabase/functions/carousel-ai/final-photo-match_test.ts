import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { balancePhotoRepeats, matchFinalPhotos } from "./final-photo-match.ts";
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
  const invalidReview = await matchFinalPhotos(fixture(), { ...options(), call: async (o) =>
    JSON.stringify(o.tool?.name === "choisir_photos" ? { assignments: proposals() } : { oops: true }) });
  assertEquals(invalidReview.photo_review.reason, "verification-coverage");
  assertEquals(invalidReview.photo_review.verification_attempts, 2);
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

for (const failure of ["transport", "selection-empty", "review-unparseable"]) Deno.test(`aucune validation trompeuse : ${failure}`, async () => {
  let calls = 0;
  const result = await matchFinalPhotos(fixture(), { ...options(), call: async () => {
    if (failure === "transport") throw new Error("offline");
    if (calls++ === 0) return JSON.stringify({ assignments: failure === "selection-empty" ? [] : proposals() });
    return "{not json";
  } });
  assertEquals(result.slides.map((s: any) => s.photo_index), [null, null, null]);
  assertEquals(result.slides.filter((s: any) => s.photo_match).map((s: any) => s.photo_match.status), ["unverified", "unverified"]);
  assertEquals(result.photo_review.verdict, null);
  assertEquals(result.photo_review.execution_status, "unavailable");
});

// Bug réel du 04/10/2026 : une ligne manquante ou en trop dans la vérification
// jetait toutes les associations, même celles qui venaient d'être acceptées.
for (const shape of ["missing", "extra", "duplicate", "foreign"]) Deno.test(`vérification incomplète (${shape}) : relance limitée aux slides non contrôlées`, async () => {
  const required: number[][] = [];
  const result = await matchFinalPhotos(fixture(), { ...options(), call: async (o) => {
    const data = JSON.parse((o.messages[0].content as any[])[0].text);
    if (o.tool?.name === "choisir_photos") return JSON.stringify({ assignments: proposals() });
    required.push(data.required_photo_slides);
    assertEquals((o.tool?.input_schema as any).properties.assignments.items.properties.slide.enum, data.required_photo_slides);
    if (required.length === 2) return JSON.stringify({ assignments: accepted().filter(a => a.slide === 2) });
    let rows: any[] = accepted();
    if (shape === "missing") rows = rows.slice(0, 1);
    if (shape === "extra") rows = [...rows, { slide: 3, photo: 1, accepted: true, reason: "Ligne de trop." }];
    if (shape === "duplicate") rows = [rows[0], rows[1], { ...rows[1], accepted: false }];
    if (shape === "foreign") rows = [rows[0], { slide: 7, photo: 1, accepted: true, reason: "Slide inconnue." }];
    return JSON.stringify({ assignments: rows });
  } });
  assertEquals(required, shape === "extra" ? [[1, 2]] : [[1, 2], [2]]);
  assertEquals(result.slides.map((s: any) => s.photo_index), [2, 1, null]);
  assertEquals(result.photo_review.execution_status, "completed");
  assertEquals(result.photo_review.reason, "reviewed");
  assertEquals(result.photo_review.verdict, "acceptable");
});

Deno.test("vérification toujours incomplète après la relance : seule la slide manquante reste à choisir", async () => {
  let reviews = 0;
  const result = await matchFinalPhotos(fixture(), { ...options(), call: async (o) => {
    if (o.tool?.name === "choisir_photos") return JSON.stringify({ assignments: proposals() });
    return JSON.stringify({ assignments: reviews++ ? [] : accepted().slice(0, 1) });
  } });
  assertEquals(reviews, 2);
  assertEquals(result.slides.map((s: any) => s.photo_index), [2, null, null]);
  assertEquals(result.slides[1].photo_match.status, "unverified");
  assertEquals(result.photo_review.execution_status, "completed");
  assertEquals(result.photo_review.reason, "reviewed-partial");
  assertEquals(result.photo_review.verdict, "needs_images");
  assertEquals(result.photo_review.issues.length, 1);
});

Deno.test("échec technique de la 1re vérification : la relance peut encore valider", async () => {
  let reviews = 0;
  const result = await matchFinalPhotos(fixture(), { ...options(), call: async (o) => {
    if (o.tool?.name === "choisir_photos") return JSON.stringify({ assignments: proposals() });
    if (!reviews++) throw Object.assign(new Error("overloaded"), { status: 529 });
    return JSON.stringify({ assignments: accepted() });
  } });
  assertEquals(result.slides.map((s: any) => s.photo_index), [2, 1, null]);
  assertEquals(result.photo_review.verification_attempts, 2);
});

Deno.test("pas de relance quand le temps manque : slides non contrôlées laissées à choisir", async () => {
  let reviews = 0;
  const opts: any = { ...options(), call: async (o: any) => {
    if (o.tool?.name === "choisir_photos") return JSON.stringify({ assignments: proposals() });
    reviews++; opts.startedAt -= 265000;
    return JSON.stringify({ assignments: accepted().slice(0, 1) });
  } };
  const result = await matchFinalPhotos(fixture(), opts);
  assertEquals(reviews, 1);
  assertEquals(result.slides.map((s: any) => s.photo_index), [2, null, null]);
  assertEquals(result.photo_review.reason, "reviewed-partial");
});

for (const shape of ["missing", "duplicate", "out-of-range"]) Deno.test(`sélection incomplète (${shape}) : la slide concernée seule reste à choisir`, async () => {
  let reviewed: number[] = [];
  const result = await matchFinalPhotos(fixture(), { ...options(), call: async (o) => {
    if (o.tool?.name === "choisir_photos") {
      let rows: any[] = proposals();
      if (shape === "missing") rows = rows.slice(1);
      if (shape === "duplicate") rows = [rows[0], rows[0], rows[1]];
      if (shape === "out-of-range") rows[0].photo = 9;
      return JSON.stringify({ assignments: rows });
    }
    reviewed = JSON.parse((o.messages[0].content as any[])[0].text).required_photo_slides;
    return JSON.stringify({ assignments: accepted().filter(a => reviewed.includes(a.slide)) });
  } });
  assertEquals(reviewed, [2]);
  assertEquals(result.slides.map((s: any) => s.photo_index), [null, 1, null]);
  assertEquals(result.slides[0].photo_match.status, "missing");
  assertEquals(result.photo_review.execution_status, "completed");
  assertEquals(result.photo_review.verdict, "needs_images");
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

// Visite du 05/10 (carrousel mixte, 2 photos importées) : le récit continu pose
// une place photo sur chaque slide sauf la dernière (7 places pour 2 photos).
// La vérification refusait à juste titre un portrait sur « fabrication du
// savon » → 5-6 slides « image à choisir », « Créer les visuels » bloqué.
const mixDoc = () => ({
  carousel_type: "mix",
  slides: [
    { slide_type: "photo_full", overlay_text: "5 rituels slow pour ta com'", template: "couverture", overlay_position: "bottom_center", overlay_style: "narratif" },
    { slide_type: "photo_integrated", title: "", body: "Je fabrique mes savons à la main, en petites séries." },
    { slide_type: "photo_full", overlay_text: "Rituel 2 : écrire avant de publier." },
    { slide_type: "photo_full", overlay_text: "Je t'écris à toi, une seule personne." },
    { slide_type: "text_only", title: "", body: "Et toi, quel rituel ?" },
  ], caption: { body: "Légende." },
});
const mixCall = (verifyAccepts = true) => {
  let calls = 0;
  return async () => JSON.stringify({ assignments: calls++
    ? [{ slide: 1, photo: 2, accepted: verifyAccepts, reason: "Le visuel titre correspond à l'accroche." },
      { slide: 4, photo: 1, accepted: true, reason: "Portrait en ambiance pour l'adresse directe." }]
    : [{ slide: 1, photo: 2, relation: "literal", reason: "Le visuel titre correspond à l'accroche.", directive: "La couverture." },
      { slide: 2, photo: null, relation: "missing", reason: "Aucune photo ne montre un savon fait main.", directive: "Un savon fait main." },
      { slide: 3, photo: null, relation: "missing", reason: "Rien ne montre l'écriture.", directive: "Un carnet." },
      { slide: 4, photo: 1, relation: "ambient", reason: "Portrait en ambiance pour l'adresse directe.", directive: "Un visage." }] });
};

Deno.test("mixte : une place photo sans photo importée qui la soutient devient une slide texte, les photos validées restent", async () => {
  const doc = mixDoc();
  const result = await matchFinalPhotos(doc, { ...options(), body: { ...options().body, carousel_type: "mix" }, call: mixCall() });
  assertEquals(result.slides.map((s: any) => s.slide_type), ["photo_full", "text_only", "text_only", "photo_full", "text_only"]);
  assertEquals(result.slides.map((s: any) => s.photo_index ?? null), [2, null, null, 1, null]);
  // Le texte publié ne bouge pas : il change seulement de champ.
  assertEquals(result.slides[1].body, doc.slides[1].body);
  assertEquals(result.slides[2].body, "Rituel 2 : écrire avant de publier.");
  assertEquals(result.slides[2].overlay_text, undefined);
  // Plus rien à « choisir » : le front compte photo_directive sans photo_index.
  assert(result.slides.every((s: any) => Number.isInteger(s.photo_index) || !s.photo_directive));
  assertEquals(result.photo_review.verdict, "acceptable");
  assertEquals(result.photo_review.issues, []);
  assertEquals(result.photo_review.converted_to_text, [2, 3]);
  assert(!(result.structure_warnings || []).some((w: string) => w.includes("image à choisir")));
});

// Re-test live du 05/10 : il restait « 1 image à choisir » — le portrait
// proposé pour « une liste d'ingrédients lisible » refusé par la vérification.
// Un refus = aucune photo importée ne soutient le passage : slide texte aussi.
Deno.test("mixte : une photo refusée par la vérification devient aussi une slide texte", async () => {
  const result = await matchFinalPhotos(mixDoc(), { ...options(), body: { ...options().body, carousel_type: "mix" }, call: mixCall(false) });
  assertEquals(result.slides[0].slide_type, "text_only");
  assertEquals(result.slides[0].title, "5 rituels slow pour ta com'");
  assertEquals(result.slides[0].photo_index, null);
  assertEquals(result.slides[3].photo_index, 1);
  assertEquals(result.photo_review.converted_to_text, [1, 2, 3]);
  assertEquals(result.photo_review.verdict, "acceptable");
});

Deno.test("mixte : une slide restée sans contrôle (vérification partielle) reste « image à choisir »", async () => {
  let calls = 0;
  const call = async () => JSON.stringify({ assignments: calls++
    ? [{ slide: 4, photo: 1, accepted: true, reason: "Portrait en ambiance." }]
    : [{ slide: 1, photo: 2, relation: "literal", reason: "Le visuel titre.", directive: "La couverture." },
      { slide: 2, photo: null, relation: "missing", reason: "Rien.", directive: "Un savon." },
      { slide: 3, photo: null, relation: "missing", reason: "Rien.", directive: "Un carnet." },
      { slide: 4, photo: 1, relation: "ambient", reason: "Portrait en ambiance.", directive: "Un visage." }] });
  const result = await matchFinalPhotos(mixDoc(), { ...options(), startedAt: Date.now() - 240000, body: { ...options().body, carousel_type: "mix" }, call });
  assertEquals(result.slides[0].slide_type, "photo_full");
  assertEquals(result.slides[0].photo_match.status, "unverified");
  assertEquals(result.photo_review.converted_to_text, [2, 3]);
});

Deno.test("mixte : vérification indisponible → aucune conversion, places gardées « à choisir »", async () => {
  const result = await matchFinalPhotos(mixDoc(), { ...options(), body: { ...options().body, carousel_type: "mix" }, call: async () => { throw new Error("boom"); } });
  assertEquals(result.slides.map((s: any) => s.slide_type), mixDoc().slides.map((s) => s.slide_type));
  assertEquals(result.photo_review.converted_to_text, []);
});

Deno.test("carrousel photo : une place sans photo reste une slide photo, sa photo posée en ambiance (09/10)", async () => {
  const result = await matchFinalPhotos(mixDoc(), { ...options(), body: { ...options().body, carousel_type: "photo" }, call: mixCall() });
  assertEquals(result.slides[1].slide_type, "photo_integrated");
  assertEquals(result.slides[2].slide_type, "photo_full");
  assert(result.slides.filter((s: any) => s.slide_type !== "text_only").every((s: any) => Number.isInteger(s.photo_index)));
  assertEquals(result.photo_review.verdict, "acceptable");
});

// Choix de Laetitia (09/10/2026) : en « Tes photos en fond », une slide sans photo
// vérifiée reçoit une photo de l'utilisatrice en ambiance au lieu de « Image à choisir ».
Deno.test("Tes photos en fond : aucune photo vérifiée → ses photos posées en ambiance, alternées, sans alerte", async () => {
  const doc: any = { carousel_type: "photo", slides: Array.from({ length: 6 }, (_, i) =>
    ({ slide_type: "photo_full", overlay_text: `Passage ${i + 1} sur le savon.` })), caption: { body: "Légende." } };
  const opts: any = { ...options(), body: { ...options().body, carousel_type: "photo" } };
  const result = await matchFinalPhotos(doc, { ...opts, call: async () => JSON.stringify({ assignments:
    [1, 2, 3, 4, 5, 6].map(slide => ({ slide, photo: null, relation: "missing", reason: "Aucune photo ne montre de savon.", directive: "Un savon artisanal." })) }) });
  assertEquals(result.slides.map((s: any) => s.photo_index), [1, 2, 1, 2, 1, 2]);
  assertEquals(result.slides.map((s: any) => s.photo_match.status), Array(6).fill("ambient_fallback"));
  assertEquals(result.slides[0].photo_directive, "Un savon artisanal.");
  assertEquals(result.photo_review.ambient_fallback, [1, 2, 3, 4, 5, 6]);
  assertEquals(result.photo_review.verdict, "acceptable");
  assertEquals(result.photo_review.issues, []);
  assert(!result.structure_warnings.some((w: string) => w.includes("image à choisir")));
});

Deno.test("Tes photos en fond : la photo vérifiée reste, l'ambiance évite la photo refusée et la voisine", async () => {
  const doc: any = { carousel_type: "photo", ...fixture() };
  doc.slides = [doc.slides[0], doc.slides[1], { slide_type: "photo_full", overlay_text: "Un troisième passage." }];
  const opts: any = { ...options(), body: { ...options().body, photos: [...options().body.photos, { base64: "dHJvaXM=" }], carousel_type: "photo" } };
  let calls = 0;
  const result = await matchFinalPhotos(doc, { ...opts, call: async () => JSON.stringify({ assignments: calls++
    ? [{ slide: 1, photo: 2, accepted: true, reason: "Les cerises sont visibles." }, { slide: 2, photo: 1, accepted: false, reason: "Contradiction." }]
    : [...proposals(), { slide: 3, photo: null, relation: "missing", reason: "Rien ne convient.", directive: "" }] }) });
  // slide 1 : photo 2 vérifiée ; slide 2 : photo 1 refusée → la 3 (jamais utilisée) ;
  // slide 3 : la 1 (moins utilisée, différente de la voisine 3).
  assertEquals(result.slides.map((s: any) => s.photo_index), [2, 3, 1]);
  assertEquals(result.slides.map((s: any) => s.photo_match.status), ["matched", "ambient_fallback", "ambient_fallback"]);
  assertEquals(result.photo_review.verdict, "acceptable");
});

Deno.test("mixte et échec technique : pas d'ambiance imposée hors « Tes photos en fond »", async () => {
  const fail = await matchFinalPhotos(fixture(), { ...options(), call: async () => { throw new Error("offline"); } });
  assertEquals(fail.slides.map((s: any) => s.photo_index), [null, null, null]);
  const mix: any = { ...fixture(), carousel_type: "mix" };
  let calls = 0;
  const out = await matchFinalPhotos(mix, { ...options(), call: async () => JSON.stringify({ assignments: calls++
    ? accepted().map((a, i) => i ? a : { ...a, accepted: false, reason: "Ce sont des fleurs." }) : proposals() }) });
  assertEquals(out.slides[0].slide_type, "text_only");
  assertEquals(out.photo_review.ambient_fallback, []);
});

Deno.test("Tes photos en fond : pas trois fois la même photo d'affilée quand l'autre est déjà très utilisée", async () => {
  // Vu en ligne le 09/10 : portrait vérifié sur 1, 2, 6, 7 → l'ambiance posait le visuel 2 sur 3, 4 et 5.
  const doc: any = { carousel_type: "photo", slides: Array.from({ length: 7 }, (_, i) =>
    ({ slide_type: "photo_full", overlay_text: `Passage ${i + 1}.` })), caption: { body: "Légende." } };
  const opts: any = { ...options(), body: { ...options().body, carousel_type: "photo" } };
  const ok = [1, 2, 6, 7];
  let calls = 0;
  const result = await matchFinalPhotos(doc, { ...opts, call: async () => JSON.stringify({ assignments: calls++
    ? ok.map(slide => ({ slide, photo: 1, accepted: true, reason: "Portrait de la créatrice." }))
    : [1, 2, 3, 4, 5, 6, 7].map(slide => ok.includes(slide)
      ? { slide, photo: 1, relation: "ambient", reason: "Présence.", directive: "Portrait." }
      : { slide, photo: null, relation: "missing", reason: "Rien.", directive: "" }) }) });
  assertEquals(result.slides.map((s: any) => s.photo_index), [1, 1, 2, 1, 2, 1, 1]);
});

// Test réel du 09/10/2026 : photos posées [1,2,3,3,2,3,3,2,3,2], photo 3 sur 5
// slides, photo 1 sur 1. Seuil choisi par Laetitia : arrondi sup. de 10 ÷ 3 = 4.
const CASE_0910 = [1, 2, 3, 3, 2, 3, 3, 2, 3, 2];
Deno.test("répétition (09/10) : une slide en ambiance de la photo trop utilisée passe à la moins utilisée", () => {
  const verified = new Set([1, 2, 3, 5, 6, 8, 9, 10]); // slides 4 et 7 posées en ambiance
  const out = balancePhotoRepeats(CASE_0910.map((photo, i) => ({ photo, ambient: !verified.has(i + 1), rejected: null })), [1, 2, 3]);
  // Slide 4 : la 3 passe à la 1 (seuil) ; slide 7 : plus collée à la 3 de la slide 6.
  assertEquals(out.photos, [1, 2, 3, 1, 2, 3, 1, 2, 3, 2]);
  assertEquals(out.moved, [4, 7]);
  assertEquals(out.over, []);
});

Deno.test("répétition (09/10) : toutes vérifiées → rien ne bouge, l'excès est seulement signalé", () => {
  const out = balancePhotoRepeats(CASE_0910.map(photo => ({ photo, ambient: false, rejected: null })), [1, 2, 3]);
  assertEquals(out.photos, CASE_0910);
  assertEquals(out.moved, []);
  assertEquals(out.over, [{ photo: 3, count: 5, max: 4 }]);
});

Deno.test("répétition : jamais vers une voisine, la photo refusée pour ce passage seulement en dernier recours", () => {
  const slot = (photo: number, ambient = false, rejected: number | null = null) => ({ photo, ambient, rejected });
  // La 1 (refusée) et la 2 conviennent : la 2 d'abord.
  assertEquals(balancePhotoRepeats([slot(3), slot(3, true, 1), slot(3), slot(2)], [1, 2, 3]).photos, [3, 2, 3, 2]);
  // Seule la 1 (refusée) n'est pas voisine : elle est posée plutôt qu'un 5e passage de la 3.
  assertEquals(balancePhotoRepeats(CASE_0910.map((p, i) => slot(p, i === 3, i === 3 ? 1 : null)), [1, 2, 3]).photos, [1, 2, 3, 1, 2, 3, 3, 2, 3, 2]);
  // Collées mais sous le seuil : une photo encore disponible les sépare.
  assertEquals(balancePhotoRepeats([slot(1), slot(1, true), slot(2), slot(3)], [1, 2, 3]).photos, [1, 3, 2, 3]);
  // Toutes voisines : rien ne bouge, l'excès est signalé.
  const stuck = balancePhotoRepeats([slot(1), slot(2, true), slot(1), slot(2), slot(2), slot(2)], [1, 2]);
  assertEquals(stuck.photos, [1, 2, 1, 2, 2, 2]);
  assertEquals(stuck.over, [{ photo: 2, count: 4, max: 3 }]);
});

Deno.test("répétition : répartition déjà équilibrée, une seule photo → aucun changement ; une slide texte coupe le voisinage", () => {
  assertEquals(balancePhotoRepeats([1, 2, 3, 1, 2, 3, 1, 2, 3, 1].map(photo => ({ photo, ambient: true, rejected: null })), [1, 2, 3]).moved, []);
  assertEquals(balancePhotoRepeats([1, 1, 1].map(photo => ({ photo, ambient: true, rejected: null })), [1]).over, []);
  const mixed = balancePhotoRepeats([{ photo: 1, ambient: true, rejected: null }, { photo: null, ambient: false, rejected: null }, { photo: 1, ambient: true, rejected: null }], [1, 2]);
  assertEquals(mixed.photos, [2, null, 1]);
  assertEquals(mixed.over, []);
});

Deno.test("Tes photos en fond : le cas du 09/10 de bout en bout, reçus à jour, signalement seulement s'il reste un excès", async () => {
  const doc: any = { carousel_type: "photo", slides: CASE_0910.map((_, i) => ({ slide_type: "photo_full", overlay_text: `Passage ${i + 1}.` })), caption: { body: "Légende." } };
  doc.progression_review = { ...await progressionReceipt(doc, "completed"), verdict: "acceptable" };
  const photos = [{ base64: "dW4=" }, { base64: "ZGV1eA==" }, { base64: "dHJvaXM=" }];
  const opts: any = { ...options(), body: { photos, carousel_type: "photo" } };
  const verified = [1, 2, 3, 5, 6, 8, 9, 10];
  // Slides 4 et 7 : la photo 1 proposée puis refusée. Sans contrôle, le choix
  // d'ambiance écarte la 1 (refusée) et la 2 (voisine) → la 3, comme le 09/10.
  const run = (accept: number[]) => { let calls = 0; return matchFinalPhotos(structuredClone(doc), { ...opts, call: async () => JSON.stringify({ assignments: calls++
    ? CASE_0910.map((photo, i) => accept.includes(i + 1)
      ? { slide: i + 1, photo, accepted: true, reason: "Visible." }
      : { slide: i + 1, photo: 1, accepted: false, reason: "Ce détail n'est pas visible." })
    : CASE_0910.map((photo, i) => ({ slide: i + 1, photo: accept.includes(i + 1) ? photo : 1, relation: "ambient", reason: "Présence.", directive: "Atelier." })) }) }); };
  const balanced = await run(verified);
  assertEquals(balanced.photo_review.ambient_fallback, [4, 7]);
  const counts = (r: any) => [1, 2, 3].map(id => r.slides.filter((s: any) => s.photo_index === id).length);
  assert(Math.max(...counts(balanced)) <= 4, `répartition ${counts(balanced)}`);
  assertEquals(balanced.slides.filter((s: any, i: number) => verified.includes(i + 1)).map((s: any) => s.photo_index), verified.map(n => CASE_0910[n - 1]));
  assertEquals(balanced.slides.map((s: any) => s.photo_index), [1, 2, 3, 1, 2, 3, 1, 2, 3, 2]);
  assertEquals(balanced.photo_review.rebalanced, [4, 7]);
  assertEquals(balanced.photo_review.verdict, "acceptable");
  assertEquals(balanced.photo_review.issues, []);
  assertEquals(balanced.photo_review.repeated_photos, []);
  assert(balanced.photo_review.rebalanced.length > 0);
  // Les reçus sont pris sur les photos FINALES : rien n'apparaît « changé » à l'écran.
  assertEquals(balanced.photo_review.assignments.map((a: any) => a.photo), balanced.slides.map((s: any) => s.photo_index));
  assertEquals(balanced.photo_review.reviewed_material, progressionMaterial(balanced));
  assertEquals(balanced.progression_review.reviewed_material, progressionMaterial(balanced));
  assertEquals(invalidateProgressionReceipt(balanced).structure_warnings, balanced.structure_warnings);

  const allVerified = await run(CASE_0910.map((_, i) => i + 1));
  assertEquals(allVerified.slides.map((s: any) => s.photo_index), CASE_0910);
  const sentence = "La photo 3 revient sur 5 slides : tu peux en changer quelques-unes.";
  assert(allVerified.structure_warnings.includes(sentence));
  assertEquals(allVerified.photo_review.issues, [sentence]);
  assertEquals(allVerified.photo_review.repeat_warnings, [sentence]);
  assertEquals(allVerified.photo_review.verdict, "acceptable");
  // Dès qu'elle change une photo, le signalement disparaît avec les autres constats photo.
  const edited = structuredClone(allVerified); edited.slides[3].photo_index = 1;
  assert(!invalidateProgressionReceipt(edited).structure_warnings.includes(sentence));
});
