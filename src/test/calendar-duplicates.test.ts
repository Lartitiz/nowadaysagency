import { describe, it, expect } from "vitest";
import {
  plannedKey,
  isComparable,
  splitAlreadyPlanned,
  duplicateMessage,
} from "@/lib/calendar-duplicates";

describe("plannedKey", () => {
  it("le même sujet retapé reste le même sujet", () => {
    const a = { date: "2026-08-15", theme: "Les 3 erreurs", canal: "instagram" };
    const b = { date: "2026-08-15", theme: "  les   3 ERREURS  ", canal: "Instagram" };
    expect(plannedKey(a)).toBe(plannedKey(b));
  });

  it("un autre jour, un autre réseau ou un autre sujet = un autre contenu", () => {
    const base = { date: "2026-08-15", theme: "Les 3 erreurs", canal: "instagram" };
    expect(plannedKey({ ...base, date: "2026-08-16" })).not.toBe(plannedKey(base));
    expect(plannedKey({ ...base, canal: "linkedin" })).not.toBe(plannedKey(base));
    expect(plannedKey({ ...base, theme: "Autre chose" })).not.toBe(plannedKey(base));
  });
});

describe("isComparable", () => {
  it("sans sujet, on ne peut pas juger : le contenu passe", () => {
    expect(isComparable({ date: "2026-08-15", theme: "" })).toBe(false);
    expect(isComparable({ date: "2026-08-15", theme: "   " })).toBe(false);
    expect(isComparable({ date: "2026-08-15", theme: null })).toBe(false);
    expect(isComparable({ date: "", theme: "Un sujet" })).toBe(false);
    expect(isComparable({ date: "2026-08-15", theme: "Un sujet" })).toBe(true);
  });
});

describe("splitAlreadyPlanned", () => {
  const row = (theme: string, date = "2026-08-15", canal = "instagram") => ({ date, theme, canal });

  it("écarte ce qui est déjà au calendrier", () => {
    const existing = new Set([plannedKey(row("Les 3 erreurs"))]);
    const { fresh, duplicates } = splitAlreadyPlanned(
      [row("Les 3 erreurs"), row("Mes coulisses")],
      existing,
    );
    expect(fresh.map((r) => r.theme)).toEqual(["Mes coulisses"]);
    expect(duplicates.map((r) => r.theme)).toEqual(["Les 3 erreurs"]);
  });

  it("écarte aussi les doublons À L'INTÉRIEUR du lot", () => {
    // C'est le cas qui a produit 11 exemplaires du même post le 15 août.
    const { fresh, duplicates } = splitAlreadyPlanned(
      [row("Les 3 erreurs"), row("les 3 ERREURS"), row("Les 3 erreurs")],
      new Set(),
    );
    expect(fresh).toHaveLength(1);
    expect(duplicates).toHaveLength(2);
  });

  it("un même sujet sur deux réseaux n'est PAS un doublon", () => {
    const { fresh, duplicates } = splitAlreadyPlanned(
      [row("Les 3 erreurs", "2026-08-15", "instagram"), row("Les 3 erreurs", "2026-08-15", "linkedin")],
      new Set(),
    );
    expect(fresh).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });

  it("laisse passer les lignes sans sujet, sans les confondre entre elles", () => {
    const { fresh, duplicates } = splitAlreadyPlanned(
      [{ date: "2026-08-15", theme: "" }, { date: "2026-08-15", theme: null }],
      new Set(),
    );
    expect(fresh).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });

  it("ne touche à rien quand il n'y a rien à écarter", () => {
    const rows = [row("A"), row("B")];
    const { fresh, duplicates } = splitAlreadyPlanned(rows, new Set());
    expect(fresh).toEqual(rows);
    expect(duplicates).toEqual([]);
  });
});

describe("duplicateMessage", () => {
  it("dit clairement quand TOUT était déjà prévu", () => {
    expect(duplicateMessage(1, 1)).toMatch(/déjà prévu ce jour-là/i);
    expect(duplicateMessage(3, 3)).toMatch(/tout ça est déjà prévu/i);
  });

  it("dit combien ont été écartés quand une partie passe", () => {
    expect(duplicateMessage(1, 3)).toMatch(/1 contenu était déjà prévu/i);
    expect(duplicateMessage(2, 5)).toMatch(/2 contenus étaient déjà prévus/i);
  });

  it("ne dit rien quand rien n'a été écarté", () => {
    expect(duplicateMessage(0, 3)).toBe("");
  });
});
