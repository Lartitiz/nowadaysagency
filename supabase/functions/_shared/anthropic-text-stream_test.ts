// Réponse en flux (27/11/2026, script du reel affiché pendant l'écriture) :
// `callAnthropic` avec `onText` lit le flux, montre le texte au fil de l'eau et
// rend EXACTEMENT le même résultat qu'une réponse classique (mêmes contrôles).
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AnthropicError, callAnthropic } from "./anthropic.ts";

const sse = (events: unknown[]) => events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join("");
const streamOf = (text: string) => new ReadableStream({
  start(c) { const enc = new TextEncoder(); for (let i = 0; i < text.length; i += 7) c.enqueue(enc.encode(text.slice(i, i + 7))); c.close(); },
});
const okEvents = (parts: string[], stop = "end_turn") => [
  { type: "message_start", message: { model: "claude-sonnet-4-6", usage: { input_tokens: 10, output_tokens: 1 } } },
  { type: "content_block_start", index: 0, content_block: { type: "thinking" } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "réflexion secrète" } },
  { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
  ...parts.map((t) => ({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: t } })),
  { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 42 } },
  { type: "message_stop" },
];

async function withFetch(responses: (() => Response)[], run: (bodies: any[]) => Promise<void>) {
  const oldFetch = globalThis.fetch, oldKey = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.set("ANTHROPIC_API_KEY", "fake");
  const bodies: any[] = [];
  globalThis.fetch = ((_u: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Promise.resolve(responses[Math.min(bodies.length - 1, responses.length - 1)]());
  }) as typeof fetch;
  try { await run(bodies); }
  finally { globalThis.fetch = oldFetch; if (oldKey === undefined) Deno.env.delete("ANTHROPIC_API_KEY"); else Deno.env.set("ANTHROPIC_API_KEY", oldKey); }
}

Deno.test("callAnthropic + onText : texte montré au fil de l'eau, résultat et usage identiques", async () => {
  await withFetch([() => new Response(streamOf(sse(okEvents(['{"a":', ' "bon', 'jour"}']))))], async (bodies) => {
    const seen: string[] = [];
    const usage: any = {};
    const out = await callAnthropic({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "x" }], onText: (t) => seen.push(t) }, usage);
    assertEquals(out, '{"a": "bonjour"}');
    assertEquals(seen, ['{"a":', '{"a": "bon', '{"a": "bonjour"}']);
    assert(!seen.join("").includes("réflexion"), "la réflexion ne part jamais à l'écran");
    assertEquals(bodies[0].stream, true);
    assertEquals(usage.output_tokens, 42);
    assertEquals(usage.input_tokens, 10);
  });
});

Deno.test("callAnthropic sans onText : aucune demande de flux (comportement d'avant)", async () => {
  const json = { model: "claude-sonnet-4-6", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
  await withFetch([() => new Response(JSON.stringify(json))], async (bodies) => {
    assertEquals(await callAnthropic({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "x" }] }), "ok");
    assertEquals(bodies[0].stream, undefined);
  });
});

Deno.test("callAnthropic + onText : texte coupé (max_tokens) → même erreur 422 qu'avant", async () => {
  await withFetch([() => new Response(streamOf(sse(okEvents(['{"a":'], "max_tokens"))))], async () => {
    const err = await assertRejects(() => callAnthropic({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "x" }], onText: () => {}, maxRetries: 0 }), AnthropicError);
    assertEquals((err as AnthropicError).status, 422);
  });
});

Deno.test("callAnthropic + onText : flux coupé en route → relance, puis réponse complète", async () => {
  const cut = [okEvents(["début"]).slice(0, 5)];
  await withFetch([
    () => new Response(streamOf(sse(cut[0]))),
    () => new Response(streamOf(sse(okEvents(["fin propre"])))),
  ], async (bodies) => {
    const out = await callAnthropic({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "x" }], onText: () => {}, maxRetries: 1 });
    assertEquals(out, "fin propre");
    assertEquals(bodies.length, 2);
  });
});

Deno.test("callAnthropic + onText : un affichage qui plante ne casse pas l'écriture", async () => {
  await withFetch([() => new Response(streamOf(sse(okEvents(["texte"]))))], async () => {
    assertEquals(await callAnthropic({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "x" }], onText: () => { throw new Error("boum"); } }), "texte");
  });
});
