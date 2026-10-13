// Contrat de storytelling-ai (lot 2 « robustesse création de contenu »,
// 13/10/2026 ; voir docs/creation-contenu/CARTE.md). Aucun test serveur ne
// couvrait cette fonction avant ce fichier.
//
// Pour chaque `type`, on fait passer une vraie requête dans le handler
// déployé (Supabase et Anthropic simulés) et on fige le prompt envoyé à
// Claude (snapshot), la forme de la réponse ({ content }) et le quota (un
// seul logUsage « content », aucun si l'IA échoue).
//
// Dérive VOULUE d'un prompt : régénère et relis le diff du .snap.
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/storytelling-ai/contract_test.ts -- --update

import { assertSnapshot } from "https://deno.land/std@0.224.0/testing/snapshot.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  anthropicFailure,
  anthropicTextSuccess,
  authedRequest,
  captureStdServeHandler,
  installFetchMock,
  setTestEnv,
  TEST_SUPABASE_URL,
} from "../_shared/test-edge-harness.ts";

setTestEnv();
const handler = await captureStdServeHandler(new URL("./index.ts", import.meta.url).href);
const URL_FN = `${TEST_SUPABASE_URL}/functions/v1/storytelling-ai`;

// `system` part en blocs (cache de prompt) : on recolle leur texte.
// deno-lint-ignore no-explicit-any
function texte(part: any): string {
  if (typeof part === "string") return part;
  if (Array.isArray(part)) return part.map((b) => (typeof b === "string" ? b : b?.text ?? JSON.stringify(b))).join("\n");
  return JSON.stringify(part);
}

// deno-lint-ignore no-explicit-any
function promptDoc(req: any): string {
  return `── SYSTEM PROMPT ──\n${texte(req.system)}\n\n── USER PROMPT ──\n${texte(req.messages?.[0]?.content)}`;
}

const PROFILE = { activite: "Céramiste", mission: "Rendre le tournage accessible", target_description: "Débutantes", tone_register: "tutoiement complice" };
const STORY = "J'ai raté mon premier bol pendant trois mois. Un jour, ma prof m'a dit d'arrêter de forcer.";

const CASES: [string, Record<string, unknown>, string][] = [
  ["improve", { text: "J'étais dans l'atelier et j'ai raté mon bol.", step_context: "Étape 3 : l'action", profile: PROFILE }, "Les mains pleines de terre, j'ai vu le bol s'effondrer."],
  ["generate-story", {
    steps: {
      step_1_raw: "Mon premier bol raté",
      step_2_location: "L'atelier de ma prof, un mardi soir",
      step_3_action: "Je force, la terre s'effondre",
      step_4_thoughts: "Je ne suis pas faite pour ça",
      step_5_emotions: "Honte, puis soulagement",
    },
    profile: PROFILE,
  }, "Un mardi soir, dans l'atelier de ma prof…"],
  ["generate-pitch", { storytelling: STORY, profile: PROFILE }, '{"court":"J\'ai raté pendant trois mois."}'],
  ["generate-recap", { storytelling: STORY, profile: PROFILE }, '{"declencheur":"Le bol raté"}'],
];

for (const [type, params, aiText] of CASES) {
  Deno.test(`storytelling-ai — ${type} : prompt figé, réponse { content }, un seul logUsage`, async (t) => {
    const mock = installFetchMock({ anthropic: () => anthropicTextSuccess(aiText) });
    try {
      const res = await handler(authedRequest(URL_FN, { type, ...params }));
      const json = await res.json();
      assertEquals(res.status, 200, JSON.stringify(json));
      assertEquals(json.content, aiText);
      assertEquals(mock.aiUsageInserts.length, 1);
      assertEquals(mock.aiUsageInserts[0].category, "content");
      await assertSnapshot(t, promptDoc(mock.anthropicRequests[0]));
    } finally {
      mock.restore();
    }
  });
}

Deno.test("storytelling-ai — échec de l'appel IA : erreur et AUCUN crédit débité", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicFailure() });
  try {
    const res = await handler(authedRequest(URL_FN, { type: "improve", text: "Un texte." }));
    await res.body?.cancel();
    assert(res.status >= 400);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});
