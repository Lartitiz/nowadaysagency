import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { finalizeRetouch } from "./finalize.ts";

Deno.test("finalisation : comptabilise seulement après écriture confirmée", async () => {
  const calls: string[] = [];
  await finalizeRetouch(async () => { calls.push("ready"); return { error: null }; }, async () => calls.push("failed"), async () => calls.push("usage"));
  assertEquals(calls, ["ready", "usage"]);
});
Deno.test("finalisation : récupère une panne transitoire sans regénérer l’image", async () => {
  let writes = 0, charges = 0;
  await finalizeRetouch(async () => ({ error: ++writes < 3 ? "offline" : null }), async () => { throw new Error("unexpected"); }, async () => { charges++; }, async () => {});
  assertEquals(writes, 3); assertEquals(charges, 1);
});
Deno.test("finalisation : panne persistante, échec explicite et aucun décompte", async () => {
  let writes = 0, charges = 0, failures = 0;
  await assertRejects(() => finalizeRetouch(async () => { writes++; throw new Error("offline"); }, async () => { failures++; }, async () => { charges++; }, async () => {}), Error, "originale est conservée");
  assertEquals(writes, 3); assertEquals(charges, 0); assertEquals(failures, 1);
});
Deno.test("finalisation : ne masque pas l’échec si marquer failed échoue aussi", async () => {
  let charges = 0;
  await assertRejects(() => finalizeRetouch(async () => ({ error: "offline" }), async () => { throw new Error("offline"); }, async () => { charges++; }, async () => {}), Error, "Réessaie plus tard");
  assertEquals(charges, 0);
});
