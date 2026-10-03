import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyPhotoFormatting, isAllowedMotifText, planPhotoFormatting, validatePhotoFormatting } from "./photo-formatting.ts";
import { assignPhotoStyles, composePhotoSlide } from "./photo-overlay-templates.ts";

const ad = (treatment: string, position = "bottom_left") => ({ treatment, position, emphasis: null, reason: "t", surface: "veil" as const, alignment: "left" as const });
const SLIDES = [
  { slide_number: 1, photo_index: 1, template: "couverture", overlay_text: "Ce qu'une pièce finie ne montre jamais", art_direction: ad("opening") },
  { slide_number: 2, photo_index: 1, overlay_text: "Tout commence avant la forme, avec le pétrissage. Je travaille la terre sans que rien n'apparaisse encore, pendant de longues minutes.", art_direction: ad("editorial") },
  { slide_number: 3, photo_index: 2, overlay_text: "Puis vient le tournage, où la forme naît enfin. Mais une fois la pièce posée, le geste qui l'a montée ne se voit plus.", art_direction: ad("editorial", "top_left") },
  { slide_number: 4, photo_index: 3, overlay_text: "L'émaillage ne la termine pas encore. Une fois l'émail posé, la pièce doit passer par la cuisson, à l'abri des regards.", art_direction: ad("editorial") },
  { slide_number: 5, photo_index: 4, overlay_text: "C'est pour cela que je tiens un carnet. Chaque cuisson y est notée. Semaine après semaine, les pages se remplissent.", art_direction: ad("editorial", "top_left") },
  { slide_number: 6, photo_index: 5, overlay_text: "Une faïence finie est donc ce que vous voyez, et tout ce qu'elle ne montre plus.", art_direction: ad("closing") },
] as any[];
const STEPS = [{ slide_number: 2, label: "le pétrissage" }, { slide_number: 3, label: "le tournage" }, { slide_number: 4, label: "L’émaillage" }];
const MOTIF = { slide_number: 5, reason: "Les pages se remplissent.", elements: [
  { k: "rect", x: 0, y: 200, w: 140, h: 60, tone: "soft" }, { k: "rect", x: 170, y: 160, w: 140, h: 100, tone: "accent" },
  { k: "text", x: 0, y: 310, text: "S1", tone: "ink", size: 20 }, { k: "text", x: 990, y: 310, text: "les pages se remplissent", tone: "ink", anchor: "end" },
] };
const CH = { color_accent: "#5C7A5A", color_primary: "#5C7A5A", font_title: "Libre Baskerville", font_body: "IBM Plex Sans" };

Deno.test("validation : étapes = extraits exacts, au moins 3, dans l'ordre ; la couverture n'en reçoit jamais", () => {
  assertEquals(validatePhotoFormatting({ steps: STEPS, motifs: [] }, SLIDES).steps.length, 3);
  assertEquals(validatePhotoFormatting({ steps: STEPS.slice(0, 2), motifs: [] }, SLIDES).steps, []);
  assertEquals(validatePhotoFormatting({ steps: [STEPS[0], { slide_number: 3, label: "le modelage" }, STEPS[2]], motifs: [] }, SLIDES).steps, [], "label inventé");
  assertEquals(validatePhotoFormatting({ steps: [STEPS[1], STEPS[0], STEPS[2]], motifs: [] }, SLIDES).steps, [], "ordre");
  assertEquals(validatePhotoFormatting({ steps: [{ slide_number: 1, label: "une pièce finie" }, ...STEPS], motifs: [] }, SLIDES).steps, [], "couverture");
});

Deno.test("validation : motif = mots du texte ou repères courts, jamais de mot inventé ; au plus 2 ; tailles lisibles", () => {
  assert(isAllowedMotifText("S1", "")); assert(isAllowedMotifText("12", ""));
  assert(isAllowedMotifText("Les pages se remplissent", SLIDES[4].overlay_text));
  assert(!isAllowedMotifText("pages vierges", SLIDES[4].overlay_text));
  const plan = validatePhotoFormatting({ steps: [], motifs: [
    { ...MOTIF, elements: [...MOTIF.elements, { k: "text", x: 0, y: 40, text: "1 260 °C", tone: "ink" }, { k: "rect", x: 900, y: 0, w: 300, h: 50, tone: "ink" }] },
    { ...MOTIF, slide_number: 3, elements: [{ k: "rect", x: 0, y: 0, w: 10, h: 10, tone: "ink" }, { k: "text", x: 0, y: 40, text: "le tournage", tone: "ink" }] },
    { ...MOTIF, slide_number: 4, elements: [{ k: "rect", x: 0, y: 0, w: 10, h: 10, tone: "ink" }, { k: "text", x: 0, y: 40, text: "la cuisson", tone: "ink" }] },
  ] }, SLIDES);
  assertEquals(plan.motifs.length, 2);
  assertEquals(plan.motifs[0].elements.length, 4, "chiffre inventé et rectangle hors cadre retirés");
  const sizes = plan.motifs[0].elements.filter(e => e.k === "text").map(e => (e as any).size);
  assert(sizes.every(s => s >= 40 && s <= 64), `tailles ${sizes}`);
  assertEquals(validatePhotoFormatting("pas du JSON", SLIDES), { steps: [], motifs: [] });
});

Deno.test("application : étapes seulement sur des slides habillées ; un motif sur voile du bord passe sur une surface de lecture", () => {
  const plan = validatePhotoFormatting({ steps: STEPS, motifs: [MOTIF] }, SLIDES);
  const out = applyPhotoFormatting(assignPhotoStyles(SLIDES), plan);
  assertEquals(out.filter(s => s.photo_format?.step).map(s => s.photo_format.step.index), [1, 2, 3]);
  const m = out.find(s => s.photo_format?.motif)!;
  assert(["carte", "verre", "colonne"].includes(m.photo_style), m.photo_style);
  assertEquals(applyPhotoFormatting(SLIDES, plan).filter(s => s.photo_format?.step).length, 0, "sans habillage : pas d'étapes partielles");
});

// ── GARDE-FOU DU CATALOGUE (03/10/2026) ─────────────────────────────────────
// Les « 1, 2, 3 » ont disparu le 01/10/2026 parce que l'écriture a changé sans
// que rien ne le signale. Ces tests échouent si un design du catalogue ne sort
// plus, ou si la génération ne passe plus par l'étape de mise en forme.
Deno.test("catalogue : chaque design de mise en forme sort encore dans les quatre habillages", () => {
  const plan = validatePhotoFormatting({ steps: STEPS, motifs: [MOTIF] }, SLIDES);
  for (const style of ["bord", "carte", "verre", "colonne"] as const) {
    const s = applyPhotoFormatting([{ ...SLIDES[0] }, ...SLIDES.slice(1).map(x => ({ ...x, photo_style: style }))], plan);
    const step = composePhotoSlide(s[1], CH, { isFirst: false, isLast: false }).html;
    assert(step.includes('data-photo-format="etape"') && step.includes("Étape 1 · Le pétrissage") && step.includes('data-photo-step="1/3"'), `étape absente (${style})`);
    assert(step.replace(/<[^>]*>/g, "").includes(SLIDES[1].overlay_text), `texte modifié (${style})`);
    const motif = composePhotoSlide(s[4], CH, { isFirst: false, isLast: false }).html;
    if (style !== "bord") assert(motif.includes('<svg data-photo-format="motif"'), `motif absent (${style})`);
    assert(!/<script|on\w+=/i.test(motif));
  }
});

Deno.test("catalogue : la génération des carrousels photo passe toujours par la mise en forme", async () => {
  const src = await Deno.readTextFile(new URL("../carousel-visual/index.ts", import.meta.url));
  assert(/planPhotoFormatting\(prepared/.test(src), "planPhotoFormatting n'est plus appelé dans carousel-visual");
  assert(/applyPhotoFormatting\(assignPhotoStyles\(/.test(src), "applyPhotoFormatting n'est plus appliqué après les habillages");
});

Deno.test("appel IA : réponse validée, échec silencieux, consommation comptée", async () => {
  const usage: any = {};
  const ok = await planPhotoFormatting(SLIDES, usage, (async (_o: any, sink: any) => { sink.total_tokens = 120; return JSON.stringify({ steps: STEPS, motifs: [MOTIF] }); }) as any);
  assertEquals(ok.status, "completed"); assertEquals(ok.steps.length, 3); assertEquals(ok.motifs.length, 1);
  assertEquals(usage.total_tokens, 120);
  const ko = await planPhotoFormatting(SLIDES, {}, (async () => { throw new Error("timeout"); }) as any);
  assertEquals(ko.status, "unavailable"); assertEquals(ko.steps, []);
});
