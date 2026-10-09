import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  composeNarrative,
  createContinuousNarrative,
  FINAL_JUDGE_RESERVE_MS,
  narrativeAngleFamily,
  parseNarrative,
  usesContinuousNarrative,
} from "./continuous-narrative.ts";
import {
  audienceAddressRule,
  COVER_WRITING,
  LIVED_CASE_FIRST,
  NEWS_FEELING_FIRST,
  RECIT_CONTINU_MOT_CLE,
  RECIT_CONTINU_PARAGRAPHE,
  RECIT_CONTINU_SERIE_PHOTO,
  SOCLE_FAMILLES,
} from "../_shared/socle.ts";
import { COMMON } from "../_shared/carousel-editorial-contract.ts";
import { progressionJudgeCallMs, progressionReceipt } from "../_shared/carousel-progression.ts";
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
        // Fable 5.1 écrit plus lentement : 140 s au lieu de 100 s (budget global intact).
        if (events.length === 1) assertEquals(o.abortTimeoutMs, quality_max ? 140000 : 100000);
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

Deno.test("photos brutes envoyées sans pixels ni contexte : pas de récit continu (sinon « Choisis les photos »)", () => {
  // Corps réel du mode « Photos brutes » (visite du 05/10) : le front n'envoie
  // ni photos, ni photo_contexts, ni drapeau no_overlay. Le récit continu
  // levait après coup « Choisis les photos du carrousel avant de générer ».
  const pureDump = {
    type: "express_full",
    carousel_type: "photo",
    subject: "Qui je suis",
    photo_description: "",
    slide_structure: null,
    confirmed_structure: null,
    scenario_origin: "automatic",
  };
  assert(!usesContinuousNarrative(pureDump));
  assert(!usesContinuousNarrative({ ...pureDump, photos: [], photo_contexts: [] }));
  assert(usesContinuousNarrative({ ...pureDump, photo_contexts: [{}] }));
  assert(usesContinuousNarrative({ ...pureDump, photos: [{ base64: "x" }] }));
  assert(usesContinuousNarrative({ ...pureDump, slide_structure: [{ photo_index: 1 }, {}] }));
  // 09/10 : « Photos brutes » signalé par l'app = parcours classique allégé, jamais le récit continu.
  assert(!usesContinuousNarrative({ ...pureDump, photo_contexts: [{}], photos_only: true }));
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

Deno.test("carrousel photo : chaque slide reste photo_full avec son texte, même si la structure dit text_only (vu en live 04/10)", () => {
  const n = { idea: "Idée", hook: "Accroche du carrousel", paragraphs: ["Deuxième passage du récit.", "Troisième passage du récit.", "Dernier passage du récit."], caption: { hook: "h", body: "b", cta: "", hashtags: [] } };
  const out = composeNarrative(n as any, { carousel_type: "photo", photos: [{}, {}], confirmed_structure: [
    { slide_number: 1, slide_type: "photo_full", photo_index: 1 }, { slide_number: 2, slide_type: "text_only" },
    { slide_number: 3, slide_type: "photo_full", photo_index: 2 }, { slide_number: 4, slide_type: "text_only" },
  ] });
  assertEquals(out.slides.map((s: any) => s.slide_type), ["photo_full", "photo_full", "photo_full", "photo_full"]);
  assertEquals(out.slides.map((s: any) => s.overlay_text), ["Accroche du carrousel", ...n.paragraphs]);
  assert(out.slides.every((s: any) => Number.isInteger(s.photo_index)));
});

// ═══ Socle, étape 2 : le récit continu reçoit les règles du socle ═══════════

const acceptAll = async (doc: any) => ({ ...await progressionReceipt(doc, "completed"), verdict: "acceptable" as const });
async function systemFor(body: any, extra: Record<string, unknown> = {}): Promise<string> {
  let system = "";
  await createContinuousNarrative({
    ...base,
    body: { ...base.body, ...body },
    usage: {},
    ...extra,
    write: async (o) => {
      system ||= o.system || "";
      return JSON.stringify({ ...original, paragraphs: body.slide_count ? original.paragraphs.slice(0, body.slide_count - 1) : original.paragraphs });
    },
    review: acceptAll,
  });
  return system;
}

Deno.test("socle : photo, vous, vécu fourni, série photo → tu/vous en tête, Ton cas d'abord, couverture, unité photo", async () => {
  const system = await systemFor({
    slide_count: undefined,
    deepening_answers: { fait: "J'ai augmenté mes tarifs de 300 € l'an dernier et j'ai eu peur de perdre mes clientes." },
    editorial_intent: { mode: "serie_visuelle" },
  }, { audienceAddress: "vous" });
  assert(system.startsWith(`${audienceAddressRule("vous")}\n\n${COMMON}`), "règle ferme tu/vous en tête");
  for (const part of [LIVED_CASE_FIRST, COVER_WRITING, RECIT_CONTINU_MOT_CLE, RECIT_CONTINU_PARAGRAPHE, RECIT_CONTINU_SERIE_PHOTO, SOCLE_FAMILLES.J.cas_dabord.texte!, "25 à 40"]) {
    assert(system.includes(part), part.slice(0, 60));
  }
  // Contradictions d'avant supprimées.
  assert(!system.includes("sans minimum de mots"));
  assert(!system.includes("3 à 19") && system.includes("de 3 à 9 paragraphes"));
  assert(!system.includes(NEWS_FEELING_FIRST));
});

Deno.test("socle : mixte avec actu et ressenti → actu-ressenti, consigne d'actu, famille C ; sans réglage tu/vous, tête inchangée", async () => {
  const system = await systemFor({
    carousel_type: "mix",
    news_context: "Meta change l'ordre du fil Instagram (source : Meta, 2026).",
    deepening_answers: { ressenti: "Ça me fatigue, je publie déjà peu et je ne veux pas courir après l'algorithme." },
  }, { newsContext: "Meta change l'ordre du fil Instagram (source : Meta, 2026)." });
  assert(system.startsWith(COMMON), "aucune règle tu/vous sans réglage");
  assert(system.includes(NEWS_FEELING_FIRST));
  assert(system.includes("ACTUALITÉ : conserve le fait déclencheur"));
  assert(system.includes(SOCLE_FAMILLES.C.couverture_accroche.texte!));
  assert(!system.includes(LIVED_CASE_FIRST));
  assert(!system.includes("25 à 40"), "le repère photo reste réservé au carrousel photo");
  assert(system.includes("Prévois exactement 3 paragraphes"));
});

Deno.test("socle : famille d'angle du récit continu", () => {
  assertEquals(narrativeAngleFamily({ editorial_angle: "histoire-cliente" }), "B");
  assertEquals(narrativeAngleFamily({ editorial_intent: { mode: "liste" } }), "E");
  assertEquals(narrativeAngleFamily({ news_context: "Une actu." }), "C");
  assertEquals(narrativeAngleFamily({ editorial_angle: "Un brief libre, long, écrit par la personne." }), null);
  assertEquals(narrativeAngleFamily({}), null);
});

Deno.test("socle : mot clé de couverture gardé seulement s'il est un extrait court de l'accroche", () => {
  for (const carousel_type of ["photo", "mix"]) {
    const body = { ...base.body, carousel_type };
    const ok = composeNarrative({ ...original, cover_accent: "après l'achat" }, body);
    assertEquals(ok.slides[0].cover_accent, "après l'achat");
    assert(ok.slides.slice(1).every((s: any) => !("cover_accent" in s)));
    for (const bad of ["avant l'achat", original.hook, ""]) {
      assert(!("cover_accent" in composeNarrative({ ...original, cover_accent: bad }, body).slides[0]), bad);
    }
  }
  assertEquals(parseNarrative(JSON.stringify({ ...original, cover_accent: " après l'achat " })).cover_accent, "après l'achat");
});

Deno.test("socle : en longueur Auto, un texte de plus de 9 paragraphes est réécrit une fois", async () => {
  const long = { ...original, paragraphs: Array.from({ length: 12 }, (_, i) => `Paragraphe ${i + 1}, une idée distincte.`) };
  const feedbacks: string[] = [];
  let writes = 0;
  const result = await createContinuousNarrative({
    ...base,
    body: { ...base.body, slide_count: undefined },
    usage: {},
    write: async (o) => {
      writes++;
      const sent = JSON.parse((o.messages[0].content as any)[0].text);
      if (sent.feedback) feedbacks.push(sent.feedback);
      return JSON.stringify(writes === 1 ? long : original);
    },
    review: acceptAll,
  });
  assertEquals(writes, 2);
  assert(feedbacks[0].includes("12 paragraphes : 9 au plus"));
  assertEquals(result?.doc.slides.length, 4);
});

// Bilan hebdo 05/10/2026 : cinq carrousels photo d'une même marque recopiaient
// la même présentation. Les derniers contenus sont montrés au rédacteur, et une
// redite mot pour mot déclenche UNE réécriture gardée seulement si elle redit moins.
const recentTexts = [
  "Des bols pour le quotidien\nLe premier prix ne dit pas combien de temps l'objet pourra servir.\nJe vis dans la Drôme, entourée d'arbres.",
];
const rewritten = {
  ...original,
  paragraphs: [
    "Ce qu'on paie au départ ne renseigne pas sur la durée de vie de l'objet.",
    ...original.paragraphs.slice(1),
  ],
};
for (const verdict of ["acceptable", "needs_repair"] as const) {
  Deno.test(`redite d'un contenu récent : réécriture ${verdict === "acceptable" ? "gardée" : "écartée (fil abîmé)"}`, async () => {
    let writes = 0, reviews = 0;
    const systems: string[] = [];
    const output = await createContinuousNarrative({
      ...base,
      recentTexts,
      usage: {},
      write: async (o) => {
        systems.push(String(o.system));
        return JSON.stringify(++writes === 1 ? original : rewritten);
      },
      review: async (doc) => ({
        ...await progressionReceipt(doc, "completed"),
        verdict: ++reviews === 1 ? "acceptable" : verdict,
      }),
    });
    assert(systems[0].includes("DÉJÀ ÉCRIT RÉCEMMENT"));
    assert(systems[0].includes("entourée d'arbres"));
    assertEquals(writes, 2);
    assertEquals(reviews, 2);
    const echo = output?.doc.narrative_draft.recent_echo;
    assert(echo, "recent_echo manquant");
    assertEquals(echo.before, 1);
    assertEquals(echo.accepted, verdict === "acceptable");
    assertEquals(echo.after, verdict === "acceptable" ? 0 : 1);
    assertEquals(echo.reason, verdict === "acceptable" ? "accepted" : "fil-degraded");
    const slide2 = output?.doc.slides[1];
    assert(slide2 && "overlay_text" in slide2, "slide 2 sans overlay_text");
    assertEquals(
      slide2.overlay_text,
      (verdict === "acceptable" ? rewritten : original).paragraphs[0],
    );
  });
}

Deno.test("redite d'un contenu récent : candidate qui redit autant → texte d'origine, sans 2e relecture", async () => {
  let writes = 0, reviews = 0;
  const output = await createContinuousNarrative({
    ...base,
    recentTexts,
    usage: {},
    write: async () => { writes++; return JSON.stringify(original); },
    review: async (doc) => { reviews++; return { ...await progressionReceipt(doc, "completed"), verdict: "acceptable" }; },
  });
  assertEquals([writes, reviews], [2, 1]);
  assertEquals(output?.doc.narrative_draft.recent_echo.reason, "candidate-not-better");
});

Deno.test("redite : phrase fournie dans la demande du jour = pas une redite ; sans contenus récents, rien ne change", async () => {
  for (const extra of [{ recentTexts, authoredText: "Le premier prix ne dit pas combien de temps l'objet pourra servir." }, {}]) {
    let writes = 0;
    const systems: string[] = [];
    const output = await createContinuousNarrative({
      ...base,
      ...extra,
      usage: {},
      write: async (o) => { writes++; systems.push(String(o.system)); return JSON.stringify(original); },
      review: async (doc) => ({ ...await progressionReceipt(doc, "completed"), verdict: "acceptable" }),
    });
    assertEquals(writes, 1);
    assertEquals(output?.doc.narrative_draft.recent_echo.before, 0);
    assertEquals(systems[0].includes("DÉJÀ ÉCRIT RÉCEMMENT"), "recentTexts" in extra);
  }
});

Deno.test("redite : budget trop court → mesurée et tracée, pas de réécriture", async () => {
  let writes = 0;
  const output = await createContinuousNarrative({
    ...base,
    recentTexts,
    startedAt: Date.now() - 180000,
    usage: {},
    write: async () => { writes++; return JSON.stringify(original); },
    review: async (doc) => ({ ...await progressionReceipt(doc, "completed"), verdict: "acceptable" }),
  });
  assertEquals(writes, 1);
  assertEquals(output?.doc.narrative_draft.recent_echo, {
    before: 1, after: 1, attempted: false, accepted: false, reason: "time-budget",
    passages: ["Le premier prix ne dit pas combien de temps l'objet pourra servir"],
  });
});

// 09/10/2026 (photo, 3 photos, 10 slides) : le juge du récit coupé à 35 s
// (« Anthropic fetch timeout après 35000ms »), puis le juge final privé de temps.
Deno.test("juge du récit : plafond d'un appel du juge, réserve laissée au juge final", async () => {
  const caps: number[] = [];
  await createContinuousNarrative({
    ...base,
    reserveMs: 95000,
    startedAt: Date.now() - 42000,
    usage: {},
    write: async () => JSON.stringify(original),
    review: async (doc, o) => { caps.push(o.abortTimeoutMs!); return { ...await progressionReceipt(doc, "completed"), verdict: "acceptable" }; },
  });
  assertEquals(caps.length, 1);
  assert(caps[0] > 35000 && caps[0] <= progressionJudgeCallMs(original.paragraphs.length + 1), `plafond ${caps[0]}`);
});

Deno.test("juge du récit : sauté plutôt que de priver le juge final de son temps", async () => {
  let reviews = 0;
  const output = await createContinuousNarrative({
    ...base,
    reserveMs: 95000,
    // Rédaction lente : il reste 62 s, moins que la réserve du juge final + 20 s.
    startedAt: Date.now() - 113000,
    usage: {},
    write: async () => JSON.stringify(original),
    review: async (doc) => { reviews++; return { ...await progressionReceipt(doc, "completed"), verdict: "acceptable" }; },
  });
  assertEquals(reviews, 0);
  assertEquals(output?.doc.narrative_draft.review.execution_status, "skipped");
  assertEquals(output?.doc.narrative_draft.review.reason, "time-budget");
  assert(62000 - FINAL_JUDGE_RESERVE_MS < 20000);
});
