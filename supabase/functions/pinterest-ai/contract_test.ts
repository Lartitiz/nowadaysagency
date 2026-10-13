// Contrat de pinterest-ai (lot 2 « robustesse création de contenu »,
// 13/10/2026 ; voir docs/creation-contenu/CARTE.md). Aucun test serveur ne
// couvrait cette fonction avant ce fichier.
//
// Pour chaque `action` des pages Pinterest, on fait passer une vraie requête
// dans le handler déployé (Supabase et Anthropic simulés) et on fige :
//   1. le prompt envoyé à Claude (snapshot) ;
//   2. la forme de la réponse ({ content }) ;
//   3. le quota : un seul logUsage « content », aucun si l'IA échoue.
//
// Dérive VOULUE d'un prompt : régénère et relis le diff du .snap.
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/pinterest-ai/contract_test.ts -- --update

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
const URL_FN = `${TEST_SUPABASE_URL}/functions/v1/pinterest-ai`;

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

// [action, paramètres envoyés par la page, texte renvoyé par l'IA simulée]
const CASES: [string, Record<string, unknown>, string][] = [
  ["name", {}, '["Lou | Céramique & Ateliers"]'],
  ["bio", {}, '["Céramiste à Lyon : ateliers tournage pour débutantes."]'],
  ["board-description", { board_name: "Céramique pour débutantes", board_type: "pédagogique" }, "Idées et conseils pour tourner son premier bol."],
  ["pin", { subject: "Tourner son premier bol sans se décourager", board_name: "Céramique pour débutantes" }, '[{"titre":"Premier bol","description":"Les étapes."}]'],
  ["keywords", {}, '{"produit":["bol céramique"]}'],
];

for (const [action, params, aiText] of CASES) {
  Deno.test(`pinterest-ai — ${action} : prompt figé, réponse { content }, un seul logUsage`, async (t) => {
    const mock = installFetchMock({ anthropic: () => anthropicTextSuccess(aiText) });
    try {
      const res = await handler(authedRequest(URL_FN, { action, ...params }));
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

Deno.test("pinterest-ai — échec de l'appel IA : erreur et AUCUN crédit débité", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicFailure() });
  try {
    const res = await handler(authedRequest(URL_FN, { action: "bio" }));
    await res.body?.cancel();
    assert(res.status >= 400);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});
