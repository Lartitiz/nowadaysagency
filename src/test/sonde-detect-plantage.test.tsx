import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { detectPlantage } from "../../e2e-visite/detect-plantage";

// Auto-test du détecteur « écran de plantage » de la visite guidée
// (e2e-visite/detect-plantage.ts). On rend les VRAIS écrans de secours
// (ErrorBoundary global + LocalErrorBoundary) avec un enfant qui plante, puis
// on lance le détecteur sur le DOM obtenu : si un libellé change dans le front,
// ce test casse avant que la sonde ne devienne aveugle.

vi.mock("@/lib/sentry-lazy", () => ({ Sentry: { captureReactException: vi.fn() } }));
vi.mock("@/lib/client-error-monitor", () => ({ reportClientError: vi.fn() }));

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LocalErrorBoundary } from "@/components/LocalErrorBoundary";
import { Button } from "@/components/ui/button";

function Boum(): JSX.Element {
  throw new Error("boum de test");
}

// jsdom ne calcule aucune mise en page : tout aurait une taille 0 et serait
// jugé « invisible ». On donne une taille non nulle à tout élément.
const origRect = Element.prototype.getBoundingClientRect;
beforeAll(() => {
  Element.prototype.getBoundingClientRect = () =>
    ({ width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = origRect;
});
afterEach(cleanup);

describe("detectPlantage (sonde de la visite guidée)", () => {
  it("voit l'écran de plantage global « 😵 »", () => {
    render(
      <ErrorBoundary>
        <Boum />
      </ErrorBoundary>,
    );
    expect(detectPlantage()).toEqual([{ kind: "global", titre: "Oups, quelque chose a coincé" }]);
  });

  it("voit le bloc de plantage local (message par défaut et message personnalisé)", () => {
    render(
      <div>
        <LocalErrorBoundary>
          <Boum />
        </LocalErrorBoundary>
        <LocalErrorBoundary fallbackMessage="Erreur dans le dialogue de post.">
          <Boum />
        </LocalErrorBoundary>
      </div>,
    );
    expect(detectPlantage()).toEqual([
      { kind: "local", titre: "Quelque chose s'est mal passé. Réessaie." },
      { kind: "local", titre: "Erreur dans le dialogue de post." },
    ]);
  });

  it("se tait sur un écran sain, même avec un bouton « Réessayer » ordinaire ou un 😵 d'onboarding", () => {
    render(
      <div>
        <ErrorBoundary>
          <LocalErrorBoundary>
            <p>Tout va bien</p>
          </LocalErrorBoundary>
        </ErrorBoundary>
        <div>
          <p>La génération a échoué.</p>
          <Button>Réessayer</Button>
        </div>
        <button>
          <span>😵</span> Je sais pas par où commencer
        </button>
      </div>,
    );
    expect(detectPlantage()).toEqual([]);
  });
});
