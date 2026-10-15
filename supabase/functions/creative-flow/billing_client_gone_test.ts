// Débit à la livraison (15/10/2026). Bug vécu le 14/10 : idée LinkedIn,
// « générer directement », rechargement de la page 15 s plus tard → aucun
// texte, crédit débité quand même (21 → 20). LinkedIn et newsletter n'envoient
// leur texte qu'à la fin (flux « heartbeat ») : si la cliente est partie avant,
// le serveur termine mais ne débite plus. Si elle est restée, rien ne change.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureStdServeHandler, installFetchMock, setTestEnv, TEST_SUPABASE_URL } from "../_shared/test-edge-harness.ts";

setTestEnv();
const handler = await captureStdServeHandler(new URL("./index.ts", import.meta.url).href);
const URL_FN = `${TEST_SUPABASE_URL}/functions/v1/creative-flow`;
const CONTEXT = "Pourquoi je ne fais plus de remises sur mes créations";
const ANSWERS = [{ question: "Qu'a répondu la cliente ?", answer: "Elle a signé quand même." }];
const TEXTS: Record<string, string> = {
  post_linkedin: JSON.stringify({ content: "J'ai arrêté les remises il y a un an.\n\nLa cliente a signé quand même.", accroche: "J'ai arrêté les remises il y a un an." }),
  post_newsletter: JSON.stringify({ subject: "Mes prix", preheader: "Une décision", content: "J'ai arrêté les remises.", accroche: "J'ai arrêté les remises." }),
};

let n = 0;
async function scenario(contentType: string, leaveEarly: boolean) {
  const userId = `test-user-gone-${++n}`;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  // deno-lint-ignore no-explicit-any
  const mock = installFetchMock({ anthropic: async (req: any) => {
    // Seule la rédaction (gros prompt système) attend : les appels préparatoires
    // faits avant l'ouverture du flux passent tout de suite.
    const system = typeof req?.system === "string" ? req.system : JSON.stringify(req?.system ?? "");
    if (system.length > 20000) await gate; // Claude « écrit » tant que le test ne libère pas
    const tool = req?.tool_choice?.name;
    const usage = { input_tokens: 100, output_tokens: 50 };
    if (tool) return { status: 200, body: { content: [{ type: "tool_use", id: "tu", name: tool, input: JSON.parse(TEXTS[contentType]) }], stop_reason: "tool_use", usage } };
    return { status: 200, body: { content: [{ type: "text", text: TEXTS[contentType] }], stop_reason: "end_turn", usage } };
  } });
  const harnessFetch = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url.split("?")[0] === `${TEST_SUPABASE_URL}/auth/v1/user`) {
      return new Response(JSON.stringify({ id: userId, email: "x@example.com", aud: "authenticated", role: "authenticated" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return harnessFetch(input, init);
  }) as typeof fetch;
  const warns: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warns.push(args.map(String).join(" ")); };
  try {
    const res = await handler(new Request(URL_FN, {
      method: "POST",
      headers: { Authorization: "Bearer test-token", "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ step: "generate", contentType, context: CONTEXT, answers: ANSWERS }),
    }));
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    if (leaveEarly) {
      await reader.cancel(); // la page est rechargée : le navigateur coupe la connexion
      release();
      const until = Date.now() + 5000;
      while (Date.now() < until && !warns.some((w) => w.includes("billing_skipped_client_gone")) && mock.aiUsageInserts.length === 0) {
        await new Promise((r) => setTimeout(r, 20));
      }
      return { first, text: "", inserts: mock.aiUsageInserts.length, skipped: warns.some((w) => w.includes("billing_skipped_client_gone")) };
    }
    release();
    let text = first;
    for (;;) { const { done, value } = await reader.read(); if (done) break; text += new TextDecoder().decode(value); }
    return { first, text, inserts: mock.aiUsageInserts.length, skipped: warns.some((w) => w.includes("billing_skipped_client_gone")) };
  } finally {
    console.warn = originalWarn;
    globalThis.fetch = harnessFetch;
    mock.restore();
  }
}

for (const [nom, contentType] of [["LinkedIn", "post_linkedin"], ["newsletter", "post_newsletter"]]) {
  Deno.test(`${nom} : page rechargée avant la fin → aucun crédit débité`, async () => {
    const r = await scenario(contentType, true);
    assertEquals(r.first.includes('"stage":"generating"'), true);
    assertEquals(r.skipped, true);
    assertEquals(r.inserts, 0);
  });
  Deno.test(`${nom} : cliente restée jusqu'au bout → 1 crédit débité, texte livré`, async () => {
    const r = await scenario(contentType, false);
    assertEquals(r.text.includes('"type":"done"'), true);
    assertEquals(r.skipped, false);
    assertEquals(r.inserts, 1);
  });
}
