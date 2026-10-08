import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { expectedLocalRepairMs, localRepairInstruction, localRepairTargets, mergeLocalRepair } from "./thread-local-repair.ts";

const boundaries = (n: number, ruptures: number[] = []) => Array.from({ length: n - 1 }, (_, i) => ({
  from: `slides.${i}`, to: `slides.${i + 1}`, kind: ruptures.includes(i) ? "rupture" : "progression",
}));
const report = (over: Record<string, unknown> = {}) => ({
  trajectory: { kind: "developed_idea" }, defects: [], boundaries: boundaries(12), ...over,
});

Deno.test("cibles locales : rupture 6→7 + défaut sur la 7 → slides 6, 7, 8 seulement", () => {
  const r = report({ boundaries: boundaries(12, [5]), defects: [{ type: "rupture", severity: "major", slide_ids: ["slides.6"], field_ids: ["slides.6.body"] }] });
  assertEquals(localRepairTargets(r, 12), [5, 6, 7]);
});

Deno.test("cibles locales : défauts globaux, légende, catalogue ou trop étendus → réécriture complète", () => {
  const d = (type: string, ids: string[], field_ids?: string[]) => ({ type, severity: "major", slide_ids: ids, ...(field_ids ? { field_ids } : {}) });
  assertEquals(localRepairTargets(report({ trajectory: { kind: "descriptive_catalogue" }, defects: [d("juxtaposition", ["slides.2"])] }), 12), null);
  assertEquals(localRepairTargets(report({ defects: [d("unclear_idea", ["slides.2"])] }), 12), null);
  assertEquals(localRepairTargets(report({ defects: [d("promise", ["slides.0"])] }), 12), null);
  assertEquals(localRepairTargets(report({ defects: [d("voice", ["slides.3"], ["caption.body"])] }), 12), null);
  assertEquals(localRepairTargets(report({ defects: [d("repetition", ["slides.1", "slides.5", "slides.9"])] }), 12), null);
  assertEquals(localRepairTargets(report({ boundaries: [{ from: null, to: null, kind: "rupture" }] }), 12), null);
  assertEquals(localRepairTargets(report(), 12), null, "rien de localisé");
  assertEquals(localRepairTargets(report({ defects: [d("rupture", ["slides.1"])] }), 3), null, "3 slides : toujours complet");
  assertEquals(localRepairTargets(null, 12), null);
});

Deno.test("cibles locales : défaut mineur en fin de carrousel → voisines dans les bornes", () => {
  assertEquals(localRepairTargets(report({ defects: [{ type: "ending", severity: "minor", slide_ids: ["slides.11"] }] }), 12), [10, 11]);
});

Deno.test("durée attendue : part fixe de réflexion + prorata des slides réécrites", () => {
  assertEquals(expectedLocalRepairMs(84_000, 3, 12), 46_200);
  assertEquals(expectedLocalRepairMs(84_000, 12, 12), 84_000);
  assertEquals(expectedLocalRepairMs(0, 3, 12), 0);
});

Deno.test("fusion : slides réécrites remises à leur place, le reste intact", () => {
  const doc = { caption: { body: "L" }, slides: Array.from({ length: 6 }, (_, i) => ({ slide_number: i + 1, id: `s${i}`, title: `T${i}`, photo_index: i })) };
  const merged = mergeLocalRepair(doc, [2, 3], { slides: [{ slide_number: 3, title: "N2" }, { slide_number: 4, title: "N3" }] });
  assertEquals(merged.slides.map((s: any) => s.title), ["T0", "T1", "N2", "N3", "T4", "T5"]);
  assertEquals(merged.slides[2].id, "s2");
  assertEquals(merged.slides[3].photo_index, 3);
  assertEquals(merged.caption, doc.caption);
  // Carrousel complet renvoyé malgré la consigne : seules les slides demandées sont prises.
  const full = { slides: doc.slides.map((s) => ({ ...s, title: "X" + s.title })) };
  assertEquals(mergeLocalRepair(doc, [2, 3], full).slides.map((s: any) => s.title), ["T0", "T1", "XT2", "XT3", "T4", "T5"]);
  assertEquals(mergeLocalRepair(doc, [2, 3], { slides: [{ slide_number: 3 }] }), null, "nombre faux");
  assertEquals(mergeLocalRepair(doc, [2, 3], { slides: [{ slide_number: 4 }, { slide_number: 3 }] }), null, "numéros inversés");
  assertEquals(mergeLocalRepair(doc, [2, 3], null), null);
});

Deno.test("consigne locale : numéros à partir de 1 et format de retour", () => {
  const text = localRepairInstruction([5, 6, 7], { slides: new Array(12).fill({}) });
  assertEquals(text.includes("slides 6, 7, 8 (sur 12"), true);
  assertEquals(text.includes('{"slides":[...]}'), true);
});
