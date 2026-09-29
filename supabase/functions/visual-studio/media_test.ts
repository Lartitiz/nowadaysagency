import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { generateImage, imagePrompt, visionBlock, legacyReferences, ProviderOutcomeUncertainError } from "./media.ts";
import { intentSchema, premiumAllowed } from "./contract.ts";
Deno.test(
  "advice is non-generating, free creation needs a prompt and Premium is server-owned",
  () => {
    assertEquals(
      intentSchema.safeParse({
        operation: "advise",
        summary: "Une piste graphique",
      }).success,
      true,
    );
    assertEquals(
      intentSchema.safeParse({ operation: "create", summary: "Une image" })
        .success,
      false,
    );
    assertEquals(premiumAllowed("free", false), false);
    assertEquals(premiumAllowed("free", true), true);
  },
);
Deno.test(
  "original is preserved and explicit empty references do not revive it",
  () => {
    const s = {
      source_path: "original",
      source_photo_id: "photo",
      name: "Photo",
      source_metadata: { kind: "portrait" },
    };
    assertEquals(legacyReferences(s)[0].role, "subject");
    assertEquals(legacyReferences({ ...s, references: [] }), []);
  },
);
Deno.test(
  "source-free generation and editing selected parent use different API transports",
  async () => {
    const old = globalThis.fetch;
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({ data: [{ b64_json: btoa("result") }] }),
        { headers: { "Content-Type": "application/json" } },
      );
    };
    try {
      await generateImage(
        {
          operation: "create",
          image_prompt: "Flat illustration",
          format: "landscape",
          model: "test",
        },
        [],
      );
      assertEquals(calls[0].url.endsWith("/generations"), true);
      assertEquals(JSON.parse(String(calls[0].init?.body)).size, "1536x1024");
      await generateImage(
        {
          operation: "edit",
          image_prompt: "Remove plant",
          input_path: "selected-v1",
          model: "test",
          references: [
            {
              id: "ref",
              photo_id: "p",
              path: "source",
              role: "subject",
              name: "My cup",
            },
          ],
        },
        [
          new Blob(["parent"], { type: "image/jpeg" }),
          new Blob(["subject"], { type: "image/jpeg" }),
        ],
      );
      assertEquals(calls[1].url.endsWith("/edits"), true);
      const form = calls[1].init?.body as FormData;
      assertEquals(await (form.getAll("image[]")[0] as Blob).text(), "parent");
      assertEquals(await (form.getAll("image[]")[1] as Blob).text(), "subject");
      assertEquals(
        String(form.get("prompt")).includes("Image 2: subject"),
        true,
      );
    } finally {
      globalThis.fetch = old;
    }
  },
);
Deno.test("vision refuses oversized images explicitly", async () => {
  await assertRejects(
    () =>
      visionBlock(
        new Blob([new Uint8Array(5_000_001)], { type: "image/jpeg" }),
      ),
    Error,
    "studio_image_too_large",
  );
});
Deno.test("vision resizes legacy sources for interpretation without changing the original", async () => {
  const original = new Blob([new Uint8Array(5_000_001)], { type: "image/jpeg" });
  const widths: number[] = [];
  const result = await visionBlock(original, async (width) => {
    widths.push(width);
    return new Blob([width === 2048 ? new Uint8Array(5_000_001) : "resized"], {
      type: "image/jpeg",
    });
  });
  assertEquals(widths, [2048, 1600]);
  assertEquals(original.size, 5_000_001);
  assertEquals(result.source.data, btoa("resized"));
  await assertRejects(
    () => visionBlock(original, async () => null),
    Error,
    "studio_image_too_large",
  );
});

Deno.test("lost OpenAI and Photoroom responses are uncertain; explicit 4xx is definite", async () => {
  const original = globalThis.fetch;
  const cases = [
    { operation: "create", image_prompt: "A useful illustration" },
    { operation: "background", background_prompt: "Blue wall" },
  ];
  try {
    for (const proposal of cases) {
      const inputs = proposal.operation === "background"
        ? [new Blob(["source"], { type: "image/jpeg" })]
        : [];
      globalThis.fetch = () => Promise.reject(new TypeError("connection lost"));
      await assertRejects(() => generateImage(proposal, inputs), ProviderOutcomeUncertainError);
      globalThis.fetch = () => Promise.resolve(new Response("upstream error", { status: 503 }));
      await assertRejects(() => generateImage(proposal, inputs), ProviderOutcomeUncertainError);
      globalThis.fetch = () => Promise.resolve(new Response("bad request", { status: 400 }));
      await assertRejects(() => generateImage(proposal, inputs), Error, "rejected request");
    }
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("a series shot does not inherit conflicting framing from the other shots", () => {
  const proposal = {
    operation: "create", series_size: 2,
    image_prompt: "Close-up bust, front-facing, legs outside the frame",
    change: ["First photo: three-quarter length", "Second photo: close-up bust"],
    preserve: ["cobalt jacket", "approved fictional face"],
  };
  const prompt = imagePrompt(proposal);
  assertEquals(prompt.includes("First photo: three-quarter length"), false);
  assertEquals(prompt.includes(proposal.image_prompt), true);
  assertEquals(prompt.includes("cobalt jacket"), true);
  assertEquals(prompt.includes("not a collage"), true);
  assertEquals(imagePrompt({...proposal, series_size: undefined, operation: "edit"}).includes("First photo: three-quarter length"), true);
});

Deno.test("poster prompt renders confirmed copy in the image", () => {
  const prompt = imagePrompt({
    operation: "create",
    image_prompt: "Affiche portrait pour un atelier de céramique avec le titre et la date ci-dessous.",
    exact_text: ["Atelier Céramique", "12 décembre"],
  });
  assertEquals(prompt.includes('"Atelier Céramique"'), true);
  assertEquals(prompt.includes('"12 décembre"'), true);
  assertEquals(prompt.includes("Do not invent dates"), true);
});

Deno.test("the image provider receives the saved visual charter with the shot's priorities", () => {
  const prompt = imagePrompt({
    operation: "product",
    image_prompt: "Photograph the exact cobalt bag against a white wall",
    references: [{ id: "product", photo_id: "product", path: "private", role: "product", name: "Cobalt bag" }],
    brand_context: { charter: {
      photo_style: "Natural daylight, textured surfaces",
      mood_keywords: ["quiet", "warm"],
      visual_donts: ["plastic skin", "fake logos"],
    } },
  });
  assertEquals(prompt.includes("Natural daylight, textured surfaces"), true);
  assertEquals(prompt.includes("quiet; warm"), true);
  assertEquals(prompt.includes("plastic skin; fake logos"), true);
  assertEquals(prompt.includes("exact person or product references take priority"), true);
  assertEquals(prompt.includes("Preserve this exact product"), true);
  assertEquals(imagePrompt({ operation: "create", image_prompt: "A drawing" }).includes("Brand visual direction"), false);
});
Deno.test("multiple product views remain one subject while a mood photo stays style-only", () => {
  const prompt = imagePrompt({
    operation: "product",
    image_prompt: "Show my single bowl using its front and detail photos in a new scene",
    references: [
      { id: "front", photo_id: "front", path: "front.jpg", role: "product", name: "Bol de face" },
      { id: "detail", photo_id: "detail", path: "detail.jpg", role: "product", name: "Détail de l'émail" },
      { id: "mood", photo_id: "mood", path: "mood.jpg", role: "style", name: "Lumière du matin" },
    ],
  });
  assertEquals(prompt.includes("Image 1: product reference, Bol de face"), true);
  assertEquals(prompt.includes("Image 2: product reference, Détail de l'émail"), true);
  assertEquals(prompt.includes("Image 3: style reference, Lumière du matin"), true);
  assertEquals(prompt.includes("do not add a separate copy for each reference"), true);
  assertEquals(prompt.includes("Keep style-only references distinct"), true);
});

Deno.test("natural photo treatment reaches OpenAI for text and reference requests only", async () => {
  const natural = {
    operation: "edit",
    visual_kind: "photo" as const,
    photo_treatment: "natural" as const,
    image_prompt: "Keep the woman sorting fruit, reduce the lavender and simplify the terrace",
    input_path: "selected-v1",
    references: [{ id: "style", photo_id: "style", path: "reference", role: "style" as const, name: "Lavender terrace" }],
    brand_context: { charter: { photo_style: "Warm Mediterranean sunlight" } },
  };
  const prompt = imagePrompt(natural);
  assertEquals(prompt.includes("reduce the lavender"), true);
  assertEquals(prompt.includes("simplify or remove those elements"), true);
  assertEquals(prompt.includes("credible skin and material texture"), true);
  assertEquals(prompt.includes("moderate depth of field"), true);
  assertEquals(prompt.includes("Warm Mediterranean sunlight"), true);
  assertEquals(prompt.includes("Keep its other features"), false);
  assertEquals(imagePrompt({ ...natural, photo_treatment: "directed" }).includes("candid moment"), false);
  assertEquals(imagePrompt({ ...natural, visual_kind: "graphic" }).includes("candid moment"), false);
  assertEquals(imagePrompt({ ...natural, exact_text: ["Atelier"] }).includes("candid moment"), false);
  const original = globalThis.fetch;
  let sentPrompt = "";
  globalThis.fetch = async (_input, init) => {
    sentPrompt = String((init?.body as FormData).get("prompt"));
    return new Response(JSON.stringify({ data: [{ b64_json: btoa("image") }] }), { headers: { "Content-Type": "application/json" } });
  };
  try {
    await generateImage(natural, [new Blob(["source"], { type: "image/jpeg" })]);
    assertEquals(sentPrompt, prompt);
  } finally {
    globalThis.fetch = original;
  }
});
