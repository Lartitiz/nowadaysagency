// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/cron-health/reels-trop-longs_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reelsTropLongs } from "./reels-trop-longs.ts";

const ev = (format: string, s?: number, created_at = "2026-11-10T10:00:00Z") => ({
  format, created_at, content_preview: s === undefined ? {} : { durees: { reel_secondes: s, reel_mots: s * 2.5 } },
});
const toujours = () => true;

Deno.test("reels trop longs : compte au-delà de 55 s, ignore les autres formats et les reels sans mesure", () => {
  const r = reelsTropLongs([ev("reel", 48), ev("reel", 55), ev("reel", 62), ev("carousel", 90), ev("reel")], toujours);
  assertEquals(r, { mesures: 3, au_dela_55s: 1, max_s: 62, alerte: null });
});

Deno.test("reels trop longs : alerte à partir de 3 sur la fenêtre", () => {
  const r = reelsTropLongs([ev("reel", 58), ev("reel", 61), ev("reel", 70), ev("reel", 80, "2026-10-01T00:00:00Z")], (d) => d! >= "2026-11-01");
  assertEquals(r.au_dela_55s, 3);
  assertEquals(r.max_s, 70);
  assertEquals(typeof r.alerte, "string");
});

Deno.test("reels trop longs : rien de mesuré", () => {
  assertEquals(reelsTropLongs([], toujours), { mesures: 0, au_dela_55s: 0, max_s: null, alerte: null });
});
