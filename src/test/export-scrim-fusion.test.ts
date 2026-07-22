import { describe, it, expect } from "vitest";
import { parseScrimStyle } from "@/lib/export-carousel-hybrid-pptx";

/**
 * Contrat gabarits photo ⇄ export hybride : les voiles [data-injected-scrim]
 * générés par photo-overlay-templates (gradientScrim / fullDim) doivent être
 * reconnus par parseScrimStyle pour être fusionnés dans la photo native
 * (l'import Canva ne rend pas fiablement un calque PNG de voile séparé).
 * Un format non reconnu → null → le voile reste dans le raster (comportement
 * historique, fidèle en PowerPoint) : le parseur doit donc être STRICT.
 */
describe("parseScrimStyle — formats générés par photo-overlay-templates", () => {
  it("dégradé ancré en bas (0deg, tel qu'écrit dans le HTML)", () => {
    expect(parseScrimStyle("linear-gradient(0deg,rgba(0,0,0,0.78) 0%,rgba(0,0,0,0) 100%)", "rgba(0, 0, 0, 0)"))
      .toEqual({ kind: "gradient", anchor: "bottom", alpha: 0.78 });
  });

  it("dégradé ancré en haut (180deg), sérialisation getComputedStyle (espaces)", () => {
    expect(parseScrimStyle("linear-gradient(180deg, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0) 100%)", "rgba(0, 0, 0, 0)"))
      .toEqual({ kind: "gradient", anchor: "top", alpha: 0.85 });
  });

  it("dégradé SANS angle (Chrome omet 180deg, la direction par défaut) → pic en haut", () => {
    // Vu en repro le 22/07 : la slide au voile ancré en haut n'était pas fusionnée.
    expect(parseScrimStyle("linear-gradient(rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0) 100%)", "rgba(0, 0, 0, 0)"))
      .toEqual({ kind: "gradient", anchor: "top", alpha: 0.72 });
  });

  it("voile uniforme (fullDim) : background-color rgba noir sans image", () => {
    expect(parseScrimStyle("none", "rgba(0, 0, 0, 0.36)"))
      .toEqual({ kind: "uniform", alpha: 0.36 });
  });

  it("rejette un fond OPAQUE (alpha ≥ 0.99 : ce n'est pas un voile)", () => {
    expect(parseScrimStyle("none", "rgba(0, 0, 0, 1)")).toBeNull();
  });

  it("rejette un dégradé non noir ou de forme inconnue (reste dans le raster)", () => {
    expect(parseScrimStyle("linear-gradient(0deg, rgba(255, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0) 100%)", "rgba(0, 0, 0, 0)")).toBeNull();
    expect(parseScrimStyle("linear-gradient(90deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0) 100%)", "rgba(0, 0, 0, 0)")).toBeNull();
    expect(parseScrimStyle("radial-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0))", "rgba(0, 0, 0, 0)")).toBeNull();
  });

  it("rejette un élément sans voile (transparent, sans image)", () => {
    expect(parseScrimStyle("none", "rgba(0, 0, 0, 0)")).toBeNull();
    expect(parseScrimStyle("", "")).toBeNull();
  });
});
