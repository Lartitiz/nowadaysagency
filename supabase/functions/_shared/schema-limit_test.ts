import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { limitVisualSchemas } from "./schema-limit.ts";

const wrap = (slides: unknown[]) =>
  `Voici le carrousel :\n${JSON.stringify({ slides, caption: "test" })}`;

const schemasOf = (content: string): (string | null)[] => {
  const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)![0]);
  return parsed.slides.map((s: any) => s.visual_schema?.type ?? null);
};

Deno.test("3 schémas consécutifs (bug prod 04/07) → garde le 1er et le 3e", () => {
  const { content, stripped } = limitVisualSchemas(wrap([
    { slide_number: 1, body: "hook" },
    { slide_number: 2, body: "tension" },
    { slide_number: 3, visual_schema: { type: "comparison" } },
    { slide_number: 4, visual_schema: { type: "stats" } },
    { slide_number: 5, visual_schema: { type: "timeline" } },
    { slide_number: 6, body: "position" },
  ]));
  assertEquals(stripped, 1);
  assertEquals(schemasOf(content), [null, null, "comparison", null, "timeline", null]);
});

Deno.test("plafond : jamais plus de 2 schémas au total", () => {
  const { content, stripped } = limitVisualSchemas(wrap([
    { visual_schema: { type: "stats" } },
    { body: "texte" },
    { visual_schema: { type: "timeline" } },
    { body: "texte" },
    { visual_schema: { type: "checklist" } },
  ]));
  assertEquals(stripped, 1);
  assertEquals(schemasOf(content), ["stats", null, "timeline", null, null]);
});

Deno.test("0-2 schémas non consécutifs → intact (0 modification)", () => {
  const input = wrap([
    { body: "hook" },
    { visual_schema: { type: "stats" } },
    { body: "texte" },
    { visual_schema: { type: "quote_big" } },
  ]);
  const { content, stripped } = limitVisualSchemas(input);
  assertEquals(stripped, 0);
  assertEquals(content, input);
});

Deno.test("contenu non-JSON ou sans slides → rendu intact", () => {
  assertEquals(limitVisualSchemas("pas de json ici").stripped, 0);
  assertEquals(limitVisualSchemas(`{"autre": true}`).stripped, 0);
  const broken = "{{{ pas parsable";
  assertEquals(limitVisualSchemas(broken).content, broken);
});
