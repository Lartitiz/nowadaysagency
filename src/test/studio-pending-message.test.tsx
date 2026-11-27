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

// Essai du 27/11/2026 : les idées du Studio étaient une liste non cliquable.
describe("Studio : idées pour la suite", () => {
  it("un clic sur une idée l'envoie comme demande", async () => {
    const { fireEvent } = await import("@testing-library/react");
    const { vi } = await import("vitest");
    const editDraft = vi.fn(), setAutoSend = vi.fn();
    const current = { session: { id: "s1", revision: 1, messages: [
      { id: "m1", role: "assistant", text: "Voilà.", suggestions: ["Essayer en petit salon"] },
    ] }, versions: [], memory: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<StudioMessageList {...base} current={current as any} editDraft={editDraft} setAutoSend={setAutoSend} />);
    fireEvent.click(screen.getByRole("button", { name: "Essayer en petit salon" }));
    expect(editDraft).toHaveBeenCalledWith("Essayer en petit salon");
    expect(setAutoSend).toHaveBeenCalledWith("Essayer en petit salon");
  });
});
