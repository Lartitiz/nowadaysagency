// Fuite de style (audit slop 18/08, Constat 2) : ce fichier appelle l'API
// Anthropic en fetch brut (hors callAnthropic/callAnthropicWithMeta), donc
// AUCUN nettoyage n'était appliqué avant le fix — un tiret cadratin écrit ici
// se propageait ensuite dans toutes les générations de contenu qui relisent
// ce contexte (voir _shared/user-context.ts). Ce test vérifie que
// sanitizeStyleDeep nettoie bien le JSON renvoyé par callClaude.
//
// Lancer : deno test --allow-env --allow-read supabase/functions/analyze-brand/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFetchMock, setTestEnv, anthropicTextSuccess } from "../_shared/test-edge-harness.ts";

setTestEnv();

// analyze-brand utilise `serve()` de std/http (pas Deno.serve), qui ouvre un
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
const { callClaude } = await import("./index.ts");
// deno-lint-ignore no-explicit-any
(Deno as any).listen = realListen;

Deno.test("callClaude nettoie les tirets cadratins du JSON renvoyé (chemin fetch brut, hors callAnthropic)", async () => {
  const dirty = {
    value_proposition: { confidence: "high", key_phrase: "Une offre claire — sans jargon" },
    tone_style: { confidence: "high", voice_description: "Le truc c'est que je suis directe — sans détour." },
  };
  const mock = installFetchMock({
    anthropic: () => anthropicTextSuccess(JSON.stringify(dirty)),
  });
  try {
    const result = await callClaude({ website: "contenu de test" }, ["website"]);
    assertEquals(mock.anthropicCallCount, 1);
    assertEquals(
      (result.value_proposition as any).key_phrase,
      "Une offre claire, sans jargon",
    );
    // sanitizeStyle = sanitizeDashes + sanitizeSlop (cheville "Le truc c'est que" en ouverture)
    assertEquals(
      (result.tone_style as any).voice_description,
      "Je suis directe, sans détour.",
    );
  } finally {
    mock.restore();
  }
});

Deno.test("callClaude laisse un JSON déjà propre inchangé", async () => {
  const clean = {
    value_proposition: { confidence: "high", key_phrase: "Une offre claire, sans jargon" },
  };
  const mock = installFetchMock({
    anthropic: () => anthropicTextSuccess(JSON.stringify(clean)),
  });
  try {
    const result = await callClaude({ website: "contenu de test" }, ["website"]);
    assertEquals((result.value_proposition as any).key_phrase, "Une offre claire, sans jargon");
  } finally {
    mock.restore();
  }
});
