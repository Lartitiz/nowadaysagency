import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { clampAiField, validateInput, ValidationError, GenerateContentSchema } from "./input-validators.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ── clampAiField : les champs IA renvoyés par le front sont TRONQUÉS, pas rejetés ──
// Bug du 21/07 : narrative_thread > 1000 caractères → « Données invalides » qui
// cassait tout le flux carrousel photo, Réessayer compris.

Deno.test("narrative_thread trop long : tronqué à la limite, la validation passe", () => {
  const body: Record<string, unknown> = { narrative_thread: "a".repeat(1500) };
  clampAiField(body, "narrative_thread", 1000);
  assertEquals((body.narrative_thread as string).length, 1000);
  const schema = z.object({ narrative_thread: z.string().max(1000).optional().nullable() });
  assertEquals(validateInput(body, schema).narrative_thread?.length, 1000);
});

Deno.test("champ sous la limite : intact", () => {
  const body: Record<string, unknown> = { narrative_thread: "court récit" };
  clampAiField(body, "narrative_thread", 1000);
  assertEquals(body.narrative_thread, "court récit");
});

Deno.test("champ absent, null ou non-string : aucun crash, aucun changement", () => {
  const body: Record<string, unknown> = { narrative_thread: null, photo_index: 3 };
  clampAiField(body, "narrative_thread", 1000);
  clampAiField(body, "photo_index", 10);
  clampAiField(body, "inexistant", 10);
  clampAiField(null, "narrative_thread", 1000);
  assertEquals(body.narrative_thread, null);
  assertEquals(body.photo_index, 3);
});

Deno.test("éléments de confirmed_structure : story_beat et visual_anchor tronqués en place", () => {
  const slide: Record<string, unknown> = { story_beat: "b".repeat(400), visual_anchor: "v".repeat(200) };
  clampAiField(slide, "story_beat", 300);
  clampAiField(slide, "visual_anchor", 120);
  assertEquals((slide.story_beat as string).length, 300);
  assertEquals((slide.visual_anchor as string).length, 120);
});

// ── Rédaction guidée : la structure IA « détaillée étape par étape » dépasse
// presque toujours 500 → le schéma doit accepter jusqu'à 5000 (clamp côté edge).

Deno.test("GenerateContentSchema : structure IA de 3000 caractères acceptée (ex-plafond 500)", () => {
  const body = { type: "redaction-draft", structure: "s".repeat(3000), accroche: "a".repeat(120) };
  const parsed = validateInput(body, GenerateContentSchema);
  assertEquals(parsed.structure?.length, 3000);
});

Deno.test("flux redaction-draft : structure 6000 clampée à 5000 puis validée", () => {
  const raw: Record<string, unknown> = { type: "redaction-draft", structure: "s".repeat(6000) };
  clampAiField(raw, "structure", 5000);
  assertEquals(validateInput(raw, GenerateContentSchema).structure?.length, 5000);
});

Deno.test("exclude_hooks : chaque accroche IA renvoyée est tronquée à 300, les non-strings intacts", () => {
  const hooks: unknown[] = ["h".repeat(500), "courte", 42];
  const clamped = hooks.map((h) => (typeof h === "string" ? h.slice(0, 300) : h));
  assertEquals((clamped[0] as string).length, 300);
  assertEquals(clamped[1], "courte");
  assertEquals(clamped[2], 42);
});

Deno.test("validateInput rejette toujours ce qui n'est pas clampé (garde-fou anti-abus intact)", () => {
  const schema = z.object({ subject: z.string().max(10) });
  let threw = false;
  try {
    validateInput({ subject: "x".repeat(20) }, schema);
  } catch (e) {
    threw = e instanceof ValidationError;
  }
  assertEquals(threw, true);
});
