// Régression du fix "photo_retouch jamais gaté" (voir CLAUDE.md, pattern
// checkQuota -> appel IA -> logUsage UNIQUEMENT en cas de succès), sur le bloc
// Illustration de couverture (Recraft) : avant le fix, logUsage("photo_retouch")
// tournait après un succès Recraft SANS qu'aucun checkQuota("photo_retouch")
// n'ait jamais gaté l'entrée dans le bloc — un compte gratuit (plafond
// photo_retouch) pouvait donc générer des couvertures sans limite.
//
// Particularité de ce fichier : carousel-visual utilise `serve()` de std/http
// (pas `Deno.serve` global), qui ouvre un VRAI socket TCP au chargement du
// module — impossible à capturer via _shared/test-edge-harness.ts
// (captureServeHandler), et incompatible avec la commande CI réelle
// (`npm run test:edges` = `deno test --allow-env --allow-read`, SANS
// --allow-net). Le bloc Illustration de couverture a donc été extrait en
// fonction exportée `applyCoverIllustration` (voir index.ts), testable
// directement — même principe que creative-flow/index_test.ts pour
// runDeepResearchWebSearch.
//
// Lancer : deno test --allow-env --allow-read supabase/functions/carousel-visual/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFetchMock, setTestEnv } from "../_shared/test-edge-harness.ts";

/**
 * installFetchMock() renvoie toujours [] pour un GET /rest/v1/ai_usage
 * générique (voir _shared/test-edge-harness.ts) : pas assez pour simuler un
 * quota "photo_retouch" épuisé (plafond free = 5, voir plan-limiter.ts). On
 * enveloppe localement le fetch déjà installé pour répondre 5 lignes
 * `{category: "photo_retouch"}` sur ce GET précis, tout en réutilisant le
 * mock Anthropic/ai_usage-POST/auth déjà en place. `mock.restore()` reste
 * suffisant pour tout nettoyer : il restaure le VRAI fetch d'origine, ce qui
 * jette aussi cette enveloppe locale au passage.
 */
function installExhaustedPhotoRetouchQuota() {
  const mock = installFetchMock({
    anthropic: () => {
      throw new Error("Anthropic ne doit jamais être appelé quand le quota photo_retouch est refusé");
    },
  });
  const wrapped = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const method = (init?.method || "GET").toUpperCase();
    if (url.includes("/rest/v1/ai_usage") && method === "GET") {
      const rows = Array.from({ length: 5 }, () => ({ category: "photo_retouch" }));
      return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return wrapped(input, init);
  }) as typeof fetch;
  return mock;
}

setTestEnv();

// Importer index.ts exécute AUSSI `serve(handler)` en haut de fichier (effet
// de bord non testé ici, voir en-tête). Sans neutraliser Deno.listen(), ça
// tente un vrai socket TCP et plante en CI (pas de --allow-net). On neutralise
// AVANT l'import (obligatoirement dynamique : un import statique s'exécute
// avant tout le reste du fichier, trop tôt pour patcher Deno.listen).
const realListen = Deno.listen;
// deno-lint-ignore no-explicit-any
(Deno as any).listen = () => ({
  [Symbol.asyncIterator]() {
    return { next: () => new Promise(() => {}) }; // ne se résout jamais : pas de crash, juste une tâche de fond inerte
  },
  accept: () => new Promise(() => {}),
  close() {},
  addr: { transport: "tcp", hostname: "localhost", port: 0 },
  rid: -1,
  ref() {},
  unref() {},
  // deno-lint-ignore no-explicit-any
}) as any;
const { applyCoverIllustration } = await import("./index.ts");
// deno-lint-ignore no-explicit-any
(Deno as any).listen = realListen;

const BASE_RESULT = { slides_html: [{ slide_number: 1, html: "<div>couverture</div>" }] };
const BASE_PARAMS = {
  reqBody: { cover_illustration: true },
  slides: [{ slide_number: 1, title: "Titre de couverture" }],
  ch: { mood_keywords: "chaleureux", color_primary: "#FB3D80", color_secondary: "#FFA7C6", color_background: "#FFF4F8" },
  userId: "test-user-id",
  workspaceId: undefined,
  usage: {},
};

Deno.test("quota photo_retouch épuisé -> illustration bloquée avant Recraft/Anthropic, pas de logUsage, échec silencieux", async () => {
  const mock = installExhaustedPhotoRetouchQuota();
  try {
    const result = structuredClone(BASE_RESULT);
    const done = await applyCoverIllustration(result, { ...BASE_PARAMS, reqBody: { cover_illustration: true } });

    assertEquals(mock.anthropicCallCount, 0);
    const photoRetouchLogs = mock.aiUsageInserts.filter((r) => r.category === "photo_retouch");
    assertEquals(photoRetouchLogs.length, 0);
    // Échec silencieux : le carrousel garde sa couverture d'origine, pas d'erreur remontée au client.
    assertEquals(done, false);
    assertEquals(result.slides_html[0].html, "<div>couverture</div>");
  } finally {
    mock.restore();
  }
});

Deno.test("cover_illustration non demandée -> checkQuota jamais consulté, aucun appel réseau", async () => {
  const mock = installFetchMock({
    anthropic: () => {
      throw new Error("Anthropic ne doit pas être appelé quand cover_illustration n'est pas demandée");
    },
  });
  try {
    const result = structuredClone(BASE_RESULT);
    const done = await applyCoverIllustration(result, { ...BASE_PARAMS, reqBody: { cover_illustration: false } });

    assertEquals(mock.anthropicCallCount, 0);
    assertEquals(done, false);
  } finally {
    mock.restore();
  }
});
