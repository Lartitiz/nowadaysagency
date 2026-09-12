import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRetiredRequest } from "./index.ts";

Deno.test("route de recette retirée : aucune génération possible", async () => {
  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    const res = handleRetiredRequest(new Request("https://example.test/carousel-ai-candidate", { method }));
    assertEquals(res.status, 410);
    assertEquals((await res.json()).error, "candidate_retired");
  }
});
Deno.test("route de recette retirée : prévol sans contenu", () => {
  const res = handleRetiredRequest(new Request("https://example.test/carousel-ai-candidate", { method: "OPTIONS" }));
  assertEquals(res.status, 204);
  assertEquals(res.body, null);
});
