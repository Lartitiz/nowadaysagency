import { assertEquals, assert, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateDeepIdeas } from "./pipeline.ts";
import { extractIdeaSources } from "./research.ts";
const idea = { subject: "Un détail d'usage", angle: "Analyse", insight: "Une distinction précise", mechanism: "Un mécanisme expliqué", reader_benefit: "Choisir selon son besoin", outline: ["Montrer", "Expliquer"], example: "Un exemple fictif", nuance: "Une limite concrète", grounding: "Un public précis", objective_tag: "credibilite", source_ids: [], to_verify: [] };
Deno.test("direct subjectless entry researches internally and formulates 4 developed ideas", async () => {
  const calls: any[] = []; let researches = 0;
  const result = await generateDeepIdeas({ context: "Céramiste sans histoire personnelle fournie", history: "", previous: [{ subject: "Prix", insight: "Temps de travail" }] }, {
    model: "claude-opus-5-5", apiKey: "not-a-secret", call: async (o, u) => { calls.push(o); if (u) u.total_tokens = 20; return calls.length === 1 ? JSON.stringify({ candidates: [1, 2, 3, 4, 5, 6].map(i => ({ ...idea, subject: `Piste ${i}` })), research_queries: ["Pourquoi la forme d'une anse change sa prise en main ?"] }) : JSON.stringify({ ideas: [{ ...idea, subject: `Idée ${calls.length}` }] }); },
    research: async (q) => { researches++; assertEquals(q.length, 1); return { sources: [], status: "unavailable" }; },
  });
  assertEquals(calls.length, 5); assert(calls[0].max_tokens >= 3000); assert(calls[1].max_tokens >= 2000); assertEquals(researches, 1); assertEquals(result.ideas.length, 4); assertEquals(result.usage.total_tokens, 100);
  assert(calls[1].system.includes("retire les affirmations")); assert(calls[0].system.includes("Temps de travail"));
});
Deno.test("a duplicate parallel idea is replaced once by a reserve candidate", async () => {
  let calls = 0;
  const result = await generateDeepIdeas({ context: "Céramiste", history: "" }, {
    model: "claude-opus-5-5", apiKey: "", call: async (o) => { calls++; if (calls === 1) return JSON.stringify({ candidates: [1, 2, 3, 4, 5, 6].map(i => ({ ...idea, subject: `Piste ${i}` })), research_queries: [] }); const prompt = o.messages[0].content as string; const n = prompt.match(/piste n°(\d)/)?.[1]; return JSON.stringify({ ideas: [{ ...idea, subject: n === "2" ? "Idée 1" : `Idée ${n}` }] }); },
    research: async (q) => { assertEquals(q.length, 0); return { sources: [], status: "not_needed" }; },
  });
  assertEquals(calls, 6); assertEquals(result.ideas.map(i => i.subject).sort(), ["Idée 1", "Idée 3", "Idée 4", "Idée 5"]);
});
Deno.test("deepen preserves one selected thesis and rejects incomplete outputs without a paid retry cascade", async () => {
  let calls = 0;
  await assertRejects(() => generateDeepIdeas({ context: "Formatrice", history: "" }, {
    model: "claude-opus-5-5", apiKey: "", call: async () => { calls++; return calls === 1 ? '{"candidates":[{"subject":"A"}],"research_queries":[]}' : '{"ideas":[{"subject":"Un titre seul"}]}'; }, research: async () => ({ sources: [], status: "not_needed" }),
  }));
  assertEquals(calls, 2);
});
Deno.test("sources use actual citation metadata, never a prose URL", () => {
  const sources = extractIdeaSources([{ type: "text", text: "Une assertion", citations: [{ url: "javascript:bad" }, { url: "https://example.org/source", title: "Source primaire" }] }, { type: "text", text: "Source prétendue https://invented.example" }], "2026-09-16");
  assertEquals(sources.length, 1); assertEquals(sources[0].claim, "Une assertion"); assertEquals(sources[0].url, "https://example.org/source");
});
Deno.test("each developed idea is emitted as soon as it is ready, before the slowest one", async () => {
  let calls = 0; let releaseSlow!: () => void; const slow = new Promise<void>(r => { releaseSlow = r; });
  const events: any[] = [];
  const pending = generateDeepIdeas({ context: "Céramiste", history: "", onEvent: e => events.push(e) }, {
    model: "claude-opus-5-5", apiKey: "", call: async (o) => {
      calls++; if (calls === 1) return JSON.stringify({ candidates: [1, 2, 3, 4, 5, 6].map(i => ({ ...idea, subject: `Piste ${i}` })), research_queries: [] });
      const n = (o.messages[0].content as string).match(/piste n°(\d)/)?.[1];
      if (n === "1") await slow; // the first-ranked idea is the slowest
      if (n === "2") throw new Error("timeout"); // a failure starts its reserve at once
      return JSON.stringify({ ideas: [{ ...idea, subject: `Idée ${n}` }] });
    },
    research: async () => ({ sources: [], status: "not_needed" }),
  });
  for (let i = 0; i < 20 && events.filter(e => e.type === "idea").length < 3; i++) await new Promise(r => setTimeout(r, 0));
  assertEquals(events.filter(e => e.type === "stage").map(e => e.stage), ["research", "writing"]);
  assertEquals(events.filter(e => e.type === "idea").map(e => e.idea.subject), ["Idée 3", "Idée 4", "Idée 5"]);
  releaseSlow();
  const result = await pending;
  assertEquals(events.filter(e => e.type === "idea").map(e => e.ready), [1, 2, 3, 4]);
  assertEquals(result.ideas.map(i => i.subject), ["Idée 3", "Idée 4", "Idée 5", "Idée 1"]);
});
const sse = (text: string, stop = "end_turn") => new ReadableStream<Uint8Array>({ start(c) {
  const e = new TextEncoder(); const send = (o: unknown) => c.enqueue(e.encode(`data: ${JSON.stringify(o)}\n\n`));
  send({ type: "message_start", message: { usage: { input_tokens: 7 } } });
  for (let i = 0; i < text.length; i += 9) send({ type: "content_block_delta", delta: { type: "text_delta", text: text.slice(i, i + 9) } });
  send({ type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 3 } }); c.close();
} });
Deno.test("streamed mode shows the 4 pistes, then each idea while it is written, in its slot", async () => {
  const events: any[] = []; let classic = 0;
  const realNow = Date.now; let clock = 0; Date.now = () => (clock += 1000);
  try {
    const result = await generateDeepIdeas({ context: "Céramiste", history: "", onEvent: e => events.push(e) }, {
      model: "claude-opus-5-5", apiKey: "", call: async () => { classic++; return ""; }, research: async () => ({ sources: [], status: "not_needed" }),
      stream: async (_m, _s, user) => {
        if (user.includes("Explore 6 pistes")) return sse(JSON.stringify({ candidates: [1, 2, 3, 4, 5, 6].map(i => ({ subject: `Piste ${i}`, insight: "x", grounding: "y" })), research_queries: [] }));
        const n = user.match(/piste n°(\d)/)![1];
        return sse(JSON.stringify({ ideas: [{ ...idea, subject: `Idée — ${n}`, insight: "Une \"thèse\" précise" }] }));
      },
    });
    assertEquals(classic, 0);
    assertEquals(result.ideas.length, 4); assertEquals(result.usage.total_tokens, 50);
    const pistes = events.filter(e => e.type === "draft" && !e.fields && e.piste);
    assertEquals(pistes.slice(0, 4).map(e => [e.slot, e.piste]), [[0, "Piste 1"], [1, "Piste 2"], [2, "Piste 3"], [3, "Piste 4"]]);
    // Pistes arrive before research starts: the screen has something to show early.
    assert(events.findIndex(e => e.type === "draft") < events.findIndex(e => e.stage === "research"));
    const live = events.filter(e => e.type === "draft" && e.fields);
    assert(live.length >= 4);
    assert(live.every(e => !e.fields.subject.includes("—")), "same dash cleaning as final ideas");
    assert(live.some(e => e.fields.insight === "Une \"thèse\" précise"));
    assertEquals(events.filter(e => e.type === "idea").map(e => e.slot).sort(), [0, 1, 2, 3]);
  } finally { Date.now = realNow; }
});
Deno.test("a broken stream falls back to the classic call with the same prompt", async () => {
  const events: any[] = []; let classic = 0;
  const result = await generateDeepIdeas({ context: "Céramiste", history: "", onEvent: e => events.push(e) }, {
    model: "claude-opus-5-5", apiKey: "", research: async () => ({ sources: [], status: "not_needed" }),
    stream: async () => sse('{"ideas":[{"subject":"coupé', "max_tokens"),
    call: async (o) => { classic++; const user = o.messages[0].content as string;
      if (user.includes("Explore 6 pistes")) return JSON.stringify({ candidates: [1, 2, 3, 4, 5].map(i => ({ subject: `Piste ${i}` })), research_queries: [] });
      const n = user.match(/piste n°(\d)/)![1]; return JSON.stringify({ ideas: [{ ...idea, subject: n === "2" ? "Idée 1" : `Idée ${n}` }] }); },
  });
  assertEquals(classic, 6); // preparation + 4 + 1 reserve, each after its stream failed
  assertEquals(result.ideas.length, 4);
  assertEquals(result.usage.total_tokens, 0); // classic mock reports no usage: nothing left from the broken stream
});
