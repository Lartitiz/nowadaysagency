// Garde anti-régression du passage Opus 4.8 → Opus 5.5 (28/09/2026).
// Opus 5.5 renvoie 400 sur `thinking: disabled`, sur `tool_choice` forcé et sur
// `temperature` ; sa réponse peut commencer par un bloc `thinking` vide.
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AnthropicError, OPUS_MODEL, callAnthropic, callAnthropicWithMeta, getModelForAction,
  getModelForRichContent, modelRequestFields, responseText,
} from "./anthropic.ts";
import { streamAnthropicSSE, streamAnthropicToolSSE } from "./anthropic-stream.ts";

const tool = { name: "livrer", input_schema: { type: "object", properties: { a: { type: "string" } } } };
const usage = { input_tokens: 5, output_tokens: 7 };
const thinking = { type: "thinking", thinking: "" };

async function withFetch(responses: Array<{ status?: number; body: unknown }>, run: (bodies: any[]) => Promise<void>) {
  const oldFetch = globalThis.fetch, oldKey = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.set("ANTHROPIC_API_KEY", "fake");
  const bodies: any[] = [];
  let i = 0;
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const r = responses[Math.min(i++, responses.length - 1)];
    return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status ?? 200 }));
  }) as typeof fetch;
  try { await run(bodies); }
  finally { globalThis.fetch = oldFetch; if (oldKey === undefined) Deno.env.delete("ANTHROPIC_API_KEY"); else Deno.env.set("ANTHROPIC_API_KEY", oldKey); }
}

Deno.test("tout le tier Opus pointe sur Opus 5.5", () => {
  assertEquals(OPUS_MODEL, "claude-opus-5-5");
  for (const action of ["coaching", "strategy", "branding_audit", "assistant_chat"]) assertEquals(getModelForAction(action), "claude-opus-5-5");
  assertEquals(getModelForRichContent("content", true), "claude-opus-5-5");
});

Deno.test("Opus 5.5 : ni thinking disabled, ni outil forcé ; effort bas + marge de tokens", () => {
  const f = modelRequestFields("claude-opus-5-5", 1000, tool);
  assert(!("thinking" in f));
  assertEquals(f.output_config, { effort: "low" });
  assertEquals(f.tool_choice, { type: "auto", disable_parallel_tool_use: true });
  assertEquals(f.max_tokens, 16000);
  assertEquals(modelRequestFields("claude-opus-5-5", 16384).max_tokens, 24576);
  // Les autres modèles gardent leur comportement exact.
  assertEquals(modelRequestFields("claude-sonnet-4-6", 1000, tool), { max_tokens: 1000, tool_choice: { type: "tool", name: "livrer" } });
  assertEquals(modelRequestFields("claude-sonnet-5", 1000), { max_tokens: 1000, thinking: { type: "disabled" } });
});

Deno.test("responseText ignore les blocs thinking en tête", () => {
  assertEquals(responseText({ content: [thinking, { type: "text", text: "Bonjour" }] }), "Bonjour");
});

Deno.test("callAnthropic Opus 5.5 : corps valide et texte lu après le bloc thinking", async () => {
  await withFetch([{ body: { stop_reason: "end_turn", usage, content: [thinking, { type: "text", text: "Réponse" }] } }], async (bodies) => {
    const text = await callAnthropic({ model: OPUS_MODEL, system: "S", messages: [{ role: "user", content: "Q" }, { role: "assistant", content: "prefill" }], temperature: 0.7, max_tokens: 1024 });
    assertEquals(text, "Réponse");
    const b = bodies[0];
    assert(!("temperature" in b) && !("thinking" in b) && !("tool_choice" in b));
    assertEquals(b.messages.length, 1); // prefill retiré
    assertEquals(b.output_config, { effort: "low" });
    assertEquals(b.max_tokens, 16000);
  });
});

Deno.test("callAnthropic Opus 5.5 + outil : auto + consigne, relance si l'outil manque", async () => {
  await withFetch([
    { body: { stop_reason: "end_turn", usage, content: [thinking, { type: "text", text: "Voici" }] } },
    { body: { stop_reason: "tool_use", usage, content: [thinking, { type: "tool_use", name: "livrer", input: { a: "ok" } }] } },
  ], async (bodies) => {
    const raw = await callAnthropic({ model: OPUS_MODEL, system: "S", messages: [{ role: "user", content: "Q" }], tool, maxRetries: 1 });
    assertEquals(JSON.parse(raw), { a: "ok" });
    assertEquals(bodies.length, 2);
    assertEquals(bodies[0].tool_choice, { type: "auto", disable_parallel_tool_use: true });
    assert(bodies[0].system[0].text.includes("`livrer`"));
  });
});

Deno.test("refus du modèle → erreur claire 422, jamais un succès vide", async () => {
  await withFetch([{ body: { stop_reason: "refusal", usage, content: [] } }], async () => {
    const e = await assertRejects(() => callAnthropic({ model: OPUS_MODEL, messages: [{ role: "user", content: "Q" }] }), AnthropicError);
    assertEquals(e.status, 422);
  });
});

Deno.test("repli Sonnet sur 529 conservé pour Opus 5.5, outil re-forcé côté Sonnet", async () => {
  await withFetch([
    { status: 529, body: { error: {} } },
    { body: { model: "claude-sonnet-4-6", stop_reason: "tool_use", usage, content: [{ type: "tool_use", name: "livrer", input: { a: "s" } }] } },
  ], async (bodies) => {
    const sink: any = {};
    const raw = await callAnthropic({ model: OPUS_MODEL, messages: [{ role: "user", content: "Q" }], tool, maxRetries: 0 }, sink);
    assertEquals(JSON.parse(raw), { a: "s" });
    assertEquals(bodies[1].model, "claude-sonnet-4-6");
    assertEquals(bodies[1].tool_choice, { type: "tool", name: "livrer" });
    assertEquals(sink.model, "claude-sonnet-4-6");
  });
  await withFetch([
    { status: 500, body: {} },
    { body: { stop_reason: "end_turn", usage, content: [{ type: "text", text: "Sonnet" }] } },
  ], async (bodies) => {
    const r = await callAnthropicWithMeta({ model: OPUS_MODEL, messages: [{ role: "user", content: "Q" }], maxRetries: 0 });
    assertEquals(r.text, "Sonnet");
    assertEquals(bodies[1].model, "claude-sonnet-4-6");
  });
});

Deno.test("callAnthropicWithMeta Opus 5.5 lit le texte après le bloc thinking", async () => {
  await withFetch([{ body: { stop_reason: "end_turn", usage, content: [thinking, { type: "text", text: "Méta" }] } }], async () => {
    const r = await callAnthropicWithMeta({ model: OPUS_MODEL, messages: [{ role: "user", content: "Q" }] });
    assertEquals(r.text, "Méta");
  });
});

Deno.test("streams : Opus 5.5 sans thinking disabled ni outil forcé", async () => {
  await withFetch([{ body: {} }], async (bodies) => {
    await streamAnthropicSSE("k", OPUS_MODEL, "S", [{ role: "user", content: "Q" }], 0.7, 1000);
    await streamAnthropicToolSSE("k", OPUS_MODEL, "S", [{ role: "user", content: "Q" }], 0.7, 1000, tool);
    for (const b of bodies) {
      assert(!("thinking" in b) && !("temperature" in b));
      assertEquals(b.output_config, { effort: "low" });
      assertEquals(b.max_tokens, 16000);
    }
    assertEquals(bodies[1].tool_choice, { type: "auto", disable_parallel_tool_use: true });
  });
});
