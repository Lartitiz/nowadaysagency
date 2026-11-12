// deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/creative-flow/investment_context_test.ts
// Appel à investir (QA du 12/11/2026) : la règle de _shared/investment-solicitation.ts
// entre dans objectiveBlock (questions, génération, recyclage) seulement si la demande en parle.
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildRequestContext } from "./context.ts";

const ctx = { profile: {}, tone: {}, offers: [] } as any;

Deno.test("contexte creative-flow : la règle n'entre dans le prompt que pour un appel à investir", () => {
  const avec = buildRequestContext({ body: { context: "je cherche des investisseurs pour cofinancer mon prochain immeuble" }, ctx, step: "generate" });
  assertStringIncludes(avec.objectiveBlock, "APPEL À INVESTIR");
  const sans = buildRequestContext({ body: { context: "je cherche un plombier fiable" }, ctx, step: "generate" });
  assertEquals(sans.objectiveBlock, "");
  const objectif = buildRequestContext({ body: { context: "levée de fonds de ma marque", objective: "vente" }, ctx, step: "generate" });
  assertStringIncludes(objectif.objectiveBlock, "OBJECTIF : VENTE");
  assertStringIncludes(objectif.objectiveBlock, "APPEL À INVESTIR");
});
