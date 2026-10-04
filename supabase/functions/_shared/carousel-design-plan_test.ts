import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCarouselDesignPlan, composeEditorialSlide, editorialSlideText, formatEditorialSlides } from "./carousel-design-plan.ts";
import { validatePhotoFormatting } from "./photo-formatting.ts";

// MISE EN FORME du carrousel texte (03/10/2026). Garde-fou du catalogue : ces
// tests échouent si un design de mise en forme ne sort plus, ou si le rendu
// change alors qu'aucune mise en forme n'est proposée.
const CH = { color_primary: "#23395B", color_secondary: "#23395B", color_background: "#F4EFE8", color_text: "#1E2A3A", color_accent: "#B5781A", font_title: "Fraunces", font_body: "Work Sans" };
const SLIDES = [
  { slide_number: 1, title: "Comment je prépare un lancement en 4 temps", body: "" },
  { slide_number: 2, title: "D'abord, j'écoute", body: "Je relis les messages de mes clientes et je note les mots qu'elles emploient." },
  { slide_number: 3, title: "Ensuite, je trie", body: "Je garde une seule promesse, celle qui revient le plus souvent." },
  { slide_number: 4, title: "Puis j'écris", body: "Un texte court par jour, pendant une semaine, sans chercher à tout dire." },
  { slide_number: 5, title: "Enfin, je publie", body: "Semaine après semaine, les messages se répondent et le lancement se construit." },
  { slide_number: 6, title: "Et toi, par quoi commences-tu ?", body: "Dis-le-moi en commentaire." },
];
const PLAN = buildCarouselDesignPlan(SLIDES);
const BASE = SLIDES.map((s, i) => composeEditorialSlide(s, PLAN.sequence[i], CH));
const textOf = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const FORMATTING = validatePhotoFormatting({
  steps: [{ slide_number: 2, label: "j'écoute" }, { slide_number: 3, label: "je trie" }, { slide_number: 4, label: "j'écris" }, { slide_number: 5, label: "je publie" }],
  motifs: [{ slide_number: 5, reason: "Les messages s'accumulent.", elements: [
    { k: "rect", x: 0, y: 60, w: 140, h: 60, tone: "soft" }, { k: "rect", x: 170, y: 30, w: 140, h: 90, tone: "soft" }, { k: "rect", x: 340, y: 0, w: 140, h: 120, tone: "accent" },
    { k: "text", x: 0, y: 190, text: "Semaine après semaine", tone: "soft", size: 44 }] }],
}, SLIDES.map(s => ({ slide_number: s.slide_number, overlay_text: editorialSlideText(s) })));

Deno.test("texte : sans mise en forme proposée, rendu strictement identique", () => {
  assert(BASE.every(Boolean), "fixture : toutes les slides composées par le code");
  assertEquals(formatEditorialSlides(SLIDES, PLAN, CH, BASE, { steps: [], motifs: [] }), BASE);
  assertEquals(formatEditorialSlides(SLIDES, PLAN, CH, BASE, null), BASE);
  SLIDES.forEach((s, i) => assertEquals(composeEditorialSlide(s, PLAN.sequence[i], CH, null), BASE[i]));
  for (const b of BASE) assert(!b!.html.includes("data-format-block"));
});

Deno.test("texte : étapes et motif dessinés, texte intact, rien sous la zone sûre", () => {
  assertEquals(FORMATTING.steps.length, 4); assertEquals(FORMATTING.motifs.length, 1);
  const out = formatEditorialSlides(SLIDES, PLAN, CH, BASE, FORMATTING);
  for (const n of [1, 2, 3, 4]) assert(out[n]!.html.includes(`Étape ${n} · `) && out[n]!.html.includes(`data-photo-step="${n}/4"`), `étape ${n} absente`);
  assert(out[4]!.html.includes('<svg data-photo-format="motif"') || out[4]!.html.includes("Étape 4"), "slide 5 composée");
  assertEquals(out[0], BASE[0], "couverture inchangée");
  assertEquals(out[5], BASE[5], "slide sans mise en forme inchangée");
  for (const [i, s] of SLIDES.entries()) for (const t of [s.title, s.body]) if (t) assert(textOf(out[i]!.html).includes(t), `slide ${i + 1} : texte perdu`);
  for (const o of out) for (const m of o!.html.matchAll(/top:(\d+)px/g)) assert(Number(m[1]) < 1220, `bloc sous la zone sûre (${m[1]})`);
});

Deno.test("texte : slide rendue par le modèle jamais touchée ; étapes entières ou absentes", () => {
  const base = [...BASE]; base[2] = null; // slide 3 rendue ailleurs (schéma, surtitre…)
  const out = formatEditorialSlides(SLIDES, PLAN, CH, base, FORMATTING);
  assertEquals(out[2], null);
  assertEquals(out.filter(o => o?.html.includes("data-photo-step=")).length, 0, "suite incomplète → aucune étape");
});

Deno.test("texte : un texte trop long pour la mise en forme garde sa composition d'origine", () => {
  const long = Array.from({ length: 13 }, (_, i) => `Phrase ${i} qui développe une idée avec soin et précision.`).join(" ");
  const slides = SLIDES.map(s => s.slide_number === 3 ? { ...s, body: long } : s);
  const plan = buildCarouselDesignPlan(slides);
  const base = slides.map((s, i) => composeEditorialSlide(s, plan.sequence[i], CH));
  const out = formatEditorialSlides(slides, plan, CH, base, FORMATTING);
  assert(out.every((o, i) => (o === null) === (base[i] === null)), "jamais de slide perdue");
  if (base[2]) assert(out[2] === base[2] || out[2]!.html.includes("Étape 2"), "slide 3 inchangée ou mise en forme");
});

Deno.test("texte : la génération passe toujours par l'étage de mise en forme", async () => {
  const src = await Deno.readTextFile(new URL("../carousel-visual/index.ts", import.meta.url));
  assert(/planPhotoFormatting\(slides\.map\([^\n]*editorialSlideText/.test(src), "planPhotoFormatting n'est plus appelé pour le carrousel texte");
  assert(/formatEditorialSlides\(slides, designPlan, ch, editorialSlides/.test(src), "formatEditorialSlides n'est plus appliqué");
});

Deno.test("slide de rupture : mêmes mots qu'avant, seulement lus sans accents ni casse ; aucun synonyme ajouté", async () => {
  const { isRuptureRole } = await import("./carousel-design-plan.ts");
  const legacy = (role: string) => /manifest|synth|conclu|punch|separator|constat/.test(role || "");
  for (const role of ["manifeste", "synthèse", "conclusion", "punchline", "separator", "constat", "étape", "argument", "récit", "histoire", "anecdote", "bascule", "rupture", "séparateur", ""]) assertEquals(isRuptureRole(role), legacy(role), role);
  for (const role of ["Synthèse", "CONCLUSION", "Constat"]) assert(isRuptureRole(role), role);
  assertEquals(isRuptureRole(undefined), false);
  const slides = (role3: unknown) => [1, 2, 3, 4, 5, 6].map(n => ({ slide_number: n, title: `T${n}`, body: "Un texte court.", role: n === 3 ? role3 : "étape" }));
  const rupture = (role3: unknown) => buildCarouselDesignPlan(slides(role3) as any).sequence.findIndex(b => b.inverted);
  assertEquals(rupture("synthèse"), 2);
  assertEquals(rupture("histoire"), rupture(undefined), "rôle non reconnu : même repli qu'avant");
});
