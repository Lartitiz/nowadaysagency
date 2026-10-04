// Logo désactivé par défaut à l'export (choix du 04/10/2026).
import { beforeEach, describe, expect, it } from "vitest";
import { getIncludeLogoPref, setIncludeLogoPref } from "@/lib/export-logo";

describe("préférence « Ajouter mon logo »", () => {
  beforeEach(() => window.localStorage.clear());
  it("est décochée tant que personne ne l'a cochée", () => {
    expect(getIncludeLogoPref()).toBe(false);
  });
  it("suit la case cochée puis décochée", () => {
    setIncludeLogoPref(true);
    expect(getIncludeLogoPref()).toBe(true);
    setIncludeLogoPref(false);
    expect(getIncludeLogoPref()).toBe(false);
  });
});
