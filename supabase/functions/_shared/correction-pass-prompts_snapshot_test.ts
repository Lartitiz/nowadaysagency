// Tests SNAPSHOT des prompts de _shared/correction-pass.ts, AVANT son découpage
// (docs/robustesse/gros-fichiers.md, fiche 9, lot 0 ; trou n°1 de
// docs/creation-contenu/CARTE.md, section 5) : les prompts de relecture
// newsletter, légende Instagram, reel, stories et carrousel n'étaient figés
// dans aucun snapshot.
//
// Un test rouge ici n'est PAS forcément un bug : si le changement de consigne
// est VOULU, régénère et relis le diff du .snap comme une relecture de prompt :
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/_shared/correction-pass-prompts_snapshot_test.ts -- --update
//
// Lancer (flags de la CI, script npm test:edges) :
//   deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/correction-pass-prompts_snapshot_test.ts

import { assertSnapshot } from "../../edge-tests/snapshot.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as correctionPass from "./correction-pass.ts";
import {
  CORRECTION_PROMPTS,
  type CorrectionFormat,
  RESEARCH_EXCESS_PROMPT,
  RESEARCH_SOURCING_PROMPT,
  sourceFirstCorrectionPrompt,
  TESTIMONY_REMOVAL_PROMPT,
} from "./correction-pass.ts";

const FORMATS: CorrectionFormat[] = ["linkedin", "carousel", "newsletter", "instagram_caption", "reel", "stories"];

// ── Surface d'export ──────────────────────────────────────────────────────
// Au découpage, correction-pass.ts réexportera chaque sous-module : ce test
// attrape un export oublié ou ajouté par erreur.
Deno.test("correction-pass : la liste des exports est exactement celle attendue (23)", () => {
  assertEquals(Object.keys(correctionPass).sort(), [
    "CORRECTION_PROMPTS",
    "RESEARCH_EXCESS_PROMPT",
    "RESEARCH_SOURCING_PROMPT",
    "TESTIMONY_REMOVAL_PROMPT",
    "applyCorrectionPass",
    "applyCorrectionPassCarousel",
    "applyCorrectionPassReel",
    "applyCorrectionPassStories",
    "applyResearchExcessPass",
    "applyResearchSourcingPass",
    "applyTestimonyRemovalPass",
    "carouselNeedsPolish",
    "correctionModel",
    "extractCarouselTexts",
    "extractNewsletterTexts",
    "extractStoriesTexts",
    "keepUnlessRealEdit",
    "reinjectCarouselTexts",
    "reinjectNewsletterTexts",
    "reinjectStoriesTexts",
    "sourceFirstCorrectionPrompt",
    "storiesAuditableText",
    "unwrapCorrectionOutput",
  ]);
});

// ── Prompts de relecture par format ───────────────────────────────────────
Deno.test("CORRECTION_PROMPTS : les 6 formats, ni plus ni moins", () => {
  assertEquals(Object.keys(CORRECTION_PROMPTS).sort(), [...FORMATS].sort());
});

Deno.test("CORRECTION_PROMPTS : un snapshot par format", async (t) => {
  for (const format of FORMATS) {
    await t.step(format, async (s) => {
      await assertSnapshot(s, CORRECTION_PROMPTS[format]);
    });
  }
});

// ── Prompt « fidélité aux sources » ───────────────────────────────────────
// Sans source : le prompt du format + les règles de clarté. Avec une source
// (ou des phrases de la personne) : un prompt unique, quel que soit le format.
Deno.test("sourceFirstCorrectionPrompt : sans source, prompt du format + clarté", async (t) => {
  for (const format of FORMATS) {
    await t.step(format, async (s) => {
      await assertSnapshot(s, sourceFirstCorrectionPrompt({}, CORRECTION_PROMPTS[format]));
    });
  }
});

Deno.test("sourceFirstCorrectionPrompt : source vide ou blanche = sans source", () => {
  const fallback = CORRECTION_PROMPTS.linkedin;
  assertEquals(sourceFirstCorrectionPrompt({ sourceContext: "   ", authoredText: "" }, fallback), sourceFirstCorrectionPrompt({}, fallback));
});

Deno.test("sourceFirstCorrectionPrompt : avec source, le même prompt pour chaque format", async (t) => {
  const withSource = FORMATS.map((f) => sourceFirstCorrectionPrompt({ sourceContext: "La tasse est fabriquée après réservation." }, CORRECTION_PROMPTS[f]));
  const withAuthored = FORMATS.map((f) => sourceFirstCorrectionPrompt({ authoredText: "Mes mots à moi." }, CORRECTION_PROMPTS[f]));
  for (const p of [...withSource, ...withAuthored]) assertEquals(p, withSource[0]);
  await assertSnapshot(t, withSource[0]);
});

// ── Passes factuelles ─────────────────────────────────────────────────────
Deno.test("prompts des passes factuelles", async (t) => {
  await t.step("RESEARCH_SOURCING_PROMPT", async (s) => {
    await assertSnapshot(s, RESEARCH_SOURCING_PROMPT);
  });
  await t.step("TESTIMONY_REMOVAL_PROMPT", async (s) => {
    await assertSnapshot(s, TESTIMONY_REMOVAL_PROMPT);
  });
  await t.step("RESEARCH_EXCESS_PROMPT", async (s) => {
    await assertSnapshot(s, RESEARCH_EXCESS_PROMPT);
  });
});
