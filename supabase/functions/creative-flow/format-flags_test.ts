// Détection unique du format (format-flags.ts, fiche 3, lot F3, 14/10/2026).
// Fige les drapeaux par contentType / angle, et les cas qui ont changé en
// passant à une seule détection pour tout le handler.
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/creative-flow/format-flags_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectFormatFlags, personaChannel } from "./format-flags.ts";
import { callOptionsForStep } from "./call-options.ts";
import { buildQuestionsPrompt } from "./prompts/assist.ts";

const on = (ct: string | null, livraison?: string) => {
  const f = detectFormatFlags(ct, livraison ? { format_livraison: livraison } : null);
  return Object.entries(f).filter(([k, v]) => k.startsWith("is") && v === true).map(([k]) => k).sort();
};

Deno.test("detectFormatFlags : un format par contentType envoyé par le front", () => {
  assertEquals(on("instagram_post"), ["isCaption"]);
  assertEquals(on("post_instagram"), ["isCaption"]);
  assertEquals(on("linkedin_post"), ["isLinkedIn"]);
  assertEquals(on("post_linkedin"), ["isLinkedIn"]);
  assertEquals(on("story"), ["isStories"]);
  assertEquals(on("stories"), ["isStories"]);
  assertEquals(on("reel"), ["isReel"]);
  assertEquals(on("script"), ["isReel"]);
  assertEquals(on("email"), ["isNewsletter"]);
  assertEquals(on("post_newsletter"), ["isNewsletter"]);
  assertEquals(on("post_pinterest"), ["isPinterest"]);
  assertEquals(on("carrousel"), ["isCarousel"]);
  assertEquals(on("carousel"), ["isCarousel"]);
});

Deno.test("detectFormatFlags : contentType prime, l'angle ne sert que sans contentType ; casse ignorée", () => {
  assertEquals(on("post_linkedin", "carrousel"), ["isLinkedIn"]);
  assertEquals(on("", "linkedin"), ["isLinkedIn"]);
  assertEquals(on(null, "Stories"), ["isStories"]);
  assertEquals(on("LinkedIn"), ["isLinkedIn"]);
  assertEquals(detectFormatFlags("post", null, { photo_mode: true }).isPhotoMode, true);
  assertEquals(detectFormatFlags("post", null, { photo_mode: "oui" }).isPhotoMode, false);
});

Deno.test("personaChannel : LinkedIn, Instagram (post, carrousel, reel, stories) ou aucun", () => {
  const ch = (ct: string | null, l?: string) => personaChannel(detectFormatFlags(ct, l ? { format_livraison: l } : null));
  assertEquals(ch("post_linkedin"), "linkedin");
  assertEquals(ch("instagram_post"), "instagram");
  assertEquals(ch("reel"), "instagram");
  assertEquals(ch("stories"), "instagram");
  assertEquals(ch("carousel"), "instagram");
  assertEquals(ch("post"), undefined);
  assertEquals(ch("post_newsletter"), undefined);
  assertEquals(ch("post_pinterest"), undefined);
  // Changés au lot F3 (avant : aucun canal, donc le persona principal).
  assertEquals(ch("story"), "instagram");
  assertEquals(ch("script"), "instagram");
  assertEquals(ch("carrousel"), "instagram");
  assertEquals(ch("", "linkedin"), "linkedin");
});

// ── Cas changés au lot F3 : avant, ces lectures ignoraient l'angle (et la casse) ──
const Q_BASE = { QUESTIONS_PREFIX: "", brandingContext: "", brandVocabBlock: "", context: "Mes prix", editorialFormatLabel: null, calendarBlock: "", objectiveBlock: "", newsContextBlock: "", recentBriefsContext: "" };

Deno.test("lot F3 — questions : sans contentType, le canal suit le format de livraison de l'angle", () => {
  const label = (livraison: string) =>
    buildQuestionsPrompt({ ...Q_BASE, contentType: "", angle: { title: "A", structure: ["a"], tone: "t", format_livraison: livraison } }).systemPrompt.match(/- Canal : (\w+)/)?.[1];
  assertEquals(label("linkedin"), "LinkedIn");
  assertEquals(label("newsletter"), "Newsletter");
  assertEquals(label("pinterest"), "Pinterest");
  assertEquals(label("reel"), "Instagram");
  // contentType fourni : il prime toujours.
  assertEquals(buildQuestionsPrompt({ ...Q_BASE, contentType: "instagram_post", angle: { title: "A", structure: [], tone: "t", format_livraison: "linkedin" } }).systemPrompt.match(/- Canal : (\w+)/)?.[1], "Instagram");
});

Deno.test("lot F3 — température : un post rédigé pour LinkedIn est réglé pour LinkedIn, même sans contentType", () => {
  const f = detectFormatFlags("", { format_livraison: "linkedin" });
  assert(f.isLinkedIn);
  assertEquals(callOptionsForStep({ step: "generate", isLinkedIn: f.isLinkedIn, isPhotoMode: false, context: "Mes prix" }).tempText, 0.7);
});
