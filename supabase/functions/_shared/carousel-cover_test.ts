import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { acceptCoverRewrite, checkCover, COVER_HOOK_MAX_WORDS, COVER_WRITING, coverWords, enforceCover } from "./carousel-cover.ts";

// Couverture des carrousels (décision de Laetitia du 04/10/2026) : accroche de
// 10 mots max + sous-titre facultatif de 12 mots, rien d'autre. Ces tests
// échouent si une couverture peut repartir avec un corps, un kicker, un titre
// trop long, ou si le garde-fou touche aux autres slides.

const TEXT = {
  carousel_type: "tips",
  slides: [
    { slide_number: 1, title: "Plusieurs étapes pour arrêter de tourner en rond avant de poster ton contenu", body: "Tu as une idée en tête depuis trois jours et elle est toujours coincée dans ton Google Doc. Voilà une méthode simple." },
    { slide_number: 2, title: "Le blocage n'est pas l'idée", body: "C'est la peur de mal la dire." },
    { slide_number: 3, title: "Étape 1", body: "Écris sans te relire." },
  ],
};

Deno.test("couverture : consigne partagée = accroche de 10 mots, sous-titre facultatif, slide 2 autonome", () => {
  assertEquals(COVER_HOOK_MAX_WORDS, 10);
  assert(COVER_WRITING.includes("4 à 10 mots"));
  assert(COVER_WRITING.includes("titre-étiquette"));
  assert(COVER_WRITING.includes("La slide 2 est une deuxième accroche"));
});

Deno.test("couverture texte : titre trop long réécrit, corps long déplacé en tête de slide 2, autres slides intactes", async () => {
  const seen: any[] = [];
  const { doc, receipt } = await enforceCover(structuredClone(TEXT), {
    kind: "text",
    rewrite: async (input) => { seen.push(input); return { hook: "Ton idée dort dans un Google Doc ?", subtitle: null }; },
  });
  assertEquals(seen.length, 1);
  assertEquals(doc.slides[0].title, "Ton idée dort dans un Google Doc ?");
  assertEquals(doc.slides[0].body, "");
  assert(doc.slides[1].body.startsWith("Tu as une idée en tête depuis trois jours"), "le corps n'est jamais perdu");
  assert(doc.slides[1].body.endsWith("C'est la peur de mal la dire."));
  assertEquals(doc.slides[2], TEXT.slides[2]);
  assertEquals(receipt!.rewrite, "accepted");
  assert(receipt!.moved_to_slide_2);
});

Deno.test("couverture : une réécriture qui invente un chiffre ou dépasse 10 mots est refusée, le texte d'origine reste", async () => {
  const { doc, receipt } = await enforceCover(structuredClone(TEXT), {
    kind: "text",
    rewrite: async () => ({ hook: "3 étapes pour enfin poster", subtitle: null }),
  });
  assertEquals(receipt!.rewrite, "rejected");
  assertEquals(doc.slides[0].title, TEXT.slides[0].title);
  assertEquals(acceptCoverRewrite({ hook: "Un deux trois quatre cinq six sept huit neuf dix onze" }, "x"), null);
  assertEquals(acceptCoverRewrite({ hook: "3 étapes pour enfin poster" }, "Les 3 étapes")?.hook, "3 étapes pour enfin poster");
});

Deno.test("couverture : texte écrit par la personne (« Mes slides ») jamais réécrit", async () => {
  let called = false;
  const { doc, receipt } = await enforceCover(structuredClone(TEXT), { kind: "text", userAuthored: true, rewrite: async () => { called = true; return {}; } });
  assert(!called);
  assertEquals(doc.slides[0].title, TEXT.slides[0].title);
  assertEquals(doc.slides[0].body, TEXT.slides[0].body);
  assertEquals(receipt!.rewrite, "skipped_user_text");
});

Deno.test("couverture : accroche choisie par la personne conservée telle quelle", async () => {
  const hook = "Je ne te promettrai pas de résultats chiffrés. Même si ça ferait vendre.";
  const { doc, receipt } = await enforceCover({ slides: [{ slide_number: 1, title: hook, body: "" }, { slide_number: 2, title: "a", body: "b" }] }, { kind: "text", selectedHook: hook, rewrite: async () => ({ hook: "Autre" }) });
  assertEquals(doc.slides[0].title, hook);
  assertEquals(receipt!.rewrite, "skipped_selected_hook");
});

Deno.test("couverture photo : kicker, gabarit et direction éditoriale retirés ; detail court gardé en sous-titre", async () => {
  const photo = { slides: [
    { slide_number: 1, overlay_text: "Tes photos produits font fuir tes clientes.", kicker: "Méthode", detail: "Ce que j'ai changé dans ma boutique", template: "profonde", art_direction: { treatment: "statement" }, points: ["a", "b"] },
    { slide_number: 2, overlay_text: "Une photo trop parfaite dit catalogue." },
  ] };
  const { doc, receipt } = await enforceCover(photo, { kind: "photo" });
  const c = doc.slides[0];
  assertEquals(c.kicker, null);
  assertEquals(c.template, "couverture");
  assertEquals(c.art_direction, undefined);
  assertEquals(c.points, []);
  assertEquals(c.detail, "Ce que j'ai changé dans ma boutique");
  assertEquals(receipt!.rewrite, "not_needed");
  assertEquals(doc.slides[1], photo.slides[1]);
  assertEquals(checkCover(c, "photo").extras, []);
});

Deno.test("couverture mixte photo_full : overlay = accroche, detail = sous-titre", async () => {
  const mix = { slides: [
    { slide_number: 1, slide_type: "photo_full", overlay_text: "Le luxe de demain se fabrique à vingt kilomètres de chez toi, dans l'atelier d'à côté.", photo_index: 1 },
    { slide_number: 2, slide_type: "photo_integrated", title: "Le local", body: "Corps de la slide 2." },
  ] };
  const { doc } = await enforceCover(mix, { kind: "mix", rewrite: async () => ({ hook: "Le luxe de demain est au coin de ta rue.", subtitle: "Dans l'atelier d'à côté" }) });
  assertEquals(doc.slides[0].overlay_text, "Le luxe de demain est au coin de ta rue.");
  assertEquals(doc.slides[0].detail, "Dans l'atelier d'à côté");
  assert(coverWords(doc.slides[0].overlay_text) <= 10);
});

Deno.test("couverture : sans passe IA disponible (temps), titre long gardé, corps long quand même déplacé", async () => {
  const { doc, receipt } = await enforceCover(structuredClone(TEXT), { kind: "text" });
  assertEquals(receipt!.rewrite, "skipped_time");
  assertEquals(doc.slides[0].title, TEXT.slides[0].title);
  assertEquals(doc.slides[0].body, "");
  assert(doc.slides[1].body.startsWith("Tu as une idée"));
});
