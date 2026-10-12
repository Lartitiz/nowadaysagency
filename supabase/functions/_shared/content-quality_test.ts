import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildContentPreview, CAROUSEL_PLAN_FORMAT, carouselDurations, carouselPlanErrorCode, carouselPlanReport, logCarouselPlan } from "./content-quality.ts";

Deno.test("carrousel : aperçu depuis { slides, caption }", () => {
  const content = JSON.stringify({
    slides: [{ title: "Le vrai coût d'un logo" }, { title: "Étape 2" }],
    caption: { hook: "On parle argent.", body: "Détail.", cta: "Dis-moi." },
  });
  const p = buildContentPreview(content, "Prix d'un logo");
  assertEquals(p?.sujet, "Prix d'un logo");
  assertEquals(p?.hook, "Le vrai coût d'un logo");
  assertEquals((p?.apercu_slides as string[]).length, 2);
});

// Régression 03/08/2026 : le hook lisait `slides[0].title` en dur, que le mixte
// et le photo n'ont pas (ils portent `overlay_text`) → il retombait sur la
// LÉGENDE, et le juge de la routine hebdo notait l'accroche de ces 2 formats sur
// un texte qui n'était pas leur slide 1.
Deno.test("carrousel mixte/photo : le hook vient de overlay_text, PAS de la légende", () => {
  const content = JSON.stringify({
    slides: [
      { slide_number: 1, photo_index: 1, overlay_text: "On cherche des visages. Pas des mannequins." },
      { slide_number: 2, slide_type: "text_only", overlay_text: "20 ans à ne pas être crue" },
    ],
    caption: {
      hook: "Le 22 août, on ne shoote pas des mannequins. On shoote des femmes qui savent exactement ce que c'est, cette douleur qu'on ne croit jamais assez sérieuse.",
      body: "Chez Calyra, j'ai mis presque 20 ans à être entendue.",
    },
  });
  const p = buildContentPreview(content, "Casting Calyra");
  assertEquals(p?.hook, "On cherche des visages. Pas des mannequins.");
  // La légende reste lisible à part, elle ne sert juste plus de hook.
  assertEquals(typeof p?.caption === "string" && (p!.caption as string).startsWith("Le 22 août"), true);
});

Deno.test("carrousel : la légende reste le repli si la slide 1 est vide", () => {
  const content = JSON.stringify({
    slides: [{ slide_number: 1, photo_index: 1, overlay_text: "   " }],
    caption: { hook: "Accroche de secours." },
  });
  assertEquals(buildContentPreview(content, "Sujet")?.hook, "Accroche de secours.");
});

Deno.test("stories : aperçu depuis { stories:[{text}] }", () => {
  const content = JSON.stringify({
    stories: [
      { number: 1, text: "Là je prépare mon atelier storytelling." },
      { number: 2, text: "Le truc c'est de raconter POURQUOI." },
      { number: 3, text: "En vrai, ça change tout." },
      { number: 4, text: "Petite question pour toi." },
      { number: 5, text: "Écris-moi si ça te parle." },
    ],
  });
  const p = buildContentPreview(content, "Coulisses de mon atelier");
  assertEquals(p?.sujet, "Coulisses de mon atelier");
  assertEquals(p?.hook, "Là je prépare mon atelier storytelling.");
  // Aperçu plafonné à 4 stories.
  assertEquals((p?.apercu_slides as string[]).length, 4);
  assertEquals(p?.caption, "");
});

Deno.test("stories : hook de repli sur hook_options si text vide", () => {
  const content = JSON.stringify({
    stories: [{ number: 1, text: "", hook_options: { option_a: { text: "Faut qu'on parle." } } }],
  });
  const p = buildContentPreview(content, "Sujet");
  assertEquals(p?.hook, "Faut qu'on parle.");
});

Deno.test("reel : aperçu depuis { script:[{texte_parle}] }", () => {
  const content = JSON.stringify({
    script: [
      { section: "hook", texte_parle: "Mon premier devis faisait 9 pages." },
      { section: "body", texte_parle: "Personne ne l'a lu." },
    ],
  });
  const p = buildContentPreview(content, "Devis trop longs");
  assertEquals(p?.sujet, "Devis trop longs");
  assertEquals(p?.hook, "Mon premier devis faisait 9 pages.");
  assertEquals((p?.apercu_slides as string[]).length, 2);
});

Deno.test("linkedin : aperçu depuis { content } (texte libre)", () => {
  const content = JSON.stringify({ content: "Première ligne accroche.\n\nDeuxième paragraphe.\n\nTroisième." });
  const p = buildContentPreview(content, "Mon sujet LinkedIn");
  assertEquals(p?.sujet, "Mon sujet LinkedIn");
  assertEquals(p?.hook, "Première ligne accroche.");
  assertEquals((p?.apercu_slides as string[]).length, 3);
});

Deno.test("newsletter : hook = subject depuis { subject, content }", () => {
  const content = JSON.stringify({ subject: "Objet accrocheur", content: "Corps de l'email.\n\nSuite." });
  const p = buildContentPreview(content, undefined);
  assertEquals(p?.hook, "Objet accrocheur");
  assertEquals(p?.sujet, "Objet accrocheur");
});

Deno.test("séquence vide + pas de sujet → null (rien à stocker)", () => {
  assertEquals(buildContentPreview(JSON.stringify({ stories: [] }), undefined), null);
  assertEquals(buildContentPreview(JSON.stringify({ script: [] }), undefined), null);
  assertEquals(buildContentPreview("pas du json", undefined), null);
});

// Coût de la relecture éditoriale (28/09/2026) : ses tokens ne vont pas dans
// ai_usage (chaque ligne y décompte un crédit) ; ils voyagent dans l'aperçu.
Deno.test("editorialUsage : lit le total des passes de relecture, entrée et sortie séparées", async () => {
  const { editorialUsage } = await import("./content-quality.ts");
  const content = JSON.stringify({
    slides: [{ title: "Titre" }],
    editorial_review: { model: "gpt-6-astra", pass: 2, usage: { model: "gpt-6-astra", input_tokens: 5510, output_tokens: 2249 },
      total_usage: { input_tokens: 9868, output_tokens: 4415, total_tokens: 14283 } },
  });
  assertEquals(editorialUsage(content), { model: "gpt-6-astra", input_tokens: 9868, output_tokens: 4415, pass: 2 });
  // Relecture jetée par la garde : l'issue et la raison voyagent avec le coût.
  const rejected = JSON.stringify({ slides: [], editorial_review: { model: "gpt-6-astra", status: "rejected", pass: 1, total_edits: 0,
    guard: ["lost-number:26"], total_usage: { input_tokens: 4358, output_tokens: 2166 } } });
  assertEquals(editorialUsage(rejected), { model: "gpt-6-astra", input_tokens: 4358, output_tokens: 2166,
    status: "rejected", pass: 1, total_edits: 0, guard: ["lost-number:26"] });
  // Relecture indisponible (usage vide) ou absente : rien à chiffrer.
  assertEquals(editorialUsage(JSON.stringify({ slides: [], editorial_review: { model: null, total_usage: { input_tokens: 0, output_tokens: 0 } } })), null);
  assertEquals(editorialUsage(JSON.stringify({ slides: [] })), null);
  assertEquals(editorialUsage("pas du json"), null);
});

Deno.test("durées du carrousel : nombres seulement, compteurs gardés, association résumée", () => {
  const d = carouselDurations("continuous_photo", { prep_ms: 12000.4, write_ms: 30000, thread_repair_skipped: 1, label_bidon: "texte", bad_ms: NaN, neg_ms: -1 }, {
    content: JSON.stringify({ slides: [{ overlay_text: "Secret" }, {}], photo_review: { execution_status: "unavailable", reason: "selection-timeout", ambient_fallback: [1, 2] } }),
    photos: 3,
  });
  assertEquals(d, { label: "continuous_photo", prep_ms: 12000, write_ms: 30000, thread_repair_skipped: 1, photos: 3, slides: 2,
    association: { status: "unavailable", raison: "selection-timeout", ambiance: 2 } });
  assertEquals(carouselDurations("express_full", { total_ms: 5 }, { content: "pas du json", avantSchemas: true }), { label: "express_full", total_ms: 5, avant_schemas: true });
  assertEquals(carouselDurations("photo", undefined), null);
});

// ── Plan des carrousels (12/10/2026) : nombres et codes seulement ──

const planSlides = (n: number, withPhoto = n) => Array.from({ length: n }, (_, i) => ({
  slide_number: i + 1, title_suggestion: `Titre secret ${i}`, strategic_note: "Note secrète", ...(i < withPhoto ? { photo_index: 1 } : {}),
}));

Deno.test("plan : compte rendu d'un plan rattrapé par le second appel, sans aucun texte", () => {
  const plan = carouselPlanReport({
    carouselType: "photo", durationMs: 123_456.7,
    hedge: { winner: 2, calls: 2, first_error: "structure_vide" },
    emptyPlans: 1, offLengthPlans: 0, photos: 3, requestedSlides: 10,
    response: { result: { slides: planSlides(10, 8), narrative_thread: "Fil secret" } },
  });
  assertEquals(plan, {
    type: "photo", duree_ms: 123_457, appels: 2, gagnant: 2, delai_depasse: false,
    plans_vides: 1, mauvaise_longueur: 0, photos: 3, slides_demandees: 10, slides_obtenues: 10,
    slides_avec_photo: 8, longueur_approchee: false, erreur: null, erreurs_appels: ["structure_vide"],
  });
  assertEquals(/secret/i.test(JSON.stringify(plan)), false, "jamais de texte du plan");
});

Deno.test("plan : erreurs rendues à l'écran et exceptions réduites à un code", () => {
  const base = { durationMs: 1, emptyPlans: 0, offLengthPlans: 0, photos: 0, requestedSlides: null };
  assertEquals(carouselPlanReport({ ...base, hedge: { winner: null, calls: 2, timed_out: true }, response: { error: "structure_timeout" } }).erreur, "structure_timeout");
  assertEquals(carouselPlanReport({ ...base, response: { error: "Impossible de parser la structure proposée" } }).erreur, "structure_illisible");
  assertEquals(carouselPlanReport({ ...base, thrown: Object.assign(new Error("Anthropic API error: overloaded « citation »"), { status: 529 }) }).erreur, "http_529");
  assertEquals(carouselPlanReport({ ...base, carouselType: "storytelling", response: null }).type, "texte");
  assertEquals(carouselPlanErrorCode("Anthropic fetch timeout après 35000ms"), "delai");
  assertEquals(carouselPlanErrorCode("La proposition de structure a pris trop de temps."), "delai");
  assertEquals(carouselPlanErrorCode(undefined), null);
  assertEquals(carouselPlanErrorCode("Le modèle a écrit n'importe quoi"), "autre");
});

Deno.test("plan : plan le plus proche rendu à une autre longueur que demandée", () => {
  const plan = carouselPlanReport({ carouselType: "mix", durationMs: 5, hedge: { winner: null, calls: 2, first_error: "structure_longueur", second_error: "structure_longueur" },
    emptyPlans: 0, offLengthPlans: 2, photos: 2, requestedSlides: 10, response: { result: { slides: planSlides(9, 4) } } });
  assertEquals([plan.mauvaise_longueur, plan.longueur_approchee, plan.slides_obtenues, plan.slides_avec_photo, plan.erreur], [2, true, 9, 4, null]);
  assertEquals(plan.erreurs_appels, ["structure_longueur", "structure_longueur"]);
});

Deno.test("plan : écrit dans content_quality_events au format carousel_plan ; compte test jamais", async () => {
  const inserts: any[] = [];
  const client = { from: (t: string) => ({ insert: (row: any) => { inserts.push({ t, row }); return Promise.resolve({ error: null }); } }) };
  await logCarouselPlan("52e6c03c-a7de-4c20-9b4a-276751f976e8", "w1", { duree_ms: 1 }, "m", client);
  assertEquals(inserts.length, 0, "Camille (compte test) n'écrit rien");
  await logCarouselPlan("u1", "w1", { duree_ms: 1 }, "claude-sonnet", client);
  assertEquals(inserts, [{ t: "content_quality_events", row: {
    user_id: "u1", workspace_id: "w1", format: CAROUSEL_PLAN_FORMAT, model: "claude-sonnet", redac_score: null, content_preview: { plan: { duree_ms: 1 } },
  } }]);
  // Échec d'écriture : avalé, le plan n'en sait rien.
  await logCarouselPlan("u1", null, {}, undefined, { from: () => ({ insert: () => Promise.resolve({ error: { message: "statement timeout" } }) }) });
});
