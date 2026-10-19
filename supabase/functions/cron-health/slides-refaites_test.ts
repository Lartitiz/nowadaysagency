// Ligne « 🔁 Slides refaites » du bilan du lundi (chantier AA).
//   deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/cron-health/slides-refaites_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { slidesRefaites } from "./slides-refaites.ts";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 26, 9);
const at = (days: number) => new Date(now - days * DAY).toISOString();

Deno.test("slides refaites : semaine, clientes distinctes, S-1, comptes internes à part", () => {
  const clientes = [
    { user_id: "a", action_type: "slide_redo", created_at: at(1) },
    { user_id: "a", action_type: "slide_redo", created_at: at(2) },
    { user_id: "b", action_type: "slide_redo", created_at: at(3) },
    { user_id: "b", action_type: "carousel_visual", created_at: at(3) },
    { user_id: "c", action_type: "slide_redo", created_at: at(9) },
  ];
  const interne = { user_id: "admin", action_type: "slide_redo", created_at: at(1) };
  const out = slidesRefaites({
    ai: clientes, aiRows: [...clientes, interne], internalIds: new Set(["admin"]),
    curFrom: now - 7 * DAY, curTo: now, prevFrom: now - 14 * DAY, prevTo: now - 7 * DAY,
  });
  assertEquals(out, { n: 3, clientes: 2, n_s1: 1, internes: 1 });
});

Deno.test("slides refaites : aucune ligne = zéros, pas d'erreur", () => {
  assertEquals(slidesRefaites({ ai: [], aiRows: [], internalIds: new Set(), curFrom: 0, curTo: 1, prevFrom: 0, prevTo: 0 }), { n: 0, clientes: 0, n_s1: 0, internes: 0 });
});
