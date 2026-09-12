import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runRedacGate, applyGuardedCarouselCorrection } from "./redac-gate.ts";
import { applyCorrectionPassCarousel } from "./correction-pass.ts";

async function withCorrection(text: string, run: (requests: any[]) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const originalKey = Deno.env.get("ANTHROPIC_API_KEY");
  const requests: any[] = [];
  Deno.env.set("ANTHROPIC_API_KEY", "test-no-network");
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    return Promise.resolve(new Response(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" }), { headers: { "content-type": "application/json" } }));
  }) as typeof fetch;
  try { await run(requests); } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) Deno.env.delete("ANTHROPIC_API_KEY");
    else Deno.env.set("ANTHROPIC_API_KEY", originalKey);
  }
}

const source = "Le bol Rivage coûte 35 euros. Il est fabriqué à Lyon. Aucun délai communiqué.";
const original = JSON.stringify({ slides: [{ slide_number: 1, title: "Un bol en préparation", body: "Le séchage dure 5 jours.", photo_index: 2, visual_schema: null }], caption: { hashtags: ["#ceramique", "atelier"] } });
const opts = { isLinkedIn: false, inputText: source, correction: { enabled: true, skipIfShorterThan: 0, model: "claude-haiku-4-5" as const } };

Deno.test("carrousel : une correction ajoutant des chiffres non sourcés est rejetée", async () => {
  await withCorrection("[SLIDE 1 - BODY] Le séchage dure 5 jours, la cuisson prend 6 jours et la livraison demande 7 jours. Chaque étape est contrôlée dans notre atelier.", async (requests) => {
    const result = await runRedacGate(original, opts);
    assertEquals(requests.length, 1);
    assertEquals(JSON.parse(result.content).slides[0].body, "Le séchage dure 5 jours.");
    assertEquals(result.repassed, false);
    assertEquals(result.violations, 1);
  });
});

Deno.test("carrousel : une correction utile est conservée sans changer photos, schémas ou hashtags", async () => {
  await withCorrection("[SLIDE 1 - BODY] Le bol Rivage est fabriqué à Lyon. Son prix est de 35 euros. Le délai de séchage dépend du travail de la terre dans l'atelier.", async () => {
    const result = await runRedacGate(original, opts);
    const doc = JSON.parse(result.content);
    assertEquals(result.repassed, true);
    assertEquals(result.violations, 0);
    assertEquals(doc.slides[0].photo_index, 2);
    assertEquals(doc.slides[0].visual_schema, null);
    assertEquals(doc.caption.hashtags, ["ceramique", "atelier"]);
  });
});

Deno.test("carrousel : la source et le brouillon arrivent ensemble au correcteur", async () => {
  await withCorrection("[SLIDE 1 - BODY] Le bol est fabriqué à Lyon. La fabrication respecte les étapes de préparation de la terre, sans délai annoncé pour cette pièce.", async (requests) => {
    await applyCorrectionPassCarousel(original, { ...opts.correction, sourceContext: source });
    assertStringIncludes(JSON.stringify(requests[0].messages), "Aucun délai communiqué");
    assertStringIncludes(JSON.stringify(requests[0].messages), "Le séchage dure 5 jours");
  });
});

Deno.test("carrousel : le gate transmet inputText au correcteur même sans option sourceContext", async () => {
  await withCorrection("[SLIDE 1 - BODY] Le bol est fabriqué à Lyon. La fabrication respecte les étapes de préparation de la terre, sans délai annoncé pour cette pièce.", async (requests) => {
    await runRedacGate(original, opts);
    assertStringIncludes(JSON.stringify(requests[0].messages), "Aucun délai communiqué");
  });
});

Deno.test("carrousel : anciens briefs sans source et réponse incomplète conservent les champs manquants", async () => {
  await withCorrection("[SLIDE 1 - HOOK] Un bol façonné à la main, dont la matière et le geste guident le travail de préparation dans l'atelier, avant chaque cuisson.", async () => {
    const result = await applyCorrectionPassCarousel(original, opts.correction);
    assertEquals(JSON.parse(result).slides[0].body, "Le séchage dure 5 jours.");
    assertEquals(JSON.parse(result).slides[0].photo_index, 2);
  });
});

for (const variant of ["texte", "photo", "mixte"]) {
  Deno.test(`carrousel ${variant} : une citation source ne disparaît pas pour améliorer le score`, async () => {
    const quote = "La terre prend son temps";
    const doc = { slides: [{ slide_number: 1, [variant === "texte" ? "body" : "overlay_text"]: `« ${quote} ». Le séchage dure 5 jours.`, photo_index: 1 }], caption: {} };
    await withCorrection(`[SLIDE 1 - ${variant === "texte" ? "BODY" : "OVERLAY"}] Le bol prend forme dans l'atelier. Les étapes se suivent au rythme de la matière, du façonnage à la finition, avant de rejoindre votre table.`, async () => {
      const result = await runRedacGate(JSON.stringify(doc), { ...opts, inputText: `Citation à conserver : « ${quote} ». Aucun délai.` });
      assertStringIncludes(result.content, quote);
      assertEquals(result.repassed, false);
    });
  });
}

Deno.test("carrousel : un prix sourcé ne disparaît pas pendant la correction", async () => {
  const doc = JSON.stringify({ slides: [{ slide_number: 1, body: "35 euros. Le séchage dure 5 jours." }], caption: {} });
  await withCorrection("[SLIDE 1 - BODY] Le bol Rivage est fabriqué dans notre atelier de Lyon. La terre passe par plusieurs étapes de préparation avant la cuisson de la pièce.", async () => {
    const result = await runRedacGate(doc, opts);
    assertStringIncludes(result.content, "35 euros");
    assertEquals(result.repassed, false);
  });
});

Deno.test("carrousel propre : aucun appel de correction ajouté", async () => {
  await withCorrection("Ne doit pas être utilisé", async (requests) => {
    const doc = JSON.stringify({ slides: [{ title: "Le bol Rivage", body: "Grès émaillé à Lyon. 35 euros." }], caption: {} });
    const result = await runRedacGate(doc, opts);
    assertEquals(requests.length, 0);
    assertEquals(result.repassed, false);
  });
});

Deno.test("carrousel : remplacer un chiffre inventé par un autre est rejeté même à compte égal", async () => {
  await withCorrection("[SLIDE 1 - BODY] Le séchage dure 9 jours dans notre atelier. La terre doit être suffisamment sèche avant la cuisson pour permettre de terminer la pièce.", async () => {
    const result = await runRedacGate(original, opts);
    assertEquals(JSON.parse(result.content).slides[0].body, "Le séchage dure 5 jours.");
    assertEquals(result.repassed, false);
  });
});

Deno.test("carrousel : le polish préliminaire protège lui aussi les données source", async () => {
  const doc = JSON.stringify({ slides: [{ body: "Le bol Rivage coûte 35 euros et vient de Lyon." }], caption: {} });
  await withCorrection("[SLIDE 1 - BODY] Le bol Rivage vient de Lyon. Il passe par plusieurs étapes de préparation dans notre atelier avant de rejoindre la table où vous le poserez.", async () => {
    assertEquals(await applyGuardedCarouselCorrection(doc, opts), doc);
  });
});

Deno.test("carrousel : le plafonnement du score ne cache pas un chiffre inventé supplémentaire", async () => {
  const doc = JSON.stringify({ slides: [{ body: "5 jours de séchage, 6 jours de cuisson, 7 jours de finition et 8 jours de livraison." }], caption: {} });
  await withCorrection("[SLIDE 1 - BODY] 5 jours de séchage, 6 jours de cuisson, 7 jours de finition, 8 jours de livraison et 9 jours pour les retours depuis la réception de votre bol.", async () => {
    assertEquals(await applyGuardedCarouselCorrection(doc, opts), doc);
  });
});
