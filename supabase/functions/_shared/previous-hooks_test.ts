import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildContentPreview } from "./content-quality.ts";
import { matchesHookSubject, fetchPreviousHooks, fetchPreviousHooksByFormat } from "./previous-hooks.ts";

const longSubject = "Présenter une nouvelle collection de bols en grès fabriqués à la main et expliquer le temps nécessaire à leur séchage avant cuisson";

Deno.test("accroches : un sujet long se retrouve via la clé indépendante de l'aperçu", () => {
  const p = buildContentPreview({ content: "Une nouvelle collection prend forme." }, longSubject)!;
  assertEquals((p.sujet as string).length, 100);
  assertEquals(matchesHookSubject(p, longSubject), true);
  assertEquals(matchesHookSubject(p, longSubject.toUpperCase()), true);
});

Deno.test("accroches : les anciens aperçus longs restent lisibles", () => {
  const p = { sujet: longSubject.slice(0, 100), hook: "Le séchage décide." };
  assertEquals(matchesHookSubject(p, longSubject), true);
  assertEquals(matchesHookSubject({ sujet: "Le prix du bol." }, " le prix du bol "), true);
});

Deno.test("accroches : la clé récente distingue les sujets qui partagent seulement leur aperçu", () => {
  const a = longSubject.slice(0, 100) + " avant livraison";
  const b = longSubject.slice(0, 100) + " avant cuisson";
  const p = buildContentPreview({ content: "Collection" }, a)!;
  assertEquals(matchesHookSubject(p, b), false);
});

for (const workspace of ["workspace-a", null]) {
  Deno.test(`accroches : filtre d'espace réel sur recherche par sujet et par format (${workspace || "legacy"})`, async () => {
    const oldFetch = globalThis.fetch;
    const oldUrl = Deno.env.get("SUPABASE_URL"), oldKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    Deno.env.set("SUPABASE_URL", "https://fake-supabase.test");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "fake-key");
    const urls: URL[] = [];
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      urls.push(url);
      return Promise.resolve(new Response(JSON.stringify([{ content_preview: { sujet: "Le prix du bol", hook: "La matière et le geste." } }]), { headers: { "content-type": "application/json" } }));
    }) as typeof fetch;
    try {
      assertEquals(await fetchPreviousHooks("user-a", "Le prix du bol", undefined, workspace), ["La matière et le geste."]);
      assertEquals(await fetchPreviousHooksByFormat("user-a", "stories", undefined, workspace), ["La matière et le geste."]);
      assertEquals(urls.length, 2);
      for (const url of urls) {
        assertEquals(url.searchParams.get("workspace_id"), workspace ? `eq.${workspace}` : "is.null");
        assertEquals(url.searchParams.get("user_id"), "eq.user-a");
      }
    } finally {
      globalThis.fetch = oldFetch;
      for (const [key, value] of [["SUPABASE_URL", oldUrl], ["SUPABASE_SERVICE_ROLE_KEY", oldKey]]) {
        if (value === undefined) Deno.env.delete(key!); else Deno.env.set(key!, value);
      }
    }
  });
}

Deno.test("accroches : panne de lecture et sujet vide ne bloquent pas la génération", async () => {
  assertEquals(await fetchPreviousHooks("user-a", ""), []);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("Panne simulée"))) as typeof fetch;
  try { assertEquals(await fetchPreviousHooks("user-a", "Le prix du bol"), []); }
  finally { globalThis.fetch = oldFetch; }
});
