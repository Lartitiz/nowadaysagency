import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildDeepeningQuestionsPrompt } from "./prompts.ts";
import { PHOTO_QUESTIONS_CONTRACT } from "./photo-narrative.ts";
import { hasVouvoiement, questionsVouvoient } from "./questions-address.ts";

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

Deno.test("hasVouvoiement : repère vous/votre/vos hors citations", () => {
  assert(hasVouvoiement("Quelle est votre méthode ?"));
  assert(hasVouvoiement("Qu'avez-vous rénové ? Vous pouvez"));
  assert(hasVouvoiement("Vos clientes"));
  assert(!hasVouvoiement("Quelle est ta méthode ?"));
  assert(!hasVouvoiement("Tes clientes te disent « merci pour votre accueil » ?"));
  assert(!hasVouvoiement("Ton savoir-faire, tes voisins, le vosgien"));
});

Deno.test("questionsVouvoient : lit questions et exemples de réponse", () => {
  assert(questionsVouvoient(JSON.stringify({ questions: [{ question: "Ta méthode ?", placeholder: "Ce que vous avez rénové" }] })));
  assert(!questionsVouvoient(JSON.stringify({ questions: [] })));
  assert(!questionsVouvoient("pas du json"));
});
