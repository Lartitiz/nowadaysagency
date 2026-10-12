import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  acceptableAlt,
  addStockAmbientPhotos,
  parseChoices,
  parseQueries,
  stockAmbientTargets,
  STOCK_AMBIENT_LATEST_START_MS,
} from "./stock-ambient.ts";

const photo = { base64: "data:image/jpeg;base64,AAAA", mimeType: "image/jpeg" };
const slide = (status: string, text = "Un passage") => ({
  slide_type: "photo_full", photo_index: 1, overlay_text: text, photo_match: { status },
});
const doc = (statuses: string[]) => ({
  slides: statuses.map((st, i) => slide(st, `Passage ${i + 1}`)),
  photo_review: { version: "final-photo-match-v7", ambient_fallback: [] },
  generation_receipt: {},
});
const body = (n = 3, extra: Record<string, unknown> = {}) => ({
  carousel_type: "photo", subject: "Pourquoi je refuse de promettre une peau parfaite", photos: Array(n).fill(photo), ...extra,
});
const pexelsPhoto = (id: number, alt: string) => ({
  id, alt, photographer: "Ana", photographer_url: "https://www.pexels.com/@ana", url: `https://www.pexels.com/photo/${id}/`,
  src: { portrait: `https://images.pexels.com/photos/${id}/p.jpeg`, medium: `https://images.pexels.com/photos/${id}/m.jpeg` },
});
const fakeFetch = (byQuery: Record<string, any[]>, calls: string[] = []) =>
  (async (url: string) => {
    const q = new URL(url).searchParams.get("query")!;
    calls.push(q);
    return new Response(JSON.stringify({ photos: byQuery[q] || [] }), { status: 200 });
  }) as unknown as typeof fetch;

Deno.test("stock-ambient : seules les slides en ambiance hors couverture, dans la limite de 10 photos", () => {
  const d = doc(["ambient_fallback", "matched", "ambient_fallback", "missing", "ambient_fallback"]);
  assertEquals(stockAmbientTargets(d, body(3)), [3, 5]);
  assertEquals(stockAmbientTargets(d, body(9)), [3]);
  assertEquals(stockAmbientTargets(d, body(10)), []);
  assertEquals(stockAmbientTargets(d, body(3, { carousel_type: "mix" })), []);
  assertEquals(stockAmbientTargets(d, body(3, { photos_only: true })), []);
});

Deno.test("stock-ambient : une description qui montre une personne, une main ou un produit est écartée", () => {
  assert(acceptableAlt("Dried lavender on white linen"));
  assert(!acceptableAlt("Woman holding a cup of tea"));
  assert(!acceptableAlt("Hands kneading clay"));
  assert(!acceptableAlt("Soap bars in a cosmetic bottle"));
  assert(!acceptableAlt(""));
});

Deno.test("stock-ambient : lecture stricte des requêtes et des choix", () => {
  const q = parseQueries(JSON.stringify({ queries: [
    { slide: 3, query: "linen texture morning light" }, { slide: 3, query: "doublon" },
    { slide: 5, query: "woman in garden" }, { slide: 9, query: "hors liste" },
  ] }), [3, 5]);
  assertEquals([...q.entries()], [[3, "linen texture morning light"]]);
  const p = { id: "1", url: "u", thumbnail: "t", alt: "a", photographer: "", photographer_url: "", source_url: "" };
  const candidates = new Map([[3, [p]], [5, [p, { ...p, id: "2" }]]]);
  const c = parseChoices(JSON.stringify({ choices: [{ slide: 3, photo: "1" }, { slide: 5, photo: "1" }, { slide: 7, photo: "2" }] }), candidates);
  assertEquals([...c.keys()], [3]);
});

Deno.test("stock-ambient : photo vérifiée posée sur la slide, la photo de l'utilisatrice reste en secours", async () => {
  const calls: string[] = [];
  const prompts: any[] = [];
  const call = (async (opts: any) => {
    prompts.push(opts);
    if (opts.tool.name === "requetes_ambiance") {
      return JSON.stringify({ queries: [{ slide: 2, query: "linen texture" }, { slide: 3, query: "linen texture" }] });
    }
    return JSON.stringify({ choices: [{ slide: 2, photo: "11", reason: "Lin calme" }, { slide: 3, photo: "12", reason: "Lumière" }] });
  }) as any;
  const out = await addStockAmbientPhotos(doc(["ambient_fallback", "ambient_fallback", "ambient_fallback"]), {
    body: body(3), startedAt: Date.now(), usage: {}, call, apiKey: "k", logger: () => {},
    fetchImpl: fakeFetch({ "linen texture": [pexelsPhoto(10, "Woman on linen"), pexelsPhoto(11, "Linen texture"), pexelsPhoto(12, "Linen fold"), pexelsPhoto(13, "Linen in light")] }, calls),
  });
  // Une seule recherche par requête identique.
  assertEquals(calls, ["linen texture"]);
  // La couverture n'est jamais remplacée.
  assertEquals(out.slides[0].stock_ambient, undefined);
  assertEquals(out.slides[1].stock_ambient.id, "11");
  assertEquals(out.slides[1].photo_index, 1);
  assertEquals(out.slides[2].stock_ambient.id, "12");
  assertEquals(out.photo_review.stock_ambient.status, "completed");
  assertEquals(out.photo_review.stock_ambient.slides, [2, 3]);
  // La photo décrite avec une personne n'est jamais montrée au vérificateur ; candidats distincts entre slides.
  const shown = prompts[1].messages[0].content.filter((c: any) => c.type === "image").map((c: any) => c.source.url);
  assert(!shown.some((u: string) => u.includes("/10/")));
  assertEquals(new Set(shown).size, shown.length);
});

Deno.test("stock-ambient : sans clé, hors délai ou vérification en échec, le carrousel reste tel quel", async () => {
  const d = doc(["ambient_fallback", "ambient_fallback"]);
  const noKey = await addStockAmbientPhotos(d, { body: body(), startedAt: Date.now(), usage: {}, apiKey: null, logger: () => {} });
  assertEquals(noKey.photo_review.stock_ambient.reason, "no-pexels-key");
  assertEquals(noKey.slides, d.slides);
  const late = await addStockAmbientPhotos(d, { body: body(), startedAt: Date.now() - STOCK_AMBIENT_LATEST_START_MS - 1, usage: {}, apiKey: "k", logger: () => {} });
  assertEquals(late.photo_review.stock_ambient.reason, "time-budget");
  const failing = (async (opts: any) => {
    if (opts.tool.name === "requetes_ambiance") return JSON.stringify({ queries: [{ slide: 2, query: "stone texture" }] });
    throw new Error("timeout");
  }) as any;
  const broken = await addStockAmbientPhotos(d, {
    body: body(), startedAt: Date.now(), usage: {}, apiKey: "k", call: failing, logger: () => {},
    fetchImpl: fakeFetch({ "stone texture": [pexelsPhoto(20, "Grey stone texture")] }),
  });
  assertEquals(broken.photo_review.stock_ambient.status, "unavailable");
  assertEquals(broken.slides[1].stock_ambient, undefined);
  const refused = await addStockAmbientPhotos(d, {
    body: body(), startedAt: Date.now(), usage: {}, apiKey: "k", logger: () => {},
    call: (async (opts: any) => opts.tool.name === "requetes_ambiance"
      ? JSON.stringify({ queries: [{ slide: 2, query: "stone texture" }] })
      : JSON.stringify({ choices: [{ slide: 2, photo: null, reason: "Une main au bord" }] })) as any,
    fetchImpl: fakeFetch({ "stone texture": [pexelsPhoto(20, "Grey stone texture")] }),
  });
  assertEquals(refused.photo_review.stock_ambient.reason, "none-accepted");
  assertEquals(refused.slides[1].stock_ambient, undefined);
});
