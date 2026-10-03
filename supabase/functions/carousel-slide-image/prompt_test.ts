import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPrompt } from "./prompt.ts";
import { MARKETING_PROMPT_MAX } from "../_shared/higgsfield-image-api.ts";

const opts = {
  directive: "Une table d'atelier avec des bobines de fil, lumière du matin ".repeat(9).slice(0, 600),
  adjustment: "Avec une personne",
  brand: { activite: "a".repeat(400), photo_style: "b".repeat(800), mood_keywords: ["c".repeat(300)], visual_donts: "e".repeat(800), moodboard_description: "f".repeat(1200) },
};

Deno.test("Higgsfield : prompt slide ramené sous 5000 caractères, directive et ajustement intacts", () => {
  assert(buildPrompt(opts).length > MARKETING_PROMPT_MAX);
  const fitted = buildPrompt({ ...opts, maxLength: MARKETING_PROMPT_MAX });
  assert(fitted.length <= MARKETING_PROMPT_MAX);
  assert(fitted.includes(opts.directive.trim()) && fitted.endsWith("ADJUSTMENT REQUESTED (apply on top of everything above): Avec une personne"));
  assert(fitted.includes("STRICTLY FORBIDDEN: any real identifiable person"));
});

Deno.test("OpenAI (sans maxLength) : prompt slide inchangé", () => {
  const short = { ...opts, brand: { activite: "Céramiste" } };
  assertEquals(buildPrompt(short), buildPrompt({ ...short, maxLength: MARKETING_PROMPT_MAX }));
  assert(buildPrompt(opts).includes("f".repeat(1200)));
});
