import { describe, it, expect } from "vitest";
import {
  monthKey,
  monthLabel,
  monthLabelShort,
  pctChange,
  fmt,
  fmtPct,
  fmtEur,
  safeDivPct,
  safeDiv,
} from "@/lib/stats-helpers";

describe("monthKey", () => {
  it("15 mars 2025 → '2025-03-01'", () => {
    expect(monthKey(new Date(2025, 2, 15))).toBe("2025-03-01");
  });
  it("1er janvier 2025 → '2025-01-01'", () => {
    expect(monthKey(new Date(2025, 0, 1))).toBe("2025-01-01");
  });
});

describe("monthLabel", () => {
  it("'2025-03-01' → 'Mars 2025'", () => {
    expect(monthLabel("2025-03-01")).toBe("Mars 2025");
  });
  it("'2025-12-01' → 'Décembre 2025'", () => {
    expect(monthLabel("2025-12-01")).toBe("Décembre 2025");
  });
});

describe("monthLabelShort", () => {
  it("'2025-03-01' → 'Mar. 2025'", () => {
    expect(monthLabelShort("2025-03-01")).toBe("Mar. 2025");
  });
});

describe("pctChange", () => {
  it("(110, 100) → up 10%", () => {
    expect(pctChange(110, 100)).toEqual({ val: 10, dir: "up" });
  });
  it("(90, 100) → down -10%", () => {
    expect(pctChange(90, 100)).toEqual({ val: -10, dir: "down" });
  });
  it("(102, 100) → flat 2%", () => {
    expect(pctChange(102, 100)).toEqual({ val: 2, dir: "flat" });
  });
  it("(null, 100) → null", () => {
    expect(pctChange(null, 100)).toBeNull();
  });
  it("(100, null) → null", () => {
    expect(pctChange(100, null)).toBeNull();
  });
  it("(100, 0) → null", () => {
    expect(pctChange(100, 0)).toBeNull();
  });
});

describe("fmt", () => {
  it("1234 → formaté avec espace", () => {
    // fr-FR uses narrow no-break space (U+202F) or regular space depending on env
    expect(fmt(1234).replace(/\s/g, " ")).toBe("1 234");
  });
  it("null → '–'", () => expect(fmt(null)).toBe("–"));
  it("undefined → '–'", () => expect(fmt(undefined)).toBe("–"));
  it("0 → '0'", () => expect(fmt(0)).toBe("0"));
});

describe("fmtPct", () => {
  it("42.567 → '42.6%'", () => expect(fmtPct(42.567)).toBe("42.6%"));
  it("null → '–'", () => expect(fmtPct(null)).toBe("–"));
});

describe("fmtEur", () => {
  it("1500 → '1 500€'", () => {
    expect(fmtEur(1500).replace(/\s/g, " ")).toBe("1 500€");
  });
  it("null → '–'", () => expect(fmtEur(null)).toBe("–"));
});

describe("safeDivPct", () => {
  it("(50, 200) → 25", () => expect(safeDivPct(50, 200)).toBe(25));
  it("(x, 0) → null", () => expect(safeDivPct(10, 0)).toBeNull());
  it("(null, 10) → null", () => expect(safeDivPct(null, 10)).toBeNull());
});

describe("safeDiv", () => {
  it("(10, 2) → 5", () => expect(safeDiv(10, 2)).toBe(5));
  it("(10, 0) → null", () => expect(safeDiv(10, 0)).toBeNull());
  it("(null, 5) → null", () => expect(safeDiv(null, 5)).toBeNull());
});
