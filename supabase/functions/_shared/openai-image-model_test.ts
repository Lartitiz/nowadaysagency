import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { OPENAI_IMAGE_MODEL_DEFAULTS, openaiImageModel } from "./openai-image-model.ts";

Deno.test("openaiImageModel : défauts GPT Image 2.5 (Flare slides, Sunburst mannequin)", () => {
  Deno.env.delete("OPENAI_IMAGE_MODEL_SLIDE");
  Deno.env.delete("OPENAI_IMAGE_MODEL_PRODUCT");
  assertEquals(openaiImageModel("slide"), "gpt-image-2.5-flare");
  assertEquals(openaiImageModel("product"), "gpt-image-2.5-sunburst");
});

Deno.test("openaiImageModel : le secret permet le retour arrière vers gpt-image-2", () => {
  Deno.env.set("OPENAI_IMAGE_MODEL_PRODUCT", " gpt-image-2 ");
  assertEquals(openaiImageModel("product"), "gpt-image-2");
  // L'autre usage n'est pas touché.
  Deno.env.delete("OPENAI_IMAGE_MODEL_SLIDE");
  assertEquals(openaiImageModel("slide"), OPENAI_IMAGE_MODEL_DEFAULTS.slide);
  Deno.env.delete("OPENAI_IMAGE_MODEL_PRODUCT");
});

Deno.test("openaiImageModel : une faute de frappe ne casse pas tous les appels", () => {
  Deno.env.set("OPENAI_IMAGE_MODEL_SLIDE", "gpt image 2");
  assertEquals(openaiImageModel("slide"), OPENAI_IMAGE_MODEL_DEFAULTS.slide);
  Deno.env.set("OPENAI_IMAGE_MODEL_SLIDE", "dall-e-3");
  assertEquals(openaiImageModel("slide"), OPENAI_IMAGE_MODEL_DEFAULTS.slide);
  Deno.env.delete("OPENAI_IMAGE_MODEL_SLIDE");
});
