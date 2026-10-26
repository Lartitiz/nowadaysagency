// Ligne « 🪪 Fiches coincées » du bilan du lundi.
//   deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/cron-health/fiches-coincees_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fichesCoincees } from "./fiches-coincees.ts";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 26, 9);
const at = (days: number) => new Date(now - days * DAY).toISOString();
const sept = ["story", "persona", "value_proposition", "tone_style", "content_strategy", "offers", "charter"];

Deno.test("fiches coincées : ≥ 6 cartes relues, plus de 24 h, clientes seulement", () => {
  const rows = [
    { user_id: "a", updated_at: at(25), reviewed: sept },                 // coincée (7/7)
    { user_id: "b", updated_at: at(3), reviewed: sept.slice(0, 6) },      // coincée (6/7)
    { user_id: "c", updated_at: at(10), reviewed: sept.slice(0, 1) },     // relecture pas faite
    { user_id: "d", updated_at: at(40), reviewed: null },                 // relecture jamais ouverte
    { user_id: "e", updated_at: new Date(now - 2 * 3600_000).toISOString(), reviewed: sept }, // < 24 h : en cours
    { user_id: "interne", updated_at: at(5), reviewed: sept },            // compte interne
  ];
  const out = fichesCoincees(rows, { isClient: (id) => id !== "interne", now });
  assertEquals(out, { a_relire: 5, coincees: 2, plus_ancienne: at(25).slice(0, 10) });
});

Deno.test("fiches coincées : aucune ligne = zéros", () => {
  assertEquals(fichesCoincees([], { isClient: () => true, now }), { a_relire: 0, coincees: 0, plus_ancienne: null });
});
