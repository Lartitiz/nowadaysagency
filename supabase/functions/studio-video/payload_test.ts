import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildVideoPrompt, signPreparation, verifyPreparation } from "./prepare.ts";
import { estimate, MODELS, submit, type VideoInput } from "./higgsfield.ts";
import { preparationAspectRatio, videoInputForQuote, videoInputFromJob } from "./payload.ts";

const requestId = "3c90c3cc-0d44-4b50-8888-8dd25736052a";

Deno.test("confirmed Claude prompt reaches both Higgsfield JSON bodies through the saved job", async () => {
  Deno.env.set("HIGGSFIELD_API_KEY", "test-id:test-secret");
  const prepared = {
    summary: "Le bol bleu conserve son étiquette ; le mannequin fictif le prend sur la table rouge.",
    scene: "0–2 s : le bol bleu est sur la table rouge. 2–5 s : le mannequin fictif le soulève doucement. Caméra fixe.",
    invariants: ["Le bol bleu et son étiquette restent inchangés.", "La table rouge reste identique."],
    allowed_changes: "Le bras et le bol bougent pendant le geste.",
    forbidden_changes: "Pas de seconde table ni de nouveau logo.",
  };
  const refs = [{ kind: "photo", id: "a", role: "product" }, { kind: "studio_version", id: "b", role: "casting" }];
  const prompt = buildVideoPrompt(prepared, 5, refs);
  const signed = { workspace_id: "space", source_kind: "references", references: refs,
    duration: 5, resolution: "480p", aspect_ratio: "9:16", idea: "Le mannequin prend le bol.",
    summary: prepared.summary, continuity: prepared.invariants,
    allowed_changes: prepared.allowed_changes, forbidden_changes: prepared.forbidden_changes, prompt };
  const token = await signPreparation(signed, "user", "test-secret");
  assert(await verifyPreparation(token, signed, "user", "test-secret"));
  const urls = ["https://cdn.example.com/bol.png", "https://cdn.example.com/mannequin.png"];
  const quoteInput = videoInputForQuote("references", signed.prompt, 5, "480p", "9:16", urls);
  const bodies: VideoInput[] = [];
  const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(bodies.length === 1 ? { usd: 1, credits: 10 } :
      { request_id: requestId }), { status: 200 });
  };
  await estimate(quoteInput, fetcher as typeof fetch, MODELS.references);
  const saved = { source_kind: "references", prompt: quoteInput.prompt, duration: quoteInput.duration,
    resolution: quoteInput.resolution, aspect_ratio: quoteInput.aspect_ratio, input_urls: quoteInput.image_urls };
  await submit(videoInputFromJob(saved), undefined, fetcher as typeof fetch, MODELS.references);
  assertEquals(bodies, [quoteInput, quoteInput]);
  assertEquals(bodies[1].prompt, prompt);
  assertEquals((bodies[1] as { image_urls: string[] }).image_urls, urls);
  assertEquals(bodies[1].generate_audio, false);
  assert(prompt.includes("@Image 1 = produit à préserver ; @Image 2 = mannequin fictif"));
});

Deno.test("text and first-frame image jobs preserve their distinct payload shapes", () => {
  const text = videoInputForQuote("text", "Un plan calme", 4, "720p", "16:9", []);
  assertEquals(videoInputFromJob({ source_kind: "text", prompt: text.prompt, duration: 4,
    resolution: "720p", aspect_ratio: "16:9" }), text);
  const image = videoInputForQuote("photo", "Le produit tourne", 6, "480p", "9:16",
    ["https://cdn.example.com/product.png"]);
  assertEquals(videoInputFromJob({ source_kind: "photo", prompt: image.prompt, duration: 6,
    resolution: "480p", aspect_ratio: "9:16", input_url: "https://cdn.example.com/product.png" }), image);
  assert(!("aspect_ratio" in image));
  assertEquals(preparationAspectRatio("photo", "9:16"),
    "follows the source image; no aspect_ratio parameter on image-to-video");
  assertEquals(preparationAspectRatio("references", "9:16"), "9:16");
});
