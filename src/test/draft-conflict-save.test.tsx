import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DraftConflictDialog from "@/components/creer/DraftConflictDialog";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), success: vi.fn(), error: vi.fn(), read: vi.fn(), updateEq: vi.fn(), upload: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({
  upload: mocks.upload,
  getPublicUrl: (path: string) => ({ data: { publicUrl: `https://projet.supabase.co/storage/v1/object/public/calendar-visuals/${path}` } }),
}) }, from: () => ({
  insert: mocks.insert,
  update: () => ({ eq: mocks.updateEq }),
  select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }),
}) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "workspace" }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
const draft = { step: "result", ideaText: "Ma collection", selectedFormat: "carousel", result: { type: "carousel", raw: { slides: [{ title: "Bonjour" }] } }, editContent: "", visualSlides: [{ slide_number: 1, html: "<p>Bonjour</p>" }], isLinkedInCarousel: true };

describe("protecting the current draft", () => {
  beforeEach(() => vi.clearAllMocks());
  // 13/11/2026 : la fiche ouverte est un carrousel, le brouillon est devenu un reel.
  it("never overwrites the stored idea of another format: saves a new one", async () => {
    mocks.insert.mockResolvedValue({ error: null });
    mocks.read.mockResolvedValue({ data: { format: "carousel", content_data: { slides: [{ title: "Slide" }] } }, error: null });
    const onStartNew = vi.fn();
    const reel = { step: "result", ideaText: "Visite", selectedFormat: "reel", result: { type: "reel", raw: { script: [{ texte_parle: "Bonjour" }] } }, editContent: "", editingIdeaId: "carousel-idea" };
    render(<DraftConflictDialog open draft={reel} newSubject="Nouveau" onResume={vi.fn()} onStartNew={onStartNew} />);
    fireEvent.click(screen.getByRole("button", { name: "Démarrer le nouveau contenu" }));
    await waitFor(() => expect(onStartNew).toHaveBeenCalledTimes(1));
    expect(mocks.updateEq).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ format: "reel" }));
  });
  it("updates the stored idea when it has the same format", async () => {
    mocks.updateEq.mockResolvedValue({ error: null });
    mocks.read.mockResolvedValue({ data: { format: "carousel", content_data: { slides: [{ title: "Avant" }] } }, error: null });
    const onStartNew = vi.fn();
    render(<DraftConflictDialog open draft={{ ...draft, editingIdeaId: "carousel-idea" }} newSubject="Nouveau" onResume={vi.fn()} onStartNew={onStartNew} />);
    fireEvent.click(screen.getByRole("button", { name: "Démarrer le nouveau contenu" }));
    await waitFor(() => expect(onStartNew).toHaveBeenCalledTimes(1));
    expect(mocks.updateEq).toHaveBeenCalledWith("id", "carousel-idea");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("does not start the new flow if saving fails", async () => {
    mocks.insert.mockResolvedValue({ error: new Error("offline") });
    const onStartNew = vi.fn();
    render(<DraftConflictDialog open draft={draft} newSubject="Nouveau" onResume={vi.fn()} onStartNew={onStartNew} />);
    fireEvent.click(screen.getByRole("button", { name: "Démarrer le nouveau contenu" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(onStartNew).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reprendre mon contenu en cours" })).toBeEnabled();
    // L'échec se lit aussi dans la fenêtre, pas seulement dans le message flottant.
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible d’enregistrer le contenu");
  });
  it("saves the actual document and its channel before starting", async () => {
    mocks.insert.mockResolvedValue({ error: null });
    const onStartNew = vi.fn();
    render(<DraftConflictDialog open draft={draft} newSubject="Nouveau" onResume={vi.fn()} onStartNew={onStartNew} />);
    fireEvent.click(screen.getByRole("button", { name: "Démarrer le nouveau contenu" }));
    await waitFor(() => expect(onStartNew).toHaveBeenCalledTimes(1));
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ canal: "linkedin", content_data: { slides: [{ title: "Bonjour" }], visual_html: draft.visualSlides } }));
  });
  // Mesuré en base le 28/11/2026 : un brouillon mis de côté gardait ses photos dans
  // le texte des slides (fiche de 1 à 2 Mo, écrite deux fois).
  it("stores the slide photos apart: the saved idea only keeps their links", async () => {
    mocks.insert.mockResolvedValue({ error: null });
    mocks.upload.mockResolvedValue({ error: null });
    const photo = `data:image/jpeg;base64,${"A".repeat(40_000)}`;
    const withPhoto = { ...draft, visualSlides: [{ slide_number: 1, html: `<div style="background-image:url(${photo})">Bonjour</div>` }] };
    const onStartNew = vi.fn();
    render(<DraftConflictDialog open draft={withPhoto} newSubject="Nouveau" onResume={vi.fn()} onStartNew={onStartNew} />);
    fireEvent.click(screen.getByRole("button", { name: "Démarrer le nouveau contenu" }));
    await waitFor(() => expect(onStartNew).toHaveBeenCalledTimes(1));
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const row = mocks.insert.mock.calls[0][0];
    const html = row.content_data.visual_html[0].html as string;
    expect(html).not.toContain("data:image");
    expect(html).toMatch(/calendar-visuals\/test-user\/carousel-media\/[0-9a-f]{64}\.jpg/);
    expect(row.content_draft).not.toContain("data:image");
    expect(row.content_draft.length).toBeLessThan(2_000);
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

  // Rejeu à l'écran du 26/11/2026 : case cochée d'office + enregistrement impossible =
  // « Démarrer le nouveau contenu » muet. Plus de case : la fenêtre annonce l'abandon,
  // le bouton démarre, et rien n'est écrit dans Mes idées (jamais de fausse sauvegarde).
  it.each([
    {step:"format", photoCount:1},
    {step:"idea", photoDescription:"Description avant import", photoSubject:"Sujet photo"},
  ])("brouillon parti de photos ($step) : pas de case, l'abandon est annoncé, le bouton démarre sans rien enregistrer", async (photoDraft) => {
    const onStartNew=vi.fn();
    render(<DraftConflictDialog open draft={{...draft,result:null,editContent:"",...photoDraft}} newSubject="Nouveau" onResume={vi.fn()} onStartNew={onStartNew}/>);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByTestId("draft-photo-notice")).toHaveTextContent("Ce brouillon part de photos");
    expect(screen.getByTestId("draft-photo-notice")).toHaveTextContent("sinon il sera abandonné");
    fireEvent.click(screen.getByText("Démarrer le nouveau contenu"));
    await waitFor(() => expect(onStartNew).toHaveBeenCalledTimes(1));
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("brouillon sans photo : la case reste, cochée d'office", () => {
    render(<DraftConflictDialog open draft={draft} newSubject="Nouveau" onResume={vi.fn()} onStartNew={vi.fn()}/>);
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.queryByTestId("draft-photo-notice")).toBeNull();
  });


});
