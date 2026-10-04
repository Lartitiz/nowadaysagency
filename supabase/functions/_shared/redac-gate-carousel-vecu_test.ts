// Carrousel (04/10/2026) : les témoignages inventés (« une céramiste me
// disait… ») et le vécu au passé inventé (« j'ai essayé. Résultat : … ») étaient
// mesurés sur LinkedIn (#1310/#1317/#1321) mais pas sur le carrousel. Le gate
// carrousel les mesure maintenant sur slides + légende, quand l'appelant fournit
// la source (brief + réponses + actu), avec instruction ciblée, garde
// anti-régression et passe dédiée courte.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { installFetchMock, setTestEnv } from "./test-edge-harness.ts";
import { analyzeCarouselRedac, applyGuardedCarouselCorrection, redacViolations, runRedacGate } from "./redac-gate.ts";
import { extractCarouselTexts, TESTIMONY_REMOVAL_PROMPT } from "./correction-pass.ts";

setTestEnv();

const BRIEF = "Pourquoi publier plus souvent sur Instagram ne fait pas décoller ta portée. Les 3 premières heures comptent.";
const TESTIMONY = "Une céramiste me disait récemment qu'elle avait doublé sa fréquence sans rien voir bouger.";
const EXPERIENCE = "J'ai essayé de poster tous les jours. Résultat : moins de vues qu'avant.";
const CLEAN_1 = "Doubler sa fréquence sans voir sa portée bouger, c'est courant.";
const CLEAN_2 = "Je pense que publier plus ne règle rien : les 3 premières heures décident de la suite.";
const CLEAN_CAPTION = "Je trouve qu'on confond régularité et volume. Ce qui compte, c'est ce qui donne envie de s'arrêter.";

// deno-lint-ignore no-explicit-any
const carousel = (slide1: string, captionBody: string): any => ({
  slides: [
    { slide_number: 1, title: "Publier plus ne suffit pas", body: slide1, photo_index: 1 },
    { slide_number: 2, title: "Ce qui compte vraiment", body: CLEAN_2, photo_index: 2 },
    { slide_number: 3, title: "À toi de jouer", body: "Choisis un post par semaine et soigne son ouverture." },
  ],
  caption: { hook: "Publier plus, vraiment ?", body: captionBody, cta: "Tu publies combien de fois par semaine ?", hashtags: ["instagram"] },
});

const anthropicText = (text: string) => ({
  status: 200,
  body: { content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 100 } },
});

// deno-lint-ignore no-explicit-any
const systemOf = (req: any): string =>
  typeof req?.system === "string" ? req.system : Array.isArray(req?.system) ? req.system.map((b: any) => b?.text ?? "").join("") : "";
const gateOpts = (testimonySource: string | undefined, enabled = true) => ({
  isLinkedIn: false,
  inputText: BRIEF,
  testimonySource,
  correction: { enabled, skipIfShorterThan: 0, model: "claude-haiku-4-5" as const },
});

Deno.test("carrousel : témoignage et vécu au passé inventés détectés sur slides + légende", () => {
  const a = analyzeCarouselRedac(carousel(TESTIMONY, EXPERIENCE), undefined, undefined, undefined, undefined, BRIEF);
  assertEquals(a.inventedTestimonials?.length, 1);
  assertEquals(a.inventedTestimonials?.[0].includes("Une céramiste me disait"), true);
  assertEquals(a.inventedExperiences?.length, 1);
  assertEquals(a.inventedExperiences?.[0].includes("Résultat : moins de vues"), true);
  assertEquals(redacViolations(a), 2);
  const clean = analyzeCarouselRedac(carousel(CLEAN_1, CLEAN_CAPTION), undefined, undefined, undefined, undefined, BRIEF);
  assertEquals(clean.inventedTestimonials, []);
  assertEquals(clean.inventedExperiences, []);
  assertEquals(redacViolations(clean), 0);
});

Deno.test("carrousel : source qui fournit le témoignage ou le vécu -> accepté ; source inconnue -> non mesuré", () => {
  const doc = carousel(TESTIMONY, EXPERIENCE);
  const provided = `${BRIEF}\nUne cliente céramiste m'a dit qu'elle avait doublé sa fréquence. J'ai testé tous les jours pendant un mois.`;
  const a = analyzeCarouselRedac(doc, undefined, undefined, undefined, undefined, provided);
  assertEquals(a.inventedTestimonials, []);
  assertEquals(a.inventedExperiences, []);
  const unknown = analyzeCarouselRedac(doc);
  assertEquals(unknown.inventedTestimonials, []);
  assertEquals(unknown.inventedExperiences, []);
});

Deno.test("carrousel : habitude plausible du métier au présent -> pas signalée (#1320)", () => {
  const habit = "Je ne publie presque jamais une pièce que je viens de sortir du four.";
  const a = analyzeCarouselRedac(carousel(habit, CLEAN_CAPTION), undefined, undefined, undefined, undefined, BRIEF);
  assertEquals(a.inventedTestimonials, []);
  assertEquals(a.inventedExperiences, []);
});

Deno.test("carrousel : une correction qui INTRODUIT un témoignage est rejetée", async () => {
  const clean = JSON.stringify(carousel(CLEAN_1, CLEAN_CAPTION));
  const logs: string[] = [];
  const mock = installFetchMock({ anthropic: () => anthropicText(`[SLIDE 1 - BODY] ${TESTIMONY}`) });
  try {
    const out = await applyGuardedCarouselCorrection(clean, {
      inputText: BRIEF,
      testimonySource: BRIEF,
      correction: { skipIfShorterThan: 0, model: "claude-haiku-4-5", logger: (m) => logs.push(m) },
    });
    assertEquals(mock.anthropicCallCount >= 1, true);
    assertEquals(out, clean);
    assertEquals(logs.some((m) => m.includes("regression:invented-testimonials")), true);
  } finally {
    mock.restore();
  }
});

Deno.test("carrousel : instruction ciblée dans la relecture, puis passe dédiée gardée (marqueurs préservés)", async () => {
  const doc = carousel(TESTIMONY, EXPERIENCE);
  const block = extractCarouselTexts(doc);
  // deno-lint-ignore no-explicit-any
  const requests: any[] = [];
  const mock = installFetchMock({
    // deno-lint-ignore no-explicit-any
    anthropic: (req: any) => {
      requests.push(req);
      // Relecture générale : ne corrige rien. Passe dédiée : retire les deux.
      if (systemOf(req).includes("Tu es correctrice factuelle")) {
        return anthropicText(block.replace(TESTIMONY, CLEAN_1).replace(EXPERIENCE, CLEAN_CAPTION));
      }
      return anthropicText(block);
    },
  });
  try {
    const result = await runRedacGate(JSON.stringify(doc), gateOpts(BRIEF));
    const out = JSON.parse(result.content);
    assertEquals(result.before.inventedTestimonials?.length, 1);
    assertEquals(result.before.inventedExperiences?.length, 1);
    assertEquals(JSON.stringify(requests[0]).includes("TÉMOIGNAGE INVENTÉ"), true);
    assertEquals(JSON.stringify(requests[0]).includes("VÉCU PERSONNEL INVENTÉ"), true);
    const dedicated = requests.find((r) => systemOf(r) === TESTIMONY_REMOVAL_PROMPT);
    assertEquals(Boolean(dedicated), true);
    assertEquals(JSON.stringify(dedicated).includes("[SLIDE 1 - BODY]"), true);
    assertEquals(out.slides[0].body, CLEAN_1);
    assertEquals(out.slides[0].title, "Publier plus ne suffit pas");
    assertEquals(out.slides[1].body, CLEAN_2);
    assertEquals(out.slides[0].photo_index, 1);
    assertEquals(out.caption.body, CLEAN_CAPTION);
    assertEquals(result.after.inventedTestimonials, []);
    assertEquals(result.after.inventedExperiences, []);
    assertEquals(result.repassed, true);
    assertEquals(out.quality_check.invented_testimonials, 0);
    assertEquals(out.quality_check.invented_experiences, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("carrousel : passe dédiée rejetée si le témoignage reste ou si un chiffre sourcé disparaît", async () => {
  const doc = carousel(TESTIMONY, CLEAN_CAPTION);
  const block = extractCarouselTexts(doc);
  for (
    const dedicatedOutput of [
      block.replace("Une céramiste me disait récemment", "Une potière me confiait"),
      block.replace(TESTIMONY, CLEAN_1).replace("les 3 premières heures", "les premières heures"),
    ]
  ) {
    const mock = installFetchMock({
      // deno-lint-ignore no-explicit-any
      anthropic: (req: any) => anthropicText(systemOf(req).includes("Tu es correctrice factuelle") ? dedicatedOutput : block),
    });
    try {
      const result = await runRedacGate(JSON.stringify(doc), gateOpts(BRIEF));
      const out = JSON.parse(result.content);
      assertEquals(out.slides[0].body, TESTIMONY);
      assertEquals(out.slides[1].body, CLEAN_2);
      assertEquals(result.after.inventedTestimonials?.length, 1);
    } finally {
      mock.restore();
    }
  }
});

Deno.test("carrousel : correction désactivée ou source absente -> aucune passe dédiée", async () => {
  const doc = JSON.stringify(carousel(TESTIMONY, EXPERIENCE));
  const mock = installFetchMock({ anthropic: () => anthropicText("[SLIDE 1 - BODY] ne doit pas être appelé") });
  try {
    const disabled = await runRedacGate(doc, gateOpts(BRIEF, false));
    assertEquals(mock.anthropicCallCount, 0);
    assertEquals(disabled.after.inventedTestimonials?.length, 1);
    assertEquals(disabled.violations, 2);
    const unmeasured = await runRedacGate(doc, gateOpts(undefined));
    assertEquals(mock.anthropicCallCount, 0);
    assertEquals(unmeasured.violations, 0);
  } finally {
    mock.restore();
  }
});
