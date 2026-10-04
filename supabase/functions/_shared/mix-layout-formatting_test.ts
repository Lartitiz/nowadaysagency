import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyMixFormatting, composeMixCarousel, composeMixSlide, type MixCharter, type MixSlideSpec } from "./mix-slide-layouts.ts";
import {
  applyMixLayouts,
  keepDraftLayoutFields,
  MIX_LAYOUT_RULES,
  mixLayoutTelemetry,
  photoOrientation,
  planMixLayouts,
  stripMixWriterLayoutFields,
  validateMixLayoutPlan,
} from "./mix-layout-formatting.ts";
import { MIX_LAYOUT_AFTER_WRITING, mixWritingPrompt } from "../carousel-ai/variant-writing.ts";

const CH: MixCharter = {
  color_primary: "#23395B", color_secondary: "#23395B", color_background: "#F4EFE8",
  color_text: "#1E2A3A", color_accent: "#B5781A", font_title: "Fraunces", font_body: "Work Sans", border_radius: "rounded",
};
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
const plan = (choices: any[]) => ({ choices: choices.map(c => ({ reason: "r", side: null, position: null, ...c })) });

// ── Rédaction : elle ne décide plus de la disposition ─────────────────────────

Deno.test("disposition mixte : la rédaction ne demande plus photo_layout ni overlay_*", async () => {
  for (const body of [{ subject: "S" }, { subject: "S", text_first: true }]) {
    const p = mixWritingPrompt(body, false, "", "");
    for (const field of ["photo_layout", "overlay_position", "overlay_style", "top_photo", "left_photo", "card_photo", "layouts confirmés"]) assert(!p.includes(field), `prompt mixte : ${field}`);
    assert(p.includes(MIX_LAYOUT_AFTER_WRITING), "la rédaction sait que la disposition vient après");
    // slide_type et photo_index restent à la rédaction (structure du récit).
    for (const kept of ["photo_full", "photo_integrated", "text_only", "photo_index", "overlay_text"]) assert(p.includes(kept), kept);
  }
  const src = await Deno.readTextFile(new URL("../carousel-ai/index.ts", import.meta.url));
  const tool = /const MIX_CAROUSEL_TOOL = \{[\s\S]*?\n\};/.exec(src)?.[0] || "";
  assert(tool.includes("livrer_carrousel_mixte"), "outil mixte introuvable");
  for (const field of ["photo_layout", "overlay_position", "overlay_style"]) assert(!tool.includes(field), `outil mixte : ${field}`);
  const handler = /async function handleMixCarouselRequest[\s\S]*?\n}\n/.exec(src)?.[0] || "";
  assert(/then\(stripMixWriterLayoutFields\)/.test(handler), "la sortie de rédaction mixte n'est plus filtrée");
  assert(/keepDraftLayoutFields\(draft, out\)/.test(handler), "une réparation peut changer la disposition");
});

Deno.test("disposition mixte : ce que la rédaction écrirait quand même est ignoré, texte intact", () => {
  const written = JSON.stringify({ carousel_type: "mix", slides: [
    { slide_number: 1, slide_type: "photo_full", photo_index: 1, overlay_text: "Un millimètre change tout.", overlay_position: "top_left", overlay_style: "minimal" },
    { slide_number: 2, slide_type: "photo_integrated", photo_index: 2, photo_layout: "left_photo", title: "L'émail", body: "Le même bleu coule autrement." },
  ] });
  const out = JSON.parse(stripMixWriterLayoutFields(written));
  for (const s of out.slides) for (const f of ["photo_layout", "overlay_position", "overlay_style"]) assert(!(f in s), f);
  assertEquals(out.slides[0].overlay_text, "Un millimètre change tout.");
  assertEquals([out.slides[1].slide_type, out.slides[1].photo_index, out.slides[1].title, out.slides[1].body], ["photo_integrated", 2, "L'émail", "Le même bleu coule autrement."]);
  assertEquals(stripMixWriterLayoutFields("pas du JSON"), "pas du JSON");
  // Réparation : la disposition posée par le code (structure confirmée) reste celle du brouillon.
  const draft = JSON.stringify({ slides: [{ slide_number: 1, overlay_text: "A", overlay_position: "top_left" }, { slide_number: 2, title: "B" }] });
  const repaired = JSON.stringify({ slides: [{ slide_number: 1, overlay_text: "A réparé", overlay_position: "bottom_left", overlay_style: "minimal" }, { slide_number: 2, title: "B réparé", photo_layout: "right_photo" }] });
  const kept = JSON.parse(keepDraftLayoutFields(draft, repaired));
  assertEquals(kept.slides[0], { slide_number: 1, overlay_text: "A réparé", overlay_position: "top_left" });
  assertEquals(kept.slides[1], { slide_number: 2, title: "B réparé" });
});

// ── Validation par le code ──────────────────────────────────────────────────

Deno.test("disposition mixte : sans proposition, rendu identique au choix déterministe", () => {
  const base = composeMixCarousel(CERAMIQUE, CH, 5)!;
  const empty = composeMixCarousel(applyMixLayouts(CERAMIQUE, { choices: [] }), CH, 5)!;
  assertEquals(empty.map(s => s.html), base.map(s => s.html));
  assert(base.every(s => !s.layout_proposal), "aucun reçu sans proposition");
});

Deno.test("disposition mixte : une proposition invalide retombe EXACTEMENT sur le choix actuel", () => {
  const base = composeMixCarousel(CERAMIQUE, CH, 5)!;
  assertEquals(base.map(s => s.layout), ["couverture_aplat", "photo_aplat", "sur_photo", "photo_aplat", "passe_partout", "respiration"]);
  const invalid = [
    plan([{ slide_number: 1, layout: "passe_partout" }]), // couverture : fixée par le code
    plan([{ slide_number: 3, layout: "photo_aplat" }]), // même famille que la slide 2
    plan([{ slide_number: 2, layout: "sur_photo" }]), // passage développé sur la photo
    plan([{ slide_number: 4, layout: "vignette" }]), // hors catalogue proposable
    plan([{ slide_number: 4, layout: "nouveau_style" }]),
  ];
  for (const p of invalid) {
    const out = composeMixCarousel(applyMixLayouts(CERAMIQUE, p as any), CH, 5)!;
    assertEquals(out.map(s => s.html), base.map(s => s.html), JSON.stringify(p));
  }
  const receipt = composeMixCarousel(applyMixLayouts(CERAMIQUE, invalid[1] as any), CH, 5)![2].layout_proposal;
  assertEquals(receipt?.status, "rejected");
  // À côté d'une slide « pause » : jamais l'aplat (deux aplats voisins).
  const withPause: MixSlideSpec[] = [...CERAMIQUE.slice(0, 5), { slide_number: 6, slide_type: "text_only", title: "Trois temps", body: "Pétrir, tourner, cuire.", visual_schema: { type: "checklist", items: [{ text: "Pétrir" }, { text: "Tourner" }, { text: "Cuire" }] } }];
  const pauseBase = composeMixCarousel(withPause, CH, 5)!;
  assertEquals(pauseBase[5].layout, "pause");
  const s4 = { slide_number: 4, layout: "passe_partout" };
  const pauseRef = composeMixCarousel(applyMixLayouts(withPause, plan([s4]) as any), CH, 5)!;
  assertEquals(pauseRef[3].layout, "passe_partout");
  const pauseOut = composeMixCarousel(applyMixLayouts(withPause, plan([s4, { slide_number: 5, layout: "photo_aplat" }]) as any), CH, 5)!;
  assertEquals(pauseOut[4].layout_proposal?.status, "rejected");
  assertEquals(pauseOut.map(s => s.html), pauseRef.map(s => s.html));
  // Motif : jamais dans la colonne étroite du côte-à-côte.
  const motif = { reason: "r", elements: [{ k: "rect" as const, x: 0, y: 40, w: 140, h: 100, tone: "soft" as const }, { k: "rect" as const, x: 170, y: 20, w: 140, h: 120, tone: "accent" as const }] };
  const s5 = { ...CERAMIQUE[4], mix_format: { motif } };
  const opts = { isFirst: false, isLast: false, previous: "photo_aplat" as const, photoCount: 5 };
  assertEquals(composeMixSlide({ ...s5, mix_layout: { layout: "cote_a_cote", side: "left" } }, CH, opts)!.html, composeMixSlide(s5, CH, opts)!.html);
  // Disposition confirmée (structure validée) : elle prime.
  const locked = { ...CERAMIQUE[3], photo_layout: "right_photo" };
  assertEquals(composeMixSlide({ ...locked, mix_layout: { layout: "passe_partout" } }, CH, opts)!.html, composeMixSlide(locked, CH, opts)!.html);
});

Deno.test("disposition mixte : une proposition valide est dessinée dans le catalogue, texte et photo entiers", () => {
  const p = plan([
    { slide_number: 2, layout: "cote_a_cote", side: "right" },
    { slide_number: 3, layout: "passe_partout" },
    { slide_number: 4, layout: "sur_photo" }, // passage de 14 mots, mais photo_integrated avec titre : refusé
    { slide_number: 5, layout: "cote_a_cote", side: "left" },
  ]);
  const out = composeMixCarousel(applyMixLayouts(CERAMIQUE, p as any), CH, 5)!;
  assertEquals(out[1].layout, "cote_a_cote");
  assert(/left:610px;top:0px;width:470px/.test(out[1].html), "photo à droite");
  assertEquals(out[2].layout, "passe_partout");
  assertEquals(out[3].layout_proposal?.status, "rejected");
  assertEquals(out[3].layout, "photo_aplat", "refus → choix déterministe après un passe-partout");
  assertEquals(out[4].layout, "cote_a_cote");
  for (let i = 1; i < out.length; i++) assert(out[i].layout !== out[i - 1].layout, `slides ${i} et ${i + 1} identiques`);
  for (const [i, s] of out.entries()) {
    const src = CERAMIQUE[i];
    for (const t of [src.title, src.body, src.overlay_text]) if (t) assert(textOf(s.html).includes(t), `slide ${i + 1} : texte perdu`);
    if (src.photo_index) assert(s.html.includes(`{{PHOTO_${src.photo_index}}}`), `slide ${i + 1} : photo perdue`);
  }
  const tele = mixLayoutTelemetry({ version: "v", status: "completed", choices: [], proposed: 5, rejected: [{ slide_number: 9, layout: "x", reason: "slide non proposable" }] }, out);
  assertEquals([tele.proposed, tele.accepted, tele.rejected.length], [5, 3, 2]);
});

Deno.test("disposition mixte : sur_photo haut ou bas choisi par l'étage, position confirmée prioritaire", () => {
  const s = { slide_number: 3, slide_type: "photo_full", photo_index: 4, overlay_text: "Sur le tour, un millimètre change tout." };
  const opts = { isFirst: false, isLast: false, previous: "photo_aplat" as const, photoCount: 5 };
  const top = composeMixSlide({ ...s, mix_layout: { layout: "sur_photo", position: "top" } }, CH, opts)!;
  assertEquals(top.layout, "sur_photo");
  assert(/top:96px/.test(top.html), "bloc en haut");
  const lockedBottom = composeMixSlide({ ...s, overlay_position: "bottom_left", mix_layout: { layout: "sur_photo", position: "top" } }, CH, opts)!;
  assert(!/top:96px/.test(lockedBottom.html), "position confirmée gardée");
});

Deno.test("disposition mixte : lecture de la réponse, seules les options réelles passent", () => {
  const options = new Map([[2, ["photo_aplat", "passe_partout", "cote_a_cote"] as any], [3, ["sur_photo", "photo_aplat"] as any]]);
  const v = validateMixLayoutPlan(JSON.stringify({ layouts: [
    { slide_number: 2, layout: "cote_a_cote", side: "diagonale", reason: "r" },
    { slide_number: 2, layout: "passe_partout", reason: "doublon" },
    { slide_number: 3, layout: "passe_partout", reason: "pas une option" },
    { slide_number: 1, layout: "photo_aplat", reason: "couverture" },
    { slide_number: 6, layout: "respiration", reason: "texte" },
  ] }), options);
  assertEquals(v.proposed, 5);
  assertEquals(v.choices, [{ slide_number: 2, layout: "cote_a_cote", side: "left", position: null, reason: "r" }]);
  assertEquals(v.rejected.map(r => r.reason), ["doublon", "texte ne tient pas", "slide non proposable", "slide non proposable"]);
  assertEquals(validateMixLayoutPlan("{pas du json", options).choices, []);
});

// ── L'étage ne réécrit jamais le texte ───────────────────────────────────────

Deno.test("disposition mixte : l'étage ne réécrit jamais le texte, échec → rendu inchangé", async () => {
  assert(MIX_LAYOUT_RULES.includes("Tu ne réécris, n'ajoutes ni ne retires aucun mot"));
  const photos = [1, 2, 3, 4, 5].map(() => ({ base64: PNG_PORTRAIT }));
  let sent: any = null;
  const fake = async (req: any) => {
    sent = req;
    // Le modèle tente de glisser du texte : il doit être ignoré.
    return JSON.stringify({ layouts: [
      { slide_number: 2, layout: "cote_a_cote", side: "right", reason: "r", title: "Titre inventé", body: "Corps réécrit" },
      { slide_number: 4, layout: "passe_partout", reason: "r", overlay_text: "Nouveau texte" },
    ] });
  };
  const usage: any = {};
  const p = await planMixLayouts(CERAMIQUE, CH, photos, usage, fake as any);
  assertEquals(p.status, "completed");
  assertEquals(p.choices.map(c => [c.slide_number, c.layout]), [[2, "cote_a_cote"], [4, "passe_partout"]]);
  const applied = applyMixLayouts(CERAMIQUE, p);
  applied.forEach((s, i) => {
    const { mix_layout: _m, ...rest } = s;
    assertEquals(rest, CERAMIQUE[i], `slide ${i + 1} modifiée au-delà de la disposition`);
  });
  // Seules les slides photo à disposer sont envoyées avec des options ; une photo une fois.
  const payload = JSON.parse(sent.messages[0].content[0].text);
  assertEquals(payload.slides.filter((s: any) => s.options.length).map((s: any) => s.slide_number), [2, 3, 4, 5]);
  assertEquals(payload.slides[1].photo_orientation, "portrait");
  assertEquals(sent.messages[0].content.filter((c: any) => c.type === "image").length, 4);
  assertEquals(sent.abortTimeoutMs, 25000);
  // Échec ou délai : aucune disposition, rendu identique au déterministe.
  const failed = await planMixLayouts(CERAMIQUE, CH, photos, {}, (() => Promise.reject(new Error("timeout"))) as any);
  assertEquals([failed.status, failed.choices.length], ["unavailable", 0]);
  assertEquals(composeMixCarousel(applyMixLayouts(CERAMIQUE, failed), CH, 5)!.map(s => s.html), composeMixCarousel(CERAMIQUE, CH, 5)!.map(s => s.html));
  // Rien à disposer (une seule slide photo, la couverture) : pas d'appel.
  let called = false;
  const skipped = await planMixLayouts([CERAMIQUE[0], CERAMIQUE[5]], CH, photos, {}, (() => { called = true; return Promise.resolve("{}"); }) as any);
  assertEquals([skipped.status, called], ["skipped", false]);
});

Deno.test("disposition mixte : la mise en forme et la disposition se cumulent sans rien perdre", () => {
  const steps = { steps: [{ slide_number: 2, label: "" }, { slide_number: 4, label: "L'émail" }, { slide_number: 5, label: "" }], motifs: [] };
  const p = plan([{ slide_number: 2, layout: "passe_partout" }, { slide_number: 5, layout: "cote_a_cote", side: "left" }]);
  const out = composeMixCarousel(applyMixFormatting(applyMixLayouts(CERAMIQUE, p as any), steps as any), CH, 5)!;
  assertEquals(out[1].layout, "passe_partout");
  assertEquals(out[4].layout, "cote_a_cote");
  for (const n of [1, 3, 4]) assert(out[n].html.includes("data-photo-step="), `étape perdue slide ${n + 1}`);
});

Deno.test("disposition mixte : orientation lue dans l'en-tête (PNG, JPEG), inconnue sinon", () => {
  assertEquals(photoOrientation(PNG_PORTRAIT), "portrait");
  assertEquals(photoOrientation("data:image/jpeg;base64," + JPEG_LANDSCAPE), "paysage");
  assertEquals(photoOrientation("pas une image"), null);
  assertEquals(photoOrientation(undefined), null);
});

Deno.test("disposition mixte : le rendu passe toujours par l'étage, en parallèle de la mise en forme", async () => {
  const src = await Deno.readTextFile(new URL("../carousel-visual/index.ts", import.meta.url));
  assert(/Promise\.all\(\[\s*planPhotoFormatting\(mixTextSlides, usage\),\s*planMixLayouts\(numbered, ch, reqBody\.photos \|\| \[\], usage\),?\s*\]\)/.test(src), "l'étage de disposition n'est plus lancé en parallèle");
  assert(/composeMixCarousel\(applyMixFormatting\(applyMixLayouts\(numbered, mixLayouts\)/.test(src), "les dispositions ne sont plus appliquées");
  assert(/carousel_mix_layout_formatting/.test(src), "télémétrie de disposition perdue");
});

// En-têtes minimaux (dimensions seulement).
function b64(bytes: number[]): string { return btoa(String.fromCharCode(...bytes)); }
const PNG_PORTRAIT = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 3, 0x20, 0, 0, 4, 0xb0, 8, 2, 0, 0, 0]);
const JPEG_LANDSCAPE = b64([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x02, 0xd0, 0x05, 0x00, 3, 1, 0x22, 0, 0, 0, 0]);
