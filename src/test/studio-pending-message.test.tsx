import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudioMessageList } from "@/features/visual-studio/StudioMessageList";

const base = {
  current: undefined, proposal: null, references: [], writable: true, busy: "",
  generating: false, mutate: async () => null, onRetryVersion: () => {},
  readyFollowUp: null, identitySheet: false, productName: "", editDraft: () => {},
  setAutoSend: () => {}, openCastingRef: { current: null },
  onEditComposition: () => {}, onOpenExistingTool: () => {}, proposalCard: null,
};

describe("Studio : message en cours d'envoi", () => {
  it("affiche tout de suite le message envoyé et un indicateur d'attente", () => {
    render(<StudioMessageList {...base} busy="message" pendingMessage="Range le salon, garde les murs" />);
    expect(screen.getByText("Range le salon, garde les murs")).toBeTruthy();
    expect(screen.getByText(/Je lis ta demande/)).toBeTruthy();
  });
  it("n'affiche rien de plus sans message en attente", () => {
    render(<StudioMessageList {...base} />);
    expect(screen.queryByText(/Je lis ta demande/)).toBeNull();
  });
});
