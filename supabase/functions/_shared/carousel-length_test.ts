import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { autoMaxSlides, carouselLengthPrompt, carouselStructureIssues, longTextSlides, structureRepairInstruction } from "./carousel-length.ts";

// 04/10/2026 (décision de Laetitia : « Jusqu'à 20 en texte ») : en longueur
// auto, le carrousel TEXTE découpe une idée par slide, jamais de texte raccourci.
Deno.test("découpage une idée par slide : carrousel texte auto seulement", () => {
  const auto = carouselLengthPrompt({ subject: "Ce que l'IA coûte", carousel_type: null });
  assert(auto.includes("UNE IDÉE PAR SLIDE") && auto.includes("sans raccourcir"));
  assert(auto.includes("de 4 à 20"));
  assert(!carouselLengthPrompt({ subject: "x", slide_count: 7 }).includes("UNE IDÉE PAR SLIDE"), "nombre imposé");
  assert(!carouselLengthPrompt({ subject: "x", carousel_type: "photo" }).includes("UNE IDÉE PAR SLIDE"), "photo : règle propre");
  assert(!carouselLengthPrompt({ subject: "x", carousel_type: "mix" }).includes("UNE IDÉE PAR SLIDE"), "mixte");
});

Deno.test("plafond auto : 20 en texte, 10 en photo et en mixte", () => {
  assertEquals(autoMaxSlides({ carousel_type: "prise_de_position" }), 20);
  assertEquals(autoMaxSlides({}), 20);
  assertEquals(autoMaxSlides({ carousel_type: "photo" }), 10);
  assertEquals(autoMaxSlides({ carousel_type: "mix" }), 10);
  assert(carouselLengthPrompt({ subject: "x", carousel_type: "photo" }).includes("de 4 à 10"));
  assert(carouselLengthPrompt({ subject: "x", carousel_type: "mix" }).includes("de 4 à 10"));
});

Deno.test("slides longues mesurées en texte auto, jamais coupées", () => {
  const long = Array.from({ length: 60 }, () => "mot").join(" ");
  const parsed = { slides: [{ slide_number: 1, title: long }, { slide_number: 2, title: "Court", body: "Une phrase." }, { slide_number: 3, body: long }] };
  assertEquals(longTextSlides(parsed, { subject: "x" }), [3]);
  assertEquals(longTextSlides(parsed, { subject: "x", slide_count: 3 }), []);
  assertEquals(longTextSlides(parsed, { subject: "x", carousel_type: "photo" }), []);
});

// Contrôle « liste promise » (« 5 erreurs… ») : il lit les champs du type de
// carrousel et accepte le titre seul suivi de son explication (ONE_IDEA_RULE).
const cover = { slide_number: 1, role: "hook", title: "5 erreurs qui freinent ta com" };
const end = { role: "conclusion", title: "Choisis-en une", body: "Corrige-la cette semaine." };
const listIssues = (slides: any[], body: any = { subject: "5 erreurs de communication" }) =>
  carouselStructureIssues({ slides: slides.map((s, i) => ({ slide_number: i + 1, ...s })) }, body).filter((i) => !/slides reçues/.test(i));

Deno.test("liste texte complète : aucun défaut", () => {
  const slides = [cover, ...[1, 2, 3, 4, 5].map((n) => ({ role: "erreur", title: `${n}. Erreur ${n}`, body: "Ce qui coince et quoi faire à la place." })), end];
  assertEquals(listIssues(slides), []);
});

Deno.test("liste photo : overlay_text, kicker et detail sont lus", () => {
  const body = { subject: "5 erreurs de communication", carousel_type: "photo" };
  const slides = [
    { role: "hook", overlay_text: "5 erreurs qui freinent ta com" },
    { role: "erreur", overlay_text: "1. Poster sans stratégie : chaque post part dans une direction." },
    { role: "erreur", kicker: "2. Copier les autres", overlay_text: "Ta cliente ne te reconnaît plus." },
    { role: "erreur", overlay_text: "Erreur 3 — parler à tout le monde", detail: "Personne ne se sent visé." },
    { role: "erreur", kicker: "4. Oublier l'appel", overlay_text: "Le post plaît, personne n'agit." },
    { role: "erreur", overlay_text: "5) Disparaître trois semaines, puis revenir sans prévenir." },
    { role: "conclusion", overlay_text: "Choisis-en une et corrige-la cette semaine." },
  ];
  assertEquals(listIssues(slides, body), []);
});

Deno.test("titre seul puis explication sur la slide suivante : accepté", () => {
  const slides = [cover,
    ...[1, 2, 3, 4, 5].flatMap((n) => [{ role: "erreur", title: `${n}. Erreur ${n}`, body: "" }, { role: "erreur", title: "", body: "Ce qui coince et quoi faire à la place." }]),
    end];
  assertEquals(listIssues(slides), []);
  // Même découpage en photo : nom seul en kicker, explication sur la photo suivante.
  const photo = [{ role: "hook", overlay_text: "5 erreurs" },
    ...[1, 2, 3, 4, 5].flatMap((n) => [{ kicker: `${n}. Erreur ${n}` }, { overlay_text: "Ce qui coince et quoi faire." }]),
    { role: "conclusion", overlay_text: "À toi de choisir." }];
  assertEquals(listIssues(photo, { subject: "5 erreurs", carousel_type: "photo", slide_count: 12 }), []);
});

Deno.test("vrai élément manquant ou non expliqué : toujours signalé", () => {
  const four = [cover, ...[1, 2, 3, 5].map((n) => ({ role: "erreur", title: `${n}. Erreur ${n}`, body: "Explication." })), end];
  assert(listIssues(four).some((i) => i.includes("non repérés : 4")));
  // Titre seul suivi directement de l'élément suivant : pas d'explication.
  const bare = [cover, { title: "1. Erreur 1", body: "" }, ...[2, 3, 4, 5].map((n) => ({ title: `${n}. Erreur ${n}`, body: "Explication." })), end];
  assert(listIssues(bare).some((i) => i.includes("slide 2 nomme un élément")));
  // Titre seul juste avant la conclusion : la conclusion n'est pas son explication.
  const beforeEnd = [cover, ...[1, 2, 3, 4].map((n) => ({ title: `${n}. Erreur ${n}`, body: "Explication." })), { title: "5. Erreur 5" }, end];
  assert(listIssues(beforeEnd).some((i) => i.includes("slide 6 nomme un élément")));
  // Photo : kicker seul suivi de l'élément suivant.
  const photoBare = [{ role: "hook", overlay_text: "5 erreurs" }, { kicker: "1. Erreur 1" }, ...[2, 3, 4, 5].map((n) => ({ overlay_text: `${n}. Erreur ${n} : explication.` })), { role: "conclusion", overlay_text: "Fin." }];
  assert(listIssues(photoBare, { subject: "5 erreurs", carousel_type: "photo" }).some((i) => i.includes("slide 2 nomme un élément")));
  // Photo : 5 éléments écrits en overlay, un oublié.
  const photo = [{ role: "hook", overlay_text: "5 erreurs" }, ...[1, 2, 3, 4].map((n) => ({ overlay_text: `${n}. Erreur ${n} : explication.` })), { role: "conclusion", overlay_text: "Fin." }];
  assert(listIssues(photo, { subject: "5 erreurs", carousel_type: "photo" }).some((i) => i.includes("non repérés : 5")));
});

Deno.test("consigne de réparation adaptée au défaut", () => {
  const list = structureRepairInstruction(["Éléments de la liste non repérés : 4. Numérote et explique chaque élément."]);
  assert(list.includes("élément manquant") && !list.includes("nombre de slides"));
  const named = structureRepairInstruction(["La slide 3 nomme un élément sans l'expliquer."]);
  assert(named.includes("slide qui suit") && !named.includes("nombre de slides"));
  assert(structureRepairInstruction(["7 slides reçues, exactement 10 demandées."]).includes("nombre de slides"));
  assert(structureRepairInstruction(["La dernière slide doit conclure le propos (role:conclusion)."]).includes("conclusion"));
});

Deno.test("mixte : une slide de plus de 50 mots est signalée pour être redécoupée", async () => {
  const { longMixSlideIssues } = await import("./carousel-length.ts");
  const long = Array(51).fill("mot").join(" ");
  const parsed = { slides: [{ title: "Couv" }, { body: long }, { body: "court" }] };
  assertEquals(longMixSlideIssues(parsed, { carousel_type: "mix" }).length, 1);
  assertEquals(longMixSlideIssues(parsed, { carousel_type: "mix", slide_count: 3 }).length, 0);
  assertEquals(longMixSlideIssues(parsed, { carousel_type: "text" }).length, 0);
});
