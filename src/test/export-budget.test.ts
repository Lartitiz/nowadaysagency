import { describe, it, expect } from "vitest";
import {
  budgetExportMs,
  CAPTURE_TIMEOUT_MS,
  RENDER_CONCURRENCY,
} from "@/lib/export-budget";

// Bug du 01/08 : le pont Canva plafonnait la fabrication du PPTX à 90 s en dur,
// alors que le fabricant s'autorise 25 s PAR capture, 3 slides de front. Sur un
// carrousel de 10 slides, le pire cas légitime (4 lots × 25 s = 100 s) dépassait
// le plafond : l'export échouait par construction, et les garde-fous internes
// — conçus pour abandonner UNE slide et continuer — n'avaient jamais le temps de
// jouer. Ce test verrouille l'invariant : le budget global couvre TOUJOURS le
// pire cas des garde-fous internes.

describe("budget d'export", () => {
  it("couvre le pire cas des garde-fous internes, quel que soit le nombre de slides", () => {
    for (const slides of [1, 3, 4, 6, 8, 10, 12, 15, 20]) {
      const lots = Math.ceil(slides / RENDER_CONCURRENCY);
      const pireCasCaptures = lots * CAPTURE_TIMEOUT_MS;
      expect(budgetExportMs(slides)).toBeGreaterThan(pireCasCaptures);
    }
  });

  it("le carrousel de 10 slides qui échouait a désormais de la marge", () => {
    // 4 lots × 25 s = 100 s de captures : l'ancien plafond de 90 s le tuait.
    expect(budgetExportMs(10)).toBeGreaterThan(100000);
  });

  it("jamais plus sévère que l'ancien plafond, même pour une seule slide", () => {
    expect(budgetExportMs(1)).toBeGreaterThanOrEqual(90000);
    expect(budgetExportMs(0)).toBeGreaterThanOrEqual(90000);
  });

  it("reste borné : une attente sans fin vaut moins qu'une erreur claire", () => {
    expect(budgetExportMs(200)).toBeLessThanOrEqual(300000);
  });

  it("croît avec le nombre de slides", () => {
    expect(budgetExportMs(20)).toBeGreaterThan(budgetExportMs(4));
  });
});
