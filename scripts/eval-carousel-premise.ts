// Opt-in semantic regression: exercises the production final judge on fixed,
// synthetic cases. No database, saved drafts, UI actions or image upload.
// Deno run --no-config --no-lock --node-modules-dir=none --allow-env --allow-read
//   --allow-net=api.anthropic.com scripts/eval-carousel-premise.ts --run
import { reviewCarouselProgression } from "../supabase/functions/_shared/carousel-progression.ts";
const allFixtures = JSON.parse(await Deno.readTextFile(new URL("./fixtures/carousel-premise.json", import.meta.url)));
const selectedId = Deno.args.find((arg) => arg.startsWith("--case="))?.slice(7);
const fixtures = allFixtures.filter((f:any) => !selectedId || f.id === selectedId);
if (!fixtures.length) throw new Error("Unknown fixture");
if (!Deno.args.includes("--run")) {
  console.log(JSON.stringify({mode:"dry",cases:fixtures.map((f:any)=>({id:f.id,expected:f.expected})),max_calls:8}));
  Deno.exit();
}
if (!Deno.env.get("ANTHROPIC_API_KEY")) throw new Error("Provider unavailable; no calls made");
const originalFetch = globalThis.fetch;
let calls = 0;
let trajectoryOutputs: unknown[] = [];
globalThis.fetch = (async (url:any, init?:RequestInit) => {
  const body = JSON.parse(String(init?.body));
  if (url !== "https://api.anthropic.com/v1/messages" || calls >= 8 || body.max_tokens > 8192 || body.tools?.[0]?.name !== "juger_progression") throw new Error("Unexpected call or evaluation budget exceeded");
  calls++;
  const response = await originalFetch(url,init);
  if (response.ok) {
    const data = await response.clone().json();
    // Synthetic fixtures only. Capture the public tool field needed to diagnose
    // an invalid report, never reasoning blocks, credentials or request headers.
    for (const block of data.content || []) if (block.type === "tool_use" && block.name === "juger_progression") trajectoryOutputs.push(block.input?.trajectory ?? null);
  }
  return response;
}) as typeof fetch;
let failures = 0;
try {
  for (const fixture of fixtures) {
    trajectoryOutputs = [];
    const result = await reviewCarouselProgression(fixture.doc,{sources:fixture.sources ?? [{id:"request",provenance:"user",text:fixture.source}],abortTimeoutMs:60000});
    const pass = result.execution_status === "completed" && result.verdict === fixture.expected && (!fixture.expected_trajectory || result.report?.trajectory?.kind === fixture.expected_trajectory);
    if (!pass) failures++;
    console.log(JSON.stringify({id:fixture.id,expected:fixture.expected,pass,result,...(result.execution_status === "invalid" ? {invalid_trajectory_outputs:trajectoryOutputs} : {})}));
  }
} finally {globalThis.fetch = originalFetch;}
console.log(JSON.stringify({calls,failures,cases:fixtures.length}));
if(failures) Deno.exit(1);
