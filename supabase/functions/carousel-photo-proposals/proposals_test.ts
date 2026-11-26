import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { cleanPhotoIds, parsePlans, parseRetryQueries, proposePhotos } from "./proposals.ts";

const slides = [1, 2, 3, 4].map((n) => ({ slide: n, text: `Passage ${n}` }));
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
const ok = (photo: string) => ({ photo, people: false, products_or_text: false });

Deno.test("photo-proposals : lecture stricte du plan (bibliothèque jamais deux fois, requête sans personne)", () => {
  const plans = parsePlans(JSON.stringify({ plans: [
    { slide: 1, ideal: "Un plan d'appartement annoté sur une table", library_photo: 2, query: "floor plan on table" },
    { slide: 2, ideal: "Une façade d'immeuble ancien", library_photo: 2, query: "old building facade" },
    { slide: 3, ideal: "court", library_photo: 9, query: "woman visiting flat" },
    { slide: 3, ideal: "Doublon ignoré de la slide trois", library_photo: 1, query: "x y z" },
    { slide: 8, ideal: "Hors liste, jamais lue", library_photo: 1, query: "empty room" },
  ] }), [1, 2, 3], [1, 2]);
  assertEquals(plans.get(1), { ideal: "Un plan d'appartement annoté sur une table", library: 2, query: "floor plan on table" });
  // Photo 2 déjà donnée à la slide 1 : la slide 2 passe aux photos libres de droit.
  assertEquals(plans.get(2), { ideal: "Une façade d'immeuble ancien", library: null, query: "old building facade" });
  // Numéro hors catalogue, description trop courte, requête qui nomme une personne.
  assertEquals(plans.get(3), { ideal: null, library: null, query: null });
  assert(!plans.has(8));
  assertEquals([...cleanPhotoIds(JSON.stringify({ checks: [ok("1"), ok("2"), { photo: "2", people: true, products_or_text: false }] }))], ["1"]);
});

Deno.test("photo-proposals : bibliothèque d'abord, photo libre de droit vérifiée ensuite, couverture comprise", async () => {
  const calls: string[] = [];
  const prompts: any[] = [];
  const call = (async (opts: any) => {
    prompts.push(opts);
    if (opts.tool.name === "requetes_de_secours") return JSON.stringify({ queries: [{ slide: 4, query: "bright staircase" }] });
    if (opts.tool.name === "plan_images") {
      return JSON.stringify({ plans: [
        { slide: 1, ideal: "Une façade d'immeuble ancien vue de la rue", library_photo: null, query: "old building facade" },
        { slide: 2, ideal: "Le plateau vide avant travaux", library_photo: 3, query: "empty loft" },
        { slide: 3, ideal: "Un mètre et un crayon sur un plan", library_photo: null, query: "old building facade" },
        { slide: 4, ideal: "Une cage d'escalier lumineuse", library_photo: null, query: "bright staircase" },
      ] });
    }
    return JSON.stringify({
      choices: [{ slide: 1, photo: "11", reason: "Façade" }, { slide: 3, photo: "12", reason: "Façade" }, { slide: 4, photo: null, reason: "Rien" }],
      checks: [ok("11"), ok("12"), ok("13"), { photo: "14", people: true, products_or_text: false }, ok("21")],
    });
  }) as any;
  const usage: any = {};
  const { proposals, receipt } = await proposePhotos({
    subject: "La découpe d'immeubles", brand: "Marchand de biens", slides, targets: [1, 2, 3, 4],
    library: [{ index: 3, description: "Plateau vide avant travaux, murs bruts" }],
  }, {
    usage, call, apiKey: "k", logger: () => {},
    fetchImpl: fakeFetch({
      "old building facade": [pexelsPhoto(10, "Man in front of a facade"), pexelsPhoto(11, "Old facade"), pexelsPhoto(12, "Stone facade"), pexelsPhoto(13, "Facade detail"), pexelsPhoto(14, "Balcony detail"), pexelsPhoto(15, "Roof line"), pexelsPhoto(16, "Windows")],
      "bright staircase": [pexelsPhoto(21, "Bright staircase")],
    }, calls),
  });
  // Le catalogue part au modèle, et la slide avec photo de bibliothèque ne cherche rien sur Pexels.
  assert(prompts[0].messages[0].content.includes("Plateau vide avant travaux"));
  assertEquals(calls.sort(), ["bright staircase", "old building facade"]);
  const by = new Map(proposals.map((p) => [p.slide, p]));
  // La couverture reçoit elle aussi une photo libre de droit.
  assertEquals(by.get(1)!.stock!.id, "11");
  assertEquals(by.get(2)!.library_index, 3);
  assertEquals(by.get(2)!.stock, null);
  assertEquals(by.get(3)!.stock!.id, "12");
  // Aucune photo acceptée : la slide reste sans image, avec sa description d'image idéale.
  assertEquals(by.get(4)!.stock, null);
  assertEquals(by.get(4)!.ideal, "Une cage d'escalier lumineuse");
  // « Une autre » : seulement des photos vérifiées propres, jamais celle d'une autre slide ni une photo avec personne.
  const alternates = proposals.flatMap((p) => p.alternates.map((a) => a.id));
  assert(alternates.includes("13"));
  assert(!alternates.includes("14") && !alternates.includes("11") && !alternates.includes("12") && !alternates.includes("10"));
  assertEquals(receipt.status, "partial");
  assertEquals(receipt.library, [2]);
  assertEquals(receipt.stock, [1, 3]);
  // Le vérificateur sait ce que vend la marque.
  assert(prompts[1].messages[0].content[0].text.includes("Marchand de biens"));
});

Deno.test("photo-proposals : sans clé Pexels ou vérification en échec, la bibliothèque et l'image idéale restent", async () => {
  const plan = JSON.stringify({ plans: [
    { slide: 1, ideal: "Une façade d'immeuble ancien vue de la rue", library_photo: 1, query: "old building facade" },
    { slide: 2, ideal: "Le plateau vide avant travaux", library_photo: null, query: "empty loft" },
  ] });
  const library = [{ index: 1, description: "Façade de l'immeuble" }];
  const noKey = await proposePhotos({ slides, targets: [1, 2], library }, { usage: {}, call: (async () => plan) as any, apiKey: null, logger: () => {} });
  assertEquals(noKey.receipt.reason, "no-pexels-key");
  assertEquals(noKey.proposals.map((p) => [p.library_index, p.stock, p.ideal]), [[1, null, "Une façade d'immeuble ancien vue de la rue"], [null, null, "Le plateau vide avant travaux"]]);
  let n = 0;
  const failing = (async () => { if (n++ === 0) return plan; throw new Error("timeout"); }) as any;
  const broken = await proposePhotos({ slides, targets: [1, 2], library }, {
    usage: {}, call: failing, apiKey: "k", logger: () => {}, fetchImpl: fakeFetch({ "empty loft": [pexelsPhoto(31, "Empty loft")] }),
  });
  assertEquals(broken.receipt.reason, "error");
  assertEquals(broken.proposals[0].library_index, 1);
  assertEquals(broken.proposals[1].stock, null);
  // Cible inconnue du carrousel : rien n'est demandé.
  const none = await proposePhotos({ slides, targets: [9] }, { usage: {}, call: (async () => { throw new Error("jamais appelé"); }) as any, apiKey: "k", logger: () => {} });
  assertEquals(none.receipt.reason, "no-targets");
});

Deno.test("photo-proposals : deuxième essai pour les slides restées sans photo, avec une requête différente", async () => {
  const calls: string[] = [];
  const prompts: any[] = [];
  const call = (async (opts: any) => {
    prompts.push(opts);
    if (opts.tool.name === "plan_images") {
      return JSON.stringify({ plans: [
        { slide: 1, ideal: "Des pains de savon sur une grille de séchage", library_photo: null, query: "wooden drying rack" },
        { slide: 2, ideal: "Une étagère en bois vide dans une pièce calme", library_photo: null, query: "empty wooden shelf" },
        { slide: 3, ideal: "De la lavande séchée sur du lin", library_photo: null, query: "dried lavender linen" },
      ] });
    }
    if (opts.tool.name === "requetes_de_secours") {
      return JSON.stringify({ queries: [{ slide: 1, query: "morning light wood" }, { slide: 2, query: "dried lavender linen" }] });
    }
    const ids: string[] = opts.tool.input_schema.properties.checks.items.properties.photo.enum;
    const slides: number[] = opts.tool.input_schema.properties.choices.items.properties.slide.enum;
    // Premier essai : seule la slide 3 trouve ; deuxième essai : la slide 1 trouve.
    const want: Record<number, string> = { 3: "31", 1: "41" };
    return JSON.stringify({
      choices: slides.map((slide) => ({ slide, photo: ids.includes(want[slide]) ? want[slide] : null, reason: "x" })),
      checks: ids.map((photo) => ({ photo, people: false, products_or_text: false })),
    });
  }) as any;
  const { proposals, receipt } = await proposePhotos({ subject: "Savons à froid", brand: "Savonnerie", slides, targets: [1, 2, 3] }, {
    usage: {}, call, apiKey: "k", logger: () => {},
    fetchImpl: fakeFetch({
      "wooden drying rack": [pexelsPhoto(21, "Wooden rack")],
      "dried lavender linen": [pexelsPhoto(31, "Dried lavender")],
      "morning light wood": [pexelsPhoto(31, "Dried lavender"), pexelsPhoto(41, "Morning light on wood")],
    }, calls),
  });
  // « shelf » est un mot interdit : pas de recherche au premier essai, puis une requête de secours
  // déjà essayée (écartée) : la slide 2 reste à choisir. La slide 1 est servie au deuxième essai.
  assertEquals(calls.sort(), ["dried lavender linen", "morning light wood", "wooden drying rack"]);
  const by = new Map(proposals.map((p) => [p.slide, p]));
  assertEquals(by.get(3)!.stock!.id, "31");
  assertEquals(by.get(1)!.stock!.id, "41");
  assertEquals(by.get(2)!.stock, null);
  assertEquals(receipt.retried, [1]);
  assertEquals(receipt.retry_queries, { "1": "morning light wood" });
  assertEquals(receipt.status, "partial");
  // La photo déjà posée sur la slide 3 n'est jamais reproposée au deuxième essai.
  const retryVerify = prompts[prompts.length - 1].messages[0].content.filter((c: any) => c.type === "image").map((c: any) => c.source.url);
  assert(!retryVerify.some((u: string) => u.includes("/31/")));
  // Le modèle sait quelle requête a échoué.
  const retryPrompt = prompts.find((p) => p.tool.name === "requetes_de_secours").messages[0].content;
  assert(retryPrompt.includes("wooden drying rack") && retryPrompt.includes('"failed_query":null'));
  assertEquals([...parseRetryQueries(JSON.stringify({ queries: [
    { slide: 1, query: "Wooden Drying Rack" }, { slide: 2, query: "woman at market" }, { slide: 2, query: "soft linen fold" }, { slide: 9, query: "empty room" },
  ] }), [1, 2], new Set(["wooden drying rack"]))], [[2, "soft linen fold"]]);
});
