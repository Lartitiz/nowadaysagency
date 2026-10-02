import { assertEquals } from "jsr:@std/assert@1";
import { asksIntegration } from "./scene-workflow.ts";
const refs = [{ id: "m", role: "casting", path: "m", name: "M" }] as never;
Deno.test("integration request is detected", () => {
  assertEquals(asksIntegration("edit", ["Visage exact du mannequin", "Bague exacte"], refs), true);
});
Deno.test("framing correction stays a scene edit", () => {
  assertEquals(asksIntegration("edit", ["Cadrage plus rapproché", "Main pivotée"], refs), false);
});
Deno.test("no originals means no integration", () => {
  assertEquals(asksIntegration("edit", ["Bague exacte"], [] as never), false);
});
