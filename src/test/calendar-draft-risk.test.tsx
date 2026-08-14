import { describe, it, expect, vi, afterEach } from "vitest";
import { getDraftRisk } from "@/components/calendar/CalendarContentCard";
import type { CalendarPost } from "@/lib/calendar-constants";

// Un brouillon posé sur une date (jamais programmé pour auto-publish) et un
// post réellement programmé avaient le même rendu dans la grille — impossible
// de repérer AVANT la date les brouillons qui ne partiront jamais tout seuls.
// getDraftRisk() est le signal qui permet à CalendarContentCard de les distinguer.
describe("getDraftRisk", () => {
  const base: CalendarPost = {
    id: "1",
    date: "2026-08-14",
    theme: "Test",
    angle: null,
    status: "drafting",
    canal: "instagram",
  } as CalendarPost;

  afterEach(() => {
    vi.useRealTimers();
  });

  it("signale 'overdue' quand la date est passée et le post n'est pas programmé", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T10:00:00"));
    expect(getDraftRisk({ ...base, date: "2026-08-14" })).toBe("overdue");
  });

  it("signale 'soon' quand la date est dans les 48h et le post n'est pas programmé", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T10:00:00"));
    expect(getDraftRisk({ ...base, date: "2026-08-15" })).toBe("soon");
    expect(getDraftRisk({ ...base, date: "2026-08-16" })).toBe("soon");
  });

  it("ne signale rien pour une date lointaine", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T10:00:00"));
    expect(getDraftRisk({ ...base, date: "2026-08-25" })).toBeNull();
  });

  it("ne signale rien si le post est programmé pour auto-publish (auto_publish: true)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T10:00:00"));
    expect(getDraftRisk({ ...base, date: "2026-08-14", auto_publish: true })).toBeNull();
  });

  it("ne signale rien si le post est déjà publié", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T10:00:00"));
    expect(getDraftRisk({ ...base, date: "2026-08-14", status: "published" })).toBeNull();
  });
});
