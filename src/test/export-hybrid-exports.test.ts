import { describe, it, expect } from "vitest";
import * as hybrid from "@/lib/export-carousel-hybrid-pptx";

/**
 * Liste des exports de l'entrée de l'export hybride (fiche 15 de
 * docs/robustesse/gros-fichiers.md, lot T). Pendant le découpage en
 * `src/lib/export-carousel-hybrid/`, l'entrée doit réexporter tout ce que les
 * appelants et les tests utilisent : un réexport oublié fait échouer ce test.
 * Les quatre premiers sont utilisés par l'appli ; les autres sont exportés
 * pour les tests (export-hybrid-text-layout, export-hybrid-photo-zones).
 */
describe("export-carousel-hybrid-pptx — exports", () => {
  it("expose exactement ces fonctions", () => {
    expect(Object.keys(hybrid).sort()).toEqual(
      [
        "exportCarouselHybridPptx",
        "parseScrimStyle",
        "zoneCoversRect",
        "zoneOverlapsRect",
        "addBlockToSlide",
        "applyTextTransform",
        "clearOpaqueBackdropsBehindZone",
        "desiredTextWidthIn",
        "extractPhotoZones",
        "findOverlayElement",
        "isMonoFont",
        "maxFitPt",
        "parentCardOf",
        "stripDataUrlsFromBackground",
        "verticalBudgetPx",
      ].sort(),
    );
    for (const v of Object.values(hybrid)) expect(typeof v).toBe("function");
  });
});
