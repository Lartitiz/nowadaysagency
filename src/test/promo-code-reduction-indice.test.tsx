import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// « Tu as un code d'accès ? » : un code de réduction Stripe est reconnu et mène
// au paiement avec la réduction posée ; un code inconnu dit quoi faire.
// Les réponses imitent invokeWithTimeout : un refus 400 arrive avec `error`
// ET le message du serveur dans `data`.

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: invoke }));
vi.mock("@/hooks/use-user-plan", () => ({ useUserPlan: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import PromoCodeInput from "@/components/PromoCodeInput";

function submit(code: string) {
  render(<PromoCodeInput />);
  fireEvent.change(screen.getByPlaceholderText("MONCODE"), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: "Activer" }));
}

describe("PromoCodeInput — codes de réduction", () => {
  beforeEach(() => invoke.mockReset());

  it("code inconnu (refus 400) : indique où saisir un code de réduction", async () => {
    invoke.mockResolvedValueOnce({
      data: { error: "Code invalide ou expiré." },
      error: { code: "SERVER_ERROR", message: "Code invalide ou expiré." },
    });
    submit("FAUTEDEFRAPPE");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Ajouter un code promotionnel"));
  });

  it("code déjà utilisé : pas d'indice", async () => {
    invoke.mockResolvedValueOnce({
      data: { error: "Tu as déjà utilisé ce code." },
      error: { code: "SERVER_ERROR", message: "Tu as déjà utilisé ce code." },
    });
    submit("DEJA");
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("code de réduction Stripe : affiche la réduction puis ouvre le paiement avec le code", async () => {
    invoke
      .mockResolvedValueOnce({ data: { discount: { id: "promo_1", code: "PARTENAIRE", label: "-10 € par mois" } }, error: null })
      .mockResolvedValueOnce({ data: { url: "https://checkout.stripe.test/x" }, error: null });
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, pathname: "/pricing", origin: "https://app.test", set href(v: string) { assign(v); } } });
    try {
      submit("PARTENAIRE");
      await screen.findByText(/Code de réduction reconnu : -10 € par mois/);
      fireEvent.click(screen.getByRole("button", { name: "Passer au paiement avec cette réduction" }));
      await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/x"));
      const [fn, opts] = invoke.mock.calls[1];
      expect(fn).toBe("create-checkout");
      expect(opts.body).toMatchObject({ mode: "subscription", promotionCode: "PARTENAIRE", cancelUrl: "https://app.test/pricing?checkout=cancelled" });
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });
});
