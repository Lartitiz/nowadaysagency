import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { feedbackNewItems, ontGenere } from "./feedback-new.ts";

Deno.test("feedbackNewItems : plus anciens d'abord, contenu tronqué, max respecté", () => {
  const rows = [
    { user_id: "a", type: "bug", severity: "minor", content: "récent", page_url: "/creer", created_at: "2026-10-10T00:00:00Z" },
    { user_id: "b", type: "idea", severity: null, content: "x".repeat(300), page_url: null, created_at: "2026-09-01T00:00:00Z" },
  ];
  const out = feedbackNewItems(rows, 1);
  assertEquals(out.length, 1);
  assertEquals(out[0].type, "idea");
  assertEquals(out[0].contenu.length, 160);
});

Deno.test("ontGenere : compte les membres actifs depuis l'inscription", () => {
  assertEquals(ontGenere([{ user_id: "a" }, { user_id: "b" }], [{ user_id: "b" }, { user_id: "z" }]), 1);
});
