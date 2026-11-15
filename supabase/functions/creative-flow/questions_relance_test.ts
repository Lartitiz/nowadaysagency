// deno-lint-ignore-file no-explicit-any
// Relance des questions de creative-flow (14/11/2026) : essai réel sur le compte
// test, les questions (Haiku) sortaient à 27-41 mots avec listes d'options et
// deux « ? ». Une question trop longue → une relance ; la version relancée est
// gardée seulement si elle règle le défaut.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureStdServeHandler, installFetchMock, setTestEnv, TEST_SUPABASE_URL } from "../_shared/test-edge-harness.ts";

setTestEnv();
const handler = await captureStdServeHandler(new URL("./index.ts", import.meta.url).href);
const URL_FN = `${TEST_SUPABASE_URL}/functions/v1/creative-flow`;

const LONGUE = "Quand tu as décidé de ne plus utiliser de parfum de synthèse dans tes savons, qu'est-ce qui t'a fait basculer : une réaction cutanée, une cliente qui t'a alertée, ou une lecture ?";
// Trop longue SANS liste de choix finale (une liste finale est coupée en code, sans relance : test plus bas).
const LONGUE_SANS_LISTE = "Quand tu as décidé de ne plus jamais utiliser de parfum de synthèse dans tes savons pour les peaux sensibles, quel moment précis de ta fabrication ou de tes échanges avec tes clientes t'a fait basculer pour de bon ?";
const COURTE = "Quel moment précis t'a fait renoncer au parfum de synthèse dans tes savons ?";
const qs = (q: string) => ({ questions: [{ question: q, placeholder: "Une cliente qui rougissait" }] });

async function run(inputs: unknown[], userId: string) {
  let calls = 0;
  const mock = installFetchMock({
    anthropic: (req: any) => {
      const input = inputs[Math.min(calls, inputs.length - 1)];
      calls++;
      return { status: 200, body: { content: [{ type: "tool_use", id: "tu_1", name: req?.tool_choice?.name ?? "poser_questions", input }], stop_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 10 } } };
    },
  });
  const harnessFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url.split("?")[0] === `${TEST_SUPABASE_URL}/auth/v1/user`) {
      return new Response(JSON.stringify({ id: userId, email: "q@example.com", aud: "authenticated", role: "authenticated" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return harnessFetch(input, init);
  }) as typeof fetch;
  try {
    const res = await handler(new Request(URL_FN, { method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ step: "questions", contentType: "instagram_post", context: "Pourquoi je refuse le parfum de synthèse" }) }));
    return { status: res.status, body: await res.json(), calls };
  } finally {
    globalThis.fetch = harnessFetch;
    mock.restore();
  }
}

Deno.test("creative-flow questions : une question trop longue est relancée une fois", async () => {
  const r = await run([qs(LONGUE_SANS_LISTE), qs(COURTE)], "test-user-relance-1");
  assertEquals(r.status, 200);
  assertEquals(r.calls, 2);
  assertEquals(r.body.questions[0].question, COURTE);
});

Deno.test("creative-flow questions : questions déjà lisibles, aucun appel de plus", async () => {
  const r = await run([qs(COURTE)], "test-user-relance-2");
  assertEquals(r.calls, 1);
  assertEquals(r.body.questions[0].question, COURTE);
});

Deno.test("creative-flow questions : relance encore trop longue, on garde la première version", async () => {
  const r = await run([qs(LONGUE_SANS_LISTE), qs(LONGUE_SANS_LISTE + " Et après ?")], "test-user-relance-3");
  assertEquals(r.calls, 2);
  assert(r.body.questions[0].question === LONGUE_SANS_LISTE);
});

Deno.test("creative-flow questions : la liste de choix finale est coupée sans relance (sonde ❓ du 15/11)", async () => {
  const r = await run([qs(LONGUE)], "test-user-relance-4");
  assertEquals(r.calls, 1);
  assertEquals(r.body.questions[0].question, "Quand tu as décidé de ne plus utiliser de parfum de synthèse dans tes savons, qu'est-ce qui t'a fait basculer ?");
  assertEquals(r.body.questions[0].placeholder, "Une cliente qui rougissait");
});
