import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyMixFormatting, composeMixCarousel, composeMixSlide, mixSlideText, type MixCharter, type MixSlideSpec } from "./mix-slide-layouts.ts";
import { validatePhotoFormatting } from "./photo-formatting.ts";

const CH: MixCharter = {
  color_primary: "#23395B", color_secondary: "#23395B", color_background: "#F4EFE8",
  color_text: "#1E2A3A", color_accent: "#B5781A", font_title: "Fraunces", font_body: "Work Sans", border_radius: "rounded",
};
const mid = { isFirst: false, isLast: false, previous: null, photoCount: 5 } as const;
const textOf = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&");

// Récit de la maquette validée (céramiste, 02/10/2026).
const CERAMIQUE: MixSlideSpec[] = [
  { slide_number: 1, slide_type: "photo_integrated", photo_index: 2, title: "Pourquoi deux bols de la même série ne sont jamais pareils", body: "" },
  { slide_number: 2, slide_type: "photo_integrated", photo_index: 1, title: "", body: "Tout commence avant le tour. Je pétris chaque boule d'argile à la main pour chasser l'air, et aucune n'a tout à fait la même humidité." },
  { slide_number: 3, slide_type: "photo_full", photo_index: 4, overlay_text: "Sur le tour, un millimètre change tout." },
  { slide_number: 4, slide_type: "photo_integrated", photo_index: 3, title: "L'émail", body: "Le même bleu, posé de la même façon, coule différemment selon sa place dans le four." },
  { slide_number: 5, slide_type: "photo_integrated", photo_index: 5, title: "", body: "Chaque fournée a sa page dans mon carnet : température, place dans le four, couleur obtenue." },
  { slide_number: 6, slide_type: "text_only", title: "Ce carnet ne sert pas à effacer ces écarts.", body: "Il m'aide à les comprendre. Ils sont la trace de l'argile, de la main et du four. Le bol que tu choisis dans la série n'existe qu'une fois." },
];

Deno.test("mix : tout le récit est composé, texte verbatim, racine 1080×1350", () => {
  const out = composeMixCarousel(CERAMIQUE, CH, 5);
  assert(out, "le récit de la maquette doit être composé par le code");
  assertEquals(out!.length, 6);
  for (const [i, slide] of out!.entries()) {
    assert(slide.html.includes("width:1080px;height:1350px;position:relative"));
    const src = CERAMIQUE[i];
    for (const t of [src.title, src.body, src.overlay_text]) if (t) assert(textOf(slide.html).includes(t), `slide ${i + 1} : texte perdu`);
  }
});

Deno.test("mix : couverture en aplat + photo, photos annotées pour l'export", () => {
  const out = composeMixCarousel(CERAMIQUE, CH, 5)!;
  assertEquals(out[0].layout, "couverture_aplat");
  assert(out[0].html.includes('data-pptx-photo="2"'));
  assert(out[0].html.includes("url({{PHOTO_2}})"));
  assert(out[0].html.includes('data-slide-text="title"'));
  for (const s of out) assert(!/data-pptx-shape="[^"]*"[^>]*\{\{PHOTO_/.test(s.html), "un aplat ne doit jamais porter la photo");
});

Deno.test("mix : jamais deux fois la même mise en page d'affilée", () => {
  const out = composeMixCarousel(CERAMIQUE, CH, 5)!;
  for (let i = 1; i < out.length; i++) assert(out[i].layout !== out[i - 1].layout, `slides ${i} et ${i + 1} identiques (${out[i].layout})`);
});

Deno.test("mix : texte développé jamais posé sur la photo plein cadre", () => {
  const long = "Tout commence avant le tour. Je pétris chaque boule d'argile à la main pour chasser l'air, et aucune n'a tout à fait la même humidité.";
  const out = composeMixSlide({ slide_number: 2, slide_type: "photo_full", photo_index: 1, overlay_text: long }, CH, mid)!;
  assert(["photo_aplat", "passe_partout", "cote_a_cote"].includes(out.layout));
  assert(out.html.includes('data-slide-text="overlay"'), "photo_full reste éditable par son overlay");
  assert(!out.html.includes("data-injected-scrim"));
});

Deno.test("mix : overlay court sur photo plein cadre → bloc de charte, photo entière", () => {
  const out = composeMixSlide({ slide_number: 3, slide_type: "photo_full", photo_index: 4, overlay_text: "Un millimètre change tout." }, CH, mid)!;
  assertEquals(out.layout, "sur_photo");
  assert(out.html.includes('data-slide-text="overlay"'));
  assert(out.html.includes("{{PHOTO_4}}"));
  assert(out.html.includes('data-pptx-shape="card"'));
  assert(!out.html.includes("data-injected-scrim"), "aucun voile noir sur la photo");
});

Deno.test("mix : slide texte → respiration, ancres titre et corps", () => {
  const out = composeMixSlide(CERAMIQUE[5], CH, { ...mid, isLast: true })!;
  assertEquals(out.layout, "respiration");
  assert(out.html.includes('data-slide-text="title"'));
  assert(out.html.includes('data-slide-text="body"'));
  assert(!out.html.includes("{{PHOTO_"));
});

Deno.test("mix : photo_layout confirmé côte à côte respecté", () => {
  const out = composeMixSlide({ slide_number: 2, slide_type: "photo_integrated", photo_index: 1, photo_layout: "right_photo", title: "Le geste", body: "Une phrase courte." }, CH, mid)!;
  assertEquals(out.layout, "cote_a_cote");
});

Deno.test("mix : schéma visuel ou texte démesuré → rendu modèle pour tout le carrousel", () => {
  assertEquals(composeMixCarousel([...CERAMIQUE, { slide_number: 7, slide_type: "text_only", title: "Étapes", visual_schema: { type: "timeline" } }], CH, 5), null);
  const huge = Array(400).fill("argile").join(" ");
  assertEquals(composeMixSlide({ slide_number: 2, slide_type: "photo_integrated", photo_index: 1, body: huge }, CH, mid), null);
});

Deno.test("mix : CTA détectable et texte échappé", () => {
  const out = composeMixSlide({ slide_number: 6, slide_type: "text_only", title: `<img src=x onerror=alert(1)>`, body: "Fin.", cta_label: "Passe à l'atelier" }, CH, { ...mid, isLast: true })!;
  assert(out.html.includes('data-slide-cta="1"'));
  assert(out.html.includes('data-slide-text="cta"'));
  assert(!out.html.includes("<img src=x"));
});

Deno.test("mix : contrastes lisibles quelle que soit la charte", () => {
  for (const ch of [CH, { ...CH, color_primary: "#FFD6E8", color_secondary: "#FFE561", color_accent: "#FFF4F8", color_background: "#FFFFFF", color_text: "#FFFFFF" }, { color_background: "#111111" } as MixCharter]) {
    const out = composeMixCarousel(CERAMIQUE, ch, 5)!;
    assert(out, "charte quelconque : composition attendue");
  }
  // Aplat trop pâle pour porter du texte : bascule sur une couleur qui contraste.
  const pale = composeMixSlide(CERAMIQUE[1], { ...CH, color_primary: "#FFF6F9", color_secondary: "#FFF6F9", color_accent: "#FFF6F9", color_background: "#FFFFFF" }, mid)!;
  assert(!pale.html.includes("background:#FFF6F9"));
});

Deno.test("mix : photo_index hors bornes → slide texte, jamais un placeholder orphelin", () => {
  const out = composeMixSlide({ slide_number: 2, slide_type: "photo_integrated", photo_index: 9, title: "Titre", body: "Corps." }, CH, mid)!;
  assertEquals(out.layout, "respiration");
  assert(!out.html.includes("{{PHOTO_9}}"));
});

// Vu en prod le 02/10/2026 : un passage de 74 mots faisait basculer TOUT le
// carrousel sur le rendu modèle.
Deno.test("mix : passage très développé → composé (photo réduite ou vignette), jamais de repli global", () => {
  const p74 = "Pourquoi la sincérité change-t-elle tout ? Parce qu'elle rend chaque contenu cohérent avec le précédent. Quand votre voix et ce que vous montrez restent les mêmes d'une semaine à l'autre, un nouveau contenu ne fait pas que s'ajouter : il confirme. La personne qui vous lit vérifie, sans même y penser, que ce qu'elle avait perçu la fois d'avant était juste. C'est cette petite vérification, répétée, qui devient peu à peu de la confiance.";
  const a = composeMixSlide({ slide_number: 6, slide_type: "photo_integrated", photo_index: 1, photo_layout: "top_photo", body: p74 }, CH, mid);
  assert(a && a.html.includes("{{PHOTO_1}}"));
  const p95 = `${p74} ${p74.split(" ").slice(0, 21).join(" ")}`;
  const b = composeMixSlide({ slide_number: 6, slide_type: "photo_full", photo_index: 2, overlay_text: p95 }, CH, mid)!;
  assertEquals(b.layout, "vignette");
  assert(b.html.includes("{{PHOTO_2}}"));
  assert(textOf(b.html).includes(p95));
  assert(composeMixCarousel([...CERAMIQUE.slice(0, 5), { slide_number: 6, slide_type: "photo_integrated", photo_index: 1, body: p74 }], CH, 5));
});

Deno.test("mix : accroche courte d'une couverture photo_full → titre, ancre overlay conservée", () => {
  const out = composeMixSlide({ slide_number: 1, slide_type: "photo_full", photo_index: 1, overlay_text: "Pourquoi un seul post viral ne remplace pas la confiance" }, CH, { ...mid, isFirst: true })!;
  assertEquals(out.layout, "couverture_aplat");
  assert(/data-slide-text="overlay"[^>]*font-family:'Fraunces'/.test(out.html));
  assert(!/data-slide-text="overlay"[^>]*font-size:4\dpx/.test(out.html), "l'accroche ne doit pas être en taille de corps");
});

// ── MISE EN FORME du mixte (03/10/2026) ─────────────────────────────────────
// Garde-fou du catalogue : ces tests échouent si un design de mise en forme
// ne sort plus dans le mixte, ou si la génération ne passe plus par l'étage.
const MIX_TEXT = CERAMIQUE.map(s => ({ slide_number: s.slide_number, overlay_text: mixSlideText(s) }));
const MIX_PLAN = validatePhotoFormatting({
  steps: [{ slide_number: 2, label: "chaque boule d'argile" }, { slide_number: 3, label: "Sur le tour" }, { slide_number: 4, label: "L'émail" }],
  motifs: [{ slide_number: 5, reason: "Une page par fournée.", elements: [
    { k: "rect", x: 0, y: 40, w: 140, h: 120, tone: "soft" }, { k: "rect", x: 170, y: 40, w: 140, h: 120, tone: "soft" }, { k: "rect", x: 340, y: 40, w: 140, h: 120, tone: "accent" },
    { k: "text", x: 0, y: 150, text: "température", tone: "ink", size: 40 },
  ] }],
}, MIX_TEXT);

Deno.test("mix mise en forme : étapes et motif dessinés, texte intact, composition conservée", () => {
  assertEquals(MIX_PLAN.steps.length, 3); assertEquals(MIX_PLAN.motifs.length, 1);
  const out = composeMixCarousel(applyMixFormatting(CERAMIQUE, MIX_PLAN), CH, 5);
  assert(out, "la mise en forme ne doit jamais faire perdre la composition par le code");
  for (const [i, n] of [[1, 1], [2, 2], [3, 3]]) assert(out![i].html.includes(`Étape ${n}`) && out![i].html.includes(`data-photo-step="${n}/3"`), `étape ${n} absente`);
  // Le motif tombe hors de la photo, dans une colonne large.
  assert(out![4].html.includes('<svg data-photo-format="motif"'), `motif absent (${out![4].layout})`);
  assert(out![4].layout !== "cote_a_cote" && out![4].layout !== "sur_photo");
  // La slide 3 (overlay court) quitte le bloc sur photo pour porter l'étape lisiblement, ou la garde : texte toujours là.
  for (const [i, slide] of out!.entries()) {
    const src = CERAMIQUE[i];
    for (const t of [src.title, src.body, src.overlay_text]) if (t) assert(textOf(slide.html).includes(t), `slide ${i + 1} : texte perdu`);
  }
});

Deno.test("mix mise en forme : un motif n'est jamais dessiné dans la colonne étroite ; texte très long → composé sans", () => {
  const motif = { elements: MIX_PLAN.motifs[0].elements, reason: "r" };
  const cote = composeMixSlide({ slide_number: 4, slide_type: "photo_integrated", photo_index: 2, photo_layout: "left_photo", title: "Titre", body: "Un passage court.", mix_format: { motif } }, CH, mid)!;
  assert(cote.layout !== "cote_a_cote" || !cote.html.includes("<svg"), "motif dans le côte-à-côte");
  assert(cote.html.includes("<svg"), "le motif doit trouver une colonne large");
  const phrase = "Une phrase développée qui raconte le geste et la matière sans se presser.";
  for (const n of [5, 6, 7]) {
    const long = Array.from({ length: n }, () => phrase).join(" ");
    const plain = composeMixCarousel([CERAMIQUE[0], { slide_number: 2, slide_type: "photo_integrated", photo_index: 1, title: "", body: long }], CH, 5)!;
    const out = composeMixCarousel([CERAMIQUE[0], { slide_number: 2, slide_type: "photo_integrated", photo_index: 1, title: "", body: long, mix_format: { motif } }], CH, 5);
    assert(out, "repli sans mise en forme plutôt que rendu modèle");
    assert(textOf(out![1].html).includes(long));
    assert(!(out![1].layout === "vignette" && plain[1].layout !== "vignette"), `${n * 13} mots : la photo ne doit pas passer en vignette pour un motif`);
  }
});

Deno.test("mix mise en forme : une suite d'étapes est entière ou absente", () => {
  const long = Array.from({ length: 7 }, () => "Une phrase développée qui raconte le geste et la matière sans se presser.").join(" ");
  const slides: MixSlideSpec[] = [CERAMIQUE[0],
    { ...CERAMIQUE[1], mix_format: { step: { index: 1, total: 3, label: "Tout commence avant le tour" } } },
    { slide_number: 3, slide_type: "photo_integrated", photo_index: 3, title: "", body: long, mix_format: { step: { index: 2, total: 3, label: "Une phrase" } } },
    { ...CERAMIQUE[3], mix_format: { step: { index: 3, total: 3, label: "L'émail" } } }];
  const out = composeMixCarousel(slides, CH, 5)!;
  const withStep = out.filter(s => s.html.includes("data-photo-step=")).length;
  assert(withStep === 0 || withStep === 3, `${withStep} étapes sur 3`);
});

Deno.test("mix mise en forme : la génération passe toujours par l'étage de mise en forme", async () => {
  const src = await Deno.readTextFile(new URL("../carousel-visual/index.ts", import.meta.url));
  assert(/planPhotoFormatting\(mixTextSlides/.test(src), "planPhotoFormatting n'est plus appelé pour le mixte");
  assert(/composeMixCarousel\(applyMixFormatting\(/.test(src), "applyMixFormatting n'est plus appliqué au mixte");
});

Deno.test("mix mise en forme : motif aligné sur le texte, texte atténué lisible", () => {
  const motif = { reason: "r", elements: [
    { k: "text" as const, x: 60, y: 40, text: "Pétrissage", tone: "soft" as const, size: 40 },
    { k: "line" as const, x1: 60, y1: 80, x2: 900, y2: 80, tone: "soft" as const },
  ] };
  const html = composeMixSlide({ slide_number: 3, slide_type: "photo_integrated", photo_index: 2, title: "", body: "Un passage court.", mix_format: { motif } }, CH, mid)!.html;
  assert(/viewBox="(\d+) /.exec(html)![1] !== "0", "le cadre doit commencer au premier élément");
  assert(!/<text[^>]*(fill-)?opacity/.test(html), "jamais d'opacité sur du texte");
});
