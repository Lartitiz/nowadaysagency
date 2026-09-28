import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { generateImage, imagePrompt, visionBlock, legacyReferences } from "./media.ts";
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
