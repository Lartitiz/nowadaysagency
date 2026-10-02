import { assertEquals } from "jsr:@std/assert@1";
import { repairTargets, validTargets } from "./scene-workflow.ts";

const t = (role: string, ids: string[], location = "Main") =>
  ({ role, reference_ids: ids, location, instruction: "Remplacer" }) as never;

Deno.test("deux consignes produit pour la même photo deviennent une seule", () => {
  const refs = [
    { id: "m", role: "casting", path: "m", name: "M" },
    { id: "p", role: "product", path: "p", name: "P" },
  ] as never;
  const fixed = repairTargets([t("casting", ["m"]), t("product", ["p"], "Doigt"), t("product", ["p"], "Autre")], refs);
  assertEquals(fixed.length, 2);
  assertEquals((fixed[1] as { location: string }).location, "Doigt");
  assertEquals(validTargets(fixed, refs), true);
});

Deno.test("deux personnes distinctes ne sont jamais fusionnées", () => {
  const refs = [
    { id: "a", role: "person", path: "a", name: "A" },
    { id: "b", role: "person", path: "b", name: "B" },
  ] as never;
  const fixed = repairTargets([t("person", ["a"]), t("person", ["b"])], refs);
  assertEquals(fixed.length, 2);
});
