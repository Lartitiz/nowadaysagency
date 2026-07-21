import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { clampAiField, validateInput, ValidationError } from "./input-validators.ts";
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
