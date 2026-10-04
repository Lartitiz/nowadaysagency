import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { collectDataImages, externalizeVerified, type MediaStorage } from "./carousel-media.ts";

const big = (seed: string) => `data:image/jpeg;base64,${btoa(seed.repeat(20_000))}`;
function fakeStorage(files = new Map<string, Uint8Array<ArrayBuffer>>(), refuse = false): MediaStorage & { files: Map<string, Uint8Array<ArrayBuffer>> } {
  return {
    files,
    upload: async (path, bytes) => {
      if (refuse) return { error: { message: "quota" } };
      if (files.has(path)) return { error: { message: "The resource already exists", statusCode: "409" } };
      files.set(path, bytes);
      return { error: null };
    },
    publicUrl: (path) => `https://x/storage/v1/object/public/calendar-visuals/${path}`,
  };
}
const fetchFrom = (files: Map<string, Uint8Array<ArrayBuffer>>, corrupt = false) => (async (url: string) => {
  const path = String(url).split("/calendar-visuals/")[1];
  const bytes = files.get(path);
  if (!bytes) return new Response("", { status: 404 });
  return new Response(corrupt ? bytes.slice(1) : bytes);
}) as typeof fetch;

Deno.test("existing content: every pasted photo is stored once, re-read, and replaced by its link", async () => {
  const storage = fakeStorage();
  const photo = big("a");
  const value = { visual_html: [{ html: `<img src="${photo}">` }], _carousel_cloud: { history: [{ raw: { visual_html: [{ html: `<i style="background:url(${photo})"></i>` }] } }] } };
  const result = await externalizeVerified(value, "owner-1", storage, fetchFrom(storage.files));
  assertEquals(result.failures, []);
  assertEquals(result.found, 1);
  assertEquals(storage.files.size, 1);
  assert([...storage.files.keys()][0].match(/^owner-1\/carousel-media\/[0-9a-f]{64}\.jpg$/));
  assert(!JSON.stringify(result.value).includes("data:image"));
});

Deno.test("text drafts (JSON stored as text) are converted too", async () => {
  const storage = fakeStorage();
  const draft = JSON.stringify({ visual_html: [{ html: `<img src="${big("b")}">` }] });
  const result = await externalizeVerified(draft, "owner-2", storage, fetchFrom(storage.files));
  assert(!result.value.includes("data:image"));
  assert(result.value.includes("/carousel-media/"));
});

Deno.test("a photo already stored by a save (same content) is reused", async () => {
  const storage = fakeStorage();
  const photo = big("c");
  await externalizeVerified({ html: photo }, "owner-3", storage, fetchFrom(storage.files));
  const again = await externalizeVerified({ html: photo }, "owner-3", storage, fetchFrom(storage.files));
  assertEquals(again.failures, []);
  assertEquals(storage.files.size, 1);
});

Deno.test("all or nothing: a refused upload or a different re-read size leaves the content untouched", async () => {
  const value = { a: big("d"), b: big("e") };
  const refused = await externalizeVerified(value, "owner-4", fakeStorage(new Map(), true), fetchFrom(new Map()));
  assertEquals(refused.value, value);
  assertEquals(refused.stored, 0);
  assert(refused.failures[0].includes("quota"));
  const storage = fakeStorage();
  const corrupt = await externalizeVerified(value, "owner-4", storage, fetchFrom(storage.files, true));
  assertEquals(corrupt.value, value);
  assert(corrupt.failures.every((f) => f.includes("taille différente")));
});

Deno.test("small inline images are not collected", () => {
  assertEquals(collectDataImages({ icon: `data:image/png;base64,${btoa("x".repeat(50))}` }).size, 0);
});
