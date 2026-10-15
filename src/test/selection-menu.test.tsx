import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SelectionMenuProvider from "@/components/SelectionMenuProvider";

// Menu IA sur une sélection de texte (lot 9, 14/10/2026 ; voir
// docs/creation-contenu/CARTE.md, section 5) : une action appelle la fonction
// serveur ai-text-action par invokeWithTimeout (télémétrie Sentry comprise), et
// « Copier » met le résultat dans le presse-papiers.

const m = vi.hoisted(() => ({
  demo: false,
  invoke: vi.fn(),
  close: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/hooks/use-text-selection", () => ({
  useTextSelection: () => ({
    selection: { text: "Le café du coin est bon. L'accueil est chaleureux." },
    menuPosition: { top: 100, left: 200 },
    isVisible: true,
    close: m.close,
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-test" } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: m.demo }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: m.invoke }));
vi.mock("sonner", () => ({ toast: m.toast }));

const writeText = vi.fn(async () => {});

beforeEach(() => {
  m.demo = false;
  m.invoke.mockReset();
  m.close.mockReset();
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(cleanup);

describe("menu IA sur sélection de texte", () => {
  it("une action appelle ai-text-action via invokeWithTimeout avec le texte, la consigne et l'espace", async () => {
    m.invoke.mockResolvedValue({ data: { result: "Café bon, accueil chaleureux." }, error: null });
    render(<SelectionMenuProvider><p>contenu</p></SelectionMenuProvider>);

    fireEvent.click(await screen.findByRole("button", { name: /Raccourcir/ }));

    expect(await screen.findByText("Café bon, accueil chaleureux.")).toBeInTheDocument();
    expect(m.invoke).toHaveBeenCalledTimes(1);
    const [fn, options, timeout] = m.invoke.mock.calls[0];
    expect(fn).toBe("ai-text-action");
    expect(options.body).toEqual({
      selected_text: "Le café du coin est bon. L'accueil est chaleureux.",
      action_prompt: expect.stringContaining("Raccourcis ce texte"),
      workspace_id: "ws-1",
    });
    expect(timeout).toBe(30000);
  });

  it("« Copier » copie le résultat et ferme le menu", async () => {
    m.invoke.mockResolvedValue({ data: { result: "Une version plus percutante." }, error: null });
    render(<SelectionMenuProvider><p>contenu</p></SelectionMenuProvider>);

    fireEvent.click(await screen.findByRole("button", { name: /Rendre plus percutant/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Copier/ }));

    expect(writeText).toHaveBeenCalledWith("Une version plus percutante.");
    expect(m.toast.success).toHaveBeenCalled();
    expect(m.close).toHaveBeenCalled();
  });

  it("une erreur du serveur affiche un message et ne montre aucun résultat à copier", async () => {
    m.invoke.mockResolvedValue({ data: null, error: { message: "quota" } });
    render(<SelectionMenuProvider><p>contenu</p></SelectionMenuProvider>);

    fireEvent.click(await screen.findByRole("button", { name: /Reformuler/ }));

    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Copier/ })).not.toBeInTheDocument();
  });

  it("en mode démo, aucune requête au serveur", async () => {
    m.demo = true;
    render(<SelectionMenuProvider><p>contenu</p></SelectionMenuProvider>);

    fireEvent.click(await screen.findByRole("button", { name: /Raccourcir/ }));

    expect(await screen.findByRole("button", { name: /Copier/ }, { timeout: 3000 })).toBeInTheDocument();
    expect(m.invoke).not.toHaveBeenCalled();
  });
});
