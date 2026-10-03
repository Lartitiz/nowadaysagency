import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  clipSection, generateHiggsfieldImageSync, MARKETING_CREATE_MODEL, MARKETING_FIDELITY_MODEL, MARKETING_PROMPT_MAX,
  type SyncImageRequest,
} from "./higgsfield-image-api.ts";

const ID = "11111111-2222-3333-4444-555555555555";
const SPEND = "99999999-8888-7777-6666-555555555555";

function env(on = true) {
  Deno.env.set("HIGGSFIELD_DATA_USE_REVIEWED", "true");
  on ? Deno.env.set("HIGGSFIELD_IMAGE_ENABLED", "true") : Deno.env.delete("HIGGSFIELD_IMAGE_ENABLED");
  Deno.env.set("HIGGSFIELD_API_KEY", "id:secret");
  Deno.env.set("HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD", "50");
}

function fakeDb(rpc: { data?: unknown; error?: { message: string } | null } = { data: SPEND, error: null }) {
  const calls = { rpc: [] as unknown[], updates: [] as Record<string, unknown>[] };
  const db = {
    rpc: (name: string, args: unknown) => { calls.rpc.push({ name, args }); return Promise.resolve({ data: rpc.data, error: rpc.error ?? null }); },
    from: (_t: string) => ({
      update: (v: Record<string, unknown>) => ({ eq: () => { calls.updates.push(v); return Promise.resolve({ error: null }); } }),
    }),
  };
  return { db: db as never, calls };
}

type Step = (url: string, init?: RequestInit) => Response | Promise<Response>;
function stubFetch(steps: Step[]) {
  const original = globalThis.fetch;
  const seen: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push({ url, init });
    const step = steps.shift();
    if (!step) throw new Error(`unexpected fetch ${url}`);
    return Promise.resolve(step(url, init));
  }) as typeof fetch;
  // Env is process-wide: never leak the flags into other test files.
  const restore = () => {
    globalThis.fetch = original;
    for (const k of ["HIGGSFIELD_IMAGE_ENABLED", "HIGGSFIELD_DATA_USE_REVIEWED", "HIGGSFIELD_API_KEY", "HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD"]) Deno.env.delete(k);
  };
  return { seen, restore };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const req = (over: Partial<SyncImageRequest> = {}): SyncImageRequest => ({
  source: "product-on-model", userId: ID, workspaceId: null, model: MARKETING_FIDELITY_MODEL,
  prompt: "Stage the exact product.", format: "portrait", inputs: [new Blob(["x"], { type: "image/jpeg" })],
  deadline: Date.now() + 5_000, pollMs: 1, ...over,
});

const uploadSteps: Step[] = [
  () => json({ upload_url: "https://up.example.com/put", public_url: "https://cdn.example.com/p.jpg", upload_headers: { "Content-Type": "image/jpeg" } }),
  () => new Response(null, { status: 200 }),
];

Deno.test("sync Higgsfield: flag off or oversized prompt → nothing is called or reserved", async () => {
  const f = stubFetch([]);
  try {
    env(false);
    const { db, calls } = fakeDb();
    assertEquals(await generateHiggsfieldImageSync(db, req()), { ok: false, reason: "unavailable" });
    env(true);
    assertEquals(await generateHiggsfieldImageSync(db, req({ prompt: "x".repeat(MARKETING_PROMPT_MAX + 1) })), { ok: false, reason: "prompt_too_long" });
    assertEquals([f.seen.length, calls.rpc.length], [0, 0]);
  } finally { f.restore(); }
});

Deno.test("sync Higgsfield: upload → estimate → shared budget reservation → submit (no webhook) → poll → image", async () => {
  env();
  const f = stubFetch([
    ...uploadSteps,
    () => json({ type: "description", description: "token billed" }),
    () => json({ request_id: ID }),
    () => json({ request_id: ID, status: "in_progress" }),
    () => json({ request_id: ID, status: "completed", images: [{ url: "https://cdn.example.com/out.png" }] }),
    () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })),
  ]);
  try {
    const { db, calls } = fakeDb();
    const result = await generateHiggsfieldImageSync(db, req());
    assert(result.ok);
    assertEquals(result.blob.type, "image/png");
    assertEquals(calls.rpc, [{ name: "reserve_higgsfield_image_cost", args: {
      p_source: "product-on-model", p_user: ID, p_workspace: null, p_estimate: 0.33, p_monthly_limit: 50 } }]);
    assertEquals(calls.updates.map((u) => u.status), ["queued", "completed"]);
    const submit = f.seen[3];
    assertEquals(submit.url, `https://api.higgsfield.ai/${MARKETING_FIDELITY_MODEL}`);
    const body = JSON.parse(String(submit.init?.body));
    assertEquals(body, { prompt: "Stage the exact product.", quality: "high", resolution: "1k", aspect_ratio: "2:3",
      enhance_prompt: false, image_urls: ["https://cdn.example.com/p.jpg"] });
  } finally { f.restore(); }
});

Deno.test("sync Higgsfield: a creation without input sends no image_urls", async () => {
  env();
  const f = stubFetch([
    () => json({ type: "description" }),
    () => json({ request_id: ID }),
    () => json({ request_id: ID, status: "completed", images: [{ url: "https://cdn.example.com/out.jpg" }] }),
    () => new Response(new Blob([new Uint8Array([1])], { type: "image/jpeg" })),
  ]);
  try {
    const { db } = fakeDb();
    const result = await generateHiggsfieldImageSync(db, req({ source: "carousel-slide-image", model: MARKETING_CREATE_MODEL, inputs: [] }));
    assert(result.ok);
    assertEquals(f.seen[1].url, `https://api.higgsfield.ai/${MARKETING_CREATE_MODEL}`);
    assertEquals("image_urls" in JSON.parse(String(f.seen[1].init?.body)), false);
  } finally { f.restore(); }
});

Deno.test("sync Higgsfield: monthly budget refused → no submission", async () => {
  env();
  const f = stubFetch([...uploadSteps, () => json({ type: "description" })]);
  try {
    const { db, calls } = fakeDb({ data: null, error: { message: "studio_provider_budget" } });
    assertEquals(await generateHiggsfieldImageSync(db, req()), { ok: false, reason: "budget" });
    assertEquals([f.seen.length, calls.updates.length], [3, 0]);
  } finally { f.restore(); }
});

Deno.test("sync Higgsfield: a refused submission releases the reservation, never retried", async () => {
  env();
  const f = stubFetch([...uploadSteps, () => json({ type: "description" }), () => json({ detail: "no credits" }, 402)]);
  try {
    const { db, calls } = fakeDb();
    assertEquals(await generateHiggsfieldImageSync(db, req()), { ok: false, reason: "rejected" });
    assertEquals(calls.updates.map((u) => u.status), ["failed"]);
  } finally { f.restore(); }
});

Deno.test("sync Higgsfield: provider failure releases; timeout keeps the accepted request counted", async () => {
  env();
  let f = stubFetch([...uploadSteps, () => json({ type: "description" }), () => json({ request_id: ID }),
    () => json({ request_id: ID, status: "failed" })]);
  try {
    const { db, calls } = fakeDb();
    assertEquals(await generateHiggsfieldImageSync(db, req()), { ok: false, reason: "failed" });
    assertEquals(calls.updates.map((u) => u.status), ["queued", "failed"]);
  } finally { f.restore(); }
  env();
  f = stubFetch([...uploadSteps, () => json({ type: "description" }), () => json({ request_id: ID }),
    ...Array.from({ length: 50 }, () => () => json({ request_id: ID, status: "in_progress" }))]);
  try {
    const { db, calls } = fakeDb();
    assertEquals(await generateHiggsfieldImageSync(db, req({ deadline: Date.now() + 40, pollMs: 5 })), { ok: false, reason: "timeout" });
    assertEquals(calls.updates.map((u) => u.status), ["queued", "uncertain"]);
  } finally { f.restore(); }
});

Deno.test("clipSection shortens only the optional section, then drops it", () => {
  const brand = "BRAND UNIVERSE:\n- " + "b".repeat(200);
  const prompt = `SCENE: keep.\n\n${brand}\n\nADJUSTMENT REQUESTED: warmer`;
  const clipped = clipSection(prompt, brand, prompt.length - 50);
  assertEquals(clipped.length, prompt.length - 50);
  assert(clipped.endsWith("ADJUSTMENT REQUESTED: warmer") && clipped.includes("…"));
  const dropped = clipSection(prompt, brand, 60);
  assertEquals(dropped, "SCENE: keep.\n\nADJUSTMENT REQUESTED: warmer");
  assertEquals(clipSection(prompt, brand, 10_000), prompt);
});
