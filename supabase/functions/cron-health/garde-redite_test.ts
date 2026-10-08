import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { gardeRediteStats } from "./garde-redite.ts";

const from = Date.parse("2026-10-01T00:00:00Z");
const to = Date.parse("2026-10-08T00:00:00Z");
const inWindow = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return t >= from && t < to;
};

Deno.test("la garde a mordu : compté même si l'après est propre", () => {
  const s = gardeRediteStats([
    { created_at: "2026-10-03T10:00:00Z", format: "carousel_express_full", content_preview: { hook: "Nouvelle accroche", hook_echoes_before: 1 } },
    { created_at: "2026-10-04T10:00:00Z", format: "linkedin", content_preview: { hook: "x", hook_echoes_before: 2 } },
    { created_at: "2026-10-05T10:00:00Z", format: "linkedin", content_preview: { hook: "y", hook_echoes_before: 1 } },
  ], inWindow);
  assertEquals(s.a_mordu, 3);
  assertEquals(s.echos_avant, 4);
  assertEquals(s.par_format, { carousel_express_full: 1, linkedin: 2 });
});

Deno.test("garde armée sans écho : armée, pas mordu", () => {
  const s = gardeRediteStats([
    { created_at: "2026-10-03T10:00:00Z", format: "stories", content_preview: { hook: "a", hook_echoes_before: 0 } },
  ], inWindow);
  assertEquals(s, { contenus: 1, garde_armee: 1, a_mordu: 0, echos_avant: 0, par_format: {} });
});

Deno.test("champ absent (garde non armée, ancienne ligne, aperçu nul) : ni armée ni mordu", () => {
  const s = gardeRediteStats([
    { created_at: "2026-10-03T10:00:00Z", format: "carousel_photo", content_preview: { hook: "a" } },
    { created_at: "2026-10-03T11:00:00Z", format: "carousel_photo", content_preview: null },
    { created_at: "2026-10-03T12:00:00Z", format: "carousel_photo" },
  ], inWindow);
  assertEquals(s, { contenus: 3, garde_armee: 0, a_mordu: 0, echos_avant: 0, par_format: {} });
});

Deno.test("hors fenêtre : ignoré", () => {
  const s = gardeRediteStats([
    { created_at: "2026-09-20T10:00:00Z", format: "linkedin", content_preview: { hook_echoes_before: 3 } },
    { created_at: null, format: "linkedin", content_preview: { hook_echoes_before: 3 } },
  ], inWindow);
  assertEquals(s.contenus, 0);
  assertEquals(s.a_mordu, 0);
});
