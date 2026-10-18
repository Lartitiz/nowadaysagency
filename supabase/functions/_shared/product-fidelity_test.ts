import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CpuMeter, expandBox, featherAlpha, imageSize, normalizeBox, prepareProductReference, productFidelityLine, REFINE_CPU_ESTIMATE_MS,
  refineProductRegion, refinePrompt, refineSquare, visionImage,
} from "./product-fidelity.ts";

// imagescript loads its WebAssembly over the network: pixel tests run only with
// --allow-net (locally), like image-downscale_test.ts; CI keeps the pure tests.
const net = (await Deno.permissions.query({ name: "net", host: "deno.land" })).state === "granted";
// deno-lint-ignore no-explicit-any
let Image: any;
if (net) Image = (await import("https://deno.land/x/imagescript@1.3.0/mod.ts")).Image;

async function solid(width: number, height: number, rgba: number) {
  const image = new Image(width, height);
  image.fill(rgba);
  return new Blob([new Uint8Array(await image.encodeJPEG(95))], { type: "image/jpeg" });
}
async function pixel(blob: Blob, x: number, y: number) {
  const image = await Image.decode(new Uint8Array(await blob.arrayBuffer()));
  return Image.colorToRGBA(image.getPixelAt(x + 1, y + 1));
}

Deno.test("normalizeBox reads the 0..1000 grid and rejects empty boxes", () => {
  assertEquals(normalizeBox({ x_min: 100, y_min: 200, x_max: 300, y_max: 600 }), { x: 0.1, y: 0.2, w: 0.2, h: 0.4 });
  assertEquals(normalizeBox({ x_min: 300, y_min: 600, x_max: 100, y_max: 200 }), { x: 0.1, y: 0.2, w: 0.2, h: 0.4 });
  assertEquals(normalizeBox({ x_min: 100, y_min: 100, x_max: 102, y_max: 500 }), null);
  assertEquals(normalizeBox({ x_min: "a" }), null);
});

Deno.test("expandBox stays inside the image", () => {
  const box = expandBox({ x: 0, y: 0.9, w: 0.2, h: 0.1 }, 0.5);
  assertEquals(box.x, 0);
  assert(box.y + box.h <= 1);
});

Deno.test("refineSquare is square, clamped and around the product", () => {
  const s = refineSquare({ x: 0.9, y: 0.9, w: 0.05, h: 0.05 }, 1000, 1500);
  assertEquals(s.side, 300); // 30 % of the short side minimum
  assertEquals(s.x + s.side, 1000);
  assert(s.y + s.side <= 1500);
  const big = refineSquare({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 1000, 1500);
  assertEquals(big.side, 1000);
});

Deno.test("featherAlpha ramps from 0 at the edge to 1 inside", () => {
  assertEquals(featherAlpha(0, 10), 0);
  assertEquals(featherAlpha(10, 10), 1);
  assert(featherAlpha(5, 10) > 0.4 && featherAlpha(5, 10) < 0.6);
});

Deno.test({ name: "prepareProductReference crops to the located product, then cuts it out", ignore: !net, fn: async () => {
  const original = await solid(400, 400, 0xffffffff);
  let cutInput: Blob | null = null;
  const prepared = await prepareProductReference(original, "bague", {
    locate: () => Promise.resolve({ box: { x: 0.25, y: 0.25, w: 0.25, h: 0.25 }, description: "three almond lobes", extraneous: "loose silver grains" }),
    cutout: (blob) => { cutInput = blob; return Promise.resolve(blob); },
  });
  assert(prepared.cropped && prepared.detoured);
  const cropped = await Image.decode(new Uint8Array(await cutInput!.arrayBuffer()));
  assertEquals([cropped.width, cropped.height], [140, 140]); // 100 px + 20 px each side
  assertEquals(prepared.description, "three almond lobes");
  assert(productFidelityLine(prepared).includes("Not part of the product (never add them): loose silver grains."));
} });

Deno.test("prepareProductReference falls back to the original photo", async () => {
  const original = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
  const prepared = await prepareProductReference(original, "bague", {
    locate: () => Promise.resolve(null),
    cutout: () => Promise.resolve(null),
  });
  assertEquals(prepared.blob, original);
  assert(!prepared.cropped && !prepared.detoured);
  assertEquals(productFidelityLine(prepared), "");
});

Deno.test({ name: "refineProductRegion pastes the regenerated square back with feathered edges", ignore: !net, fn: async () => {
  const image = await solid(600, 900, 0xff0000ff); // red
  let prompt = "", inputs: Blob[] = [];
  const outcome = await refineProductRegion({
    image, reference: await solid(50, 50, 0xffffffff), product: "bague",
    ref: { description: "three almond lobes", extraneous: "" },
    locate: () => Promise.resolve({ box: { x: 0.45, y: 0.45, w: 0.1, h: 0.1 }, description: "", extraneous: "" }),
    generate: async (p, i) => { prompt = p; inputs = i; return await solid(1024, 1024, 0x0000ffff); }, // blue
  });
  assert(outcome.ok);
  assertEquals(inputs.length, 2);
  assert(prompt.includes("three almond lobes"));
  const square = refineSquare({ x: 0.45, y: 0.45, w: 0.1, h: 0.1 }, 600, 900);
  const [r, , b] = await pixel(outcome.blob, square.x + square.side / 2, square.y + square.side / 2);
  assert(b > 200 && r < 60, "centre comes from the patch");
  const [r2, , b2] = await pixel(outcome.blob, 5, 5);
  assert(r2 > 200 && b2 < 60, "outside the square is untouched");
  const [r3, , b3] = await pixel(outcome.blob, square.x, square.y + square.side / 2);
  assert(r3 > 150 && b3 < 100, "the square border fades into the original");
} });

Deno.test({ name: "refineProductRegion keeps the image when the product is missing, large or generation fails", ignore: !net, fn: async () => {
  const image = await solid(100, 100, 0xff0000ff);
  const base = { image, reference: image, product: "bague", ref: { description: "", extraneous: "" } };
  const notFound = await refineProductRegion({ ...base, locate: () => Promise.resolve(null), generate: () => Promise.resolve(null) });
  assertEquals(notFound, { ok: false, reason: "not_found" });
  const large = await refineProductRegion({ ...base, locate: () => Promise.resolve({ box: { x: 0, y: 0, w: 0.9, h: 0.9 }, description: "", extraneous: "" }), generate: () => Promise.resolve(null) });
  assertEquals(large, { ok: false, reason: "already_large" });
  const failed = await refineProductRegion({ ...base, locate: () => Promise.resolve({ box: { x: 0.4, y: 0.4, w: 0.1, h: 0.1 }, description: "", extraneous: "" }), generate: () => Promise.reject(new Error("x")) });
  assertEquals(failed, { ok: false, reason: "generation_failed" });
} });

Deno.test("refinePrompt trusts the vision geometry over a saved caption", () => {
  const prompt = refinePrompt("bague avec perles nacrées", { description: "three almond lobes", extraneous: "loose grains" });
  assert(!prompt.includes("perles"));
  assert(prompt.includes("three almond lobes"));
});

Deno.test("refinePrompt keeps the framing and names the product", () => {
  const prompt = refinePrompt("bague argent", { description: "", extraneous: "" });
  assert(prompt.includes("bague argent"));
  assert(prompt.includes("no zoom, shift or rotation"));
  assert(prompt.length < 2000);
});

// ── Host CPU limit (18/10/2026) ──
// The staging died at 2 152 ms of CPU (546 WORKER_RESOURCE_LIMIT, « CPU Time
// exceeded »), the provider image already paid: the vision step decoded and
// re-encoded every image, a 2000×2000 photo included, and re-shrank an image
// already at 1024 px. These tests pin the cheap path, without network.

/** Minimal JPEG header: SOI, APP0, SOF0 with the given size (no pixels). */
function jpegHeader(width: number, height: number) {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ]);
}
function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

Deno.test("imageSize reads JPEG and PNG headers without decoding", () => {
  assertEquals(imageSize(jpegHeader(2000, 1500)), { width: 2000, height: 1500 });
  assertEquals(imageSize(pngHeader(1360, 2048)), { width: 1360, height: 2048 });
  assertEquals(imageSize(new Uint8Array([1, 2, 3, 4])), null);
});

Deno.test("visionImage sends a light photo as is: no decode for the 2000×2000 packshot", async () => {
  const packshot = new Blob([jpegHeader(2000, 2000)], { type: "image/jpeg" });
  const meter = new CpuMeter(1_000);
  assertEquals(await visionImage(packshot, meter), packshot);
  const result = new Blob([jpegHeader(1024, 1542)], { type: "image/jpeg" });
  assertEquals(await visionImage(result, meter), result, "an image already at 1024 px is not shrunk again");
  assertEquals(meter.spent, 0);
});

Deno.test("CpuMeter: parallel claims cannot both pass a full budget", async () => {
  const meter = new CpuMeter(1_000);
  await meter.time(() => new Promise((r) => setTimeout(r, 20)));
  assert(meter.spent >= 15);
  assert(meter.claim(600));
  assert(!meter.claim(600), "the second parallel pass waits for the first one's release");
  meter.release(600);
  assert(meter.claim(600));
});

Deno.test("refineProductRegion skips the zoomed pass when the CPU budget is spent: no vision, no provider image", async () => {
  const meter = new CpuMeter(1_400);
  meter.spent = 1_400 - REFINE_CPU_ESTIMATE_MS + 1;
  let located = 0, generated = 0;
  const image = new Blob([jpegHeader(1024, 1542)], { type: "image/jpeg" });
  const outcome = await refineProductRegion({
    image, reference: image, product: "bague", ref: { description: "", extraneous: "" }, meter,
    locate: () => { located++; return Promise.resolve(null); },
    generate: () => { generated++; return Promise.resolve(null); },
  });
  assertEquals(outcome, { ok: false, reason: "cpu_budget" });
  assertEquals([located, generated], [0, 0]);
});

Deno.test({ name: "a 2000×2000 product photo, prepared then refined, stays well under the 2 s CPU limit", ignore: !net, fn: async () => {
  const photo = new Image(2000, 2000).fill((x: number, y: number) => Image.rgbToColor((x * 7) % 256, (y * 3) % 256, (x + y) % 256));
  const original = new Blob([new Uint8Array(await photo.encodeJPEG(90))], { type: "image/jpeg" });
  const meter = new CpuMeter(1_400);
  const prepared = await prepareProductReference(original, "bureau", {
    locate: async (img, _p, _m, m) => { assertEquals(await visionImage(img, m), img); return { box: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, description: "", extraneous: "" }; },
    cutout: (blob) => Promise.resolve(blob),
  }, meter);
  assert(prepared.cropped);
  const result = await solid(1024, 1536, 0xff0000ff);
  const outcome = await refineProductRegion({
    image: result, reference: prepared.blob, product: "bureau", ref: prepared, meter,
    locate: () => Promise.resolve({ box: { x: 0.4, y: 0.4, w: 0.1, h: 0.1 }, description: "", extraneous: "" }),
    generate: () => solid(1024, 1024, 0x0000ffff),
  });
  assert(outcome.ok);
  assert(meter.spent < 1_400, `image CPU ${meter.spent} ms`);
} });
