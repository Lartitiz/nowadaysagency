import { describe, expect, it } from "vitest";
import {
  activeMarronnier,
  easterSunday,
  feteDesMeres,
  lastWeekdayOfMonth,
  nextMarronniers,
  nthWeekdayOfMonth,
  plannedPostDate,
  MARRONNIERS,
} from "@/lib/marronniers";

const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

describe("helpers de dates", () => {
  it("nthWeekdayOfMonth : 4e jeudi de novembre 2026 = 26/11", () => {
    expect(ymd(nthWeekdayOfMonth(2026, 11, 4, 4))).toBe("2026-11-26");
  });
  it("lastWeekdayOfMonth : dernier mercredi de juin 2026 = 24/06", () => {
    expect(ymd(lastWeekdayOfMonth(2026, 6, 3))).toBe("2026-06-24");
  });
  it("Pâques (Meeus) : 2026 = 05/04, 2027 = 28/03, 2012 = 08/04", () => {
    expect(ymd(easterSunday(2026))).toBe("2026-04-05");
    expect(ymd(easterSunday(2027))).toBe("2027-03-28");
    expect(ymd(easterSunday(2012))).toBe("2012-04-08");
  });
  it("fête des mères : 2026 = 31/05 (cas normal)", () => {
    expect(ymd(feteDesMeres(2026))).toBe("2026-05-31");
  });
  it("fête des mères : 2012 = 03/06 (Pentecôte le 27/05 → décalée)", () => {
    expect(ymd(feteDesMeres(2012))).toBe("2012-06-03");
  });
});

describe("occurrences", () => {
  it("Black Friday 2026 = 27/11 (lendemain du 4e jeudi)", () => {
    const bf = MARRONNIERS.find((m) => m.key === "black_friday")!;
    expect(ymd(bf.dateFor(2026))).toBe("2026-11-27");
  });
  it("nextMarronniers depuis le 10/07/2026 : soldes d'été passées, rentrée devant", () => {
    const next = nextMarronniers(new Date(2026, 6, 10), 3);
    expect(next[0].marronnier.key).toBe("rentree");
    expect(ymd(next[0].date)).toBe("2026-09-01");
    expect(next[0].daysUntil).toBe(53);
  });
  it("une occurrence passée bascule sur l'année suivante", () => {
    const next = nextMarronniers(new Date(2026, 11, 27), MARRONNIERS.length);
    const noel = next.find((o) => o.marronnier.key === "noel")!;
    expect(ymd(noel.date)).toBe("2027-12-25");
    const nouvelAn = next.find((o) => o.marronnier.key === "nouvel_an")!;
    expect(ymd(nouvelAn.date)).toBe("2027-01-01");
  });
});

describe("activeMarronnier (fenêtre d'anticipation)", () => {
  it("le 07/12 : Noël (J-18, fenêtre 35 j)", () => {
    const occ = activeMarronnier(new Date(2026, 11, 7));
    expect(occ?.marronnier.key).toBe("noel");
    expect(occ?.daysUntil).toBe(18);
  });
  it("le 10/07 : aucun marronnier dans sa fenêtre", () => {
    expect(activeMarronnier(new Date(2026, 6, 10))).toBeNull();
  });
  it("le 20/08 : la rentrée entre dans sa fenêtre (21 j)", () => {
    expect(activeMarronnier(new Date(2026, 7, 20))?.marronnier.key).toBe("rentree");
  });
});

describe("plannedPostDate", () => {
  it("J-7 avant Noël = 18/12", () => {
    const occ = activeMarronnier(new Date(2026, 11, 7))!;
    expect(ymd(plannedPostDate(occ, new Date(2026, 11, 7)))).toBe("2026-12-18");
  });
  it("jamais avant demain (marronnier imminent)", () => {
    const occ = activeMarronnier(new Date(2026, 11, 23))!;
    expect(occ.marronnier.key).toBe("noel");
    expect(ymd(plannedPostDate(occ, new Date(2026, 11, 23)))).toBe("2026-12-24");
  });
});
