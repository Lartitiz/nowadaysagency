import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { fetchWithRetry } from "./http-retry.ts";

function mockResponse(status: number, body = ""): Response {
  return new Response(body, { status });
}

// ── Cas de base ──

Deno.test("succès du 1er coup : pas de retry", async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => {
    calls++;
    return mockResponse(200, "ok");
  });
  assertEquals(calls, 1);
  assertEquals(result.retried, false);
  assertEquals(result.response?.status, 200);
});

Deno.test("5xx puis succès : 1 retry, réponse finale 200", async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => {
    calls++;
    return calls === 1 ? mockResponse(503, "down") : mockResponse(200, "ok");
  }, { retryDelayMs: 0 });
  assertEquals(calls, 2);
  assertEquals(result.retried, true);
  assertEquals(result.response?.status, 200);
});

Deno.test("5xx persistant : épuise les tentatives, renvoie la dernière réponse 5xx", async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => {
    calls++;
    return mockResponse(502, "still down");
  }, { retryDelayMs: 0 });
  assertEquals(calls, 2);
  assertEquals(result.retried, true);
  assertEquals(result.response?.status, 502);
});

Deno.test("4xx : jamais de retry (photoroom-edit / photo-background-replace)", async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => {
    calls++;
    return mockResponse(422, "bad request");
  });
  assertEquals(calls, 1);
  assertEquals(result.retried, false);
  assertEquals(result.response?.status, 422);
});

// ── Modes d'erreur réseau (les 3 variantes observées dans les 5 edge functions) ──

Deno.test('mode "timeout-or-type-error" (photo-background-replace) : timeout retente', async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => {
    calls++;
    if (calls === 1) {
      const e = new DOMException("aborted", "TimeoutError");
      throw e;
    }
    return mockResponse(200);
  }, { retryDelayMs: 0, networkErrorRetryMode: "timeout-or-type-error", timeoutLabel: "Photoroom timeout" });
  assertEquals(calls, 2);
  assertEquals(result.retried, true);
  assertEquals(result.response?.status, 200);
});

Deno.test('mode "timeout-or-type-error" : TypeError (coupure réseau) retente', async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => {
    calls++;
    if (calls === 1) throw new TypeError("network drop");
    return mockResponse(200);
  }, { retryDelayMs: 0, networkErrorRetryMode: "timeout-or-type-error" });
  assertEquals(calls, 2);
  assertEquals(result.retried, true);
});

Deno.test('mode "type-error-only" (product-on-model / carousel-slide-image) : timeout NE retente PAS', async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => {
    calls++;
    throw new DOMException("aborted", "TimeoutError");
  }, { retryDelayMs: 0, networkErrorRetryMode: "type-error-only", timeoutLabel: "OpenAI timeout" });
  assertEquals(calls, 1); // un seul appel : pas de retry sur timeout dans ce mode
  assertEquals(result.retried, false);
  assertEquals(result.response, null);
  assertEquals(result.lastError, "OpenAI timeout");
});

Deno.test('mode "type-error-only" : TypeError retente bien', async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => {
    calls++;
    if (calls === 1) throw new TypeError("network drop");
    return mockResponse(200);
  }, { retryDelayMs: 0, networkErrorRetryMode: "type-error-only" });
  assertEquals(calls, 2);
  assertEquals(result.retried, true);
});

Deno.test('mode "always" (photoroom-edit / recraft-picto) : retente même une erreur générique', async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => {
    calls++;
    if (calls === 1) throw new Error("erreur quelconque");
    return mockResponse(200);
  }, { retryDelayMs: 0, networkErrorRetryMode: "always" });
  assertEquals(calls, 2);
  assertEquals(result.retried, true);
  assertEquals(result.response?.status, 200);
});

// ── Budget temps pour le retry 5xx (product-on-model / carousel-slide-image) ──

Deno.test("maxElapsedMsFor5xxRetry dépassé : pas de retry sur 5xx", async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => {
    calls++;
    return mockResponse(500, "down");
  }, { retryDelayMs: 0, maxElapsedMsFor5xxRetry: -1 }); // budget déjà dépassé dès le 1er appel
  assertEquals(calls, 1);
  assertEquals(result.retried, false);
  assertEquals(result.response?.status, 500);
});

Deno.test("maxElapsedMsFor5xxRetry large : retry sur 5xx comme d'habitude", async () => {
  let calls = 0;
  const result = await fetchWithRetry(async () => {
    calls++;
    return calls === 1 ? mockResponse(500, "down") : mockResponse(200);
  }, { retryDelayMs: 0, maxElapsedMsFor5xxRetry: 30_000 });
  assertEquals(calls, 2);
  assertEquals(result.retried, true);
});

// ── Le corps 5xx est bien drainé avant le retry (pas de fuite de ressource) ──

Deno.test("le corps de la réponse 5xx est consommé avant le retry", async () => {
  let bodyRead = false;
  let calls = 0;
  const result = await fetchWithRetry(async () => {
    calls++;
    if (calls === 1) {
      const res = mockResponse(503, "down");
      const originalText = res.text.bind(res);
      res.text = async () => {
        bodyRead = true;
        return originalText();
      };
      return res;
    }
    return mockResponse(200);
  }, { retryDelayMs: 0 });
  assert(bodyRead, "le body de la 1ère réponse 5xx aurait dû être lu avant le retry");
  assertEquals(result.response?.status, 200);
});
