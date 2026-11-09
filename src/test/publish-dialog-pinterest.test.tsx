import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PublishOrScheduleDialog from "@/components/creer/PublishOrScheduleDialog";

// Publication d'épingles (09/11/2026) : « Maintenant » + choix du tableau, pas de « Programmer ».
vi.mock("@/components/calendar/AlreadyPlannedNotice", () => ({ default: () => null }));

const boardsState = (over = {}) => ({
  boards: [{ id: "b1", name: "Recettes" }, { id: "b2", name: "Déco" }],
  loading: false, error: null, selectedBoardId: null as string | null, onSelect: vi.fn(), onRetry: vi.fn(), ...over,
});
const props = {
  open: true, onOpenChange: vi.fn(), channel: "pinterest" as const, channelConnected: true,
  onPublishNow: vi.fn(), onSchedule: vi.fn(), onDraft: vi.fn(), onPublishedByHand: vi.fn(), onConnectChannel: vi.fn(),
};

describe("fenêtre « Publier » : épingle Pinterest", () => {
  it("propose « Maintenant » sur Pinterest, sans « Programmer »", () => {
    render(<PublishOrScheduleDialog {...props} pinterestBoards={boardsState({ selectedBoardId: "b1" })} />);
    expect(screen.getByText("Publié tout de suite sur Pinterest")).toBeInTheDocument();
    expect(screen.queryByTestId("publish-schedule-option")).not.toBeInTheDocument();
    expect(screen.getByTestId("publish-now-option")).toBeEnabled();
  });

  it("liste les tableaux et transmet le choix", () => {
    const state = boardsState();
    render(<PublishOrScheduleDialog {...props} pinterestBoards={state} disabledReason="Choisis le tableau Pinterest où ranger ton épingle." />);
    fireEvent.change(screen.getByTestId("pinterest-board-select"), { target: { value: "b2" } });
    expect(state.onSelect).toHaveBeenCalledWith("b2");
    expect(screen.getByTestId("publish-now-option")).toBeDisabled();
  });

  it("compte non connecté : pas de liste de tableaux, bouton « Connecter Pinterest »", () => {
    render(<PublishOrScheduleDialog {...props} channelConnected={false} pinterestBoards={boardsState()} />);
    expect(screen.queryByTestId("pinterest-board-select")).not.toBeInTheDocument();
    expect(screen.getByText("Compte Pinterest non connecté.")).toBeInTheDocument();
    expect(screen.getByTestId("publish-connect-action")).toHaveTextContent("Connecter Pinterest");
  });

  it("lecture des tableaux en échec : message et bouton pour relire", () => {
    const state = boardsState({ boards: [], error: "Jeton Pinterest expiré ou invalide." });
    render(<PublishOrScheduleDialog {...props} pinterestBoards={state} />);
    expect(screen.getByTestId("pinterest-boards-error")).toHaveTextContent("Jeton Pinterest expiré");
    fireEvent.click(screen.getByText("Relire mes tableaux"));
    expect(state.onRetry).toHaveBeenCalled();
  });
});
