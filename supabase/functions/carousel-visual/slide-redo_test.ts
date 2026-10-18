// « Refaire cette slide » côté carousel-visual (chantier AA, 18/10/2026) :
// lecture de la demande, jeton interne (pas de second débit), consigne de mise
// en page, rendu par le modèle d'un lot d'une seule slide, réponse réduite à
// cette slide.
//   deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/carousel-visual/slide-redo_test.ts

import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { keepOnlyRedoSlide, readSlideRedo, redoDirective, redoNeedsModelRender, withDesignNote } from "./slide-redo.ts";
import { runParallelChunkGeneration } from "./model-render.ts";
import { SLIDE_REDO_GRANT, signInternalGrant, verifyInternalGrant } from "../_shared/internal-grant.ts";

Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
const USER = "user-a";
const slides = () => [
  { slide_number: 1, role: "hook", title: "Couverture" },
  { slide_number: 2, role: "body", slide_type: "photo_integrated", title: "Deux", body: "Texte", mix_layout_memo: { layout: "cote_a_cote" } },
  { slide_number: 3, role: "body", title: "Trois", body: "Texte", visual_schema: { type: "timeline" } },
];
const req = (grant?: string) => new Request("http://localhost/carousel-visual", { method: "POST", headers: grant ? { [SLIDE_REDO_GRANT.header]: grant } : {} });

Deno.test("slide refaite — pas de render_only : rendu normal", async () => {
  assertEquals(await readSlideRedo({ slides: slides() }, req(), USER), null);
});

Deno.test("slide refaite — jeton de carousel-ai valide : pas de second débit", async () => {
  const body = { slides: slides(), render_only: 2, design_note: "  texte   en haut ", cover_illustration: true };
  const redo = await readSlideRedo(body, req(await signInternalGrant(SLIDE_REDO_GRANT.purpose, USER)), USER);
  assertEquals(redo, { slideNumber: 2, index: 1, note: "texte en haut", granted: true });
  assertEquals(body.cover_illustration, false, "pas de couverture illustrée (crédit image) sur une slide refaite");
  assert(!("mix_layout_memo" in body.slides[1]), "la disposition gardée de la slide refaite est choisie à nouveau");
});

Deno.test("slide refaite — sans jeton, jeton d'une autre personne ou d'un autre but : débit normal", async () => {
  for (const grant of [undefined, await signInternalGrant(SLIDE_REDO_GRANT.purpose, "user-b"), await signInternalGrant("autre", USER), "123.abc"]) {
    const redo = await readSlideRedo({ slides: slides(), render_only: 3 }, req(grant), USER);
    assertEquals(redo?.granted, false);
  }
});

Deno.test("jeton interne — expire", async () => {
  const old = await signInternalGrant(SLIDE_REDO_GRANT.purpose, USER, Date.now() - 10 * 60_000);
  assertEquals(await verifyInternalGrant(old, SLIDE_REDO_GRANT.purpose, USER), false);
});

Deno.test("slide refaite — numéro absent du carrousel : refus 400", async () => {
  await assertRejects(() => readSlideRedo({ slides: slides(), render_only: 9 }, req(), USER), Error, "introuvable");
});

Deno.test("slide refaite — rendu du modèle : consigne de mise en page (texte, mixte) ou schéma (texte)", () => {
  const s = slides();
  const plain = { slideNumber: 1, index: 0, note: "", granted: true };
  const note = { ...plain, note: "texte en haut" };
  assertEquals(redoNeedsModelRender(plain, s, "text"), false);
  assertEquals(redoNeedsModelRender(note, s, "text"), true);
  assertEquals(redoNeedsModelRender({ slideNumber: 3, index: 2, note: "", granted: true }, s, "text"), true);
  // Mixte : la consigne seule fait redessiner (vu en réel : la couverture ne changeait pas).
  assertEquals(redoNeedsModelRender(note, s, "mix"), true);
  assertEquals(redoNeedsModelRender({ slideNumber: 3, index: 2, note: "", granted: true }, s, "mix"), false);
  assertEquals(redoNeedsModelRender(note, s, "photo"), false);
  assertEquals(redoNeedsModelRender(null, s, "text"), false);
});

Deno.test("slide refaite — consigne de mise en page dans le rendu et les étapes de disposition", async () => {
  const redo = { slideNumber: 2, index: 1, note: "texte en haut", granted: true };
  const directive = redoDirective(redo);
  assert(directive.includes("QUE la slide 2") && directive.includes("« texte en haut »") && directive.includes("aucun mot"));
  assertEquals(redoDirective(null), "");
  assertEquals(withDesignNote({ ...redo, note: "" }), undefined);
  let seen = "";
  // deno-lint-ignore no-explicit-any
  const call = withDesignNote(redo, (async (opts: any) => { seen = opts.system; return "{}"; }) as any)!;
  await call({ model: "claude-sonnet-4-6", system: "RÈGLES", messages: [] } as never, {});
  assert(seen.startsWith("RÈGLES") && seen.includes("SLIDE 2") && seen.includes("« texte en haut »"));
});

Deno.test("slide refaite — seule la slide refaite repart, mémoires du carrousel jamais réécrites", () => {
  const result = { slides_html: [{ slide_number: 1, html: "a" }, { slide_number: 2, html: "b" }], mix_layout_memos: [null, { layout: "pleine" }], mix_formatting_memo: { v: 1 } };
  keepOnlyRedoSlide(result, { slideNumber: 2, index: 1, note: "", granted: true });
  assertEquals(result, { slides_html: [{ slide_number: 2, html: "b" }], redo_mix_layout_memo: { layout: "pleine" } } as unknown as typeof result);
});

Deno.test("rendu par le modèle — un seul lot pour la slide refaite, avec la consigne", async () => {
  const sent: string[] = [];
  const previous = globalThis.fetch;
  Deno.env.set("ANTHROPIC_API_KEY", "test");
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    sent.push(JSON.stringify(body.messages));
    const text = JSON.stringify({ slides_html: [{ slide_number: 3, html: "<div>3</div>" }], slides_invariants: { layouts_used: ["x"] } });
    return new Response(JSON.stringify({ model: body.model, content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await runParallelChunkGeneration({
      slides: [1, 2, 3, 4, 5, 6].map((n) => ({ slide_number: n, title: `S${n}` })), ch: {}, darkBrand: false, isPhotoCarousel: false, isMixCarousel: false,
      model: "claude-sonnet-4-6", systemPromptWithAnnotations: "SYS", finalUserPrompt: "PLAN", buildMessagesFor: (t: string) => [{ role: "user", content: t }],
      usage: {}, emitStatus: () => {}, tStart: Date.now(), onlyIndexes: [2], extraDirective: redoDirective({ slideNumber: 3, index: 2, note: "autre disposition", granted: true }),
    });
    assertEquals(sent.length, 1, "un seul appel, pas de rattrapage pour les autres slides");
    assert(sent[0].includes("TU NE RENDS QUE les slides 3") && sent[0].includes("autre disposition"));
    assertEquals(result.slides_html.map((s: { slide_number: number }) => s.slide_number), [3]);
  } finally {
    globalThis.fetch = previous;
  }
});
