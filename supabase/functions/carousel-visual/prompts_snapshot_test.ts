// Tests SNAPSHOT des constructeurs de prompts de carousel-visual (extraits en
// fonctions top-level par les refactors #777/#803/#811). Ces prompts portent
// tout le design system des carrousels (charte, contraste, safe zones,
// ancrage data-slide-text…) : rien d'autre ne verrouille leur sortie, une
// dérive accidentelle passerait inaperçue en CI. Chaque builder est appelé
// avec une matrice charte remplie/minimale × darkBrand et sa sortie comparée
// à un snapshot figé.
//
// Un test rouge ici n'est PAS forcément un bug : si la dérive de prompt est
// VOULUE, régénère les snapshots et relis le diff du .snap comme une review
// de prompt :
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/carousel-visual/prompts_snapshot_test.ts -- --update
//
// Lancer (flags EXACTS de la CI, script npm test:edges) :
//   deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/carousel-visual/prompts_snapshot_test.ts

import { assertSnapshot } from "https://deno.land/std@0.224.0/testing/snapshot.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { setTestEnv } from "../_shared/test-edge-harness.ts";

setTestEnv();

// Importer index.ts exécute AUSSI `serve(handler)` en haut de fichier (effet
// de bord non testé ici). Sans neutraliser Deno.listen(), ça tente un vrai
// socket TCP et plante en CI (pas de --allow-net). On neutralise AVANT
// l'import (obligatoirement dynamique) — même danse que index_test.ts.
const realListen = Deno.listen;
// deno-lint-ignore no-explicit-any
(Deno as any).listen = () => ({
  [Symbol.asyncIterator]() {
    return { next: () => new Promise(() => {}) }; // ne se résout jamais : pas de crash, juste une tâche de fond inerte
  },
  accept: () => new Promise(() => {}),
  close() {},
  addr: { transport: "tcp", hostname: "localhost", port: 0 },
  rid: -1,
  ref() {},
  unref() {},
  // deno-lint-ignore no-explicit-any
}) as any;
const {
  buildTextCarouselPrompt,
  buildMixCarouselPrompt,
  buildCoherencePlan,
  denseSlidesBlock,
} = await import("./index.ts");
// deno-lint-ignore no-explicit-any
(Deno as any).listen = realListen;

// Charte MINIMALE : uniquement les champs toujours présents (aucun champ
// optionnel → tous les blocs conditionnels du prompt restent éteints).
const CHARTE_MINIMALE = {
  color_primary: "#FB3D80",
  color_secondary: "#91014B",
  color_accent: "#FFE561",
  color_background: "#FFF4F8",
  color_text: "#1A1A1A",
  font_title: "Libre Baskerville",
  font_body: "IBM Plex Sans",
  mood_keywords: "joyeux mais pro",
  border_radius: "20px",
};

// Charte SOMBRE et REMPLIE : tous les champs optionnels renseignés (texture,
// interdits visuels, brief IA, moodboard, icônes, layout de référence, style
// photo) → tous les blocs conditionnels du prompt allumés, darkBrand=true.
const CHARTE_SOMBRE_COMPLETE = {
  color_primary: "#E7C07B",
  color_secondary: "#3A2E24",
  color_accent: "#C94F2E",
  color_background: "#1C1A17",
  color_text: "#F4EDE3",
  font_title: "Cormorant Garamond",
  font_body: "Work Sans",
  mood_keywords: "artisanal, chaleureux, brut",
  border_radius: "12px",
  texture_url: "https://exemple.test/texture-papier.jpg",
  photo_style: "lumière naturelle d'atelier, grain argentique",
  visual_donts: "pas de dégradés flashy, pas d'emojis dans les titres",
  ai_generated_brief: "Une marque d'atelier : matière, patience, gestes répétés.",
  moodboard_description: "Terre cuite, lin froissé, bois brut, céramiques empilées.",
  icon_style: "pictos filaires fins, trait irrégulier",
  template_layout_description: "Titre serif en haut à gauche, photo pleine hauteur à droite, badge terracotta en pied de slide.",
};

const SLIDES_TEXTE = [
  { slide_number: 1, role: "hook", title: "Le talent n'existe pas", body: "" },
  { slide_number: 2, role: "tip", title: "Ce qui existe : 200 bols ratés", body: "La régularité au tour fait plus que le don. Chaque raté t'apprend un geste." },
  {
    slide_number: 3,
    role: "tip",
    title: "Avant / après",
    body: "Six mois d'écart entre ces deux bols.",
    visual_schema: {
      type: "before_after",
      before: { label: "Mois 1", items: ["bols voilés", "émail qui coule"] },
      after: { label: "Mois 6", items: ["parois régulières", "émail maîtrisé"] },
    },
  },
  { slide_number: 4, role: "cta", title: "Viens tourner avec moi", body: "Atelier débutantes, lien en bio." },
];

const SLIDES_MIX = [
  { slide_number: 1, slide_type: "photo_full", photo_index: 1, overlay_text: "Le talent n'existe pas.", overlay_style: "minimal", overlay_position: "center" },
  { slide_number: 2, slide_type: "text_only", role: "tip", title: "Ce qui existe : 200 bols ratés", body: "La régularité au tour fait plus que le don." },
  { slide_number: 3, slide_type: "photo_integrated", photo_index: 2, photo_layout: "card_photo", title: "Mois 6", body: "Parois régulières, émail maîtrisé." },
];

const VISUAL_BLOCK = "\n\nSCHÉMAS VISUELS DEMANDÉS : la slide 3 porte un before_after (voir JSON).";

function promptDoc(p: { systemPrompt: string; userPrompt: string }): string {
  return `── SYSTEM PROMPT ──\n${p.systemPrompt}\n\n── USER PROMPT ──\n${p.userPrompt}`;
}

// ── Carrousel TEXTE ──

Deno.test("buildTextCarouselPrompt — charte minimale, marque claire, sans overrides ni bloc visuel", async (t) => {
  await assertSnapshot(t, promptDoc(buildTextCarouselPrompt({
    ch: CHARTE_MINIMALE,
    safeFontTitle: "Libre Baskerville",
    safeFontBody: "IBM Plex Sans",
    darkBrand: false,
    styleInstructions: "",
    slides: SLIDES_TEXTE,
    style: "editorial",
    custom_overrides: null,
    visualBlock: "",
  })));
});

Deno.test("buildTextCarouselPrompt — charte sombre complète, darkBrand, overrides et bloc visuel", async (t) => {
  await assertSnapshot(t, promptDoc(buildTextCarouselPrompt({
    ch: CHARTE_SOMBRE_COMPLETE,
    safeFontTitle: "Cormorant Garamond",
    safeFontBody: "Work Sans",
    darkBrand: true,
    styleInstructions: "STYLE DEMANDÉ : éditorial magazine, titres XXL.",
    slides: SLIDES_TEXTE,
    style: "custom",
    custom_overrides: { slide_bg_override: "#141210", text_size: "large" },
    visualBlock: VISUAL_BLOCK,
  })));
});

// (Pas de tests buildPhotoCarouselPrompt : la fonction — code mort depuis le
// chantier gabarits du 13/07, composedByCode court-circuitant vers
// composePhotoSlide — a été supprimée le 17/08/2026.)

// ── Carrousel MIXTE ──

Deno.test("buildMixCarouselPrompt — charte sombre complète, trois types de slides, bloc visuel", async (t) => {
  await assertSnapshot(t, promptDoc(buildMixCarouselPrompt({
    ch: CHARTE_SOMBRE_COMPLETE,
    slides: SLIDES_MIX,
    visualBlock: VISUAL_BLOCK,
  })));
});

Deno.test("buildMixCarouselPrompt — charte minimale, sans bloc visuel", async (t) => {
  await assertSnapshot(t, promptDoc(buildMixCarouselPrompt({
    ch: CHARTE_MINIMALE,
    slides: SLIDES_MIX,
    visualBlock: "",
  })));
});

// ── Plan de cohérence (mode texte : alternance des fonds, rupture, techniques) ──

Deno.test("buildCoherencePlan — 8 slides, marque claire, séparateur explicite + schémas visuels", async (t) => {
  const slides = [
    { slide_number: 1, role: "hook", title: "Le talent n'existe pas" },
    { slide_number: 2, role: "context", title: "Mon premier bol" },
    { slide_number: 3, role: "tip", title: "Avant / après", visual_schema: { type: "before_after" } },
    { slide_number: 4, role: "tip", title: "La régularité" },
    { slide_number: 5, role: "separator", title: "200 bols." },
    { slide_number: 6, role: "tip", title: "Le mécanisme", visual_schema: { type: "timeline" } },
    { slide_number: 7, role: "tip", title: "La nuance" },
    { slide_number: 8, role: "cta", title: "Viens tourner" },
  ];
  await assertSnapshot(t, buildCoherencePlan(slides, CHARTE_MINIMALE, false));
});

Deno.test("buildCoherencePlan — 5 slides sans schéma, marque sombre (moments de design auto, fonds gamme sombre)", async (t) => {
  const slides = [
    { slide_number: 1, role: "hook", title: "Le talent n'existe pas" },
    { slide_number: 2, role: "tip", title: "200 bols ratés" },
    { slide_number: 3, role: "tip", title: "La régularité" },
    { slide_number: 4, role: "tip", title: "La nuance" },
    { slide_number: 5, role: "cta", title: "Viens tourner" },
  ];
  await assertSnapshot(t, buildCoherencePlan(slides, CHARTE_SOMBRE_COMPLETE, true));
});

Deno.test("buildCoherencePlan — 3 slides (pas d'ajout automatique de moments de design sous 4 slides)", async (t) => {
  const slides = [
    { slide_number: 1, role: "hook", title: "Le talent n'existe pas" },
    { slide_number: 2, role: "tip", title: "200 bols ratés" },
    { slide_number: 3, role: "cta", title: "Viens tourner" },
  ];
  await assertSnapshot(t, buildCoherencePlan(slides, CHARTE_MINIMALE, false));
});


// 04/10/2026 : slide de ~70 mots + carte « 1,5 % » dupliquée par le modèle de
// mise en page (consigne « chiffres TOUJOURS mis en scène »). Une slide longue
// garde son texte seul ; le chiffre en grand va sur la slide pause.
const LONG = Array.from({ length: 60 }, (_, i) => `mot${i}`).join(" ") + " 1,5 %";
const SLIDES = [
  { slide_number: 1, title: "Couverture", body: LONG },
  { slide_number: 2, title: "Longue", body: LONG },
  { slide_number: 3, title: "", body: "", visual_schema: { type: "stats", items: [{ number: "1,5 %", label: "x" }] }, schema_pause: true },
  { slide_number: 4, title: "Courte", body: "Une phrase courte avec 3 mots." },
  { slide_number: 5, title: "Photo", body: LONG, slide_type: "photo_full" },
];

Deno.test("slides denses : listées (hors couverture, slide pause, photo), courtes exclues", () => {
  const block = denseSlidesBlock(SLIDES);
  assert(block.includes("SLIDES DENSES (plus de 45 mots) : 2."), block);
  assertEquals(denseSlidesBlock(SLIDES.slice(2, 4)), "");
});

Deno.test("garde-fou : la consigne ne demande plus de dupliquer les chiffres d'une slide longue", () => {
  const { systemPrompt, userPrompt } = buildTextCarouselPrompt({ ch: {}, safeFontTitle: "A", safeFontBody: "B", darkBrand: false, styleInstructions: "", slides: SLIDES, style: "", custom_overrides: null, visualBlock: denseSlidesBlock(SLIDES) });
  const all = systemPrompt + userPrompt;
  assert(!all.includes("TOUJOURS mis en scène"));
  assert(all.includes("Sur une slide LONGUE"));
  assert(all.includes("SLIDES DENSES"));
  assert(all.includes("jamais une colonne étroite"), "slide dense : pleine largeur");
});

// HTML réel du test du 04/10/2026 (slides 2 et 3, ~60-70 mots) : le modèle
// répétait « 0,3 Wh » et « 415 TWh → 945 TWh » en grand au-dessus du texte.
const { stripDenseFigureEchoes } = await import("./index.ts");
const BODY2 = "Commençons par l'électricité. Selon Epoch AI (2024), une requête ChatGPT consomme environ 0,3 Wh, presque autant qu'une recherche Google. L'écart serait donc bien plus faible que ce qu'on entend partout. Cela ne veut pas dire que l'IA ne coûte rien : son poids se joue ailleurs que dans la question que l'on pose, et il faut regarder plus loin.";
const BODY3 = "Ce qui pèse, c'est la somme de toutes ces requêtes, faites à chaque seconde dans le monde. On appelle cela l'inférence : le moment où le modèle répond. Répétée à très grande échelle, elle fait tourner des centres de données en continu. Selon l'AIE et l'Autorité de la concurrence (2025), leur consommation électrique mondiale pourrait passer de 415 TWh en 2024 à 945 TWh en 2030.";
const HTML2 = `<div data-pptx-shape="background"><svg width="300" data-decorative="true"><path d="M0 15"></path></svg><div><h2 data-slide-text="title" data-pptx-editable="body">Une requête consomme <span>moins</span> qu'on ne le répète</h2></div><div><p data-pptx-editable="body">0,3 Wh</p><p data-pptx-editable="body">source : Epoch AI, 2024</p></div><p data-slide-text="body" data-pptx-editable="body">${BODY2}</p></div>`;
const HTML3 = `<div data-pptx-shape="background"><div><h2 data-slide-text="title" data-pptx-editable="body">Le coût se joue dans <span>l'échelle</span></h2></div><div><div><p data-pptx-editable="body">2024</p><p data-pptx-editable="body">415 TWh</p></div><svg width="110" data-decorative="true"><path d="M5 50"></path></svg><div><p data-pptx-editable="body">2030</p><p data-pptx-editable="body">945 TWh</p></div></div><p data-slide-text="body" data-pptx-editable="body">${BODY3}</p></div>`;
const DENSE_SRC = [
  { slide_number: 1, title: "Couverture", body: "" },
  { slide_number: 2, title: "Une requête consomme moins qu'on ne le répète", body: BODY2 },
  { slide_number: 3, title: "Le coût se joue dans l'échelle", body: BODY3 },
  { slide_number: 4, title: "", body: "", schema_pause: true, visual_schema: { type: "stats", items: [{ number: "415 TWh", label: "2024" }] } },
];

Deno.test("slide dense : le chiffre répété en grand est retiré, le texte ancré reste entier", () => {
  const pause = `<div data-pptx-shape="background"><div><p>415 TWh</p><p>2024</p></div></div>`;
  const result = { slides_html: [{ slide_number: 2, html: HTML2 }, { slide_number: 3, html: HTML3 }, { slide_number: 4, html: pause }] };
  stripDenseFigureEchoes(result, { isPhotoCarousel: false, slides: DENSE_SRC });
  const [s2, s3, s4] = result.slides_html.map((s: any) => s.html);
  assert(!s2.includes(">0,3 Wh<") && !s2.includes("source : Epoch"), s2);
  assert(!s3.includes(">415 TWh<") && !s3.includes(">945 TWh<") && !s3.includes('width="110"'), s3);
  assert(s2.includes(BODY2) && s3.includes(BODY3), "texte entier");
  assert(s2.includes('data-slide-text="title"') && s3.includes('data-pptx-shape="background"'));
  assertEquals(s4, pause, "la slide pause garde son schéma");
});

Deno.test("slide dense : rien n'est retiré en photo, mixte, slide courte, chiffre absent du texte ou étape", () => {
  for (const opts of [{ isPhotoCarousel: true }, { isPhotoCarousel: false, isMixCarousel: true }]) {
    const r = { slides_html: [{ slide_number: 3, html: HTML3 }] };
    stripDenseFigureEchoes(r, { ...opts, slides: DENSE_SRC });
    assertEquals(r.slides_html[0].html, HTML3);
  }
  const short = [{ slide_number: 1, title: "c", body: "" }, { slide_number: 2, title: "Court", body: "Une requête consomme 0,3 Wh selon Epoch AI (2024)." }];
  const r1 = { slides_html: [{ slide_number: 2, html: HTML2 }] };
  stripDenseFigureEchoes(r1, { isPhotoCarousel: false, slides: short });
  assertEquals(r1.slides_html[0].html, HTML2, "slide courte : chiffre en grand permis");
  const other = HTML3.replace(">415 TWh<", ">99 TWh<").replace(">945 TWh<", ">12 TWh<").replace(">2024<", ">1999<").replace(">2030<", ">1998<");
  const r2 = { slides_html: [{ slide_number: 3, html: other }] };
  stripDenseFigureEchoes(r2, { isPhotoCarousel: false, slides: DENSE_SRC });
  assertEquals(r2.slides_html[0].html, other, "chiffre absent du texte : pas un écho");
  const step = HTML3.replace("<div><h2", `<div data-photo-format="etape" data-photo-step="2/5"><div data-pptx-editable="caption" data-photo-step-label="1">Étape 2 · L'échelle</div></div><div><h2`);
  const src2 = DENSE_SRC.map(x => x.slide_number === 3 ? { ...x, body: x.body + " Étape 2." } : x);
  const r3 = { slides_html: [{ slide_number: 3, html: step }] };
  stripDenseFigureEchoes(r3, { isPhotoCarousel: false, slides: src2 });
  assert(r3.slides_html[0].html.includes('data-photo-step="2/5"'), "étape gardée");
});

Deno.test("slide dense : la phrase-clé mise en valeur DANS le texte ancré n'est jamais retirée", () => {
  const key = "En août 2025, Google a publié 0,24 Wh pour une requête médiane.";
  const body = `<p data-slide-text="body">Début du texte. <span style="display:block; font-size:44px">${key}</span> Suite.</p>`;
  const html = `<div data-pptx-shape="background"><h2 data-slide-text="title">Titre</h2>${body}<div><p>0,24 Wh</p></div></div>`;
  const src = [{ slide_number: 1, title: "c", body: "" }, { slide_number: 2, title: "Titre", body: "Début du texte. " + key + " Suite. " + Array.from({ length: 50 }, (_, i) => `mot${i}`).join(" ") }];
  const r = { slides_html: [{ slide_number: 2, html }] };
  stripDenseFigureEchoes(r, { isPhotoCarousel: false, slides: src });
  assert(r.slides_html[0].html.includes(body), "texte ancré intact");
  assert(!r.slides_html[0].html.includes("<div><p>0,24 Wh</p></div>"), "l'écho décoratif part");
});
