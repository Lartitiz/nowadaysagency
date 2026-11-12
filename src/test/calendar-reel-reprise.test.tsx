import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CalendarPostContent } from "@/components/calendar/CalendarPostContent";

/* Un reel enregistré au calendrier se reprend tel quel (script + montage) :
   avant le 12/11/2026, seuls « Voir le script » et « Nouvelle version IA »
   existaient, et le montage était perdu. */
const props = (detail: Record<string, unknown>, onOpenAtelier = vi.fn()) => ({
  editingPost: { id: "p1", story_sequence_detail: detail } as any, theme: "Mon reel", contentDraft: "Phrase 1",
  setContentDraft: vi.fn(), accroche: "", setAccroche: vi.fn(), status: "drafting", setStatus: vi.fn(), isGenerating: false,
  onSmartGenerate: vi.fn(), onCopy: vi.fn(), onOpenAtelier, onNavigateToDeepen: vi.fn(), postCanal: "instagram", format: "reel",
  angle: "", objectif: "", notes: "", mediaUrls: [], onSaveAndClose: vi.fn(), onShowContentViewer: vi.fn(),
});

describe("Calendrier — reprendre un reel", () => {
  it("« Reprendre le reel » rouvre le reel enregistré", () => {
    const onOpenAtelier = vi.fn();
    render(<MemoryRouter><CalendarPostContent {...props({ type: "reel", script: [{ texte_parle: "Phrase 1" }] }, onOpenAtelier)} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Reprendre le reel/ }));
    expect(onOpenAtelier).toHaveBeenCalledOnce();
  });

  it("pas de bouton pour un reel sans script enregistré", () => {
    render(<MemoryRouter><CalendarPostContent {...props({ type: "reel" })} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /Reprendre le reel/ })).toBeNull();
  });
});
