import { assert, assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callCarouselWriter, pickCarouselWriter, writerRequest, writerResponse, type CarouselWriterOptions } from "./writer.ts";
import { AnthropicError } from "../_shared/anthropic.ts";

const base: CarouselWriterOptions = { model: "claude-opus-5", system: "Sources et voix", messages: [{ role: "user", content: "Brief" }], temperature: 0.85, max_tokens: 8192 };
const tool = { name: "livrer_carrousel", input_schema: { type: "object", properties: { slides: { type: "array" }, photo_mismatch: { type: "object" } } } };
const usage = { input_tokens: 10, output_tokens: 20, output_tokens_details: { reasoning_tokens: 12 } };
const opus = { model: "claude-opus-5", stop_reason: "end_turn", usage, content: [{ type: "thinking", thinking: "not visible" }, { type: "text", text: "Texte" }] };
const astra = { model: "gpt-6-astra", status: "completed", usage, output: [{ type: "reasoning", summary: [] }, { type: "message", content: [{ type: "output_text", text: "Texte" }] }] };

Deno.test("explicit normal/Max routing; no env alias or silent escalation", () => {
  assertEquals(pickCarouselWriter({}), "claude-opus-5");
  assertEquals(pickCarouselWriter({ quality_max: false }), "claude-opus-5");
  assertEquals(pickCarouselWriter({ quality_max: true }), "gpt-6-astra");
});
Deno.test("Opus adaptive medium + forced tool, no unsupported sampling", () => {
  const request = writerRequest({ ...base, tool });
  assertEquals(request.thinking, { type: "adaptive" });
  assertEquals(request.output_config, { effort: "medium" });
  assertEquals(request.tool_choice, { type: "tool", name: tool.name });
  assertEquals(request.tools, [tool]);
  assert(!("temperature" in request));
});
Deno.test("Astra Responses medium, no storage/sampling; schema optionality preserved", () => {
  const request = writerRequest({ ...base, model: "gpt-6-astra", tool });
  assertEquals(request.reasoning, { effort: "medium" });
  assertEquals(request.store, false);
  assertEquals(request.service_tier, "default");
  assertEquals(request.max_output_tokens, 8192);
  assertEquals(request.parallel_tool_calls, false);
  assertEquals((request.tools as any[])[0].parameters, tool.input_schema);
  assertEquals((request.tools as any[])[0].strict, false);
  assertEquals(request.tool_choice, { type: "function", name: tool.name });
  assert(!("temperature" in request));
});
Deno.test("Astra keeps photo ordering, MIME and interleaved descriptions", () => {
  const content = [{ type: "text", text: "Photo 1" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" } }, { type: "text", text: "Fin" }];
  const request = writerRequest({ ...base, model: "gpt-6-astra", messages: [{ role: "user", content }] });
  assertEquals((request.input as any[])[0].content, [{ type: "input_text", text: "Photo 1" }, { type: "input_image", image_url: "data:image/png;base64,aGVsbG8=" }, { type: "input_text", text: "Fin" }]);
  assertEquals(content[1].type, "image");
  assertThrows(() => writerRequest({ ...base, model: "gpt-6-astra", messages: [{ role: "user", content: [{ type: "document" }] }] }), AnthropicError);
});
Deno.test("both providers exclude hidden thinking; usage includes reasoning once", () => {
  for (const data of [opus, astra]) {
    const sink = {};
    assertEquals(writerResponse(data, { ...base, model: data.model as any }, sink), "Texte");
    assertEquals(sink, { model: data.model, input_tokens: 10, output_tokens: 20, total_tokens: 30 });
  }
});
Deno.test("Opus cache usage included and provided punctuation preservation available", () => {
  const sink: any = {};
  const data = { ...opus, usage: { ...usage, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 }, content: [{ type: "text", text: "Texte — exact" }] };
  assertEquals(writerResponse(data, { ...base, keepDashes: true }, sink), "Texte — exact");
  assertEquals(sink.total_tokens, 37);
});
Deno.test("tools return full JSON including refusal and unknown visual fields", () => {
  const value = { photo_mismatch: { reason: "Décalage" }, slides: [{ news_entity: "Entité", photo_index: 2 }] };
  for (const openai of [false, true]) {
    const options = { ...base, model: openai ? "gpt-6-astra" : "claude-opus-5", tool } as CarouselWriterOptions;
    const data = openai ? { ...astra, output: [{ type: "function_call", name: tool.name, arguments: JSON.stringify(value) }] } : { ...opus, content: [{ type: "tool_use", name: tool.name, input: value }] };
    assertEquals(JSON.parse(writerResponse(data, options)), value);
  }
});
for(const [name, data] of [
  ["truncated", { ...astra, status: "incomplete" }],
  ["model mismatch", { ...astra, model: "other" }],
  ["empty/refusal", { ...astra, output: [] }],
  ["usage absent", { ...astra, usage: {} }],
] as const) Deno.test(`Astra ${name} fails before successful usage`, () => {
  const sink = {};
  assertThrows(() => writerResponse(data, { ...base, model: "gpt-6-astra" }, sink), AnthropicError);
  assertEquals(sink, {});
});
Deno.test("Opus truncation and wrong/invalid tool never succeed", () => {
  assertThrows(() => writerResponse({ ...opus, stop_reason: "max_tokens" }, base), AnthropicError);
  assertThrows(() => writerResponse(opus, { ...base, tool }), AnthropicError);
  assertThrows(() => writerResponse({ ...astra, output: [{ type: "function_call", name: tool.name, arguments: "{" }] }, { ...base, model: "gpt-6-astra", tool }), AnthropicError);
});
for(const model of ["claude-opus-5", "gpt-6-astra"] as const) Deno.test(`HTTP ${model}: correct destination; errors never retry/downgrade/leak provider body`, async () => {
  const name = model === "gpt-6-astra" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  const oldKey = Deno.env.get(name), oldFetch = globalThis.fetch;
  Deno.env.set(name, "fake-secret");
  let calls = 0;
  globalThis.fetch = ((url: unknown, init?: RequestInit) => {
    calls++;
    assertEquals(String(url), model === "gpt-6-astra" ? "https://api.openai.com/v1/responses" : "https://api.anthropic.com/v1/messages");
    assertEquals(JSON.parse(String(init?.body)).model, model);
    return Promise.resolve(new Response("private error content", { status: 500 }));
  }) as typeof fetch;
  try {
    const error = await assertRejects(() => callCarouselWriter({ ...base, model }), AnthropicError);
    assert(!error.message.includes("private"));
    assertEquals(calls, 1);
    Deno.env.delete(name);
    await assertRejects(() => callCarouselWriter({ ...base, model }), AnthropicError);
    assertEquals(calls, 1);
  } finally { globalThis.fetch = oldFetch; if(oldKey === undefined) Deno.env.delete(name); else Deno.env.set(name, oldKey); }
});
