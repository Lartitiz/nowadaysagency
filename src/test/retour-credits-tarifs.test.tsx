import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Parcours cassé du 01/08, volet « crédits épuisés » :
//  1. les boutons « Passer au Premium » emmenaient sur /mon-plan, qui est le
//     plan de COMMUNICATION (éditorial), pas l'abonnement. On cliquait pour
//     payer et on atterrissait sur son calendrier de contenus.
//  2. et comme pour Canva, rien ne ramenait au travail en cours.

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  assign: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams(window.location.search)],
  Link: ({ to, children, ...rest }: any) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/posthog", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/Confetti", () => ({ default: () => null }));

import QuotaWallModal from "@/components/QuotaWallModal";
import PaymentSuccessPage from "@/pages/PaymentSuccessPage";
import { handleQuotaError } from "@/lib/quota-error-handler";
import { CHEMIN_TARIFS, lireRetour, memoriseRetour } from "@/lib/retour-apres-detour";

function allerSur(url: string) {
  window.history.replaceState({}, "", url);
}

// jsdom refuse une vraie navigation : on observe l'intention. On garde le VRAI
// objet location derrière (pathname/search doivent continuer à suivre
// history.replaceState) et on n'intercepte que `assign`.
const vraieLocation = window.location;
const locationStub = {
  assign: mocks.assign,
  replace: mocks.assign,
  get pathname() { return vraieLocation.pathname; },
  get search() { return vraieLocation.search; },
  get href() { return vraieLocation.href; },
  get origin() { return vraieLocation.origin; },
  get hash() { return vraieLocation.hash; },
};
Object.defineProperty(window, "location", {
  configurable: true,
  get: () => locationStub,
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  allerSur("/");
});

describe("« Passer au Premium » mène bien à l'abonnement", () => {
  it("le mur des crédits ouvre les tarifs, pas le plan éditorial", () => {
    allerSur("/creer");
    render(
      <QuotaWallModal open onClose={() => {}} plan="free" usage={{} as any} />,
    );

    fireEvent.click(screen.getByText(/Passer à L'Assistant Com'/i));

    expect(mocks.navigate).toHaveBeenCalledWith(CHEMIN_TARIFS);
    expect(mocks.navigate).not.toHaveBeenCalledWith("/mon-plan");
    // …en notant d'où l'on vient.
    expect(lireRetour()?.chemin).toBe("/creer");
  });

  it("le message « plus de crédits » emmène aux tarifs en notant la page", () => {
    allerSur("/creer?format=carrousel");

    const traite = handleQuotaError({ message: "Tu as atteint ta limite de générations IA ce mois" });
    expect(traite).toBe(true);

    const [, opts] = mocks.toast.mock.calls[0];
    opts.action.onClick();

    expect(mocks.assign).toHaveBeenCalledWith(CHEMIN_TARIFS);
    expect(lireRetour()?.chemin).toBe("/creer?format=carrousel");
  });
});

describe("après le paiement, on reprend son travail", () => {
  it("propose de reprendre le contenu en cours et y retourne", () => {
    memoriseRetour("/creer");
    allerSur("/payment/success?session_id=cs_test");

    render(<PaymentSuccessPage />);

    const bouton = screen.getByText(/Reprendre ton contenu en cours/i);
    fireEvent.click(bouton);

    expect(mocks.navigate).toHaveBeenCalledWith("/creer");
    // Mémo consommé : un retour arrière ne renvoie pas en boucle.
    expect(lireRetour()).toBeNull();
  });

  it("sans travail en cours, la page ne change pas (bouton « Commencer »)", () => {
    allerSur("/payment/success");

    render(<PaymentSuccessPage />);

    expect(screen.getByText("Commencer")).toBeTruthy();
    expect(screen.queryByText(/Reprendre/i)).toBeNull();
  });
});

describe("le mémo ignore les pages du détour lui-même", () => {
  it("ne mémorise ni les tarifs ni la confirmation de paiement", () => {
    allerSur(CHEMIN_TARIFS);
    memoriseRetour();
    expect(lireRetour()).toBeNull();

    allerSur("/payment/success");
    memoriseRetour();
    expect(lireRetour()).toBeNull();
  });
});
