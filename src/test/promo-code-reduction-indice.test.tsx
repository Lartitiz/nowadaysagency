import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Un code de réduction (tarif partenaire, géré par la page de paiement) tapé
// dans « Tu as un code d'accès ? » : on dit où le saisir au lieu d'un simple « invalide ».

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: invoke }));
vi.mock("@/hooks/use-user-plan", () => ({ useUserPlan: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import PromoCodeInput from "@/components/PromoCodeInput";

describe("PromoCodeInput — code inconnu", () => {
  it("indique la page de paiement pour un code de réduction", async () => {
    invoke.mockResolvedValueOnce({ data: { error: "Code invalide ou expiré." }, error: null });
    render(<PromoCodeInput />);
    fireEvent.change(screen.getByPlaceholderText("MONCODE"), { target: { value: "PARTENAIRE" } });
    fireEvent.click(screen.getByRole("button", { name: "Activer" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Ajouter un code promotionnel"));
  });

  it("ne l'affiche pas pour un code déjà utilisé", async () => {
    invoke.mockResolvedValueOnce({ data: { error: "Tu as déjà utilisé ce code." }, error: null });
    render(<PromoCodeInput />);
    fireEvent.change(screen.getByPlaceholderText("MONCODE"), { target: { value: "DEJA" } });
    fireEvent.click(screen.getByRole("button", { name: "Activer" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
