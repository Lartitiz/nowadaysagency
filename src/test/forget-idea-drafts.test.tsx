import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { forgetIdeaDrafts, loadFlowState, saveFlowState, setFlowUserId, setFlowWorkspaceId } from "@/hooks/use-flow-persistence";

vi.mock("sonner", () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }));

/** Nouvel onglet après fermeture : plus de sessionStorage, l'ancien onglet n'est plus « présent ». */
function nouvelOnglet() {
  sessionStorage.clear();
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith("creer_flow_presence")) localStorage.removeItem(key);
  }
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); setFlowUserId("owner"); setFlowWorkspaceId("owner"); });
afterEach(() => { setFlowUserId(null); });

it("un brouillon dont la fiche est supprimée ne revient pas dans un nouvel onglet", () => {
  saveFlowState({ step: "questions", ideaText: "Pourquoi je garde les portes anciennes", editingIdeaId: "idea-1" });
  forgetIdeaDrafts("idea-1");
  expect(loadFlowState()).toBeNull();
  nouvelOnglet();
  expect(loadFlowState()).toBeNull();
});

it("le brouillon d'une autre fiche reste disponible", () => {
  saveFlowState({ step: "questions", ideaText: "Les cheminées en marbre", editingIdeaId: "idea-2" });
  forgetIdeaDrafts("idea-1");
  nouvelOnglet();
  expect(loadFlowState()?.ideaText).toBe("Les cheminées en marbre");
});
