// Annulation par l'appelant (10/10/2026) : le plan du carrousel lance un second
// appel quand le premier traîne et coupe le perdant. Une annulation ne doit
// JAMAIS repartir en relance (ce serait un nouvel appel complet payé pour rien).
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AnthropicError, callAnthropic } from "./anthropic.ts";

async function withHangingFetch(run: (count: () => number) => Promise<void>) {
  const oldFetch = globalThis.fetch, oldKey = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.set("ANTHROPIC_API_KEY", "fake");
  let n = 0;
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
    n++;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
  }) as typeof fetch;
  try { await run(() => n); }
  finally { globalThis.fetch = oldFetch; if (oldKey === undefined) Deno.env.delete("ANTHROPIC_API_KEY"); else Deno.env.set("ANTHROPIC_API_KEY", oldKey); }
}

Deno.test("callAnthropic : annulé par l'appelant → coupe le fetch, aucune relance", async () => {
  await withHangingFetch(async (count) => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 20);
    const err = await assertRejects(() => callAnthropic({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "x" }], signal: ac.signal }), AnthropicError);
    assertEquals((err as AnthropicError).status, 499);
    assertEquals(count(), 1);
  });
});

Deno.test("callAnthropic : signal déjà annulé → aucun appel", async () => {
  await withHangingFetch(async (count) => {
    const ac = new AbortController();
    ac.abort();
    await assertRejects(() => callAnthropic({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "x" }], signal: ac.signal }), AnthropicError);
    assertEquals(count(), 0);
  });
});

Deno.test("callAnthropic : plafond par tentative sans signal → relance comme avant", async () => {
  await withHangingFetch(async (count) => {
    await assertRejects(() => callAnthropic({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "x" }], abortTimeoutMs: 10, maxRetries: 1 }), AnthropicError);
    assert(count() === 2, `2 tentatives attendues, ${count()} vues`);
  });
});
