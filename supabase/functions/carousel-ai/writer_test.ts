import { assert, assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callCarouselWriter, pickCarouselWriter, writerRequest, writerResponse, type CarouselWriterOptions } from "./writer.ts";
import { AnthropicError } from "../_shared/anthropic.ts";

const base: CarouselWriterOptions = { model: "claude-opus-5", system: "Sources et voix", messages: [{ role: "user", content: "Brief" }], temperature: 0.85, max_tokens: 8192 };
const tool = { name: "livrer_carrousel", input_schema: { type: "object", properties: { slides: { type: "array" }, photo_mismatch: { type: "object" } } } };
const usage = { input_tokens: 10, output_tokens: 20, output_tokens_details: { reasoning_tokens: 12 } };
const opus = { model: "claude-opus-5", stop_reason: "end_turn", usage, content: [{ type: "thinking", thinking: "not visible" }, { type: "text", text: "Texte" }] };
const astra = { model: "gpt-6-astra", status: "completed", usage, output: [{ type: "reasoning", summary: [] }, { type: "message", content: [{ type: "output_text", text: "Texte" }] }] };

Deno.test("explicit normal/Max routing; no silent escalation", () => {
  const old = Deno.env.get("CAROUSEL_MAX_WRITER");
  Deno.env.delete("CAROUSEL_MAX_WRITER");
  try {
    assertEquals(pickCarouselWriter({}), "claude-opus-5-5");
    assertEquals(pickCarouselWriter({ quality_max: false }), "claude-opus-5-5");
    assertEquals(pickCarouselWriter({ quality_max: true }), "claude-fable-5-1");
    // Banc d'essai (retour à Opus 5) : valeur exacte seulement, Qualité Max prioritaire.
    assertEquals(pickCarouselWriter({ writer_bench: "claude-opus-5" }), "claude-opus-5");
    assertEquals(pickCarouselWriter({ writer_bench: "claude-opus-5", quality_max: true }), "claude-fable-5-1");
    assertEquals(pickCarouselWriter({ writer_bench: "claude-fable-5-1" }), "claude-opus-5-5");
    // Retour arrière par secret : liste blanche stricte, le mode standard n'est jamais touché.
    Deno.env.set("CAROUSEL_MAX_WRITER", "gpt-6-astra");
    assertEquals(pickCarouselWriter({ quality_max: true }), "gpt-6-astra");
    assertEquals(pickCarouselWriter({}), "claude-opus-5-5");
    Deno.env.set("CAROUSEL_MAX_WRITER", "claude-mythos-5-1");
    assertEquals(pickCarouselWriter({ quality_max: true }), "claude-fable-5-1");
  } finally {
    if (old === undefined) Deno.env.delete("CAROUSEL_MAX_WRITER"); else Deno.env.set("CAROUSEL_MAX_WRITER", old);
  }
});
Deno.test("Fable 5.1 (Max) : outil en auto, réflexion adaptative, effort medium, marge de tokens", () => {
  const request = writerRequest({ ...base, model: "claude-fable-5-1", tool });
  assertEquals(request.model, "claude-fable-5-1");
  assertEquals(request.thinking, { type: "adaptive" });
  assertEquals(request.output_config, { effort: "medium" });
  assertEquals(request.tool_choice, { type: "auto", disable_parallel_tool_use: true });
  assert((request.system as any[])[0].text.includes("`livrer_carrousel`"));
  assertEquals(request.max_tokens, 16000);
  assert(!("temperature" in request));
});
Deno.test("Opus 5.5: never forced tool nor disabled thinking (both 400), room for thinking", () => {
  const request = writerRequest({ ...base, model: "claude-opus-5-5", tool });
  assertEquals(request.model, "claude-opus-5-5");
  assertEquals(request.thinking, { type: "adaptive" });
  assertEquals(request.output_config, { effort: "medium" });
  assertEquals(request.tool_choice, { type: "auto", disable_parallel_tool_use: true });
  assertEquals(request.tools, [tool]);
  assert((request.system as any[])[0].text.startsWith("Sources et voix"));
  assert((request.system as any[])[0].text.includes("`livrer_carrousel`"));
  assertEquals(request.max_tokens, 16000);
  assertEquals(writerRequest({ ...base, model: "claude-opus-5-5", max_tokens: 20000 }).max_tokens, 20000);
  assert(!("temperature" in request));
  // Opus 5 inchangé : consigne d'outil absente, max_tokens tel quel.
  const opus5 = writerRequest({ ...base, tool });
  assertEquals((opus5.system as any[])[0].text, "Sources et voix");
  assertEquals(opus5.max_tokens, 8192);
});
Deno.test("Opus refusal is a clear error, never a success", () => {
  const sink = {};
  assertThrows(() => writerResponse({ ...opus, model: "claude-opus-5-5", stop_reason: "refusal", content: [] }, { ...base, model: "claude-opus-5-5" }, sink), AnthropicError, "refusé");
  assertEquals(sink, {});
});
Deno.test("Opus 5.5 without tool call: one retry on the same model, then success or clear error", async () => {
  const oldKey = Deno.env.get("ANTHROPIC_API_KEY"), oldFetch = globalThis.fetch;
  Deno.env.set("ANTHROPIC_API_KEY", "fake-secret");
  const noTool = { ...opus, model: "claude-opus-5-5", content: [{ type: "thinking", thinking: "" }, { type: "text", text: "Voici" }] };
  const withTool = { ...opus, model: "claude-opus-5-5", content: [{ type: "tool_use", name: tool.name, input: { slides: [] } }] };
  for (const [second, ok] of [[withTool, true], [noTool, false]] as const) {
    let calls = 0;
    globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assertEquals(body.model, "claude-opus-5-5");
      assertEquals(body.tool_choice.type, "auto");
      return Promise.resolve(new Response(JSON.stringify(calls === 1 ? noTool : second)));
    }) as typeof fetch;
    try {
      const options = { ...base, model: "claude-opus-5-5" as const, tool };
      if (ok) assertEquals(JSON.parse(await callCarouselWriter(options)), { slides: [] });
      else await assertRejects(() => callCarouselWriter(options), AnthropicError);
      assertEquals(calls, 2);
    } finally { globalThis.fetch = oldFetch; }
  }
  if (oldKey === undefined) Deno.env.delete("ANTHROPIC_API_KEY"); else Deno.env.set("ANTHROPIC_API_KEY", oldKey);
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
Deno.test("Max : crédit fournisseur épuisé distingué d'une saturation sans exposer son message privé",async()=>{
  const oldKey=Deno.env.get("OPENAI_API_KEY"),oldFetch=globalThis.fetch;
  Deno.env.set("OPENAI_API_KEY","fake-secret");
  globalThis.fetch=(()=>Promise.resolve(new Response(JSON.stringify({error:{code:"credit_balance_exhausted",type:"insufficient_quota",message:"PRIVATE_ACCOUNT_DETAILS"}}),{status:429}))) as typeof fetch;
  try{
    const error=await assertRejects(()=>callCarouselWriter({...base,model:"gpt-6-astra"}),AnthropicError);
    assert(error.message.includes("épuisé"));assert(error.message.includes("mode standard"));
    assert(!error.message.includes("PRIVATE_ACCOUNT_DETAILS"));
  }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)Deno.env.delete("OPENAI_API_KEY");else Deno.env.set("OPENAI_API_KEY",oldKey);}
});
for(const model of ["claude-opus-5", "claude-opus-5-5", "claude-fable-5-1", "gpt-6-astra"] as const) Deno.test(`HTTP ${model}: correct destination; errors never retry/downgrade/leak provider body`, async () => {
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

// 07/10/2026 : slides en brouillon pendant l'écriture → réponse en flux.
const sse = (events: any[], chunk = 17) => {
  const raw = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new ReadableStream<Uint8Array>({ start(c) { const b = new TextEncoder().encode(raw); for (let i = 0; i < b.length; i += chunk) c.enqueue(b.slice(i, i + chunk)); c.close(); } });
};
const streamed = (stop = "end_turn") => [
  { type: "message_start", message: { model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 5 } } },
  { type: "content_block_start", index: 0, content_block: { type: "thinking" } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "secret" } },
  { type: "content_block_start", index: 1, content_block: { type: "text" } },
  { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: '{"slides":[{"title":"A"},' } },
  { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: '{"title":"B"}]}' } },
  { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 20 } },
  { type: "message_stop" },
];
Deno.test("rédaction en flux : texte visible seulement, mêmes contrôles et même usage qu'une réponse classique", async () => {
  const oldFetch = globalThis.fetch, oldKey = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.set("ANTHROPIC_API_KEY", "test");
  const seen: string[] = []; let body: any;
  try {
    globalThis.fetch = (async (_url: any, init: any) => { body = JSON.parse(init.body); return new Response(sse(streamed()), { status: 200, headers: { "content-type": "text/event-stream" } }); }) as typeof fetch;
    const sink: any = {};
    const text = await callCarouselWriter({ ...base, model: "claude-opus-5-5", onText: (t) => seen.push(t) }, sink);
    assertEquals(body.stream, true);
    assert(!("onText" in body));
    assertEquals(text, '{"slides":[{"title":"A"},{"title":"B"}]}');
    assertEquals(seen.at(-1), text);
    assert(seen.every((t) => !t.includes("secret")));
    assertEquals(sink, { model: "claude-opus-5-5", input_tokens: 15, output_tokens: 20, total_tokens: 35 });
    // Coupure par max_tokens : même refus qu'en réponse classique.
    globalThis.fetch = (async () => new Response(sse(streamed("max_tokens")), { status: 200 })) as typeof fetch;
    await assertRejects(() => callCarouselWriter({ ...base, model: "claude-opus-5-5", onText: () => {} }), AnthropicError, "pas complète");
    // Erreur en plein flux : erreur claire, jamais un texte tronqué livré.
    globalThis.fetch = (async () => new Response(sse([streamed()[0], { type: "error", error: { type: "overloaded_error", message: "x" } }]), { status: 200 })) as typeof fetch;
    await assertRejects(() => callCarouselWriter({ ...base, model: "claude-opus-5-5", onText: () => {} }), AnthropicError, "saturé");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) Deno.env.delete("ANTHROPIC_API_KEY"); else Deno.env.set("ANTHROPIC_API_KEY", oldKey);
  }
});
Deno.test("rédaction en flux : jamais avec un outil ni pour Astra", () => {
  assert(!("stream" in writerRequest({ ...base, model: "claude-opus-5-5", tool, onText: () => {} })));
  assert(!("stream" in writerRequest({ ...base, model: "gpt-6-astra", onText: () => {} })));
  assertEquals(writerRequest({ ...base, model: "claude-opus-5-5", onText: () => {} }).stream, true);
  assert(!("stream" in writerRequest({ ...base, model: "claude-opus-5-5" })));
});
