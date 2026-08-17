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
