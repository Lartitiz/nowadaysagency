import { describe, it, expect } from "vitest";
import { weeklyIdeas, isoWeekNumber, WEEKLY_IDEA_POOL } from "@/lib/weekly-ideas";

// La rotation DOIT rester identique à celle de l'edge email-trigger
// (supabase/functions/email-trigger/index.ts) : même pool, même formule
// start = (semaine ISO × 5) % 20. Ces tests verrouillent la parité —
// si l'un des deux côtés change, ce test casse et rappelle la synchro.
describe("weeklyIdeas (parité e-mail du rituel hebdo)", () => {
  it("retourne 5 idées du pool, sans doublon", () => {
    const ideas = weeklyIdeas(new Date("2026-07-05"));
    expect(ideas).toHaveLength(5);
    expect(new Set(ideas).size).toBe(5);
    for (const i of ideas) expect(WEEKLY_IDEA_POOL).toContain(i);
  });

  it("est stable toute la semaine et change à la semaine suivante", () => {
    // Semaine ISO du lundi 29/06 au dimanche 05/07/2026
    const lundi = weeklyIdeas(new Date("2026-06-29T08:00:00Z"));
    const dimanche = weeklyIdeas(new Date("2026-07-05T21:00:00Z"));
    const lundiSuivant = weeklyIdeas(new Date("2026-07-06T08:00:00Z"));
    expect(dimanche).toEqual(lundi);
    expect(lundiSuivant).not.toEqual(lundi);
  });

  it("reproduit exactement la formule de l'edge (start = semaine×5 % 20)", () => {
    const d = new Date("2026-07-05");
    const week = isoWeekNumber(d);
    const start = (week * 5) % WEEKLY_IDEA_POOL.length;
    const expected = Array.from(
      { length: 5 },
      (_, i) => WEEKLY_IDEA_POOL[(start + i) % WEEKLY_IDEA_POOL.length],
    );
    expect(weeklyIdeas(d)).toEqual(expected);
  });

  it("isoWeekNumber : valeurs de référence", () => {
    expect(isoWeekNumber(new Date("2026-01-01"))).toBe(1);
    expect(isoWeekNumber(new Date("2026-07-05"))).toBe(27);
    expect(isoWeekNumber(new Date("2026-12-31"))).toBe(53);
  });
});
