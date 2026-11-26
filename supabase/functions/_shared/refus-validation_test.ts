//   deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/refus-validation_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EVENEMENT_REFUS, noterRefusValidation, refusPayload } from "./refus-validation.ts";

Deno.test("refus de validation : la trace porte la fonction, le message coupé, le type de demande", async () => {
  const lignes: any[] = [];
  const client = { from: (t: string) => ({ insert: (row: any) => { lignes.push({ t, row }); return Promise.resolve({ error: null }); } }) };
  const message = "Données invalides: confirmed_structure.3.overlay_position: Invalid enum value. " + "x".repeat(400);
  await noterRefusValidation("u1", "carousel-ai", message, { type: "express_full", carousel_type: "photo", photos: ["…"] }, client);
  assertEquals(lignes.length, 1);
  assertEquals(lignes[0].t, "frontend_debug_logs");
  assertEquals(lignes[0].row.event, EVENEMENT_REFUS);
  assertEquals(lignes[0].row.user_id, "u1");
  assertEquals(lignes[0].row.payload, { ...refusPayload("carousel-ai", message), type: "express_full", carousel_type: "photo" });
  assertEquals(lignes[0].row.payload.message.length, 300);
});

Deno.test("refus de validation : une trace qui échoue ne lève jamais", async () => {
  await noterRefusValidation(null, "carousel-ai", "Données invalides: x", {}, { from: () => { throw new Error("base coupée"); } });
  await noterRefusValidation(null, "carousel-ai", "Données invalides: x", {}, { from: () => ({ insert: () => Promise.resolve({ error: { message: "refusé" } }) }) });
});
