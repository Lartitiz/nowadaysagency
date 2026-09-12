// Opt-in, four existing/fictitious drafts. No generation, DB, image, or saved text.
// Run once: deno run --allow-env --allow-read --allow-net=api.openai.com scripts/eval-carousel-astra-review.ts --run
import { applyGuardedCarouselCorrection } from "../supabase/functions/_shared/redac-gate.ts";
import { carouselEditorialFields } from "../supabase/functions/_shared/carousel-editorial-review.ts";

const fixtures = JSON.parse(await Deno.readTextFile(new URL("./fixtures/carousel-review-astra.json", import.meta.url)));
if (!Deno.args.includes("--run")) {
  console.log(JSON.stringify({ mode: "dry", cases: fixtures.map((f: any) => f.id), max_calls: 4, api_budget_usd: 3 }));
  Deno.exit();
}
if (!Deno.env.get("OPENAI_API_KEY")) throw new Error("OpenAI key unavailable; no calls made");
const originalFetch = globalThis.fetch;
let calls = 0, reservedUSD = 0;
let responseEvidence: any = null;
globalThis.fetch = (async (url: any, init?: RequestInit) => {
  if (url !== "https://api.openai.com/v1/responses" || calls >= 4) throw new Error("Unexpected provider or extra call forbidden");
  const body = JSON.parse(String(init?.body));
  if (body.model !== "gpt-6-astra" || body.reasoning?.effort !== "medium" || body.store !== false || body.max_output_tokens !== 8192 || body.tool_choice?.name !== "review_carousel_fields") throw new Error("Unexpected review contract");
  // UTF-8 request bytes conservatively bound text input tokens; no images/tools
  // with external execution are permitted. Reserve the entire output ceiling.
  const ceiling = new TextEncoder().encode(String(init?.body)).length * 10 / 1e6 + 8192 * 50 / 1e6;
  if (reservedUSD + ceiling > 3) throw new Error("Budget ceiling reached; no further request");
  reservedUSD += ceiling;
  calls++;
  const response = await originalFetch(url, init);
  if (response.ok) {
    const data = await response.clone().json();
    // Exclude all provider reasoning, credentials, headers, and unrelated fields.
    responseEvidence = { model: data.model, status: data.status, usage: data.usage,
      reviews: data.output?.filter((o: any) => o.type === "function_call" && o.name === "review_carousel_fields").map((o: any) => JSON.parse(o.arguments)) };
  } else responseEvidence = { http_status: response.status };
  return response;
}) as typeof fetch;

try {
  for (const fixture of fixtures) {
    responseEvidence = null;
    const started = performance.now(), beforeCalls = calls;
    const output = JSON.parse(await applyGuardedCarouselCorrection(JSON.stringify(fixture.doc), {
      inputText: fixture.source,
      correction: { semanticReview: true, currentBrief: fixture.source,
        authoredText: fixture.authoredText || "", enabled: true, abortTimeoutMs: 60000 },
    }));
    const usage = responseEvidence?.usage;
    const after = carouselEditorialFields(output).map(f => f.text).join("\n");
    console.log(JSON.stringify({ id: fixture.id, latency_ms: Math.round(performance.now() - started),
      calls: calls - beforeCalls, provider: responseEvidence,
      estimated_api_usd: usage ? (usage.input_tokens * 10 + usage.output_tokens * 50) / 1e6 : null,
      output, changed_fields: carouselEditorialFields(fixture.doc).filter(f => carouselEditorialFields(output).find(o => o.id === f.id)?.text !== f.text).map(f => f.id),
      residual_exact_regressions: ["elles ne se lisent pas entre elles", "je ne fais pas une version de chaque", "la refaire ensuite", "tout le monde en même temps", "une seule fois", "C'est un signal, pas un accident", "Une matière discrète, une vérité qui s'impose"].filter(t => after.includes(t)),
    }));
    if (calls !== beforeCalls + 1 || output.editorial_review?.status !== "reviewed") break;
  }
  console.log(JSON.stringify({ completed_calls: calls, reserved_ceiling_usd: reservedUSD, max_calls: 4, api_budget_usd: 3 }));
} finally { globalThis.fetch = originalFetch; }
