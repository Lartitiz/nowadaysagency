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
      assertEquals(JSON.parse(String((calls[0].init as { body?: unknown } | undefined)?.body)).size, "1536x1024");
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
      const form = (calls[1].init as { body?: unknown } | undefined)?.body as FormData;
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

Deno.test("provider diagnostics retain status and code without free-form private data", async () => {
  const original = globalThis.fetch;
  const originalLog = console.error;
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    for (const code of ["rate_limit_exceeded", "https://private.example/token?secret=private"]) {
      globalThis.fetch = () => Promise.resolve(Response.json({ error: { code, message: "private prompt and token" } }, { status: 429 }));
      await assertRejects(() => generateImage({ operation: "create", image_prompt: "private prompt" }, []));
    }
    assertEquals(logs, [
      ["[studio:image-provider-rejected]", JSON.stringify({ status: 429, code: "rate_limit_exceeded" })],
      ["[studio:image-provider-rejected]", JSON.stringify({ status: 429, code: "unspecified" })],
    ]);
  } finally { globalThis.fetch = original; console.error = originalLog; }
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

Deno.test("actual provider payload separates casting bytes from mood and starts sheets with the method", async () => {
  const old=globalThis.fetch;
  const calls: RequestInit[]=[];
  globalThis.fetch=async(_url,init)=>{calls.push(init!);return new Response(JSON.stringify({data:[{b64_json:btoa("result")}]}));};
  const person={mode:"sheet" as const,name:"Nora fictive",stable_traits:"42 ans, bague à gauche",variable_details:"T-shirt bleu",views:["face","profil"]};
  try{
    await generateImage({operation:"create",image_prompt:"Nora",person_reference:person},[]);
    const sheetPrompt = JSON.parse(String(calls[0].body)).prompt;
    assertEquals(sheetPrompt.startsWith("photorealistic character reference sheet"),true);
    await generateImage({operation:"create",image_prompt:"New scene",person_reference:{...person,mode:"scene",views:[]},references:[{id:"nora",photo_id:null,path:"nora",role:"casting",name:"Nora"},{id:"mood",photo_id:null,path:"mood",role:"style",name:"Bibliothèque"}]},[new Blob(["approved-nora"],{type:"image/jpeg"}),new Blob(["library-mood"],{type:"image/jpeg"})]);
    const form=calls[1].body as FormData;
    assertEquals(await (form.getAll("image[]")[0] as Blob).text(),"approved-nora");
    assertEquals(await (form.getAll("image[]")[1] as Blob).text(),"library-mood");
    assertEquals(String(form.get("prompt")).includes("Image 1: casting reference, Nora"),true);
    assertEquals(String(form.get("prompt")).includes("Image 2: style reference, Bibliothèque"),true);
    assertEquals(String(form.get("prompt")).includes("photorealistic character reference sheet"),false);
    // Both provider routes must receive the realism rule, not only the interpreter.
    for (const prompt of [sheetPrompt, String(form.get("prompt"))]) {
      assertEquals(prompt.includes("A believable everyday person"), true);
      assertEquals(prompt.includes("Preserve the approved face and build"), true);
      assertEquals(prompt.includes("Do not manufacture blemishes, wrinkles, scars or unattractiveness"), true);
      assertEquals(prompt.includes("Explicitly requested makeup, grooming and fashion styling"), true);
    }
  }finally{globalThis.fetch=old;}
});

Deno.test("human realism preserves requested styling and does not apply to object-only prompts", () => {
  const prompt = imagePrompt({operation:"create",image_prompt:"Nora wearing vivid red lipstick",person_reference:{mode:"sheet",name:"Nora fictive",stable_traits:"42 ans",variable_details:"Vivid red lipstick and a tailored evening suit",views:["face","profil"]}});
  assertEquals(prompt.includes("Vivid red lipstick and a tailored evening suit"), true);
  assertEquals(prompt.includes("A believable everyday person"), true);
  assertEquals(imagePrompt({operation:"create",image_prompt:"A ceramic bowl"}).includes("HUMAN REALISM"), false);
});

Deno.test("product staging sends the confirmed support and keeps the mood reference out of the pose", async () => {
  const proposal = {
    operation: "product",
    visual_kind: "photo" as const,
    image_prompt: "La céramique aux coquelicots repose à plat sur la table dans la cour provençale.",
    product_placement: "À plat sur la table en pierre, son fond en contact avec la surface.",
    brand_context: { charter: { photo_style: "Mediterranean lifestyle", visual_direction: { composition: "Product centered" } } },
    references: [
      { id: "plate", photo_id: "plate", path: "plate.jpg", role: "product" as const, name: "Céramique aux coquelicots" },
      { id: "mood", photo_id: "mood", path: "cour.jpg", role: "style" as const, name: "Cour provençale" },
    ],
  };
  const original = globalThis.fetch;
  let prompt = "";
  globalThis.fetch = async (_input, init) => {
    prompt = String(((init as any)?.body as FormData).get("prompt"));
    return new Response(JSON.stringify({ data: [{ b64_json: btoa("image") }] }), {
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await generateImage(proposal, [
      new Blob(["plate"], { type: "image/jpeg" }),
      new Blob(["mood"], { type: "image/jpeg" }),
    ]);
    assertEquals(prompt.includes("Confirmed product placement: À plat sur la table en pierre"), true);
    assertEquals(prompt.includes("real contact with the confirmed supporting surface"), true);
    assertEquals(prompt.includes("match that setting's camera perspective"), true);
    assertEquals(prompt.includes("Image 1: product reference"), true);
    assertEquals(prompt.includes("Image 2: style reference"), true);
    assertEquals(prompt.includes("Do not copy its foreground props"), true);
    assertEquals(prompt.includes("Confirmed product placement takes priority over brand composition advice"), true);
  } finally { globalThis.fetch = original; }
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
  assertEquals(prompt.includes("Do not automatically simplify the setting"), true);
  assertEquals(prompt.includes("credible material and skin textures"), true);
  assertEquals(prompt.includes("moderate depth of field"), false);
  assertEquals(prompt.includes("Warm Mediterranean sunlight"), false);
  assertEquals(prompt.includes("Keep its other features"), false);
  assertEquals(imagePrompt({ ...natural, photo_treatment: "directed" }).includes("Natural photograph with coherent light"), false);
  assertEquals(imagePrompt({ ...natural, visual_kind: "graphic" }).includes("Natural photograph with coherent light"), false);
  assertEquals(imagePrompt({ ...natural, exact_text: ["Atelier"] }).includes("Natural photograph with coherent light"), false);
  const original = globalThis.fetch;
  let sentPrompt = "";
  globalThis.fetch = async (_input, init) => {
    sentPrompt = String(((init as any)?.body as FormData).get("prompt"));
    return new Response(JSON.stringify({ data: [{ b64_json: btoa("image") }] }), { headers: { "Content-Type": "application/json" } });
  };
  try {
    await generateImage(natural, [new Blob(["source"], { type: "image/jpeg" }), new Blob(["style"], { type: "image/jpeg" })]);
    assertEquals(sentPrompt, prompt);
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test("identity scenes in a series keep each shot's setting instead of the first scene",()=>{
 const prompt=imagePrompt({operation:"create",series_size:2,series_index:1,summary:"Nora seated in the library",image_prompt:"Nora reading",person_reference:{mode:"scene",name:"Nora",stable_traits:"42 ans, bague gauche",variable_details:"FIRST SHOT: standing in a garden",views:[]}});
 assertEquals(prompt.includes("FIRST SHOT"),false);assertEquals(prompt.includes("Nora seated in the library"),true);assertEquals(prompt.includes("42 ans, bague gauche"),true);
});
