// Fuite de style (audit slop 18/08, Constat 2) : le chemin nominal de ce
// fichier (fetch brut + web search) contournait le nettoyage automatique de
// callAnthropic. Le filet de secours (extraction structurée, plus bas dans
// index.ts) passe lui par callAnthropic et était déjà propre — seul le
// chemin nominal fuitait. Ce test vérifie que parseNewsjackingJson nettoie
// bien le JSON parsé avant de le renvoyer.
//
// Lancer : deno test --allow-env --allow-read supabase/functions/newsjacking-ai/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { setTestEnv } from "../_shared/test-edge-harness.ts";

setTestEnv();

// newsjacking-ai utilise `serve()` de std/http (pas Deno.serve), qui ouvre un
// vrai socket TCP au chargement du module — on neutralise Deno.listen AVANT
// l'import, même patron que creative-flow/index_test.ts.
const realListen = Deno.listen;
// deno-lint-ignore no-explicit-any
(Deno as any).listen = () => ({
  [Symbol.asyncIterator]() {
    return { next: () => new Promise(() => {}) };
  },
  accept: () => new Promise(() => {}),
  close() {},
  addr: { transport: "tcp", hostname: "localhost", port: 0 },
  rid: -1,
  ref() {},
  unref() {},
  // deno-lint-ignore no-explicit-any
}) as any;
const { parseNewsjackingJson } = await import("./index.ts");
// deno-lint-ignore no-explicit-any
(Deno as any).listen = realListen;

Deno.test("parseNewsjackingJson nettoie les tirets cadratins (parse direct)", () => {
  const fullText = JSON.stringify({
    actus: [{ titre: "Titre", resume: "Un résumé — avec un aparté", pertinence: "forte" }],
  });
  const parsed = parseNewsjackingJson(fullText);
  assertEquals((parsed!.actus as any[])[0].resume, "Un résumé, avec un aparté");
});

Deno.test("parseNewsjackingJson nettoie aussi via la stratégie 2 (JSON noyé dans du texte autour de 'actus')", () => {
  const fullText = `Voici ce que j'ai trouvé après recherche.\n{"actus":[{"titre":"T","resume":"Spoiler : ça a changé — beaucoup.","pertinence":"forte"}]}\nFin.`;
  const parsed = parseNewsjackingJson(fullText);
  assertEquals((parsed!.actus as any[])[0].resume, "Ça a changé, beaucoup.");
});

Deno.test("parseNewsjackingJson renvoie null si aucun JSON exploitable", () => {
  assertEquals(parseNewsjackingJson("pas de json ici, juste de la prose."), null);
});
