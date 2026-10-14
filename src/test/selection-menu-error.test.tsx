import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, screen } from "@testing-library/react";

// Menu IA sur sélection (lot 10, 14/10/2026) : le refus clair du serveur
// (texte trop long, consigne trop longue…) s'affiche tel quel, au lieu du
// message générique « Oups, quelque chose a coincé ».

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import SelectionMenu, { selectionActionErrorMessage } from "@/components/SelectionMenu";

const TOO_LONG = "Le texte sélectionné est trop long (9 000 caractères, 8 000 au maximum). Sélectionne un passage plus court, par exemple un paragraphe à la fois.";

function mount(onAction: (text: string, prompt: string) => Promise<string>) {
  render(<SelectionMenu selectedText="Un texte" position={{ top: 0, left: 0 }} isVisible onAction={onAction} onClose={vi.fn()} />);
}

describe("SelectionMenu — message d'erreur", () => {
  beforeEach(() => vi.clearAllMocks());

  it("affiche le message du serveur pour une action du menu", async () => {
    mount(async () => { throw new Error(TOO_LONG); });
    fireEvent.click(screen.getByText("Raccourcir"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(TOO_LONG));
  });

  it("affiche le message du serveur pour une demande libre", async () => {
    mount(async () => { throw new Error("Ta consigne est trop longue (1 200 caractères, 1 000 au maximum). Résume ce que tu veux en quelques phrases."); });
    fireEvent.click(screen.getByText("Demander autre chose..."));
    fireEvent.change(screen.getByPlaceholderText("Dis-moi ce que tu veux faire avec ce texte..."), { target: { value: "Rends-le drôle" } });
    fireEvent.click(screen.getByText("Envoyer →"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Ta consigne est trop longue")));
  });

  it("la demande libre est plafonnée à 1 000 caractères, comme le serveur", () => {
    mount(async () => "ok");
    fireEvent.click(screen.getByText("Demander autre chose..."));
    expect(screen.getByPlaceholderText("Dis-moi ce que tu veux faire avec ce texte...").getAttribute("maxlength")).toBe("1000");
  });

  it("garde le message générique quand l'erreur n'a pas de texte", () => {
    expect(selectionActionErrorMessage(new Error(""))).toBe("Oups, quelque chose a coincé");
    expect(selectionActionErrorMessage("boom")).toBe("Oups, quelque chose a coincé");
    expect(selectionActionErrorMessage(undefined)).toBe("Oups, quelque chose a coincé");
  });
});
