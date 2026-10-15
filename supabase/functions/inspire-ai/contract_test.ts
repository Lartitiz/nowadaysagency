// Contrat de inspire-ai (lot 2 « robustesse création de contenu »,
// 13/10/2026 ; voir docs/creation-contenu/CARTE.md). Aucun test serveur ne
// couvrait cette fonction avant ce fichier.
//
// Les deux entrées de InspireFlow (texte collé, capture d'écran) passent dans
// le handler déployé (Supabase et Anthropic simulés). On fige le message
// envoyé à Claude (snapshot), la forme de la réponse et le quota (un seul
// logUsage « content » ; aucun si la réponse IA est illisible).
//
// Dérive VOULUE d'un prompt : régénère et relis le diff du .snap.
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/inspire-ai/contract_test.ts -- --update

import { assertSnapshot } from "../../edge-tests/snapshot.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  anthropicTextSuccess,
  authedRequest,
  captureServeHandler,
  installFetchMock,
  setTestEnv,
  TEST_SUPABASE_URL,
} from "../_shared/test-edge-harness.ts";

setTestEnv();
const handler = await captureServeHandler(new URL("./index.ts", import.meta.url).href);
const URL_FN = `${TEST_SUPABASE_URL}/functions/v1/inspire-ai`;

const AI_RESULT = {
  analysis: { accroche: "Question directe", structure: "Liste", ton: "complice", engagement: "question finale" },
  adapted_content: "Tu crois qu'il faut du talent pour tourner un bol ?",
  format: "carrousel",
  objective: "visibilite",
  pillar: "pédagogie",
};

Deno.test("inspire-ai — texte collé : message figé, résultat JSON renvoyé tel quel, un seul logUsage", async (t) => {
  const mock = installFetchMock({ anthropic: () => anthropicTextSuccess(JSON.stringify(AI_RESULT)) });
  try {
    const res = await handler(authedRequest(URL_FN, {
      source_text: "5 erreurs que font toutes les débutantes en poterie (et comment les éviter).",
    }));
    const json = await res.json();
    assertEquals(res.status, 200, JSON.stringify(json));
    assertEquals(json, AI_RESULT);
    assertEquals(mock.aiUsageInserts.length, 1);
    assertEquals(mock.aiUsageInserts[0].category, "content");
    await assertSnapshot(t, JSON.stringify(mock.anthropicRequests[0].messages, null, 2));
  } finally {
    mock.restore();
  }
});

Deno.test("inspire-ai — capture d'écran : image transmise en base64 après le prompt, un seul logUsage", async (t) => {
  const mock = installFetchMock({ anthropic: () => anthropicTextSuccess(JSON.stringify(AI_RESULT)) });
  try {
    const res = await handler(authedRequest(URL_FN, {
      source_type: "screenshot",
      images: [{ data: "data:image/png;base64,iVBORw0KGgo=", type: "image/png" }],
      context: "Je veux l'adapter à mes ateliers de tournage.",
    }));
    const json = await res.json();
    assertEquals(res.status, 200, JSON.stringify(json));
    assertEquals(mock.aiUsageInserts.length, 1);
    await assertSnapshot(t, JSON.stringify(mock.anthropicRequests[0].messages, null, 2));
  } finally {
    mock.restore();
  }
});

Deno.test("inspire-ai — réponse IA illisible : 502 et AUCUN crédit débité", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicTextSuccess("pas du JSON") });
  try {
    const res = await handler(authedRequest(URL_FN, {
      source_text: "5 erreurs que font toutes les débutantes en poterie (et comment les éviter).",
    }));
    await res.body?.cancel();
    assertEquals(res.status, 502);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});
