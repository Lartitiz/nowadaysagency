// Stories des chemins SECONDAIRES (mode photo / vision, recyclage), 04/10/2026.
// Avant : ces deux chemins écrivaient les stories en prose « texte +
// indication visuelle », affichée telle quelle (aucune image, consignes de
// tournage lues comme du texte à publier). Maintenant ils produisent la même
// séquence structurée que le flux principal et passent par la même chaîne :
// retrait de la mise en page écrite → correction du texte → mise en forme par
// le code → photo d'abord. Ces tests échouent si l'un des deux chemins revient
// à la prose ou échappe à la chaîne.
//
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/creative-flow/stories_secondary_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFetchMock, setTestEnv } from "../_shared/test-edge-harness.ts";
import { buildVisionGenerateBrief, buildVisionTool } from "../_shared/vision-prompts.ts";
import { RECYCLAGE_CARROUSEL_LONGUEUR, RECYCLAGE_STORIES_LONGUEUR } from "../_shared/socle.ts";
import {
  adoptStructuredStories,
  coerceStoriesSequence,
  finalizeStoriesLayout,
  STORY_WRITER_LAYOUT_FIELDS,
  storyWords,
  stripStoriesWriterLayout,
} from "../_shared/story-formatting.ts";

setTestEnv();

// Même neutralisation de serve() que index_test.ts (pas de --allow-net en CI).
const realListen = Deno.listen;
// deno-lint-ignore no-explicit-any
(Deno as any).listen = () => ({
  [Symbol.asyncIterator]() {
    return { next: () => new Promise(() => {}) };
  },
  accept: () => new Promise(() => {}),
  close() {},
  addr: { transport: "tcp", hostname: "localhost", port: 0 },
  rid: -1,
  ref() {},
  unref() {},
  // deno-lint-ignore no-explicit-any
}) as any;
const { buildRecycleSystemPrompt, finalizeRecycledStories } = await import("./index.ts");
// deno-lint-ignore no-explicit-any
(Deno as any).listen = realListen;

const VALID_GABARITS = ["photo_pills", "interaction", "liste", "citation"];
const LAYOUT_WORDS = [
  "gabarit", "body_pill", "list_pills", "\"quote\"", "\"background\"", "text_position",
  // (« placement » entre guillemets : le socle partagé du recyclage parle de
  // « déplacement de perspective », sans rapport avec la mise en page)
  "\"placement\"", "photo_pills", "fond_pills", "fond_couleur", "\"interaction\"", "\"liste\"", "\"citation\"",
];

/** Chaque story non face cam : plan visuel valide, fond photo, et rien de ce
 * qu'affiche le gabarit n'est inventé ni ne fait disparaître un mot. */
// deno-lint-ignore no-explicit-any
function assertStoriesReady(stories: any[]) {
  assert(stories.length > 0, "aucune story");
  for (const [i, s] of stories.entries()) {
    const n = `story ${i + 1}`;
    if (s.face_cam === true) {
      assertEquals(s.visual, null, `${n} face cam : pas de visuel`);
      continue;
    }
    assert(s.visual && typeof s.visual === "object", `${n} sans visuel`);
    assert(VALID_GABARITS.includes(s.visual.gabarit), `${n} : gabarit ${s.visual.gabarit}`);
    assertEquals(s.visual.background, "photo", `${n} sans fond photo`);
    const text: string = s.text;
    const words = storyWords(text).join(" ");
    if (s.visual.gabarit === "liste") {
      for (const it of s.visual.list_pills) assert(text.includes(it), `${n} : item inventé « ${it} »`);
      const shown = storyWords([s.visual.title_pill || "", ...s.visual.list_pills].join(" ")).join(" ");
      assert(shown.includes(words) || words === storyWords(s.visual.list_pills.join(" ")).join(" "), `${n} : mot perdu par la liste`);
    } else if (s.visual.gabarit === "citation") {
      assert(text.toLowerCase().includes(String(s.visual.quote).toLowerCase()), `${n} : citation inventée`);
    } else {
      assertEquals(s.visual.body_pill, text, `${n} : le texte affiché n'est pas le texte complet`);
    }
  }
}

// ═══ 1. MODE PHOTO (vision) ═══

const OLD_VISION_STORIES_BRIEF =
  `Découpe une SÉQUENCE DE 3 À 5 STORIES Instagram qui exploitent cette image (zooms, crops narratifs, hors-champ, sticker question / sondage). Chaque story doit avoir une intention claire (accroche, contexte, révélation, CTA). Texte court, oral, direct.`;

Deno.test("vision stories : consignes d'écriture mot pour mot ; sortie = tableau de stories, sans prose ni mise en page", () => {
  for (const ctype of ["stories", "story", "instagram_stories"]) {
    const { formatBrief, jsonShape } = buildVisionGenerateBrief(ctype);
    assertEquals(formatBrief, OLD_VISION_STORIES_BRIEF, "les consignes d'écriture des stories photo ont changé");
    // Plus de prose « séquence numérotée … + indication visuelle » dans "content".
    assert(!jsonShape.includes('"content"'), "le prompt photo stories demande encore un content en prose");
    assert(!jsonShape.includes("séquence numérotée"), "ancienne forme prose encore demandée");
    for (const kept of ['"stories"', '"text"', '"sticker"', '"title_pill"', '"photo_directive"', '"face_cam"', '"accroche"']) {
      assert(jsonShape.includes(kept), `la forme de sortie a perdu ${kept}`);
    }
    // Garde-fou : le prompt d'écriture ne demande AUCUNE mise en page.
    for (const w of [...LAYOUT_WORDS, "placement"]) assert(!jsonShape.includes(w), `le prompt photo stories demande « ${w} »`);
    for (const f of STORY_WRITER_LAYOUT_FIELDS) assert(!jsonShape.includes(`"${f}"`), `champ de mise en page « ${f} »`);

    const tool = buildVisionTool(ctype);
    // deno-lint-ignore no-explicit-any
    const schema: any = tool.input_schema;
    assertEquals(schema.required.includes("stories"), true);
    assertEquals("content" in schema.properties, false, "le tool photo stories accepte encore un content en prose");
    const schemaJson = JSON.stringify(schema);
    for (const f of STORY_WRITER_LAYOUT_FIELDS) assert(!schemaJson.includes(`"${f}"`), `champ de mise en page « ${f} » dans le tool`);
  }
  // Les autres formats photo ne changent pas.
  for (const ctype of ["post_linkedin", "reel", "newsletter", "instagram_post"]) {
    assert(buildVisionGenerateBrief(ctype).jsonShape.includes('"content"'));
    // deno-lint-ignore no-explicit-any
    assertEquals((buildVisionTool(ctype).input_schema as any).required.includes("content"), true);
  }
});

/** Réponse du tool vision (JSON transporté), avec ce qu'un modèle pourrait
 * écrire de travers : mise en page, prose héritée, story vide. */
function visionToolOutput(): string {
  return JSON.stringify({
    accroche: "Ce bol a failli finir à la poubelle",
    format: "stories_sequence",
    content: "1. Zoom sur la fissure. Texte : Ce bol a failli finir à la poubelle.",
    stories: [
      {
        number: 1, role: "accroche",
        text: "Ce bol a failli finir à la poubelle. Regardez la fissure, juste là, sur le bord.",
        sticker: null,
        visual: { title_pill: null, photo_directive: "zoom serré sur la fissure du bord", gabarit: "fond_pills", background: "fond_couleur", body_pill: "Un résumé" },
        face_cam: false,
      },
      {
        number: 2, role: "contexte",
        text: "Ce que je regarde avant de jeter : la profondeur ; la longueur ; l'endroit.",
        sticker: null,
        visual: { title_pill: null, photo_directive: "crop sur mes mains qui tiennent le bol", list_pills: ["Item réécrit"] },
      },
      {
        number: 3, role: "révélation",
        text: "Une cliente m'a dit « c'est celui-là que je veux, avec sa cicatrice » et je l'ai gardé.",
        visual: { photo_directive: "le bol entier, hors-champ l'étagère", quote: "inventée" },
      },
      {
        number: 4, role: "CTA",
        text: "Et vous, vous gardez les pièces imparfaites ?",
        sticker: { type: "sondage", label: "Sondage", options: ["Je garde", "Je jette"], placement: "bas" },
        visual: { title_pill: "Petit sondage", photo_directive: "la photo entière" },
      },
      { number: 5, text: "", visual: {} },
    ],
  });
}

Deno.test("vision stories : la réponse suit la chaîne du flux principal ; chaque story a un visuel valide, aucun mot perdu, extraits exacts", () => {
  const parsed = JSON.parse(visionToolOutput());
  // Ordre de production (creative-flow, bloc isStories) : adoption → retrait →
  // [correction du texte] → mise en forme + photo d'abord.
  assertEquals(adoptStructuredStories(parsed), true);
  stripStoriesWriterLayout(parsed);
  finalizeStoriesLayout(parsed, { storiesPhotoCatalog: [] });
  assertEquals("content" in parsed, false, "la prose « indication visuelle » serait encore affichée / copiée");
  assertEquals(parsed.stories.length, 4, "la story vide doit être écartée, les autres gardées");
  assertStoriesReady(parsed.stories);
  assertEquals(parsed.stories.map((s: any) => s.visual.gabarit), ["photo_pills", "liste", "citation", "interaction"]);
  // L'indication visuelle reste une consigne photo, jamais du texte.
  assertEquals(parsed.stories[0].visual.photo_directive, "zoom serré sur la fissure du bord");
  for (const s of parsed.stories) assert(!s.text.includes("zoom"), "indication visuelle dans le texte lu");
  const all = JSON.stringify(parsed.stories);
  for (const invented of ["Un résumé", "Item réécrit", "inventée", "fond_couleur", "\"placement\""]) assert(!all.includes(invented), invented);
});

Deno.test("vision stories : stories sérialisées en chaîne → adoptées ; réponse en prose seule → laissée telle quelle", () => {
  const raw = JSON.parse(visionToolOutput());
  const asString = { ...raw, stories: JSON.stringify(raw.stories) };
  assertEquals(adoptStructuredStories(asString), true);
  assert(Array.isArray(asString.stories));
  const prose = { content: "1. Story texte…", accroche: "a" };
  assertEquals(adoptStructuredStories(prose), false);
  assertEquals(prose.content, "1. Story texte…");
  assertEquals(coerceStoriesSequence({ stories: [{ text: "" }, { visual: {} }] }), null);
  assertEquals(coerceStoriesSequence("Story 1 : texte en prose"), null);
});

Deno.test("creative-flow : en mode photo, les stories adoptent la forme structurée AVANT le retrait / la correction / la mise en forme", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const start = src.indexOf('if (isStories && step === "generate") {');
  assert(start > 0);
  const block = src.slice(start, start + 1200);
  const adopt = block.indexOf("if (isPhotoMode) adoptStructuredStories(parsed)");
  const strip = block.indexOf("stripStoriesWriterLayout(parsed)");
  const finalize = block.indexOf("finalizeStoriesLayout(parsed");
  assert(adopt >= 0 && strip > adopt && finalize > strip, `ordre cassé : ${adopt}, ${strip}, ${finalize}`);
  // La génération photo utilise le tool structuré (miroir du prompt).
  const vision = src.slice(src.indexOf("async function runVisionGenerate("));
  assert(vision.slice(0, 9000).includes("tool: buildVisionTool(contentType)"));
});

// ═══ 2. RECYCLAGE ═══

const FORMAT_LABELS: Record<string, string> = {
  carrousel: "Carrousel Instagram",
  reel: "Script Reel (30-60 sec)",
  stories: "Séquence Stories",
  linkedin: "Post LinkedIn",
  newsletter: "Email / Newsletter",
};
const OLD_STORIES_LINE = "- Stories : une idée par story, le nombre suit le découpage. Chaque story = ce qui est affiché (texte, sticker, sondage) + indication visuelle. Une story d'interaction au milieu ou vers la fin.";
const recyclePrompt = (f: string) => buildRecycleSystemPrompt([f], FORMAT_LABELS, "[PREFIX]", "", "céramiste", "débutantes", "atelier");

Deno.test("recyclage stories : séquence structurée demandée, indication visuelle hors du texte, aucune mise en page ; autres formats inchangés", () => {
  const p = recyclePrompt("stories");
  assert(!p.includes('"stories": "contenu complet ici"'), "les stories recyclées sont encore demandées en prose");
  assert(p.includes('"stories": {\n      "stories": ['), "forme structurée absente");
  for (const kept of ['"text"', '"sticker"', '"title_pill"', '"photo_directive"', '"photo_query_en"', '"face_cam"']) {
    assert(p.includes(kept), `le prompt stories recyclé a perdu ${kept}`);
  }
  assert(p.includes('indication visuelle (dans "photo_directive", jamais dans le texte)'));
  assert(p.includes("Une story d'interaction (sticker) au milieu ou vers la fin de la séquence."), "règle d'interaction perdue");
  // Une idée par story (socle, 05/10/2026) : plus de nombre fixe, la longueur suit le découpage.
  assert(p.includes(RECYCLAGE_STORIES_LONGUEUR), "longueur perdue");
  assert(!/5-7 stories|Story 4 =/.test(p), "nombre fixe de stories encore imposé");
  for (const w of LAYOUT_WORDS) assert(!p.includes(w), `le prompt stories recyclé demande « ${w} »`);
  for (const f of STORY_WRITER_LAYOUT_FIELDS) assert(!p.includes(`"${f}"`), `champ de mise en page « ${f} »`);
  // Les prompts des autres formats ne bougent pas (le LinkedIn en particulier).
  for (const f of ["linkedin", "reel", "carrousel", "newsletter"]) {
    const other = recyclePrompt(f);
    assert(other.includes(OLD_STORIES_LINE), `${f} : ligne stories modifiée`);
    assert(!other.includes("photo_directive") && !other.includes("IMPORTANT pour les stories"), `${f} : consigne stories ajoutée`);
  }
});

Deno.test("recyclage carrousel : une idée par slide, plus de « exactement 8 slides » (socle, 05/10/2026)", () => {
  const p = recyclePrompt("carrousel");
  assert(p.includes(RECYCLAGE_CARROUSEL_LONGUEUR), "consigne de longueur du socle absente");
  for (const old of ["exactement 8 slides", "Pas moins de 8 slides", "- Carrousel : 8 slides", "Slides 2 à 8 : 2-4 phrases"]) {
    assert(!p.includes(old), `nombre fixe encore imposé : « ${old} »`);
  }
  assert(p.includes("de 5 à 12 slides"), "bornes raisonnables absentes");
  assert(p.includes("Le nombre de slides suit le découpage"), "découpage absent de la consigne finale");
});

const anthropicText = (text: string) => ({
  status: 200,
  body: { content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 40, output_tokens: 20 } },
});
const RECYCLED = () => ({
  stories: [
    { number: 1, role: "Hook", text: "J'ai longtemps cru qu'un bol fissuré était un bol raté. Ma newsletter de la semaine m'a fait changer d'avis.", sticker: null, visual: { title_pill: null, photo_directive: "le bol fissuré posé sur l'établi", photo_query_en: "cracked bowl", gabarit: "citation", body_pill: "Résumé inventé" }, face_cam: false },
    { number: 2, role: "Contexte", text: "Ce que je regarde : la profondeur ; la longueur ; l'endroit de la fissure.", visual: { photo_directive: "mes mains qui inspectent le bord", photo_query_en: "hands inspecting pottery" } },
    { number: 3, role: "Vécu", text: "Je vous le dis en vrai, face caméra.", face_cam: true, visual: { gabarit: "photo_pills" } },
    { number: 4, role: "Interaction", text: "Vous gardez vos pièces imparfaites, vous ?", sticker: { type: "sondage", label: "Sondage", options: ["Oui", "Non"], placement: "haut" }, visual: { photo_directive: "une étagère de bols imparfaits", photo_query_en: "imperfect ceramics shelf" } },
  ],
});

Deno.test("recyclage stories : finalizeRecycledStories passe par retrait → correction → mise en forme ; chaque story a un visuel valide", async () => {
  // Correction : réponse sans marqueur → texte d'origine gardé (garde de fidélité).
  const mock = installFetchMock({ anthropic: () => anthropicText("réponse sans marqueur") });
  try {
    for (const input of [RECYCLED(), JSON.stringify(RECYCLED()), RECYCLED().stories]) {
      const done = await finalizeRecycledStories(input, { sourceText: "Ma newsletter sur les bols fissurés.", fullContext: "" });
      assert(done, "séquence perdue");
      assertStoriesReady(done!.sequence.stories);
      const s = done!.sequence.stories;
      assertEquals(s.map((x: any) => x.visual?.gabarit ?? null), ["photo_pills", "liste", null, "interaction"]);
      // Texte intact, mot pour mot (aucune réécriture par la mise en forme).
      assertEquals(s[0].text, RECYCLED().stories[0].text);
      assertEquals(s[1].visual.list_pills, ["la profondeur", "la longueur", "l'endroit de la fissure"]);
      assertEquals(s[0].visual.photo_directive, "le bol fissuré posé sur l'établi");
      const all = JSON.stringify(s);
      for (const invented of ["Résumé inventé", "\"placement\""]) assert(!all.includes(invented), invented);
    }
    // La source recyclée est la matière de la correction (comme l'ancienne garde texte).
    assert(mock.anthropicCallCount >= 1, "la correction du texte n'a pas tourné");
  } finally {
    mock.restore();
  }
});

Deno.test("recyclage stories : séquence sans texte → null (le format est retenté), jamais de story vide affichée", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicText("x") });
  try {
    assertEquals(await finalizeRecycledStories({ stories: [] }, { sourceText: "s", fullContext: "" }), null);
    assertEquals(await finalizeRecycledStories({ stories: [{ text: "  " }] }, { sourceText: "s", fullContext: "" }), null);
    assertEquals(await finalizeRecycledStories("Story 1 : prose", { sourceText: "s", fullContext: "" }), null);
  } finally {
    mock.restore();
  }
});

Deno.test("creative-flow recyclage : les stories structurées passent par finalizeRecycledStories avant toute garde texte", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const run = src.slice(src.indexOf("const runFormat = async (f: string)"));
  const structured = run.indexOf("if (structuredStories) {");
  const finalize = run.indexOf("await finalizeRecycledStories(resultVal");
  const textGate = run.indexOf("await runTextRedacGate(resultVal");
  assert(structured > 0 && finalize > structured && textGate > finalize, `ordre cassé : ${structured}, ${finalize}, ${textGate}`);
  const fn = src.slice(src.indexOf("export async function finalizeRecycledStories("));
  const strip = fn.indexOf("stripStoriesWriterLayout(sequence)");
  const corr = fn.indexOf("applyStoriesCorrectionPass(sequence");
  const lay = fn.indexOf("finalizeStoriesLayout(sequence");
  assert(strip > 0 && corr > strip && lay > corr, `chaîne recyclage cassée : ${strip}, ${corr}, ${lay}`);
});

Deno.test("recyclage : la voix parlée, pas hachée, vaut pour chaque format recyclé (05/10/2026)", async () => {
  const { VOIX_PARLEE_PAS_HACHEE } = await import("../_shared/socle.ts");
  for (const f of ["stories", "carrousel", "reel", "linkedin", "newsletter"]) {
    if (!recyclePrompt(f).includes(VOIX_PARLEE_PAS_HACHEE)) throw new Error(`recyclage ${f} sans la consigne`);
  }
});
