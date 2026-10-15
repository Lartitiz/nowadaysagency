// Images du Studio bloquées « en cours » (fiche 18, lot T) : la requête et ses deux issues.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { studioImagesBloquees } from "./studio-bloquees.ts";

// Faux client : note la chaîne d'appels et rend la réponse donnée.
function fauxClient(reponse: { count: number | null; error: { message: string } | null }) {
  const appels: unknown[][] = [];
  const chaine = {
    select: (...a: unknown[]) => (appels.push(["select", ...a]), chaine),
    eq: (...a: unknown[]) => (appels.push(["eq", ...a]), chaine),
    lt: (...a: unknown[]) => (appels.push(["lt", ...a]), Promise.resolve(reponse)),
  };
  return { appels, client: { from: (t: string) => (appels.push(["from", t]), chaine) } };
}

const NOW = Date.parse("2026-10-15T08:00:00Z");

Deno.test("studio bloquées : compte les versions « processing » de plus d'1 h", async () => {
  const { appels, client } = fauxClient({ count: 3, error: null });
  assertEquals(await studioImagesBloquees(client, NOW), { count: 3 });
  assertEquals(appels, [
    ["from", "visual_studio_versions"],
    ["select", "id", { count: "exact", head: true }],
    ["eq", "status", "processing"],
    ["lt", "created_at", "2026-10-15T07:00:00.000Z"],
  ]);
});

Deno.test("studio bloquées : count absent → 0", async () => {
  const { client } = fauxClient({ count: null, error: null });
  assertEquals(await studioImagesBloquees(client, NOW), { count: 0 });
});

Deno.test("studio bloquées : erreur de lecture → { erreur }", async () => {
  const { client } = fauxClient({ count: null, error: { message: "permission denied" } });
  assertEquals(await studioImagesBloquees(client, NOW), { erreur: "permission denied" });
});
