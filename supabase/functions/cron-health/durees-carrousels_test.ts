import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dureesStats } from "./durees-carrousels.ts";
import { carouselDurations } from "../_shared/content-quality.ts";

const at = "2026-10-09T10:00:00Z";
const ev = (durees: unknown) => ({ created_at: at, content_preview: durees === undefined ? {} : { durees } });

Deno.test("bilan des durées : médiane, 90e centile, max par parcours ; réparations sautées, association, dépassements", () => {
  const photo = (total: number, match: number, extra: Record<string, unknown> = {}) =>
    ev({ label: "continuous_photo", total_ms: total, write_ms: 30_000, match_ms: match, ...extra });
  const events = [
    photo(86_000, 17_250, { association: { status: "completed", raison: "reviewed", ambiance: 0 } }),
    photo(147_000, 15_300, { association: { status: "completed", raison: "reviewed", ambiance: 2 } }),
    photo(135_000, 17_500, { thread_repair_skipped: 1, association: { status: "skipped", raison: "time-budget", ambiance: 10 } }),
    photo(280_000, 40_000),
    ev({ label: "express_full", total_ms: 340_000, avant_schemas: true }),
    ev(undefined), // autre format
    ev({ total_ms: 1 }), // sans parcours : ignoré
    { created_at: "2026-09-01T00:00:00Z", content_preview: { durees: { label: "continuous_photo", total_ms: 999_000 } } }, // hors fenêtre
  ];
  const s = dureesStats(events, (d) => !!d && d.startsWith("2026-10"));
  assertEquals(Object.keys(s), ["continuous_photo", "express_full"]);
  const p = s.continuous_photo;
  assertEquals(p.generations, 4);
  assertEquals(p.etapes.total_ms, { n: 4, mediane: 135, p90: 280, max: 280 });
  assertEquals(p.etapes.match_ms, { n: 4, mediane: 17.3, p90: 40, max: 40 });
  assertEquals(p.etapes.write_ms?.mediane, 30);
  assertEquals(p.etapes.thread_repair_ms, undefined);
  assertEquals([p.reparations_sautees, p.association_non_aboutie, p.slides_en_ambiance, p.au_dela_270s, p.au_dela_330s], [1, 1, 12, 1, 0]);
  assertEquals(s.express_full.au_dela_330s, 1);
});

Deno.test("bilan des durées : lit exactement ce que carouselDurations écrit", () => {
  const d = carouselDurations("continuous_mix", { prep_ms: 12_766, write_ms: 30_154, thread_judge_ms: 34_008, match_ms: 15_284, total_ms: 147_303 },
    { content: { slides: [{}], photo_review: { execution_status: "completed", reason: "reviewed", ambient_fallback: [] } }, photos: 3 });
  const s = dureesStats([ev(d)], () => true);
  assertEquals(s.continuous_mix.etapes.total_ms, { n: 1, mediane: 147.3, p90: 147.3, max: 147.3 });
  assertEquals(s.continuous_mix.association_non_aboutie, 0);
});
