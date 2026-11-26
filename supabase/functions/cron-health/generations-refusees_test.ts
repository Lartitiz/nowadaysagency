// Ligne « 🚫 Générations refusées » du bilan du lundi.
//   deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/cron-health/generations-refusees_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generationsRefusees } from "./generations-refusees.ts";

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 30, 9);
const at = (days: number) => new Date(now - days * DAY).toISOString();
const refus = (user_id: string | null, days: number, message = "Données invalides: confirmed_structure.3.overlay_position: Invalid enum value") =>
  ({ user_id, created_at: at(days), payload: { fonction: "carousel-ai", message, type: "express_full", carousel_type: "photo" } });

Deno.test("générations refusées : semaine sans refus → 0, rien à lire", () => {
  assertEquals(generationsRefusees([], { isClient: () => true, now }), { refus: 0, comptes: 0, clientes: 0, dernier: null });
});

Deno.test("générations refusées : le cas du 25/11 (compte de démonstration, 2 essais) compte, même sans cliente touchée", () => {
  const out = generationsRefusees([refus("demo", 5.1), refus("demo", 5)], { isClient: (id) => id !== "demo", now });
  assertEquals(out.refus, 2);
  assertEquals(out.comptes, 1);
  assertEquals(out.clientes, 0);
  assertEquals(out.dernier?.fonction, "carousel-ai");
  assertEquals(out.dernier?.message.includes("overlay_position"), true);
});

Deno.test("générations refusées : fenêtre de 7 jours, clientes comptées à part, dernier refus en tête", () => {
  const out = generationsRefusees([refus("a", 9), refus("a", 2, "Données invalides: narrative_thread"), refus("b", 1, "Données invalides: image_role"), refus(null, 3)], { isClient: (id) => id === "a" || id === "b", now });
  assertEquals(out.refus, 3);
  assertEquals(out.comptes, 3);
  assertEquals(out.clientes, 2);
  assertEquals(out.dernier, { date: at(1).slice(0, 10), fonction: "carousel-ai", message: "Données invalides: image_role" });
});
