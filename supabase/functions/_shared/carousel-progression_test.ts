import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  progressionReceipt,
  progressionWarnings,
  reviewCarouselProgression,
  validateProgressionReport,
} from "./carousel-progression.ts";
import {
  invalidateProgressionReceipt,
  progressionMaterial,
} from "./carousel-editorial-snapshot.ts";
import {
  analyzeCarouselRedac,
  redacViolations,
  runRedacGate,
} from "./redac-gate.ts";

const doc = {
  slides: [{ title: "Reconnaître", body: "Un signe donne un repère." }, {
    visual_schema: {
      type: "quote_big",
      quote: "La pratique donne son sens au repère.",
    },
  }],
  caption: { body: "Une identité laisse une part à découvrir." },
};
const sources = [{
  id: "brief",
  provenance: "user",
  text:
    "Une identité visuelle offre un repère. La pratique donne son sens à ce repère.",
}];
const valid = () => ({
  idea_read:
    "Un signe permet de reconnaître, les pratiques permettent de connaître.",
  verdict: "acceptable",
  slides: [{
    id: "slides.0",
    contribution: "Définit le repère",
    source_ids: ["brief"],
  }, {
    id: "slides.1",
    contribution: "Explique le rôle de la pratique",
    source_ids: ["brief"],
  }],
  boundaries: [{
    from: "slides.0",
    to: "slides.1",
    inherits: "le repère",
    advances: "son sens dans la pratique",
    kind: "progression",
  }],
  defects: [],
  conclusion: "La pratique donne un contenu au repère.",
  limits: [],
});

Deno.test("le registre global lit les schémas, la légende et les frontières même pour deux slides", async () => {
  let input = "";
  const r = await reviewCarouselProgression(doc, {
    sources,
    call: async (o) => {
      input = String(o.messages[0].content);
      const schema: any = o.tool!.input_schema;
      assertEquals(schema.properties.slides.items.properties.id.enum, ["slides.0", "slides.1"]);
      assertEquals(schema.properties.slides.items.properties.source_ids.items.enum, ["brief"]);
      assertEquals(schema.properties.slides.minItems, 2);
      assertEquals(schema.properties.boundaries.maxItems, 1);
      assertEquals(schema.properties.conclusion.minLength, 1);
      assertEquals(JSON.parse(input).expected_boundaries_in_order, [{ from: "slides.0", to: "slides.1" }]);
      return JSON.stringify(valid());
    },
  });
  assert(input.includes(doc.slides[1].visual_schema!.quote));
  assert(input.includes(doc.caption.body));
  assertEquals(r.execution_status, "completed");
  assertEquals(r.verdict, "acceptable");
  assertEquals(r.reviewed_text_hash.length, 64);
});
for (
  const [name, mutate] of Object.entries({
    empty: (r: any) => {
      r.slides = [];
    },
    partial: (r: any) => {
      r.slides.pop();
    },
    duplicate: (r: any) => {
      r.slides[1].id = "slides.0";
    },
    boundary: (r: any) => {
      r.boundaries = [];
    },
    order: (r: any) => {
      r.boundaries[0].from = "slides.1";
    },
    source: (r: any) => {
      r.slides[0].source_ids = ["invented"];
    },
    contradiction: (r: any) => {
      r.boundaries[0].kind = "rupture";
    },
    unproven: (r: any) => {
      r.verdict = "needs_repair";
      r.defects = [{
        slide_ids: ["slides.0"],
        severity: "major",
        type: "unsupported",
        excerpt: "phrase inexistante",
        reason: "Raison",
        repair: "Corriger",
      }];
    },
    noEvidence: (r: any) => {
      r.verdict = "needs_repair";
    },
  })
) {
  Deno.test(`verdict incomplet/incohérent refusé : ${name}`, async () => {
    const r = valid();
    mutate(r);
    assert(validateProgressionReport(r, doc, sources));
    const out = await reviewCarouselProgression(doc, {
      sources,
      call: async () => JSON.stringify(r),
    });
    assertEquals(out.execution_status, "invalid");
    assertEquals(out.verdict, null);
    assert(progressionWarnings(out).length > 0);
  });
}

Deno.test("diagnostic d'un rapport incomplet sans recopier sa prose non validée", async () => {
  const report = { ...valid(), conclusion: null, idea_read: "CONTEXTE PRIVE" };
  const out = await reviewCarouselProgression(doc, { sources, call: async () => JSON.stringify(report) });
  assertEquals(out.execution_status, "invalid");
  assertEquals(out.reason, "missing-summary");
  assertEquals(out.validation_details?.conclusion, { type: "null" });
  assert(!JSON.stringify(out.validation_details).includes("CONTEXTE PRIVE"));
  assertEquals(out.verdict, null);
});

Deno.test("timeout distinct d'une lecture sans défaut et brouillon conservé", async () => {
  const before = JSON.stringify(doc);
  const r = await reviewCarouselProgression(doc, {
    sources,
    call: async () => {
      throw Error("timeout");
    },
  });
  assertEquals(r.execution_status, "unavailable");
  assertEquals(r.verdict, null);
  assertEquals(JSON.stringify(doc), before);
});
Deno.test("une reprise du format est bornée, garde le texte et cumule les deux usages", async () => {
  const before = JSON.stringify(doc);
  let calls = 0;
  const out = await reviewCarouselProgression(doc, { sources, call: async (options, usage) => {
    calls++;
    Object.assign(usage!, { input_tokens: 10, output_tokens: 5, total_tokens: 15 });
    if (calls === 1) return JSON.stringify({ ...valid(), conclusion: null });
    assert(String(options.messages[2].content).includes("missing-summary"));
    assertEquals(options.maxRetries, 0);
    assert(options.abortTimeoutMs! <= 45_000);
    return JSON.stringify(valid());
  } });
  assertEquals(calls, 2);
  assertEquals(out.execution_status, "completed");
  assertEquals(out.usage?.total_tokens, 30);
  assertEquals(out.format_retry, { attempted: true, initial_reason: "missing-summary" });
  assertEquals(JSON.stringify(doc), before);
});
Deno.test("la reprise du format ne transforme pas un défaut en feu vert", async () => {
  let calls = 0;
  const out = await reviewCarouselProgression(doc, { sources, call: async () => {
    calls++;
    return JSON.stringify(calls === 1 ? { ...valid(), verdict: "needs_repair", conclusion: null } : valid());
  } });
  assertEquals(calls, 2);
  assertEquals(out.execution_status, "invalid");
  assertEquals(out.reason, "format-verdict-regression");
  assertEquals(out.verdict, null);
});
Deno.test("citation avec espaces typographiques reconnue, mots inventés refusés", () => {
  const report: any = valid();
  report.verdict = "needs_repair";
  report.defects = [{ slide_ids: ["slides.1"], severity: "minor", type: "voice", excerpt: "La\u00a0pratique donne son sens au repère.", reason: "Raison", repair: "Correction" }];
  assertEquals(validateProgressionReport(report, doc, sources), null);
  report.defects[0].excerpt = "La pratique inventée donne son sens au repère.";
  assertEquals(validateProgressionReport(report, doc, sources), "defect-excerpt:0");
});
Deno.test("pas de reprise du format au-delà du budget de temps", async () => {
  let calls = 0;
  const out = await reviewCarouselProgression(doc, { sources, abortTimeoutMs: 1, call: async () => { calls++; return "{}"; } });
  assertEquals(calls, 1);
  assertEquals(out.execution_status, "invalid");
  assertEquals(out.format_retry?.attempted, false);
});
Deno.test("budget de contexte explicite, aucun appel ni troncature silencieuse", async () => {
  let calls = 0;
  const r = await reviewCarouselProgression(doc, {
    sources: [{ ...sources[0], text: "x".repeat(101_000) }],
    call: async () => {
      calls++;
      return "{}";
    },
  });
  assertEquals(calls, 0);
  assertEquals(r.execution_status, "skipped");
  assertEquals(r.reason, "context-budget");
});
Deno.test("réception tronquée ne vaut pas certification", async () => {
  const r = await reviewCarouselProgression(doc, {
    sources,
    call: async () => '{"idea_read":',
  });
  assertEquals(r.execution_status, "invalid");
});
Deno.test("modification de prose, schéma, légende, photo ou ordre invalide le reçu ; ajout de HTML ne l'invalide pas", async () => {
  const original = {
    ...doc,
    progression_review: {
      ...await progressionReceipt(doc, "completed"),
      verdict: "acceptable",
    },
  };
  for (
    const mutate of [
      (d: any) => d.slides[0].body = "Autre texte",
      (d: any) => d.slides[1].visual_schema.quote = "Autre citation",
      (d: any) => d.caption.body = "Autre légende",
      (d: any) => d.slides[0].photo_index = 4,
      (d: any) => d.slides.reverse(),
    ]
  ) {
    const changed = structuredClone(original);
    mutate(changed);
    const out = invalidateProgressionReceipt(changed);
    assertEquals(out.progression_review.execution_status, "stale");
    assertEquals(out.progression_review.verdict, null);
  }
  assertEquals(
    invalidateProgressionReceipt({
      ...original,
      visual_html: [{ html: "<div>rendu</div>" }],
    }).progression_review.execution_status,
    "completed",
  );
  assertEquals(invalidateProgressionReceipt({ slides: doc.slides }), {
    slides: doc.slides,
  });
  assert(progressionMaterial(original).includes("La pratique donne son sens"));
});
Deno.test("35 mots sur photo restent intacts, longueur seule sans pénalité ni appel de correction", async () => {
  const overlay = "La matière " + Array(33).fill("reste").join(" ");
  const content = JSON.stringify({
    slides: [{ slide_number: 1, overlay_text: overlay }],
    caption: { hashtags: [] },
  });
  const analysis = analyzeCarouselRedac(JSON.parse(content));
  assertEquals(analysis.overlongOverlays.length, 1);
  assertEquals(redacViolations(analysis), 0);
  const out = await runRedacGate(content, {
    isLinkedIn: false,
    correction: { enabled: false },
  });
  assertEquals(JSON.parse(out.content).slides[0].overlay_text, overlay);
  assertEquals(out.score, 100);
});
