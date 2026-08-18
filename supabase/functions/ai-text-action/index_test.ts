// Régression du gate rédactionnel de dérive (audit du 18/08/2026) : une
// réécriture ciblée (raccourcir, reformuler…) sur une sélection de texte ne
// doit pas réintroduire un défaut absent du texte d'origine (retournement par
// négation, formule moulée, chiffre inventé) sans être rattrapée par une
// re-passe ciblée. Un texte déjà propre ne doit PAS déclencher de 2e appel IA.
//
// Lancer : deno test --allow-env --allow-read supabase/functions/ai-text-action/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  captureServeHandler,
  installFetchMock,
  setTestEnv,
  authedRequest,
  anthropicTextSuccess,
  TEST_SUPABASE_URL,
} from "../_shared/test-edge-harness.ts";

setTestEnv();
const MODULE_URL = new URL("./index.ts", import.meta.url).href;
const handler = await captureServeHandler(MODULE_URL);

const REQUEST_BODY = {
  selected_text: "Le café du coin est bon, l'accueil est chaleureux.",
  action_prompt: "rends ce passage plus percutant",
};

Deno.test("réécriture propre -> 1 seul appel IA, pas de re-passe", async () => {
  const mock = installFetchMock({
    anthropic: () => anthropicTextSuccess("Le café du coin est excellent, l'accueil y est généreux."),
  });
  try {
    const res = await handler(
      authedRequest(`${TEST_SUPABASE_URL}/functions/v1/ai-text-action`, REQUEST_BODY),
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.result, "Le café du coin est excellent, l'accueil y est généreux.");
    assertEquals(mock.anthropicCallCount, 1);
    assertEquals(mock.aiUsageInserts.length, 1);
  } finally {
    mock.restore();
  }
});

Deno.test("réécriture qui introduit un retournement par négation absent du texte source -> re-passe ciblée, 1 seul crédit consommé", async () => {
  let call = 0;
  const mock = installFetchMock({
    anthropic: () => {
      call++;
      return call === 1
        ? anthropicTextSuccess("Ce n'est pas un café ordinaire, c'est une expérience à vivre chaque matin.")
        : anthropicTextSuccess("Ce café sort de l'ordinaire, à vivre chaque matin.");
    },
  });
  try {
    const res = await handler(
      authedRequest(`${TEST_SUPABASE_URL}/functions/v1/ai-text-action`, REQUEST_BODY),
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    // Le résultat final est celui de la re-passe (2e appel), pas la réécriture dégradée.
    assertEquals(body.result, "Ce café sort de l'ordinaire, à vivre chaque matin.");
    assertEquals(mock.anthropicCallCount, 2);
    // Un seul crédit débité malgré les 2 appels IA (même convention que creative-flow
    // pour génération + correction : tokens sommés dans une unique ligne ai_usage).
    assertEquals(mock.aiUsageInserts.length, 1);
  } finally {
    mock.restore();
  }
});

Deno.test("texte source contient déjà un retournement -> pas de re-passe (défaut préexistant accepté)", async () => {
  const mock = installFetchMock({
    // La réécriture garde le MÊME retournement que le texte source (déjà accepté
    // par l'utilisatrice en le sélectionnant) : ce n'est pas une dérive.
    anthropic: () => anthropicTextSuccess("Ce n'est pas un café ordinaire, c'est une expérience mémorable."),
  });
  try {
    const res = await handler(
      authedRequest(`${TEST_SUPABASE_URL}/functions/v1/ai-text-action`, {
        selected_text: "Ce n'est pas un café ordinaire, c'est une expérience à vivre chaque matin.",
        action_prompt: "raccourcis ce passage",
      }),
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.result, "Ce n'est pas un café ordinaire, c'est une expérience mémorable.");
    assertEquals(mock.anthropicCallCount, 1);
    assertEquals(mock.aiUsageInserts.length, 1);
  } finally {
    mock.restore();
  }
});
