import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { composeMixCarousel, composeMixSlide, type MixCharter, type MixSlideSpec } from "./mix-slide-layouts.ts";

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
