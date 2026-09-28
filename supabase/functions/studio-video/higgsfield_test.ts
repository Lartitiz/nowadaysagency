import { estimate, MODELS, publicHttpsUrl, status, submit, uploadImage, type VideoInput } from "./higgsfield.ts";

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
const requestId = "3c90c3cc-0d44-4b50-8888-8dd25736052a";
const input: VideoInput = { image_url: "https://cdn.example.com/input.jpg", prompt: "Slow camera push toward the product",
  duration: 5, resolution: "480p", output_format: "mp4", generate_audio: false };

Deno.test("quote and submission use the documented Seedance route and the same silent input", async () => {
  Deno.env.set("HIGGSFIELD_API_KEY", "test-id:test-secret");
  const calls: Array<{ url: string; body: VideoInput; auth: string | null }> = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("Authorization") });
    return new Response(JSON.stringify(calls.length === 1 ? { usd: "0.720", credits: "12.000" } :
      { request_id: requestId, status: "queued", status_url: `https://api.higgsfield.ai/requests/${requestId}/status` }),
      { status: 200, headers: { "Content-Type": "application/json", "X-Correlation-ID": "corr-1" } });
  };
  const price = await estimate(input, fetcher as typeof fetch);
  const receipt = await submit(input, "https://app.example.com/webhook", fetcher as typeof fetch);
  assert(price.usd === 0.72 && price.credits === 12, "quote values");
  assert(receipt.requestId === requestId && receipt.correlationId === "corr-1", "receipt");
  assert(calls[0].url.endsWith("/estimate/bytedance/seedance-2.5/image-to-video"), "estimate route");
  assert(calls[1].url.includes("/bytedance/seedance-2.5/image-to-video?hf_webhook="), "model route and webhook");
  assert(calls.every(c => c.auth === "Key test-id:test-secret" && JSON.stringify(c.body) === JSON.stringify(input)), "same authenticated input");
});

Deno.test("private reference upload never sends the API key to presigned storage", async () => {
  Deno.env.set("HIGGSFIELD_API_KEY", "test-id:test-secret");
  const requests: Array<{ url: string; headers: Headers }> = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), headers: new Headers(init?.headers) });
    if (requests.length === 1) return new Response(JSON.stringify({
      public_url: "https://cdn.example.com/input.jpg", upload_url: "https://storage.example.com/upload",
      upload_headers: { "Content-Type": "image/jpeg", "x-amz-tagging": "retention=temporary" },
    }), { status: 200 });
    return new Response(null, { status: 200 });
  };
  const url = await uploadImage(new Blob([new Uint8Array(64)], { type: "image/jpeg" }), fetcher as typeof fetch);
  assert(url === "https://cdn.example.com/input.jpg", "reference URL");
  assert(requests[0].headers.get("Authorization") === "Key test-id:test-secret", "API authentication");
  assert(!requests[1].headers.has("Authorization"), "no secret to storage");
  assert(requests[1].headers.get("x-amz-tagging") === "retention=temporary", "upload headers preserved");
});

Deno.test("text and ordered image references use separate documented model routes", async () => {
  Deno.env.set("HIGGSFIELD_API_KEY", "test-id:test-secret");
  const calls: Array<{ url: string; body: VideoInput }> = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ usd: 1, credits: 10 }), { status: 200 });
  };
  const textInput: VideoInput = { prompt: "Atelier lumineux", duration: 5, resolution: "480p",
    aspect_ratio: "9:16", output_format: "mp4", generate_audio: false };
  const refsInput: VideoInput = { ...textInput, image_urls: ["https://cdn.example.com/produit.jpg",
    "https://cdn.example.com/decor.jpg"] };
  await estimate(textInput, fetcher as typeof fetch, MODELS.text);
  await estimate(refsInput, fetcher as typeof fetch, MODELS.references);
  assert(calls[0].url.endsWith("/text-to-video") && !Object.hasOwn(calls[0].body, "image_urls"), "text route without image");
  assert(calls[1].url.endsWith("/reference-to-video") &&
    JSON.stringify((calls[1].body as { image_urls: string[] }).image_urls) === JSON.stringify(refsInput.image_urls),
    "reference route preserves order");
});

Deno.test("terminal status validates the request identity and public video URL", async () => {
  Deno.env.set("HIGGSFIELD_API_KEY", "test-id:test-secret");
  const valid = async () => new Response(JSON.stringify({ status: "completed", request_id: requestId,
    video: { url: "https://cdn.example.com/clip.mp4" } }), { status: 200 });
  assert((await status(requestId, valid as typeof fetch)).video?.url.endsWith("clip.mp4"), "completed video");
  assert(!publicHttpsUrl("http://127.0.0.1/clip.mp4") && !publicHttpsUrl("https://localhost/clip.mp4"), "private host refused");
  let invalid = false;
  try { await status(requestId, (async () => new Response(JSON.stringify({ status: "completed", request_id: requestId,
    video: { url: "http://127.0.0.1/clip.mp4" } }), { status: 200 })) as typeof fetch); }
  catch { invalid = true; }
  assert(invalid, "invalid result rejected");
});
