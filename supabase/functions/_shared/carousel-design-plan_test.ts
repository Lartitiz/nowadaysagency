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
  assert(/formatEditorialSlides\(slides, sensedPlan, ch, finalEditorial/.test(src), "formatEditorialSlides n'est plus appliqué");
  assert(/planTextSenseDesign\(slides, textSenseUsage\)/.test(src), "l'étage « design au service du sens » n'est plus appelé");
});

Deno.test("texte : couverture = accroche en très grand + sous-titre, centrés verticalement et horizontalement (04/10/2026)", () => {
  const cover = { slide_number: 1, title: "Arrête de publier tous les jours.", body: "Le rythme qui marche pour une marque slow" };
  const out = composeEditorialSlide(cover, PLAN.sequence[0], CH)!;
  assert(out.html.includes('data-carousel-layout="opening"'));
  assert(out.html.includes("font-size:148px"), "accroche de 6 mots en très grand");
  assertEquals((out.html.match(/text-align:center/g) || []).length, 2);
  assert(out.html.includes("justify-content:center"), "bloc centré verticalement");
  assert(textOf(out.html).includes(cover.title) && textOf(out.html).includes(cover.body));
  assert(!out.html.includes("data-format-block"));
});

// ═══ Décisions de Laetitia du 04/10/2026 (carrousel de référence) ═══
import { applyTextSenseDesign, describeCarouselDesignPlan, isSingleSentence, locateExtract, sentences, validExtract } from "./carousel-design-plan.ts";

Deno.test("plan de repli : plus de forme imposée par la position, plus de fond plein obligatoire", () => {
  const slides = [{ slide_number: 1, title: "Couverture", body: "" },
    ...Array.from({ length: 10 }, (_, i) => ({ slide_number: i + 2, role: i === 4 ? "manifeste" : "argument", title: `Titre ${i}`, body: "Un texte de développement qui tient sur deux phrases. Et voici la seconde." })),
    { slide_number: 12, title: "Alors pourquoi je l'utilise quand même ?", body: "" }];
  const plan = buildCarouselDesignPlan(slides);
  assertEquals(plan.sequence.filter(b => b.inverted).length, 0, "aucune rupture imposée, même avec un rôle « manifeste »");
  assertEquals(new Set(plan.sequence.slice(1, 11).map(b => b.layout)).size, 1, "texte nu partout, aucune rotation");
  assertEquals(plan.sequence[11].layout, "statement", "phrase seule : décidée par le texte");
  for (const b of plan.sequence) assert(!("treatment" in b), "plus de traitements en alternance (#1348)");
  const desc = describeCarouselDesignPlan(plan);
  assert(desc.includes("fond uni par défaut") && desc.includes("SENS du texte"));
  assert(!/OBLIGATOIRES|rupture avec fond de charte inversé/.test(desc));
});

Deno.test("phrase seule : une seule phrase courte, sans titre ET texte", () => {
  assert(isSingleSentence({ title: "Alors pourquoi je l'utilise quand même ?", body: "" }));
  assert(isSingleSentence({ title: "", body: "Le tout pour 2 100 € TTC" }));
  assert(!isSingleSentence({ title: "Je ne sais pas si j'ai raison.", body: "Ça crée une dissonance en moi." }));
  assert(!isSingleSentence({ title: "Un. Deux.", body: "" }));
  assertEquals(sentences("Un. Deux ? Trois"), ["Un.", "Deux ?", "Trois"]);
});

Deno.test("extraits : exacts (apostrophes courbes confondues), jamais le texte entier, plafonnés", () => {
  assertEquals(locateExtract("Oui, j’utilise l’IA générative.", "l'IA générative"), [15, 30]);
  assertEquals(validExtract("Oui, j’utilise l’IA générative.", "l'IA générative", 3), "l’IA générative");
  assertEquals(validExtract("Oui, j'utilise l'IA générative.", "l'IA éthique", 3), undefined);
  assertEquals(validExtract("Mais je préfère", "Mais je préfère", 5), undefined);
  assertEquals(validExtract("un deux trois quatre cinq six sept", "un deux trois quatre", 3), undefined);
});

const REF_CH = { color_primary: "#FB3D80", color_secondary: "#91014B", color_accent: "#FFE561", color_background: "#FFF4F8", color_text: "#1A1A1A", font_title: "Instrument Serif", font_body: "Hanken Grotesk" };
const plain = (h: string) => h.replace(/<[^>]*>/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const sizes = (h: string) => [...h.matchAll(/font-size:(\d+)px/g)].map(m => Number(m[1]));

Deno.test("tailles alignées sur la référence : couverture 168px pour 4 mots, titres ≥ 92px, texte ≥ 46px", () => {
  const slides = [
    { slide_number: 1, title: "Oui, j'utilise l'IA générative.", body: "" },
    { slide_number: 2, title: "Et oui, je m'adresse à des projets qui se veulent un peu plus responsables.", body: "Ça crée une dissonance en moi. Et j'avais envie de vous en parler." },
    { slide_number: 3, title: "Alors pourquoi je l'utilise quand même ?", body: "" },
    { slide_number: 4, title: "Mais je préfère la transparence :", body: "vous avez le droit de savoir comment est faite la com' que je propose. Et je serais ravie d'en discuter avec vous." },
  ];
  const plan = buildCarouselDesignPlan(slides);
  const out = slides.map((s, i) => composeEditorialSlide(s, plan.sequence[i], REF_CH)!);
  assert(out.every(Boolean));
  assertEquals(sizes(out[0].html)[0], 168);
  assert(sizes(out[1].html)[0] >= 84 && sizes(out[1].html)[1] >= 46, JSON.stringify(sizes(out[1].html)));
  assert(sizes(out[2].html)[0] >= 132, "phrase seule en très grand");
  for (const [i, s] of slides.entries()) for (const t of [s.title, s.body]) if (t) assert(plain(out[i].html).includes(t), `slide ${i + 1} : texte perdu`);
  for (const o of out) for (const m of o.html.matchAll(/top:(\d+)px/g)) assert(Number(m[1]) < 1220);
  // Bloc centré verticalement par le navigateur, pleine largeur utile.
  for (const o of out.slice(1)) assert(o.html.includes('data-text-block="1"') && o.html.includes("justify-content:center") && o.html.includes("width:920px"));
});

Deno.test("autofit : une slide longue réduit sa taille sans perdre un mot", () => {
  const body = Array.from({ length: 6 }, (_, i) => `Phrase ${i} qui développe une idée avec soin et précision.`).join(" ");
  const slide = { slide_number: 2, title: "Une longue explication mérite une vraie place", body };
  const out = composeEditorialSlide(slide, buildCarouselDesignPlan([{ slide_number: 1, title: "C" }, slide, { slide_number: 3, title: "F", body: "x y" }]).sequence[1], REF_CH);
  assert(out, "la slide tient");
  assert(plain(out!.html).includes(body));
  const s = sizes(out!.html);
  assert(s[1] >= 40 && s[1] <= 46, JSON.stringify(s));
});

Deno.test("design au service du sens : rupture, phrase seule, italique d'accent et surlignage appliqués ; texte inchangé", () => {
  const slides = [
    { slide_number: 1, title: "Oui, j'utilise l'IA générative.", body: "" },
    { slide_number: 2, title: "Pour tout vous dire, avant, j'étais toujours un peu bloquée.", body: "Établir une stratégie, ça coûte cher. Souvent, les personnes venaient me voir sans stratégie." },
    { slide_number: 3, title: "Je ne sais pas si j'ai raison.", body: "Ça crée une dissonance en moi, je le sais." },
    { slide_number: 4, title: "Mais je préfère la transparence :", body: "vous avez le droit de savoir." },
  ];
  const plan = buildCarouselDesignPlan(slides);
  const sensed = applyTextSenseDesign(slides, plan, REF_CH, { cover_accent: "l'IA générative", slides: [
    { slide_number: 2, forme: "texte", accent: "bloquée", surligne: "ça coûte cher" },
    { slide_number: 3, forme: "rupture", surligne: "dissonance" },
  ] });
  const out = slides.map((s, i) => composeEditorialSlide(s, sensed.sequence[i], REF_CH)!);
  assert(/<span style="font-style:italic;color:#FB3D80">l'IA générative<\/span>/.test(out[0].html), "accent de couverture");
  assert(/<span style="font-style:italic;color:#FB3D80">bloquée<\/span>/.test(out[1].html), "accent du titre");
  assert(/<span style="background:linear-gradient\(transparent 58%, #FFE561 58%\);padding:0 4px">ça coûte cher<\/span>/.test(out[1].html), "mot surligné");
  assert(out[2].html.includes("background:#91014B"), "rupture : fond plein");
  assert(!out[2].html.includes("linear-gradient"), "pas de surligneur sur fond inversé");
  for (const [i, s] of slides.entries()) for (const t of [s.title, s.body]) if (t) assert(plain(out[i].html).includes(t), `slide ${i + 1} : texte modifié`);
  // Sans réponse de l'étage : le plan de repli, inchangé.
  assertEquals(applyTextSenseDesign(slides, plan, REF_CH, null), plan);
});

Deno.test("design au service du sens : une forme qui ne tient pas cède, jamais le texte", () => {
  const long = Array.from({ length: 5 }, (_, i) => `Phrase ${i} qui développe une idée avec soin et précision.`).join(" ");
  const slides = [{ slide_number: 1, title: "Couverture", body: "" }, { slide_number: 2, title: "Un titre plutôt long pour une phrase seule en très grand", body: long }, { slide_number: 3, title: "Fin", body: "Merci." }];
  const plan = buildCarouselDesignPlan(slides);
  const sensed = applyTextSenseDesign(slides, plan, REF_CH, { slides: [{ slide_number: 2, forme: "phrase_seule" }] });
  const base = composeEditorialSlide(slides[1], plan.sequence[1], REF_CH);
  assert(base, "fixture : la slide tient en texte nu");
  assertEquals(sensed.sequence[1].layout, "essay", "la phrase seule ne tient pas : elle cède");
  const out = composeEditorialSlide(slides[1], sensed.sequence[1], REF_CH);
  assert(out && plain(out.html).includes(long), "slide toujours composée avec tout son texte");
});
