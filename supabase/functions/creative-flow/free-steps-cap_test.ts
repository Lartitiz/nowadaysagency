// Plafond quotidien des étapes gratuites de création (audit de coût du 20/10/2026).
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/creative-flow/free-steps-cap_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { BILLED_STEPS, FREE_STEPS_DAILY_FREE, FREE_STEPS_DAILY_PAID, FREE_STEPS_MESSAGE, freeStepsCapReached } from "./free-steps-cap.ts";

// deno-lint-ignore no-explicit-any
function fauxClient(count: number | null, erreur = false): any {
  const q: any = { select() { return q; }, eq() { return q; }, gt: async () => (erreur ? { count: null, error: { message: "x" } } : { count, error: null }) };
  return { from: () => q };
}
const plan = (p: string) => async () => p;

Deno.test("étapes facturées inchangées : generate, adjust, recycle", () => {
  assertEquals([...BILLED_STEPS].sort(), ["adjust", "generate", "recycle"]);
});

Deno.test("gratuit : bloqué à 30 sur 24 h, pas avant", async () => {
  assertEquals(await freeStepsCapReached(fauxClient(FREE_STEPS_DAILY_FREE - 1), "u", null, plan("free")), false);
  assertEquals(await freeStepsCapReached(fauxClient(FREE_STEPS_DAILY_FREE), "u", null, plan("free")), true);
});

Deno.test("payant : garde-fou à 150", async () => {
  assertEquals(await freeStepsCapReached(fauxClient(FREE_STEPS_DAILY_FREE), "u", null, plan("outil")), false);
  assertEquals(await freeStepsCapReached(fauxClient(FREE_STEPS_DAILY_PAID), "u", null, plan("binome")), true);
});

Deno.test("admin, plan illisible ou compteur illisible : on laisse passer", async () => {
  assertEquals(await freeStepsCapReached(fauxClient(999), "u", null, plan("admin")), false);
  assertEquals(await freeStepsCapReached(fauxClient(999), "u", null, plan("unknown")), false);
  assertEquals(await freeStepsCapReached(fauxClient(null, true), "u", null, plan("free")), false);
});

Deno.test("compte de recette : jamais bloqué", async () => {
  assertEquals(await freeStepsCapReached(fauxClient(999), "52e6c03c-a7de-4c20-9b4a-276751f976e8", null, plan("free")), false);
});

Deno.test("message sans « crédit », « quota » ni « limite » (sinon écran « plus de crédits »)", () => {
  assertEquals(/cr[ée]dit|quota|limite/i.test(FREE_STEPS_MESSAGE), false);
});
