import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  progressionReceipt,
  isPhotoChoiceDefect,
  progressionJudgeCallMs,
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
  trajectory: { kind: "developed_idea", starting_point: "Reconnaître un signe", landing: "Comprendre ce qui lui donne sens", reason: "Le deuxième passage explique ce que le repère seul ne dit pas.", field_ids: ["slides.0.body", "slides.1.visual_schema.quote"], request_source_ids: [] as string[] },
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
    from_field_ids: ["slides.0.body"],
    to_field_ids: ["slides.1.visual_schema.quote"],
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
Deno.test("modification de prose, schéma, légende ou ordre invalide le reçu ; photo seule ou ajout de HTML ne l'invalident pas", async () => {
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
  // La relecture du fil ne lit que le texte : changer la photo d'une slide ne
  // dit pas « Le texte a changé » (même règle que final-photo-match).
  const photoOnly = structuredClone(original);
  (photoOnly.slides[0] as any).photo_index = 4;
  assertEquals(invalidateProgressionReceipt(photoOnly).progression_review.execution_status, "completed");
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

Deno.test("a contradictory approval becomes an actionable refusal without discarding the rupture", async () => {
  const report = valid(); report.boundaries[0].kind = "rupture";
  assertEquals(validateProgressionReport(report, doc, sources), "contradictory-verdict");
  let calls = 0;
  const out = await reviewCarouselProgression(doc, { sources, call: async () => { calls++; return JSON.stringify(report); } });
  assertEquals(out.execution_status, "completed"); assertEquals(out.verdict, "needs_repair");
  assertEquals(out.report?.model_verdict, "acceptable");
  assertEquals(out.report?.boundaries, report.boundaries);
  assert(out.issues[0].includes("1 → 2")); assertEquals(calls, 1);
});
Deno.test("major evidence overrides approval but ungrounded evidence still fails", async () => {
  const report: any = valid();
  report.defects = [{slide_ids:["slides.0"],severity:"major",type:"unsupported",excerpt:"Un signe donne un repère.",reason:"Préciser la portée",repair:"Reprendre la limite du brief"}];
  const out = await reviewCarouselProgression(doc, {sources,call:async()=>JSON.stringify(report)});
  assertEquals(out.verdict,"needs_repair"); assertEquals(out.report?.defects,report.defects);
  report.defects[0].excerpt = "preuve inventée";
  const bad = await reviewCarouselProgression(doc, {sources,call:async()=>JSON.stringify(report)});
  assertEquals(bad.execution_status,"invalid"); assertEquals(bad.verdict,null);
});

Deno.test("mixed photo evidence selects fields and preserves exact multiline text without a copying retry", async () => {
  const mixed = { slides: [
    { slide_type: "text_only", title: "Le geste", body: "Je peins à main levée.\n\nChaque tracé diffère." },
    { slide_type: "photo_full", photo_index: 5, overlay_text: "Des fruits et des feuilles décorent ces bols." },
  ] };
  let calls = 0;
  const out = await reviewCarouselProgression(mixed, { sources, call: async (o) => {
    calls++;
    const schema: any = o.tool!.input_schema;
    assertEquals(schema.properties.defects.items.properties.excerpt, undefined);
    assert(schema.properties.defects.items.properties.field_ids.items.enum.includes("slides.1.overlay_text"));
    return JSON.stringify({ ...valid(), trajectory: {...valid().trajectory,field_ids:["slides.0.body","slides.1.overlay_text"]}, boundaries: valid().boundaries.map((b) => ({ ...b, to_field_ids: ["slides.1.overlay_text"] })), verdict: "needs_repair", defects: [{
      slide_ids: ["slides.0", "slides.1"], field_ids: ["slides.0.body", "slides.1.overlay_text"],
      severity: "major", type: "juxtaposition", reason: "La description des motifs ne poursuit pas l'explication du geste.",
      repair: "Relier l'exemple au geste sans attribuer une histoire à cette photo.",
    }] });
  } });
  assertEquals(calls, 1);
  assertEquals(out.execution_status, "completed");
  assertEquals(out.verdict, "needs_repair");
  assertEquals(out.report!.defects[0].excerpt, mixed.slides[0].body);
  assertEquals(out.report!.defects[0].evidence, [
    { field_id: "slides.0.body", text: mixed.slides[0].body },
    { field_id: "slides.1.overlay_text", text: mixed.slides[1].overlay_text },
  ]);
  assert(out.issues[0].includes("description des motifs"));
});
for (const fieldIds of [["invented"], ["slides.1.visual_schema.quote"], []]) Deno.test(`evidence IDs must belong to cited slide: ${JSON.stringify(fieldIds)}`, async () => {
  const out = await reviewCarouselProgression(doc, { sources, call: async () => JSON.stringify({ ...valid(), verdict: "needs_repair", defects: [{
    slide_ids: ["slides.0"], field_ids: fieldIds, excerpt: doc.slides[0].body,
    severity: "major", type: "rupture", reason: "Raison", repair: "Réparation",
  }] }) });
  assertEquals(out.execution_status, "invalid");
  assertEquals(out.verdict, null);
  assertEquals(out.reason, "defect-field-reference:0");
});

Deno.test("final judge excludes a misleading plan and binds every transition to its visible neighbouring fields", async () => {
  const withMisleadingPlan = { ...doc, fil: { arrivee: "INVENTED_BRIDGE_FROM_PLAN", etapes: ["Une causalité absente"] } };
  const result = await reviewCarouselProgression(withMisleadingPlan, { sources, call: async (o) => {
    assert(!JSON.stringify(o.messages).includes("INVENTED_BRIDGE_FROM_PLAN"));
    assert(o.system!.includes("une image répétée n'est pas une redite du texte"));
    const schema: any = o.tool!.input_schema;
    assert(schema.properties.boundaries.items.required.includes("from_field_ids"));
    return JSON.stringify(valid());
  } });
  assertEquals(result.verdict, "acceptable");
  const wrong: any = valid();
  wrong.boundaries[0].from_field_ids = ["slides.1.visual_schema.quote"];
  assertEquals(validateProgressionReport(wrong, doc, sources), "boundary-evidence:0:from");
  wrong.boundaries[0].from_field_ids = [];
  assertEquals(validateProgressionReport(wrong, doc, sources), "boundary-evidence:0:from");
});

Deno.test("frontières : une paire sélectionnée par ID restitue ses références et conserve une rupture", async () => {
  const r = valid();
  const { from: _from, to: _to, ...boundary } = r.boundaries[0];
  const result = await reviewCarouselProgression(doc, { sources, call: async (o) => {
    const schema: any = o.tool!.input_schema;
    assertEquals(schema.properties.boundaries.items.properties.boundary_id.enum, ["slides.0->slides.1"]);
    assertEquals(schema.properties.boundaries.items.properties.inherits.minLength, 1);
    assertEquals(schema.properties.boundaries.items.properties.advances.minLength, 1);
    assert(!schema.properties.boundaries.items.required.includes("from"));
    return JSON.stringify({ ...r, boundaries: [{ ...boundary, boundary_id: "slides.0->slides.1", kind: "rupture", inherits: "Aucun raccord explicite.", advances: "La pratique arrive sans lien expliqué." }] });
  }});
  assertEquals(result.execution_status, "completed");
  assertEquals(result.verdict, "needs_repair");
  assert(result.report);
  assertEquals(result.report.boundaries[0].from, "slides.0");
  assertEquals(result.report.boundaries[0].to, "slides.1");
});

Deno.test("frontières : reprise de format précise le champ vide sans effacer le défaut", async () => {
  let calls = 0;
  const r = valid(); r.verdict = "needs_repair"; r.boundaries[0].kind = "rupture"; r.boundaries[0].inherits = "";
  const result = await reviewCarouselProgression(doc, { sources, call: async (o) => {
    calls++;
    if (calls === 2) {
      assert(JSON.stringify(o.messages).includes("boundary-reference:0:inherits:nonempty-string-required"));
      r.boundaries[0].inherits = "Aucun lien visible.";
    }
    return JSON.stringify(r);
  }});
  assertEquals(calls, 2); assertEquals(result.execution_status, "completed"); assertEquals(result.verdict, "needs_repair");
});

Deno.test("frontières : une paire inconnue ne peut pas reprendre des références valides", async () => {
  const r = valid();
  const result = await reviewCarouselProgression(doc, { sources, call: async () => JSON.stringify({ ...r, boundaries: [{ ...r.boundaries[0], boundary_id: "slides.1->slides.0" }] }) });
  assertEquals(result.execution_status, "invalid"); assertEquals(result.reason, "boundary-reference:0:pair"); assertEquals(result.verdict, null);
});

Deno.test("un inventaire fluide ne peut pas être approuvé comme un propos développé", async () => {
  const report = valid();
  report.trajectory.kind = "descriptive_catalogue";
  report.trajectory.reason = "Les paragraphes ajoutent seulement un objet puis un lieu, sans développer une proposition.";
  assertEquals(validateProgressionReport(report, doc, sources), "contradictory-verdict");
  const out = await reviewCarouselProgression(doc, {sources, call: async () => JSON.stringify(report)});
  assertEquals(out.execution_status, "completed");
  assertEquals(out.verdict, "needs_repair");
  assertEquals(out.report?.model_verdict, "acceptable");
  assert(out.issues[0].includes("Propos à reconstruire"));
});

Deno.test("la trajectoire exige des preuves dans les slides, pas une justification dans la légende", () => {
  for (const field_ids of [[], ["caption.body"], ["slides.99.body"]]) {
    const report = valid(); report.trajectory.field_ids = field_ids;
    assertEquals(validateProgressionReport(report, doc, sources), "trajectory-evidence");
  }
  const report: any = valid(); delete report.trajectory;
  assertEquals(validateProgressionReport(report, doc, sources), "missing-trajectory");
});

Deno.test("une liste demandée reste légitime ; le plan IA ne peut pas en inventer la demande", () => {
  const report = valid(); report.trajectory.kind = "requested_series";
  assertEquals(validateProgressionReport(report, doc, sources), "trajectory-request");
  report.trajectory.request_source_ids = ["brief"];
  assertEquals(validateProgressionReport(report, doc, sources), null);
  assertEquals(validateProgressionReport(report, doc, [{...sources[0],provenance:"brand_context"}]), "trajectory-request");
  report.trajectory.kind = "visual_only";
  assertEquals(validateProgressionReport(report, doc, sources), "trajectory-visual-text");
});

Deno.test("texte voulu sur photo : le reproche « photo brute » est retiré, une vraie photo brute le garde", async () => {
  // Vu en ligne le 08/10/2026 (« Tes photos en fond ») : le juge citait « les
  // photos brutes gardent zéro texte » sur des slides photo PRÉVUES avec texte.
  const overlay = { slides: [
    { slide_type: "photo_full", photo_index: 1, overlay_text: "Un signe donne un repère." },
    { slide_type: "photo_full", photo_index: 2, overlay_text: "La pratique donne son sens au repère." },
  ] };
  const report = (): any => ({ ...valid(),
    trajectory: { ...valid().trajectory, field_ids: ["slides.0.overlay_text", "slides.1.overlay_text"] },
    boundaries: [{ ...valid().boundaries[0], from_field_ids: ["slides.0.overlay_text"], to_field_ids: ["slides.1.overlay_text"] }],
    verdict: "needs_repair",
    defects: [{ slide_ids: ["slides.0", "slides.1"], severity: "major", type: "raw_photo_text",
      field_ids: ["slides.0.overlay_text"], reason: "Le contrat exige que les photos brutes gardent zéro texte.", repair: "Retirer le texte." }],
  });
  const out = await reviewCarouselProgression(overlay, { sources, call: async () => JSON.stringify(report()) });
  assertEquals(out.execution_status, "completed");
  assertEquals(out.verdict, "acceptable");
  assertEquals(out.report?.model_verdict, "needs_repair");
  assertEquals(out.report?.dropped_raw_photo_defects, 1);
  assertEquals(out.issues, []);
  assertEquals(progressionWarnings(out), []);

  // Une autre faute du juge reste, elle : seul le faux reproche part.
  const mixed = report();
  mixed.defects.push({ slide_ids: ["slides.1"], severity: "major", type: "unsupported",
    field_ids: ["slides.1.overlay_text"], reason: "Affirmation à sourcer.", repair: "Reprendre le brief." });
  const kept = await reviewCarouselProgression(overlay, { sources, call: async () => JSON.stringify(mixed) });
  assertEquals(kept.verdict, "needs_repair");
  assertEquals(kept.issues.length, 1);
  assert(kept.issues[0].startsWith("slide 2 : Affirmation à sourcer."));

  // « Photos brutes » : la slide no_overlay qui porte du texte reste un défaut,
  // et seule elle est citée.
  const raw = { slides: [
    { slide_type: "photo_full", photo_index: 1, overlay_text: "Un signe donne un repère.", no_overlay: true },
    { slide_type: "photo_full", photo_index: 2, overlay_text: "La pratique donne son sens au repère." },
  ] };
  const rawOut = await reviewCarouselProgression(raw, { sources, call: async () => JSON.stringify(report()) });
  assertEquals(rawOut.verdict, "needs_repair");
  assertEquals(rawOut.report?.defects[0].slide_ids, ["slides.0"]);
  assertEquals(rawOut.issues.length, 1);
  assert(rawOut.issues[0].startsWith("slide 1 :"));
});

Deno.test("le juge ne voit pas les photos posées et ne juge pas leur choix ni leur répétition", async () => {
  // Vu le 09/10/2026 : le juge passe AVANT matchFinalPhotos et voyait des
  // numéros de photo provisoires (attribués à tour de rôle). Il reprochait
  // « la même photo répétée sur 3 slides », affiché à l'utilisatrice et cause
  // de réparation, alors que les photos finales sont choisies après lui.
  const overlay = { slides: [
    { slide_type: "photo_full", photo_index: 1, overlay_text: "Un signe donne un repère." },
    { slide_type: "photo_full", photo_index: 1, overlay_text: "La pratique donne son sens au repère." },
  ] };
  const report = (): any => ({ ...valid(),
    trajectory: { ...valid().trajectory, field_ids: ["slides.0.overlay_text", "slides.1.overlay_text"] },
    boundaries: [{ ...valid().boundaries[0], from_field_ids: ["slides.0.overlay_text"], to_field_ids: ["slides.1.overlay_text"] }],
    verdict: "needs_repair",
    defects: [{ slide_ids: ["slides.0", "slides.1"], severity: "major", type: "repetition",
      field_ids: ["slides.1.overlay_text"], reason: "La même photo est répétée sur 2 slides.", repair: "Choisir une autre image." }],
  });
  let sent = "";
  const out = await reviewCarouselProgression(overlay, { sources, call: async (options) => {
    sent = String(options.messages[0].content);
    return JSON.stringify(report());
  } });
  const sequence = JSON.parse(sent).sequence;
  assert(sequence.slides.every((s: any) => !("photo" in s)), "aucun numéro de photo envoyé au juge");
  assertEquals(sequence.slides[0].no_text, false);
  // Le reçu, lui, garde les photos (invalidation du reçu photo côté écran).
  assertEquals(JSON.parse(out.reviewed_material).slides[0].photo, 1);
  assertEquals(out.verdict, "acceptable");
  assertEquals(out.report?.model_verdict, "needs_repair");
  assertEquals(out.report?.dropped_photo_choice_defects, 1);
  assertEquals(progressionWarnings(out), []);

  // Un défaut de TEXTE qui parle d'une photo reste, et le verdict aussi.
  const mixed = report();
  mixed.defects.push({ slide_ids: ["slides.1"], severity: "major", type: "unsupported",
    field_ids: ["slides.1.overlay_text"], reason: "Le texte affirme ce que montre la photo sans source.", repair: "Reprendre le brief." });
  const kept = await reviewCarouselProgression(overlay, { sources, call: async () => JSON.stringify(mixed) });
  assertEquals(kept.verdict, "needs_repair");
  assertEquals(kept.issues.length, 1);
  assert(kept.issues[0].includes("Le texte affirme ce que montre la photo"));
});

Deno.test("motifs du choix des photos : étroits", () => {
  for (const reason of ["La même photo revient sur trois slides.", "Image répétée en slides 2 et 5.", "Répétition de la photo du bol.",
    "Le choix des photos ne suit pas le propos.", "La photo 2 est réutilisée plus loin.", "Photos identiques sur deux slides."]) {
    assert(isPhotoChoiceDefect({ type: "repetition", reason, repair: "" }), reason);
  }
  for (const reason of ["Le texte affirme que cette photo montre un tour de potier.", "Redite du titre de la slide 2.",
    "La slide 3 répète la même idée que la slide 2."]) {
    assert(!isPhotoChoiceDefect({ type: "repetition", reason, repair: "" }), reason);
  }
  assert(!isPhotoChoiceDefect({ type: "raw_photo_text", reason: "Même photo, texte sur photo brute.", repair: "" }));
});

// 09/10/2026 (photo, 10 slides) : premier appel 33 s sur 45, relance de format
// coupée après les 12 s restantes → contrôle « invalid », motif jamais journalisé.
Deno.test("relance de format : son propre temps, et motif de refus journalisé", async () => {
  const now = Date.now, log = console.log;
  let offset = 0, calls = 0;
  const timeouts: number[] = [], lines: string[] = [];
  Date.now = () => now() + offset;
  console.log = (line: unknown) => { lines.push(String(line)); };
  try {
    const out = await reviewCarouselProgression(doc, {
      sources,
      abortTimeoutMs: 105_000,
      callTimeoutMs: 60_000,
      call: async (options) => {
        calls++;
        timeouts.push(options.abortTimeoutMs!);
        offset += 33_000;
        return JSON.stringify(calls === 1 ? { ...valid(), conclusion: null } : { ...valid(), idea_read: null });
      },
    });
    assertEquals(calls, 2);
    assertEquals(timeouts, [60_000, 60_000]);
    assertEquals(out.execution_status, "invalid");
    const logged = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .find((l) => l?.type === "carousel_progression_review");
    assertEquals(logged.status, "invalid");
    assert(logged.reason);
    assertEquals(logged.format_retry, { attempted: true, initial_reason: "missing-summary" });
    assertEquals(logged.slides, doc.slides.length);
    assert(logged.validation_details);
    // Jamais de texte du carrousel ni des sources dans la ligne.
    assert(!lines.join("\n").includes("Reconnaître"));
  } finally { Date.now = now; console.log = log; }
});

Deno.test("plafond d'un appel du juge : 60 s jusqu'à 14 slides, +3 s par slide au-delà", () => {
  assertEquals(progressionJudgeCallMs(10), 60_000);
  assertEquals(progressionJudgeCallMs(14), 60_000);
  assertEquals(progressionJudgeCallMs(20), 78_000);
});

// Schéma aligné sur le validateur (09/10/2026) : chaque motif de refus que le
// schéma peut exprimer y figure, pour que le modèle ne produise pas un rapport
// que validateProgressionReport refusera ensuite (rapport perdu, alerte « Le
// contrôle final du fil n'a pas abouti »). Le validateur, lui, ne change pas.
Deno.test("schéma du juge aligné sur le validateur : chaque motif reproduit est exclu par le schéma", async () => {
  const three = { slides: [
    { title: "Reconnaître", body: "Un signe donne un repère." },
    { title: "Pratiquer", body: "La pratique donne son sens au repère." },
    { title: "Choisir", body: "On garde le repère qui sert." },
  ] };
  let schema: any;
  await reviewCarouselProgression(three, { sources, call: async (o) => {
    schema = o.tool!.input_schema;
    return "{}";
  } });
  const p = schema.properties;
  const base = () => ({ ...valid(),
    trajectory: { ...valid().trajectory, field_ids: ["slides.0.body"] },
    slides: [0, 1, 2].map((i) => ({ id: `slides.${i}`, contribution: "Avance", source_ids: [] })),
    boundaries: [0, 1].map((i) => ({ from: `slides.${i}`, to: `slides.${i + 1}`, from_field_ids: [`slides.${i}.body`],
      to_field_ids: [`slides.${i + 1}.body`], inherits: "le repère", advances: "la suite", kind: "progression" })),
  });
  assertEquals(validateProgressionReport(base(), three, sources), null);

  // boundary-evidence : un champ de l'autre slide (ou d'une autre frontière).
  const crossed = base();
  crossed.boundaries[0].from_field_ids = ["slides.1.body"];
  assertEquals(validateProgressionReport(crossed, three, sources), "boundary-evidence:0:from");
  const branches = p.boundaries.items.anyOf;
  assertEquals(branches.map((b: any) => b.properties.boundary_id.const), ["slides.0->slides.1", "slides.1->slides.2"]);
  assertEquals(branches[0].properties.from_field_ids.items.enum, ["slides.0.title", "slides.0.body"]);
  assertEquals(branches[0].properties.to_field_ids.items.enum, ["slides.1.title", "slides.1.body"]);
  assert(!branches[0].properties.from_field_ids.items.enum.includes("slides.1.body"));
  assertEquals(branches[1].properties.from_field_ids.minItems, 1);

  // defect-explanation : justification ou réparation vide.
  const unexplained = { ...base(), verdict: "needs_repair", defects: [{ slide_ids: ["slides.0"], severity: "minor",
    type: "unclear_idea", excerpt: "Un signe donne un repère.", field_ids: ["slides.0.body"], reason: "", repair: "Relier" }] };
  assertEquals(validateProgressionReport(unexplained, three, sources), "defect-explanation:0");
  assertEquals(p.defects.items.properties.reason.minLength, 1);
  assertEquals(p.defects.items.properties.repair.minLength, 1);
  assertEquals(p.defects.items.properties.slide_ids.minItems, 1);
  assert(/UNIQUEMENT dans les slides de slide_ids/.test(p.defects.items.properties.field_ids.description));

  // trajectory-evidence et trajectory-visual-text : slides avec texte.
  const noEvidence = base();
  noEvidence.trajectory.field_ids = [];
  assertEquals(validateProgressionReport(noEvidence, three, sources), "trajectory-evidence");
  assertEquals(p.trajectory.properties.field_ids.minItems, 1);
  const visual = base();
  visual.trajectory.kind = "visual_only";
  assertEquals(validateProgressionReport(visual, three, sources), "trajectory-visual-text");
  assert(!p.trajectory.properties.kind.enum.includes("visual_only"));
});

Deno.test("schéma du juge : photo sans texte, visual_only reste permis et les frontières acceptent []", async () => {
  const silent = { no_overlay: true, slides: [{ photo_index: 1 }, { photo_index: 2 }] };
  let schema: any;
  await reviewCarouselProgression(silent, { sources, call: async (o) => { schema = o.tool!.input_schema; return "{}"; } });
  assert(schema.properties.trajectory.properties.kind.enum.includes("visual_only"));
  assertEquals(schema.properties.trajectory.properties.field_ids.maxItems, 0);
  assertEquals(schema.properties.boundaries.items.anyOf[0].properties.from_field_ids.maxItems, 0);
});
