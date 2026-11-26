import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { filStats, refusSansJugement } from "./fil-reparations.ts";
import { threadOutcome } from "../_shared/content-quality.ts";

const at = "2026-10-08T10:00:00Z";
const ev = (fil: unknown) => ({ created_at: at, content_preview: fil === undefined ? {} : { fil } });

Deno.test("bilan du fil : réparations tentées, gardées, locales, sautées, contrôles non aboutis", () => {
  const events = [
    ev({ status: "completed", verdict: "acceptable", defauts: 0, reparation: null, sautee: null }),
    ev({ status: "completed", verdict: "needs_repair", defauts: 1, reparation: { scope: "local", acceptee: false }, sautee: null }),
    ev({ status: "completed", verdict: "acceptable", defauts: 0, reparation: { scope: "local", acceptee: true }, sautee: null }),
    ev({ status: "completed", verdict: "needs_repair", defauts: 3, reparation: { scope: "full", acceptee: true }, sautee: null }),
    ev({ status: "completed", verdict: "needs_repair", defauts: 2, reparation: null, sautee: "time-budget" }),
    ev({ status: "invalid", verdict: null, defauts: 0, reparation: null, sautee: null }),
    ev(undefined), // autre format, sans contrôle du fil
    { created_at: "2026-09-01T00:00:00Z", content_preview: { fil: { status: "invalid" } } }, // hors fenêtre
  ];
  const s = filStats(events, (d) => !!d && d.startsWith("2026-10"));
  assertEquals(s, {
    carrousels: 6, controle_non_abouti: 1, a_reparer: 3,
    reparations: { tentees: 3, gardees: 2, locales: 2, locales_gardees: 1, completes: 1, completes_gardees: 1 },
    sautees_faute_de_temps: 1,
    mineures: { tentees: 0, gardees: 0 }, refus: { inconnue: 1 },
  });
});

Deno.test("issue du fil lue sur le carrousel final", () => {
  const doc = { slides: [], progression_review: { execution_status: "completed", verdict: "needs_repair",
    report: { defects: [{}, {}] }, repair: { attempted: true, accepted: false, scope: "local", reason: "candidate-not-acceptable-or-not-improved" } } };
  assertEquals(threadOutcome(JSON.stringify(doc)), { status: "completed", verdict: "needs_repair", defauts: 2,
    reparation: { scope: "local", acceptee: false, raison: "candidate-not-acceptable-or-not-improved", declencheur: null }, sautee: null });
  assertEquals(threadOutcome({ slides: [], progression_review: { execution_status: "completed", verdict: "needs_repair", repair_skipped: "time-budget" } })?.sautee, "time-budget");
  assertEquals(threadOutcome("pas du json"), null);
  assertEquals(threadOutcome({ slides: [] }), null);
});

// 26/11/2026 : trois mixtes de suite, réparation écrite puis jetée parce que le 2e contrôle
// était coupé à 45 s (« review-invalid »). Le bilan disait seulement « gardées 0/3 ».
Deno.test("bilan du fil : raison des refus et réparations pour une remarque mineure", () => {
  const rep = (acceptee: boolean, raison: string, declencheur: string) =>
    ev({ status: "completed", verdict: "needs_repair", defauts: 1, reparation: { scope: "full", acceptee, raison, declencheur }, sautee: null });
  const s = filStats([
    rep(false, "review-invalid", "needs_repair"),
    rep(false, "review-invalid", "needs_repair"),
    rep(false, "repair-failed", "needs_repair"),
    rep(false, "candidate-not-acceptable-or-not-improved", "minor_continuity"),
    rep(true, "accepted", "minor_continuity"),
  ], (d) => !!d && d.startsWith("2026-10"));
  assertEquals(s.refus, { "review-invalid": 2, "repair-failed": 1, "candidate-not-acceptable-or-not-improved": 1 });
  assertEquals(s.mineures, { tentees: 2, gardees: 1 });
  assertEquals(refusSansJugement(s), 3);
  // Lu sur le carrousel final : le déclencheur est gardé.
  const doc = { slides: [], progression_review: { execution_status: "completed", verdict: "acceptable", repair: { attempted: true, accepted: false, trigger: "minor_continuity", reason: "review-invalid" } } };
  assertEquals((threadOutcome(doc) as any).reparation, { scope: "full", acceptee: false, raison: "review-invalid", declencheur: "minor_continuity" });
});
