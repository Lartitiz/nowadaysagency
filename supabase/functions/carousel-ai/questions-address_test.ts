import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildDeepeningQuestionsPrompt } from "./prompts.ts";
import { PHOTO_QUESTIONS_CONTRACT } from "./photo-narrative.ts";

// QA du 12/11/2026 (carrousel photo LinkedIn) : les questions disaient
// « votre savoir-faire » alors que toute l'app tutoie. Les questions parlent à
// l'utilisatrice, pas à son audience : tutoiement partout, LinkedIn compris.

Deno.test("questions carrousel : tutoiement aussi en LinkedIn", () => {
  for (const isLinkedIn of [true, false]) {
    const prompt = buildDeepeningQuestionsPrompt({ subject: "Rénovation de cuisine", carousel_type: "tips" }, "", isLinkedIn, "", "");
    assertStringIncludes(prompt, "Tutoie toujours l'utilisatrice");
    assert(!/vouvoy/i.test(prompt), "aucune consigne de vouvoiement");
  }
});

Deno.test("questions carrousel photo : consigne de tutoiement dans le contrat", () => {
  assertStringIncludes(PHOTO_QUESTIONS_CONTRACT, "tutoie-la toujours");
});
