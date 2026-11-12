import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import DraftConflictDialog from "@/components/creer/DraftConflictDialog";
import { computeDraftConflict } from "@/features/creer/draft-conflict";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ insert: vi.fn() }) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "workspace" }));

// QA du 12/11/2026 : « 🎬 Reprendre le reel » depuis le calendrier, avec un
// autre contenu ouvert dans Créer, proposait « Démarrer le NOUVEAU contenu ».
const base = { photoCount: 0, aurianaDemoActive: false, isFreshStart: false, paramSujet: "", paramIdeaId: null, paramAuto: false, paramFormat: null, paramCanal: null };
const existingFlowState: any = { step: "result", ideaText: "Mon carrousel en cours", selectedFormat: "carousel", result: { raw: { slides: [] } } };

describe("Reprendre un contenu alors qu'un autre est en cours", () => {
  it("le conflit sait que c'est une reprise et nomme le contenu repris", () => {
    const conflict = computeDraftConflict({ ...base, existingFlowState, locState: { resumeIdea: { format: "reel", raw: { sections: [] } }, fromCalendar: true, theme: "Avant / après du salon" } });
    expect(conflict).toMatchObject({ resuming: true, newSubject: "Avant / après du salon" });
    const fresh = computeDraftConflict({ ...base, existingFlowState, locState: { sujet: "Nouveau sujet" } });
    expect(fresh).toMatchObject({ resuming: false, newSubject: "Nouveau sujet" });
  });

  it("la fenêtre parle d'ouvrir le contenu choisi, jamais d'un « nouveau » contenu", () => {
    render(<DraftConflictDialog open resuming draft={existingFlowState} newSubject="Avant / après du salon" onResume={vi.fn()} onStartNew={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Ouvrir le contenu choisi" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Garder mon contenu en cours" })).toBeTruthy();
    expect(screen.getByText("À reprendre")).toBeTruthy();
    expect(screen.queryByText(/nouveau|nouvelle/i)).toBeNull();
  });

  it("sans reprise, la fenêtre reste celle d'un nouveau contenu", () => {
    render(<DraftConflictDialog open draft={existingFlowState} newSubject="Nouveau sujet" onResume={vi.fn()} onStartNew={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Démarrer le nouveau contenu" })).toBeTruthy();
    expect(screen.getByText("Nouvelle demande")).toBeTruthy();
  });
});
