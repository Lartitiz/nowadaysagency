import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleVerifyCheckoutRequest } from "./index.ts";

Deno.test("verify-checkout: une visite anonyme ne peut vérifier aucune session", async () => {
  const response = await handleVerifyCheckoutRequest(new Request("https://edge.local/verify-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "cs_test_12345678" }),
  }));
  assertEquals(response.status, 401);
  assertEquals((await response.json()).state, undefined);
});

Deno.test("verify-checkout: un identifiant manquant ou forgé ne confirme rien", async () => {
  for (const sessionId of [undefined, "cs_test", "https://evil.test/", "cs_test_12345678?other=1"]) {
    const response = await handleVerifyCheckoutRequest(new Request("https://edge.local/verify-checkout", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer token" },
      body: JSON.stringify({ session_id: sessionId }),
    }));
    assertEquals(response.status, 400);
    assertEquals((await response.json()).state, undefined);
  }
});
