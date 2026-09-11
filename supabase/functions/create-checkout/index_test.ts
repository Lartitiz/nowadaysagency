import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleCreateCheckoutRequest } from "./index.ts";

Deno.test("checkout : sans session -> 401, jamais une erreur serveur", async () => {
  const response = await handleCreateCheckoutRequest(new Request("https://edge.test/create-checkout", { method: "POST" }));
  assertEquals(response.status, 401);
});
Deno.test("checkout : JWT expiré -> 401, aucun appel Stripe", async () => {
  Deno.env.set("SUPABASE_URL", "http://localhost:54321");
  Deno.env.set("SUPABASE_ANON_KEY", "test-anon");
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ message: "JWT expired" }), { status: 401, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const response = await handleCreateCheckoutRequest(new Request("https://edge.test/create-checkout", {
      method: "POST", headers: { authorization: "Bearer expired-token" },
    }));
    assertEquals(response.status, 401);
    assertEquals(calls.length, 1);
    assertEquals(calls[0].includes("/auth/v1/user"), true);
  } finally { globalThis.fetch = original; }
});
