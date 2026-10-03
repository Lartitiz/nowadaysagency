import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

/**
 * Fidélité produit (28/09/2026) : l'interdit « logos » ne doit viser que ce qui
 * est AJOUTÉ à la scène — jamais le logo du produit de la cliente. On relit le
 * source : buildPrompt vit dans prompt.ts.
 */
Deno.test("le prompt mannequin garde le logo du produit et n'interdit que les logos ajoutés", async () => {
  const src = await Deno.readTextFile(new URL("./prompt.ts", import.meta.url));
  assert(!/added text, logos, watermarks/.test(src), "l'ancien interdit ambigu « logos » est revenu");
  assert(/ADDED to the scene/.test(src), "l'interdit doit préciser « ajouté à la scène »");
  assert(/KEEP ON THE PRODUCT: its own logo/.test(src), "la consigne de conservation du logo produit a disparu");
});

const longOpts = {
  mode: "porte", framing: "auto", ambiance: "terrasse de café ".repeat(17), adjustment: "lumière plus chaude, garder la bague",
  productDescription: "Bague en argent martelé ".repeat(40), hasPersonReference: true,
  brand: { activite: "a".repeat(200), photo_style: "b".repeat(300), mood_keywords: ["c".repeat(100)], visual_donts: "e".repeat(300), moodboard_description: "f".repeat(900) },
};

Deno.test("Higgsfield : prompt mannequin ramené sous 5000 caractères sans toucher à la demande", async () => {
  const { buildPrompt } = await import("./prompt.ts");
  const { MARKETING_PROMPT_MAX } = await import("../_shared/higgsfield-image-api.ts");
  const full = buildPrompt(longOpts);
  assert(full.length > MARKETING_PROMPT_MAX, "le cas de test doit dépasser la limite");
  const fitted = buildPrompt({ ...longOpts, maxLength: MARKETING_PROMPT_MAX });
  assert(fitted.length <= MARKETING_PROMPT_MAX, `encore ${fitted.length} caractères`);
  assert(fitted.endsWith("ADJUSTMENT REQUESTED (apply on top of everything above): lumière plus chaude, garder la bague"));
  assert(fitted.includes(longOpts.ambiance.trim()) && fitted.includes("SECOND attached image"));
  assert(fitted.includes("KEEP ON THE PRODUCT: its own logo"));
});
