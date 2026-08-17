import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// AbonnementPage n'avait aucun test malgré 12 commits sur les 3 derniers mois.
// On couvre : l'affichage du plan actuel selon check-subscription, le portail
// Stripe (gérer l'abonnement), l'upgrade (create-checkout), et la résilience
// quand une edge function échoue.

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
  refresh: vi.fn(),
  userPlan: {
    plan: "free" as string,
    usage: {} as Record<string, { used: number; limit: number }>,
    isPaid: false,
    isBinome: false,
    bonusCredits: 0,
  },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invoke }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/PromoCodeInput", () => ({ default: () => null }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({ activeWorkspace: { id: "workspace-1" }, loading: false }),
}));
vi.mock("@/hooks/use-user-plan", () => ({
  useUserPlan: () => ({ ...mocks.userPlan, refresh: mocks.refresh }),
}));
vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }: any) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import AbonnementPage from "@/pages/AbonnementPage";
import { STRIPE_PLANS } from "@/lib/stripe-config";

// Empêche jsdom de râler sur une "vraie" navigation quand le code fait
// `window.location.href = url` (create-checkout / create-checkout pack).
const originalLocation = window.location;
let hrefValue = "";

beforeEach(() => {
  vi.clearAllMocks();
  hrefValue = "";
  mocks.userPlan = { plan: "free", usage: {}, isPaid: false, isBinome: false, bonusCredits: 0 };
  mocks.invoke.mockResolvedValue({ data: null, error: null });
  window.open = vi.fn();
  delete (window as any).location;
  (window as any).location = {
    ...originalLocation,
    assign: vi.fn(),
    get href() { return hrefValue; },
    set href(v: string) { hrefValue = v; },
  };
});

afterEach(() => {
  (window as any).location = originalLocation;
});

function mockInvokeResponses(responses: Record<string, { data: any; error: any }>) {
  mocks.invoke.mockImplementation(async (fn: string) => {
    if (fn in responses) return responses[fn];
    return { data: null, error: null };
  });
}

// « Gratuit », les prix et le nom des plans réapparaissent dans le bloc
// "Changer de plan" (PlanCard) : on scope les assertions à la card "Plan
// actuel" et on attend la fin du chargement pour éviter un faux positif basé
// sur le fallback affiché pendant le fetch.
function getPlanActuelCard(): HTMLElement {
  return screen.getByText("Plan actuel").closest("div") as HTMLElement;
}

async function waitForPlanLoaded(): Promise<HTMLElement> {
  await waitFor(() => {
    expect(within(getPlanActuelCard()).queryByText(/Chargement/)).not.toBeInTheDocument();
  });
  return getPlanActuelCard();
}

describe("AbonnementPage — plan actuel", () => {
  it("affiche « Gratuit » quand check-subscription renvoie le plan free", async () => {
    mockInvokeResponses({
      "check-subscription": { data: { plan: "free" }, error: null },
    });
    render(<AbonnementPage />);

    const card = await waitForPlanLoaded();
    expect(within(card).getByText("Gratuit")).toBeInTheDocument();
  });

  it("affiche « Premium » et le prix pour le plan outil", async () => {
    mockInvokeResponses({
      "check-subscription": { data: { plan: "outil" }, error: null },
    });
    render(<AbonnementPage />);

    const card = await waitForPlanLoaded();
    expect(within(card).getByText("Premium")).toBeInTheDocument();
    expect(within(card).getByText(/39€\/mois/)).toBeInTheDocument();
  });

  it("affiche « Binôme de com » et le lien accompagnement pour le plan binôme", async () => {
    mockInvokeResponses({
      "check-subscription": { data: { plan: "binome" }, error: null },
    });
    render(<AbonnementPage />);

    const card = await waitForPlanLoaded();
    expect(within(card).getByText("Binôme de com")).toBeInTheDocument();
    expect(within(card).getByText(/290€\/mois/)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /Voir mon accompagnement/ })).toHaveAttribute(
      "href",
      "/accompagnement",
    );
  });
});

describe("AbonnementPage — portail Stripe", () => {
  it("clic sur « Gérer mon abonnement » appelle create-portal-session et ouvre l'URL renvoyée", async () => {
    mocks.userPlan.isPaid = true;
    mockInvokeResponses({
      "check-subscription": { data: { plan: "outil" }, error: null },
      "create-portal-session": { data: { url: "https://billing.stripe.com/session/abc" }, error: null },
    });
    render(<AbonnementPage />);

    const button = await screen.findByText("Gérer mon abonnement");
    fireEvent.click(button);

    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith("create-portal-session", {}, 15000),
    );
    expect(window.open).toHaveBeenCalledWith("https://billing.stripe.com/session/abc", "_blank");
  });

  it("ne propose pas de gérer l'abonnement sur le plan gratuit", async () => {
    mocks.userPlan.isPaid = false;
    mockInvokeResponses({
      "check-subscription": { data: { plan: "free" }, error: null },
    });
    render(<AbonnementPage />);

    await waitFor(() => expect(screen.getByText("Gratuit")).toBeInTheDocument());
    expect(screen.queryByText("Gérer mon abonnement")).not.toBeInTheDocument();
  });
});

describe("AbonnementPage — upgrade", () => {
  it("clic sur « Passer à Premium » appelle create-checkout avec le bon priceId et redirige", async () => {
    mocks.userPlan.plan = "free";
    mockInvokeResponses({
      "check-subscription": { data: { plan: "free" }, error: null },
      "create-checkout": { data: { url: "https://checkout.stripe.com/session/xyz" }, error: null },
    });
    render(<AbonnementPage />);

    const button = await screen.findByText(/Passer à Premium/);
    fireEvent.click(button);

    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        "create-checkout",
        { body: { priceId: STRIPE_PLANS.outil.priceId, mode: "subscription" } },
        15000,
      ),
    );
    await waitFor(() => expect(hrefValue).toBe("https://checkout.stripe.com/session/xyz"));
  });
});

describe("AbonnementPage — résilience aux erreurs", () => {
  it("n'affiche pas de crash quand check-subscription échoue et prévient via un toast", async () => {
    mocks.invoke.mockImplementation(async (fn: string) => {
      if (fn === "check-subscription") throw new Error("network down");
      return { data: null, error: null };
    });

    render(<AbonnementPage />);

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    // La page reste utilisable : le plan retombe sur l'état par défaut affiché.
    expect(screen.getByText("Mon abonnement")).toBeInTheDocument();
    const card = await waitForPlanLoaded();
    expect(within(card).getByText("Gratuit")).toBeInTheDocument();
  });
});
