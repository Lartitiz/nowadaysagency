// Opt-in semantic regression: exercises the production final judge on fixed,
// synthetic cases. No database, saved drafts, UI actions or image upload.
// Deno run --no-config --no-lock --node-modules-dir=none --allow-env --allow-read 
//   --allow-net=api.anthropic.com scripts/eval-carousel-premise.ts --run
import { reviewCarouselProgression } from "../supabase/functions/_shared/carousel-progression.ts";
const fixtures = JSON.parse(await Deno.readTextFile(new URL("./fixtures/carousel-premise.json", import.meta.url)));
if (!Deno.args.includes("--run")) {
  console.log(JSON.stringify({mode:"dry",cases:fixtures.map((f:any)=>({id:f.id,expected:f.expected})),max_calls:8}));
  Deno.exit();
}
if (!Deno.env.get("ANTHROPIC_API_KEY")) throw new Error("Provider unavailable; no calls made");
const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = (async (url:any, init?:RequestInit) => {
  const body = JSON.parse(String(init?.body));
  if (url !== "https://api.anthropic.com/v1/messages" || calls >= 8 || body.max_tokens > 8192 || body.tools?.[0]?.name !== "juger_progression") throw new Error("Unexpected call or evaluation budget exceeded");
  calls++;
  return originalFetch(url,init);
}) as typeof fetch;
let failures = 0;
try {
  for (const fixture of fixtures) {
    const result = await reviewCarouselProgression(fixture.doc,{sources:[{id:"request",provenance:"user",text:fixture.source}],abortTimeoutMs:60000});
    const pass = result.execution_status === "completed" && result.verdict === fixture.expected;
    if (!pass) failures++;
    console.log(JSON.stringify({id:fixture.id,expected:fixture.expected,pass,result}));
  }
} finally {globalThis.fetch = originalFetch;}
console.log(JSON.stringify({calls,failures,cases:fixtures.length}));
if(failures) Deno.exit(1);
