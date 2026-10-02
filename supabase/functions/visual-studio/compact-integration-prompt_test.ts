import { assertEquals, assert, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { compactIntegrationPrompt } from "./compact-integration-prompt.ts";
import { imagePrompt, type Proposal } from "./media.ts";
import { imageInputPaths } from "./photo-preservation.ts";
import { imageInput, marketingPrompt, marketingPromptTooLong, MARKETING_FIDELITY_MODEL } from "./higgsfield-image.ts";

const fixture = async (): Promise<Proposal> => JSON.parse(await Deno.readTextFile(new URL("./fixtures/marketing-integration.json", import.meta.url)));

Deno.test("failed table integration fits with all confirmed fields and target mappings intact", async () => {
  const p = await fixture(), before = JSON.stringify(p);
  assert(imagePrompt(p).length > 9000);
  const out = marketingPrompt(p);
  assert(out && out.length <= 5000);
  for (const text of [p.summary!, p.image_prompt!, p.product_placement!, ...p.preserve!, ...p.change!,
    ...p.scene_workflow!.accepted_changes!, ...p.scene_workflow!.targets!.flatMap(t => [t.location, t.instruction])]) assert(out.includes(text), text);
  assert(out.includes("Sources: Image 2"));
  assert(!out.includes("provisional person"));
  assert(!out.includes("face, hair"));
  const urls = imageInputPaths(p).map((_, i) => `https://example.com/${i}.jpg`);
  const input = imageInput(p, urls);
  assertEquals(input.prompt, out);
  assertEquals(input.image_urls, urls);
  assertEquals(input.enhance_prompt, false);
  assertEquals(JSON.stringify(p), before);
});

for (const combined of [false, true]) Deno.test(`compact integration preserves ${combined ? "person and product" : "person"} originals`, async () => {
  const p = await fixture();
  const person = { id: "person", photo_id: null, path: "fixture/person.jpg", role: "casting" as const, name: "Alex", description: "Identité fictive : cheveux courts, yeux bruns." };
  p.references = combined ? [...p.references!, person] : [person];
  p.summary = "Intégrer les originaux dans la scène approuvée.";
  p.image_prompt = "Replace every listed provisional subject with their exact originals.";
  p.change = ["Intégrer Alex sans modifier sa tenue approuvée."];
  p.person_reference = { mode: "scene", name: "Alex", stable_traits: "Cheveux courts, yeux bruns.", variable_details: "Veste bleue, assis.", views: [] };
  const target = { ...p.scene_workflow!.targets![0], role: "person" as const, reference_ids: ["person"], instruction: "Remplacer la personne au fauteuil par Alex.", location: "fauteuil" };
  p.scene_workflow!.targets = combined ? [...p.scene_workflow!.targets!, target] : [target];
  const out = compactIntegrationPrompt(p)!;
  assert(out.length < 5000);
  assert(out.includes(`Sources: Image ${combined ? 3 : 2}`));
  for (const text of [person.description, p.person_reference.stable_traits, p.person_reference.variable_details,
    target.instruction, "Replace each provisional subject", "keep approved pose/outfit", "If only a product changes, keep the person."]) assert(out.includes(text));
});

Deno.test("subsequent edits preserve accepted choices, current base, source and identity without repeating replacements", async () => {
  const p = await fixture();
  p.input_path = "fixture/edited.jpg";
  p.change = ["Éclaircir uniquement le plateau."];
  p.exact_text = ["Été 2026 — 25 €"];
  const out = compactIntegrationPrompt(p)!;
  assertEquals(imageInputPaths(p), [p.input_path, p.references![0].path, "fixture/scene.jpg"]);
  assert(out.includes("TARGETED PHOTO EDIT of Image 1"));
  assert(out.includes("Image 3: photographic source"));
  assert(out.includes("do not repeat initial replacements"));
  assert(!out.includes(p.scene_workflow!.targets![0].instruction));
  assert(out.includes(p.change[0]));
  assert(out.includes(p.exact_text[0]));
  for (const text of p.scene_workflow!.accepted_changes!) assert(out.includes(text));
});

Deno.test("oversized confirmed text is rejected without truncation or provider call", async () => {
  const p = await fixture(); p.image_prompt = "z".repeat(6000);
  assert(compactIntegrationPrompt(p)!.includes(p.image_prompt));
  assertEquals(marketingPrompt(p), null);
  assertEquals(marketingPromptTooLong(p), true);
  assertThrows(() => imageInput(p, []), Error, "studio_prompt_too_long");
  assertEquals(marketingPromptTooLong({ ...p, provider: "default" }), false);
  assertEquals(marketingPromptTooLong({ ...p, model: "higgsfield-ai/soul/v2/standard" }), false);
});

Deno.test("series preflight checks the base shot and every additional shot", () => {
  const p = { operation: "create", provider: "higgsfield", model: MARKETING_FIDELITY_MODEL, summary: "Vue principale", image_prompt: "A green chair.",
    shots: [{ summary: "Vue 1", image_prompt: "A blue chair.", format: "square" }, { summary: "Vue 2", image_prompt: "A red chair.", format: "square" }] };
  assertEquals(marketingPromptTooLong(p), false);
  p.summary = "x".repeat(6000);
  assertEquals(marketingPromptTooLong(p), true);
  p.summary = "Vue principale";
  p.shots[1].image_prompt = "x".repeat(6000);
  assertEquals(marketingPromptTooLong(p), true);
});

Deno.test("targets and accepted choices repeated verbatim in Changes are written once", async () => {
  const p = await fixture();
  const t = p.scene_workflow!.targets![0];
  p.change = [`${t.location} : ${t.instruction}`];
  p.scene_workflow!.accepted_changes = ["Bague exacte", "Bague exacte bien visible", "Bague exacte bien visible"];
  const out = compactIntegrationPrompt(p)!;
  assertEquals(out.split(t.instruction).length, 2);
  assert(out.includes("Change 1 Sources: Image 2"));
  assertEquals(out.split("Bague exacte").length, 2);
});

Deno.test("an original scene that is not sent is never named as an image", async () => {
  const p = await fixture();
  p.input_path = "fixture/edited-2.jpg";
  p.photo_source_path = "fixture/original-scene.jpg";
  p.scene_workflow!.approved_scene_id = "approved";
  p.scene_workflow!.scene_path = "fixture/previous-edit.jpg";
  const out = compactIntegrationPrompt(p)!;
  assert(!out.includes("Image 0"));
  assert(!out.includes("approved original scene"));
  assert(!imagePrompt(p).includes("Image 0"));
});

Deno.test("subsequent edit beyond the limit keeps the current request and the newest accepted choices", async () => {
  const p = await fixture();
  p.input_path = "fixture/edited.jpg";
  p.change = ["Main plus naturelle."];
  const many = Array.from({ length: 30 }, (_, i) => `Choix accepté numéro ${i} avec un peu de détail pour la longueur`);
  p.scene_workflow!.accepted_changes = many;
  const full = compactIntegrationPrompt(p)!;
  const fitted = compactIntegrationPrompt(p, 4000)!;
  assert(full.length > fitted.length);
  assert(fitted.length <= 4000);
  assert(fitted.includes(many[29]));
  assert(!fitted.includes(`${many[0]};`));
  assert(fitted.includes("earlier ones are already visible in Image 1"));
  for (const text of [p.summary!, p.image_prompt!, ...p.change, ...p.preserve!]) assert(fitted.includes(text));
});

Deno.test("an initial integration never drops accepted choices to fit", async () => {
  const p = await fixture();
  p.scene_workflow!.accepted_changes = Array.from({ length: 30 }, (_, i) => `Choix ${i} assez long pour peser dans la demande`);
  assertEquals(compactIntegrationPrompt(p, 1000), compactIntegrationPrompt(p));
});
