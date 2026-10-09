import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { COMPACT_SLIDE_PROPERTIES, expandCompactPlan } from "./compact-plan.ts";
import { buildConfirmedStructureBlock } from "./confirmed-structure.ts";

const compact = () => ({
  narrative_thread: "Fil",
  photo_notes: [
    { photo_index: 1, observation: "Portrait de face, lumière douce ; lieu inconnu.", anchor: "Visage et regard" },
    { photo_index: 2, observation: "Savons empilés sur un plan de travail.", anchor: "x".repeat(200) },
  ],
  slides: [
    { slide_number: 1, role: "hook", title_suggestion: "Titre 1", contribution: "Pose la promesse", image_relation: "Présence de la créatrice", photo_index: 1 },
    { slide_number: 2, role: "body", title_suggestion: "Titre 2", contribution: "Explique le choix", photo_index: 2 },
    { slide_number: 3, role: "body", title_suggestion: "Titre 3", develops: "Conséquence", photo_index: 1 },
    { slide_number: 4, role: "body", title_suggestion: "Titre 4", slide_type: "text_only" },
  ],
});

Deno.test("plan compact : chaque slide retrouve les champs lus en aval à partir de photo_notes", () => {
  const out = expandCompactPlan(compact());
  assert(!("photo_notes" in out));
  assertEquals(out.narrative_thread, "Fil");
  assertEquals(out.slides.map((s: any) => s.photo_observation), [
    "Portrait de face, lumière douce ; lieu inconnu.", "Savons empilés sur un plan de travail.", "Portrait de face, lumière douce ; lieu inconnu.", undefined,
  ]);
  assertEquals(out.slides[0].visual_anchor, "Visage et regard");
  assertEquals(out.slides[1].visual_anchor.length, 120);
  // strategic_note est obligatoire en aval : contribution, sinon develops, sinon le titre.
  assertEquals(out.slides.map((s: any) => s.strategic_note), ["Pose la promesse", "Explique le choix", "Conséquence", "Titre 4"]);
  assertEquals(out.slides[0].image_role, "Présence de la créatrice");
  assert(!("image_role" in out.slides[1]));
  assert(!("visual_anchor" in out.slides[3]));
});

Deno.test("plan compact : un champ déjà écrit par le modèle n'est jamais écrasé, une note invalide est ignorée", () => {
  const plan: any = compact();
  plan.slides[0] = { ...plan.slides[0], strategic_note: "Note propre", photo_observation: "Observation propre", visual_anchor: "Ancre propre", image_role: "Rôle propre" };
  plan.photo_notes.push({ photo_index: 0, observation: "hors liste" }, { photo_index: 1, observation: "doublon" });
  const out = expandCompactPlan(plan);
  assertEquals([out.slides[0].strategic_note, out.slides[0].photo_observation, out.slides[0].visual_anchor, out.slides[0].image_role], ["Note propre", "Observation propre", "Ancre propre", "Rôle propre"]);
  assertEquals(out.slides[2].photo_observation, "Portrait de face, lumière douce ; lieu inconnu.");
  assertEquals(expandCompactPlan(null), null);
  assertEquals(expandCompactPlan({ slides: "x" }), { slides: "x" });
});

Deno.test("plan compact : le schéma par slide ne répète plus la description des photos et garde tous les autres champs", () => {
  for (const key of ["photo_observation", "visual_anchor"]) assert(!(key in COMPACT_SLIDE_PROPERTIES), key);
  // Fusion strategic_note/contribution et image_role/image_relation essayée puis retirée (ton plus « IA »).
  for (const key of ["strategic_note", "image_role", "contribution", "inherits", "develops", "story_beat", "image_relation", "factual_basis", "photo_index", "overlay_position"]) assert(key in COMPACT_SLIDE_PROPERTIES, key);
});

Deno.test("plan compact : la rédaction lit chaque information une fois, l'ancien plan reste lu en entier", () => {
  const [slide] = expandCompactPlan(compact()).slides;
  const block = buildConfirmedStructureBlock([slide], { withStoryBeat: true, scenarioOrigin: "automatic" });
  assertEquals(block.split("Pose la promesse").length - 1, 1);
  assertEquals(block.split("Présence de la créatrice").length - 1, 1);
  assert(block.includes("Observation visuelle (analyse IA) : Portrait de face"));
  assert(block.includes("Détail de composition (pas une consigne de texte) : Visage et regard"));
  const legacy = buildConfirmedStructureBlock([{ slide_number: 1, role: "hook", title_suggestion: "T", strategic_note: "NOTE", contribution: "APPORT", image_role: "ROLE", image_relation: "RELATION" }], { withStoryBeat: true });
  for (const value of ["NOTE", "APPORT", "ROLE", "RELATION"]) assert(legacy.includes(value), value);
});
