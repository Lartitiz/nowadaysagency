import { assertEquals, assert, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateDeepIdeas } from "./pipeline.ts";
import { extractIdeaSources } from "./research.ts";
const idea = { subject: "Un détail d'usage", angle: "Analyse", insight: "Une distinction précise", mechanism: "Un mécanisme expliqué", reader_benefit: "Choisir selon son besoin", outline: ["Montrer", "Expliquer"], example: "Un exemple fictif", nuance: "Une limite concrète", grounding: "Un public précis", objective_tag: "credibilite", source_ids: [], to_verify: [] };
Deno.test("direct subjectless entry researches internally and formulates 4 developed ideas", async () => {
  const calls: any[] = []; let researches = 0;
  const result = await generateDeepIdeas({ context: "Céramiste sans histoire personnelle fournie", history: "", previous: [{ subject: "Prix", insight: "Temps de travail" }] }, {
    model: "claude-opus-4-8", apiKey: "not-a-secret", call: async (o, u) => { calls.push(o); if (u) u.total_tokens = 20; return calls.length === 1 ? JSON.stringify({ candidates: [idea], research_queries: ["Pourquoi la forme d'une anse change sa prise en main ?"] }) : JSON.stringify({ ideas: [1, 2, 3, 4].map(i => ({ ...idea, subject: `Idée ${i}` })) }); },
    research: async (q) => { researches++; assertEquals(q.length, 1); return { sources: [], status: "unavailable" }; },
  });
  assertEquals(calls.length, 2); assert(calls[0].max_tokens >= 3000); assert(calls[1].max_tokens >= 8000); assertEquals(researches, 1); assertEquals(result.ideas.length, 4); assertEquals(result.usage.total_tokens, 40);
  assert(calls[1].system.includes("retire les affirmations")); assert(calls[0].system.includes("Temps de travail"));
});
Deno.test("deepen preserves one selected thesis and rejects incomplete outputs without a paid retry cascade", async () => {
  let calls = 0;
  await assertRejects(() => generateDeepIdeas({ context: "Formatrice", history: "" }, {
    model: "claude-opus-4-8", apiKey: "", call: async () => { calls++; return calls === 1 ? '{"candidates":[{"subject":"A"}],"research_queries":[]}' : '{"ideas":[{"subject":"Un titre seul"}]}'; }, research: async () => ({ sources: [], status: "not_needed" }),
  }));
  assertEquals(calls, 2);
});
Deno.test("sources use actual citation metadata, never a prose URL", () => {
  const sources = extractIdeaSources([{ type: "text", text: "Une assertion", citations: [{ url: "javascript:bad" }, { url: "https://example.org/source", title: "Source primaire" }] }, { type: "text", text: "Source prétendue https://invented.example" }], "2026-09-16");
  assertEquals(sources.length, 1); assertEquals(sources[0].claim, "Une assertion"); assertEquals(sources[0].url, "https://example.org/source");
});
