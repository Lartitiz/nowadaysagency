import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { connexionsFigees, SEUIL_JOURS } from "./connexions-figees.ts";

const NOW = Date.parse("2026-11-09T08:00:00Z");
const ago = (j: number) => new Date(NOW - j * 86400000).toISOString();
const isClient = (id: string) => id !== "admin";

Deno.test("connexions figées : rien de vieux → pas d'alerte", () => {
  const s = connexionsFigees([
    { user_id: "a", platform: "google", token_expires_at: ago(2) },
    { user_id: "b", platform: "canva", token_expires_at: null },
  ], { isClient, now: NOW });
  assertEquals(s, { seuil_jours: SEUIL_JOURS, clientes: 0, internes: 0, par_plateforme: { google: 0, canva: 0, pinterest: 0 }, alerte: false });
});

Deno.test("connexions figées : expirées depuis plus de 30 j, clientes et internes à part ; Instagram et LinkedIn ignorés", () => {
  const s = connexionsFigees([
    { user_id: "a", platform: "google", token_expires_at: ago(40) },
    { user_id: "admin", platform: "pinterest", token_expires_at: ago(31) },
    { user_id: "b", platform: "canva", token_expires_at: ago(29) },
    { user_id: "c", platform: "instagram", token_expires_at: ago(90) },
    { user_id: "c", platform: "linkedin_analytics", token_expires_at: ago(90) },
  ], { isClient, now: NOW });
  assertEquals(s, { seuil_jours: 30, clientes: 1, internes: 1, par_plateforme: { google: 1, canva: 0, pinterest: 1 }, alerte: true });
});
