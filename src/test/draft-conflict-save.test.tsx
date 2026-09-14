import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DraftConflictDialog from "@/components/creer/DraftConflictDialog";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ insert: mocks.insert }) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "workspace" }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
const draft = { step: "result", ideaText: "Ma collection", selectedFormat: "carousel", result: { type: "carousel", raw: { slides: [{ title: "Bonjour" }] } }, editContent: "", visualSlides: [{ slide_number: 1, html: "<p>Bonjour</p>" }], isLinkedInCarousel: true };

describe("protecting the current draft", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not start the new flow if saving fails", async () => {
    mocks.insert.mockResolvedValue({ error: new Error("offline") });
    const onStartNew = vi.fn();
    render(<DraftConflictDialog open draft={draft} newSubject="Nouveau" onResume={vi.fn()} onStartNew={onStartNew} />);
    fireEvent.click(screen.getByRole("button", { name: "Démarrer le nouveau contenu" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(onStartNew).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reprendre mon contenu en cours" })).toBeEnabled();
  });
  it("saves the actual document and its channel before starting", async () => {
    mocks.insert.mockResolvedValue({ error: null });
    const onStartNew = vi.fn();
    render(<DraftConflictDialog open draft={draft} newSubject="Nouveau" onResume={vi.fn()} onStartNew={onStartNew} />);
    fireEvent.click(screen.getByRole("button", { name: "Démarrer le nouveau contenu" }));
    await waitFor(() => expect(onStartNew).toHaveBeenCalledTimes(1));
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ canal: "linkedin", content_data: { slides: [{ title: "Bonjour" }], visual_html: draft.visualSlides } }));
  });
  it("preserves the full initial text and channel instead of only its truncated title", async () => {
    mocks.insert.mockResolvedValue({ error: null });
    const initial = "  Premier texte complet\n" + "suite ".repeat(40);
    const onStartNew = vi.fn();
    render(<DraftConflictDialog open draft={{step:"idea",ideaText:initial,selectedFormat:null,result:null,editContent:"",forcedChannel:"newsletter"}} newSubject="Nouveau" onResume={vi.fn()} onStartNew={onStartNew}/>);
    fireEvent.click(screen.getByText("Démarrer le nouveau contenu"));
    await waitFor(() => expect(onStartNew).toHaveBeenCalled());
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({canal:"newsletter",content_data:{content:initial}}));
  });
  it("does not reset a new visit after an old save finishes", async () => {
    let resolve: (value: any) => void;
    mocks.insert.mockReturnValue(new Promise(r => {resolve=r;}));
    const onStartNew=vi.fn();
    const app=render(<DraftConflictDialog open draft={draft} newSubject="Nouveau" onResume={vi.fn()} onStartNew={onStartNew}/>);
    fireEvent.click(screen.getByText("Démarrer le nouveau contenu")); app.unmount();
    resolve!({error:null}); await Promise.resolve(); await Promise.resolve();
    expect(onStartNew).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
  });

  it.each([
    {step:"format", photoCount:1},
    {step:"idea", photoDescription:"Description avant import", photoSubject:"Sujet photo"},
  ])("keeps unarchived photo inputs at $step instead of confirming a text-only save", async (photoDraft) => {
    const onStartNew=vi.fn();
    render(<DraftConflictDialog open draft={{...draft,result:null,editContent:"",...photoDraft}} newSubject="Nouveau" onResume={vi.fn()} onStartNew={onStartNew}/>);
    fireEvent.click(screen.getByText("Démarrer le nouveau contenu"));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.insert).not.toHaveBeenCalled(); expect(onStartNew).not.toHaveBeenCalled();
  });

});
