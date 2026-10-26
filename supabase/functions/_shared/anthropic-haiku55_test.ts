// Garde anti-régression du passage Haiku 4.5 → Haiku 5.5 (26/10/2026).
// Doc « Migrating to Claude Haiku 5.5 » : `temperature` non défaut → 400, prefill
// → 400, réflexion adaptative quand `thinking` est omis (`disabled` accepté à
// l'effort par défaut), `tool_choice` forcé ACCEPTÉ, tokenizer ~30 % plus dense.
// Retour arrière : secret `AI_MODEL_HAIKU=claude-haiku-4-5`.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { HAIKU_MODEL, callAnthropic, getModelForAction, modelRequestFields, supportsTemperature } from "./anthropic.ts";
import { streamAnthropicSSE, streamAnthropicToolSSE } from "./anthropic-stream.ts";

const tool = { name: "livrer", input_schema: { type: "object", properties: { a: { type: "string" } } } };
const usage = { input_tokens: 5, output_tokens: 7 };

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

Deno.test("le tier Haiku pointe sur Haiku 5.5 (sauf secret de retour arrière)", () => {
  // Sans secret AI_MODEL_HAIKU posé dans l'environnement de test, le défaut est 5.5.
  if (!Deno.env.get("AI_MODEL_HAIKU")) assertEquals(HAIKU_MODEL, "claude-haiku-5-5");
  if (!Deno.env.get("AI_MODEL_QUESTIONS")) assertEquals(getModelForAction("questions"), HAIKU_MODEL);
  assert(!supportsTemperature("claude-haiku-5-5"));
  assert(supportsTemperature("claude-haiku-4-5"));
});

Deno.test("Haiku 5.5 : thinking coupé, outil FORCÉ gardé, plafond ×1,3, pas d'effort", () => {
  assertEquals(modelRequestFields("claude-haiku-5-5", 1000, tool), {
    max_tokens: 1300, thinking: { type: "disabled" }, tool_choice: { type: "tool", name: "livrer" },
  });
  assertEquals(modelRequestFields("claude-haiku-5-5", 300), { max_tokens: 390, thinking: { type: "disabled" } });
  // Haiku 4.5 (retour arrière) garde son comportement exact.
  assertEquals(modelRequestFields("claude-haiku-4-5", 1000, tool), { max_tokens: 1000, tool_choice: { type: "tool", name: "livrer" } });
});

Deno.test("callAnthropic Haiku 5.5 : sans temperature ni prefill, outil forcé, thinking disabled", async () => {
  await withFetch([{ body: { stop_reason: "tool_use", usage, content: [{ type: "tool_use", name: "livrer", input: { a: "ok" } }] } }], async (bodies) => {
    const raw = await callAnthropic({
      model: "claude-haiku-5-5", system: "S", tool, temperature: 0.2, max_tokens: 300,
      messages: [{ role: "user", content: "Q" }, { role: "assistant", content: "prefill" }],
    });
    assertEquals(JSON.parse(raw), { a: "ok" });
    const b = bodies[0];
    assert(!("temperature" in b) && !("output_config" in b));
    assertEquals(b.thinking, { type: "disabled" });
    assertEquals(b.tool_choice, { type: "tool", name: "livrer" });
    assertEquals(b.messages.length, 1); // prefill retiré (400 sur Haiku 5.5)
    assertEquals(b.max_tokens, 390);
    assert(!String(b.system?.[0]?.text ?? b.system).includes("`livrer`")); // pas de consigne « auto » : l'outil est forcé
  });
});

Deno.test("streams Haiku 5.5 : sans temperature, thinking disabled, outil forcé", async () => {
  await withFetch([{ body: {} }], async (bodies) => {
    await streamAnthropicSSE("k", "claude-haiku-5-5", "S", [{ role: "user", content: "Q" }], 0.7, 1000);
    await streamAnthropicToolSSE("k", "claude-haiku-5-5", "S", [{ role: "user", content: "Q" }], 0.7, 1000, tool);
    for (const b of bodies) {
      assert(!("temperature" in b) && !("output_config" in b));
      assertEquals(b.thinking, { type: "disabled" });
      assertEquals(b.max_tokens, 1300);
    }
    assertEquals(bodies[1].tool_choice, { type: "tool", name: "livrer" });
  });
});
