import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  composeNarrative,
  createContinuousNarrative,
  parseNarrative,
  usesContinuousNarrative,
} from "./continuous-narrative.ts";
import { progressionReceipt } from "../_shared/carousel-progression.ts";
const original = {
  idea: "Le temps de réparation change le choix d'un objet",
  hook: "Un objet se choisit aussi après l'achat",
  paragraphs: [
    "Le premier prix ne dit pas combien de temps l'objet pourra servir.",
    "Quand la pièce usée se remplace, cette durée dépend aussi de la réparation.",
    "Cela donne un autre critère de choix : pouvoir garder ce qui fonctionne encore.",
  ],
  caption: { hook: "", body: "", cta: "", hashtags: [] },
};
const base = {
  body: {
    carousel_type: "photo",
    scenario_origin: "automatic",
    slide_count: 4,
    photo_contexts: [{ context: "Objet démontable" }],
  },
  brandingContext: "Pièces remplaçables. Réparation proposée.",
  photoContext: "Objet démontable",
  newsContext: "",
  authoredText: "",
  startedAt: Date.now(),
  usage: {},
  emitStatus: () => {},
};

for (const quality_max of [false, true]) {
  Deno.test(`texte suivi ${quality_max ? "Max" : "standard"} : aucune rubrique du plan, relecture avant composition`, async () => {
    const events: string[] = [];
    const result = await createContinuousNarrative({
      ...base,
      body: {
        ...base.body,
        quality_max,
        confirmed_structure: Array.from(
          { length: 4 },
          (_, i) => ({
            slide_number: i + 1,
            photo_index: 1,
            slide_type: "photo_full",
            title_suggestion: "PLAN_PHOTO_A_ECARTER",
            role: "description",
          }),
        ),
      },
      usage: {},
      write: async (o, s) => {
        events.push("write");
        assertEquals(o.model, quality_max ? "claude-fable-5-1" : "claude-opus-5-5");
        assertEquals(o.tool?.name, "ecrire_texte_suivi");
        assert(o.system?.includes("25 à 40"));
        assert(o.system?.includes("caption.body"));
        assert(!JSON.stringify(o).includes("PLAN_PHOTO_A_ECARTER"));
        assert(JSON.stringify(o).includes("Pièces remplaçables"));
        if (s) Object.assign(s, { model: o.model, total_tokens: 5 });
        return JSON.stringify(original);
      },
      review: async (doc) => {
        events.push("review");
        assert(doc.slides.every((s: any) => s.photo_index === undefined));
        return {
          ...await progressionReceipt(doc, "completed"),
          verdict: "acceptable",
        };
      },
    });
    assertEquals(events, ["write", "review"]);
    assertEquals(result?.doc.slides.map((s: any) => s.overlay_text), [
      original.hook,
      ...original.paragraphs,
    ]);
    assertEquals(result?.doc.slides.map((s: any) => s.photo_index), [
      1,
      1,
      1,
      1,
    ]);
  });
}

Deno.test("mixte : la distribution conserve les paragraphes, le choix des photos et les positions", () => {
  const body = {
    ...base.body,
    carousel_type: "mix",
    confirmed_structure: [
      {
        slide_type: "photo_full",
        photo_index: 2,
        overlay_position: "top_left",
      },
      { slide_type: "text_only" },
      {
        slide_type: "photo_integrated",
        photo_index: 1,
        photo_layout: "right_photo",
      },
      { slide_type: "photo_full", photo_index: 2 },
    ],
  };
  const doc = composeNarrative(original, body);
  assertEquals(
    doc.slides.map((s: any) => s.overlay_text || s.body || s.title),
    [original.hook, ...original.paragraphs],
  );
  assertEquals(doc.slides.map((s) => s.photo_index), [2, null, 1, 2]);
  assert("overlay_position" in doc.slides[0]);
  assertEquals(doc.slides[0].overlay_position, "top_left");
  assert("photo_layout" in doc.slides[2]);
  assertEquals(doc.slides[2].photo_layout, "right_photo");
});

for (const accepted of [false, true]) {
  Deno.test(`réécriture du texte avant composition : acceptée=${accepted}`, async () => {
    let writes = 0, reviews = 0;
    const changed = {
      ...original,
      paragraphs: [
        ...original.paragraphs.slice(0, 2),
        "La durée d'usage devient ainsi un critère concret, dès le choix initial.",
      ],
    };
    const output = await createContinuousNarrative({
      ...base,
      usage: {},
      write: async () => JSON.stringify(++writes === 1 ? original : changed),
      review: async (doc) => ({
        ...await progressionReceipt(doc, "completed"),
        issues: ["Conclusion à relier"],
        verdict: ++reviews === 2 && accepted ? "acceptable" : "needs_repair",
      }),
    });
    assertEquals(writes, 2);
    assertEquals(reviews, 2);
    const last = output?.doc.slides.at(-1);
    assert(last && "overlay_text" in last);
    assertEquals(
      last.overlay_text,
      (accepted ? changed : original).paragraphs.at(-1),
    );
    assertEquals(
      output?.doc.narrative_draft.repair.reason,
      accepted ? "accepted" : "candidate-not-acceptable",
    );
  });
}

Deno.test("budget restant insuffisant : conserve le texte relu sans troisième tentative", async () => {
  let writes = 0;
  const output = await createContinuousNarrative({
    ...base,
    startedAt: Date.now() - 180000,
    usage: {},
    write: async () => {
      writes++;
      return JSON.stringify(original);
    },
    review: async (doc) => ({
      ...await progressionReceipt(doc, "completed"),
      issues: ["Propos faible"],
      verdict: "needs_repair",
    }),
  });
  assertEquals(writes, 1);
  assertEquals(output?.doc.narrative_draft.repair.reason, "time-budget");
});

Deno.test("scénarios humains, photos brutes et texte fourni gardent leur parcours", () => {
  for (
    const patch of [
      { scenario_origin: "user_validated" },
      { scenario_origin: "user_authored" },
      { no_overlay: true },
      { user_slides: [{ body: "Texte fourni" }] },
      { carousel_type: "text" },
      { text_first: true },
    ]
  ) assert(!usesContinuousNarrative({ ...base.body, ...patch }));
  assert(
    !usesContinuousNarrative({
      carousel_type: "photo",
      confirmed_structure: [{ role: "hook" }, { role: "fin" }],
    }),
  );
});

Deno.test("réponse incomplète ou mauvais nombre : erreur explicite, aucun récit de remplacement", async () => {
  assertThrows(() =>
    parseNarrative(
      JSON.stringify({ ...original, paragraphs: ["Un seul paragraphe"] }),
      4,
    )
  );
  assertThrows(() => parseNarrative("{}", 4));
  await assertRejects(
    () =>
      createContinuousNarrative({
        ...base,
        write: async () => {
          throw Error("provider-unavailable");
        },
      }),
    Error,
    "provider-unavailable",
  );
});
