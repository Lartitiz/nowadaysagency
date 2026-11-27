import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyHistory, recordStep, travelHistory } from "@/lib/edit-history";

/* La pile d'« Annuler / Rétablir » commune aux stories et au texte (27/11/2026). */

describe("pile commune d'Annuler / Rétablir", () => {
  it("regroupe les frappes rapprochées d'une même famille, pas les autres", () => {
    const h = emptyHistory<string>();
    recordStep(h, "", "titre", 30, 1000);
    recordStep(h, "a", "titre", 30, 1500); // même champ, 500 ms : même étape
    expect(h.past).toEqual([""]);
    recordStep(h, "ab", "titre", 30, 2400); // 900 ms de pause : nouvelle étape
    recordStep(h, "abc", "photo", 30, 2500); // autre famille : nouvelle étape
    recordStep(h, "x", null, 30, 2501); // sans famille : toujours une étape
    recordStep(h, "y", null, 30, 2502);
    expect(h.past).toEqual(["", "ab", "abc", "x", "y"]);
  });

  it("annule, rétablit, et un nouveau changement vide Rétablir", () => {
    const h = emptyHistory<string>();
    recordStep(h, "un", null, 30, 1);
    recordStep(h, "deux", null, 30, 2);
    expect(travelHistory(h, "trois")).toBe("deux");
    expect(travelHistory(h, "deux")).toBe("un");
    expect(travelHistory(h, "un")).toBeUndefined();
    expect(travelHistory(h, "un", true)).toBe("deux");
    recordStep(h, "deux", null, 30, 3);
    expect(h.future).toEqual([]);
    expect(travelHistory(h, "autre", true)).toBeUndefined();
  });

  it("après Annuler, la frappe suivante est une nouvelle étape même dans la même famille", () => {
    const h = emptyHistory<string>();
    recordStep(h, "", "titre", 30, 1000);
    recordStep(h, "a", "titre", 30, 1100);
    recordStep(h, "ab", "photo", 30, 1200);
    travelHistory(h, "abc"); // retour à « ab »
    recordStep(h, "ab", "photo", 30, 1250);
    expect(h.past).toEqual(["", "ab"]);
  });

  it("garde au plus `max` étapes, les plus récentes", () => {
    const h = emptyHistory<number>();
    for (let i = 0; i < 50; i++) recordStep(h, i, null, 30, i);
    expect(h.past).toHaveLength(30);
    expect(h.past[0]).toBe(20);
  });

  it("les stories et le texte passent par cette pile, et les stories lisent le raccourci commun", () => {
    const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
    for (const file of ["hooks/use-text-edit-history.ts", "components/stories/use-story-history.ts"]) {
      const code = read(file);
      expect(code, file).toContain('from "@/lib/edit-history"');
      expect(code, `${file} : la pile ne se réécrit pas à la main`).not.toMatch(/\.past\s*=|future\s*=\s*\[/);
    }
    const buttons = read("components/stories/StoryUndoButtons.tsx");
    expect(buttons).toContain("editHistoryShortcut(");
    expect(buttons, "raccourci relu à la main").not.toMatch(/key === "z"/);
  });
});
