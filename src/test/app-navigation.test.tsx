import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AppSidebar from "@/components/AppSidebar";
import { MobileNavProvider } from "@/contexts/MobileNavContext";
import { loadFlowState, saveFlowState, setFlowUserId, setFlowWorkspaceId } from "@/hooks/use-flow-persistence";
const state = vi.hoisted(() => ({ admin: false, pending: false, session: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "qa", email: "qa@example.test" }, isAdmin: state.admin, signOut: vi.fn() }) }));
vi.mock("@/hooks/use-user-plan", () => ({ useUserPlan: () => ({ plan: "binome", usage: {}, bonusCredits: 0 }) }));
vi.mock("@/hooks/use-pending-brand-review", () => ({ usePendingBrandReview: () => ({ pending: state.pending }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ activateDemo: vi.fn() }) }));
vi.mock("@/contexts/SessionContext", () => ({ useSession: () => ({ isActive: state.session }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ activeWorkspace: { id: "A", name: "A" }, workspaces: [], isMultiWorkspace: false, switchingWorkspaceId: null, switchWorkspace: vi.fn() }) }));
vi.mock("@/hooks/use-account-switcher", () => ({ useAccountSwitcher: () => ({ savedAccounts: [], switchToAccount: vi.fn(), removeAccount: vi.fn() }) }));
vi.mock("@/components/AiCreditsCounter", () => ({ default: () => <span>Crédits</span> }));
vi.mock("@/components/NotificationBell", () => ({ default: () => <button>Notifications</button> }));
function Path() { return <output data-testid="path">{useLocation().pathname}{useLocation().search}</output>; }
function mount() { return render(<MemoryRouter initialEntries={["/dashboard"]}><MobileNavProvider><AppSidebar /><Path /></MobileNavProvider></MemoryRouter>); }
function openMenu() { fireEvent.click(screen.getAllByRole("button", { name: "Mon espace" })[0]); return within(screen.getByRole("dialog", { name: "Mon espace" })); }
beforeEach(() => { state.admin = false; state.pending = false; state.session = false; localStorage.clear(); sessionStorage.clear(); setFlowUserId("qa"); setFlowWorkspaceId("A"); });
afterEach(cleanup);
it("ouvre les outils secondaires et respecte les flags et accès contractuels", () => {
  mount(); const menu = openMenu();
  expect(menu.getByRole("link", { name: "Mon identité" })).toHaveAttribute("href", "/branding");
  expect(menu.getByRole("link", { name: "Améliorer mon site" })).toHaveAttribute("href", "/site");
  expect(menu.getByRole("link", { name: "Coach IA" })).toHaveAttribute("href", "/dashboard/guide");
  expect(menu.getByRole("link", { name: "Mon accompagnement" })).toBeVisible();
  expect(menu.queryByRole("link", { name: "Pinterest" })).not.toBeInTheDocument();
  expect(menu.queryByRole("link", { name: /Mes client/ })).not.toBeInTheDocument();
});
it("ferme le menu en naviguant sans vider le brouillon avant le garde-fou de Créer", () => {
  saveFlowState({ step: "idea", ideaText: "Texte initial à conserver" });
  mount(); const menu = openMenu();
  fireEvent.click(menu.getByRole("link", { name: "Créer un contenu" }));
  expect(screen.getByTestId("path")).toHaveTextContent("/creer?new=1");
  expect(loadFlowState()?.ideaText).toBe("Texte initial à conserver");
});
it("conserve le retour vers la relecture d’une fiche importée", () => {
  state.pending = true; mount(); const menu = openMenu();
  expect(menu.getByRole("link", { name: "Valider ma fiche" })).toHaveAttribute("href", "/branding?from=onboarding&next=creer");
  expect(menu.queryByRole("link", { name: "Créer un contenu" })).not.toBeInTheDocument();
});
it("conserve les outils admin sans les ajouter aux comptes ordinaires", () => {
  state.admin = true; mount(); const menu = openMenu();
  expect(menu.getByRole("link", { name: "Pinterest" })).toBeVisible();
  expect(menu.getByRole("link", { name: /Mes client/ })).toBeVisible();
});
it("ne superpose pas la navigation à une session guidée", () => {
  state.session = true; mount();
  expect(screen.queryByRole("navigation", { name: "Navigation principale" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mon espace" })).not.toBeInTheDocument();
});
