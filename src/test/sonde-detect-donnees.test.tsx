import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";
import { detectDonneesIncompletes } from "../../e2e-visite/detect-donnees";

// Auto-test du détecteur « données incomplètes » de la visite guidée
// (e2e-visite/detect-donnees.ts) : un message « Impossible de charger … »
// visible à l'écran = une requête de données qui a échoué, que l'utilisatrice
// voit. Si le libellé du bandeau de l'accueil change de préfixe, ce test casse
// avant que la sonde ne devienne aveugle.

// jsdom ne calcule aucune mise en page : tout aurait une taille 0 et serait
// jugé « invisible ». On donne une taille non nulle à tout élément.
const origRect = Element.prototype.getBoundingClientRect;
beforeAll(() => {
  Element.prototype.getBoundingClientRect = () =>
    ({ width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = origRect;
});
afterEach(cleanup);

describe("detectDonneesIncompletes (sonde de la visite guidée)", () => {
  it("voit le bandeau de l'accueil et un bloc role=alert, chacun une seule fois", () => {
    render(
      <main>
        <div className="order-first rounded-xl border">
          <p>Impossible de charger certaines de tes données — ce que tu vois peut être incomplet.</p>
          <button>Réessayer</button>
        </div>
        <div role="alert">
          Impossible de charger le profil. <button>Réessayer</button>
        </div>
      </main>,
    );
    expect(detectDonneesIncompletes()).toEqual([
      { texte: "Impossible de charger certaines de tes données — ce que tu vois peut être incomplet." },
      { texte: "Impossible de charger le profil. Réessayer" },
    ]);
  });

  it("se tait sur un écran sain, sur un message caché et sur une phrase qui ne fait que contenir le mot", () => {
    render(
      <main>
        <p>Tout va bien</p>
        <p style={{ display: "none" }}>Impossible de charger ton profil</p>
        <p>Si c'est impossible de charger, réessaie plus tard.</p>
        <button>Réessayer</button>
      </main>,
    );
    expect(detectDonneesIncompletes()).toEqual([]);
  });

  it("le bandeau de l'accueil garde le préfixe que la sonde cherche", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../pages/AdaptiveHome.tsx"), "utf8");
    expect(src).toContain("Impossible de charger certaines de tes données");
  });
});
