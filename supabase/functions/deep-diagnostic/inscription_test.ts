// L'état d'inscription décide seul de la gratuité du diagnostic (audit de coût
// du 20/10/2026) : le champ `isOnboarding` du navigateur ne suffit plus.
//
// Lancer : deno test --allow-env --allow-read --no-check --node-modules-dir=none supabase/functions/deep-diagnostic/inscription_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { inscriptionEnCours } from "./inscription.ts";

// deno-lint-ignore no-explicit-any
function fauxClient(lignes: Record<string, any>, erreur?: string): any {
  return {
    from(table: string) {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => erreur === table
          ? { data: null, error: { message: "lecture impossible" } }
          : { data: lignes[table] ?? null, error: null },
      };
    },
  };
}

Deno.test("inscription en cours : aucune table ne dit terminé -> gratuit", async () => {
  assertEquals(await inscriptionEnCours(fauxClient({ profiles: { onboarding_completed: false } }), "u"), true);
  assertEquals(await inscriptionEnCours(fauxClient({}), "u"), true);
});

Deno.test("démarrage déjà fini (profil) -> pas gratuit, même si le navigateur dit isOnboarding", async () => {
  assertEquals(await inscriptionEnCours(fauxClient({ profiles: { onboarding_completed: true } }), "u"), false);
});

Deno.test("démarrage déjà fini (user_plan_config seule) -> pas gratuit", async () => {
  assertEquals(await inscriptionEnCours(fauxClient({ user_plan_config: { onboarding_completed: true } }), "u"), false);
});

Deno.test("lecture impossible -> pas gratuit (le quota normal s'applique)", async () => {
  assertEquals(await inscriptionEnCours(fauxClient({}, "profiles"), "u"), false);
});
