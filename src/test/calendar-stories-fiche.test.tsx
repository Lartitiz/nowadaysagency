import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/* Fiche du calendrier d'une série de stories (13/11/2026) : vignettes qui
   ouvrent l'éditeur, plus de texte modifiable qui ne touchait pas les visuels,
   ce qui reste à préparer, et comment publier. */

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/use-story-frames", () => ({
  useStoryFrames: (stories: any[]) => stories.map((s: any, i: number) => (s.face_cam ? null : `<p>frame ${i + 1}</p>`)),
}));
vi.mock("@/components/stories/StoryFramePreview", () => ({ default: (p: any) => <div data-testid="frame">{p.title}</div> }));
vi.mock("@/components/ui/textarea-with-voice", () => ({ TextareaWithVoice: (p: any) => <textarea {...p} /> }));
vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children }: any) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: any) => <div>{children}</div>,
  CollapsibleContent: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => <button type="button" onClick={onClick}>{children}</button>,
}));

import { CalendarPostContent } from "@/components/calendar/CalendarPostContent";
import { requestOpenStory, storiesPhotosToTake, storiesPublicationMoment, takeOpenStoryIndex } from "@/lib/calendar-story-open";

const DETAIL = {
  type: "stories",
  publication_time: "soir",
  stories: [
    { text: "Point chantier", format_label: "📸 Photo avec texte", visual: { gabarit: "photo_pills", background: "photo", photo_directive: "Façade de l'immeuble" } },
    { text: "Fuite réglée", visual: { gabarit: "photo_pills", background: "photo", photo_url: "https://x/p.jpg" } },
    { text: "Moi", face_cam: true },
    { text: "Sondage", visual: { gabarit: "interaction", background: "color" } },
  ],
};

function renderContent(extra: Record<string, any> = {}) {
  const props: any = {
    editingPost: { id: "p1", story_sequence_detail: DETAIL }, theme: "Point chantier",
    contentDraft: "SÉQUENCE À PUBLIER À LA SUITE (soir)\n\nSTORY 1\nPoint chantier", setContentDraft: vi.fn(),
    accroche: null, setAccroche: vi.fn(), status: "draft_ready", setStatus: vi.fn(), isGenerating: false,
    onSmartGenerate: vi.fn(), onCopy: vi.fn(), onOpenAtelier: vi.fn(), onNavigateToDeepen: vi.fn(),
    postCanal: "instagram", format: "story_serie", angle: null, objectif: null, notes: "", mediaUrls: [],
    onSaveAndClose: vi.fn(), onOpenStoriesEditor: vi.fn(), ...extra,
  };
  render(<CalendarPostContent {...props} />);
  return props;
}

describe("fiche stories du calendrier", () => {
  afterEach(() => { takeOpenStoryIndex(); vi.useRealTimers(); });

  it("vignettes cliquables : chacune ouvre l'éditeur sur sa story", () => {
    const p = renderContent();
    expect(screen.getAllByTestId("frame")).toHaveLength(3);
    expect(screen.getByText("🎥 Face caméra")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Modifier la story 3" }));
    expect(p.onOpenStoriesEditor).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: /Modifier les stories/ }));
    expect(p.onOpenStoriesEditor).toHaveBeenLastCalledWith(undefined);
  });

  it("plus de texte modifiable : le texte est en lecture seule, copiable", () => {
    const p = renderContent();
    expect(document.querySelector("[contenteditable]")).toBeNull();
    expect(screen.queryByText("✍️ Contenu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Copier le texte/ }));
    expect(p.onCopy).toHaveBeenCalled();
  });

  it("à préparer + comment publier, et « Marquer comme publiées »", () => {
    const p = renderContent();
    expect(screen.getByText("Story 1 : Façade de l'immeuble")).toBeInTheDocument();
    expect(screen.getByText("Story 3 : te filmer face caméra")).toBeInTheDocument();
    expect(screen.queryByText(/Story 2 :/)).not.toBeInTheDocument();
    expect(screen.getByText(/poste-les à la suite, le soir\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Marquer comme publiées/ }));
    expect(p.setStatus).toHaveBeenCalledWith("published");
  });

  it("publiées : plus rien à préparer, badge « Publiées »", () => {
    renderContent({ status: "published" });
    expect(screen.getByText("Publiées")).toBeInTheDocument();
    expect(screen.queryByText(/À préparer/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Comment publier/)).not.toBeInTheDocument();
  });

  it("le contenu relu (storyDetail) prime sur celui du post", () => {
    renderContent({ storyDetail: { type: "stories", stories: [{ text: "Seule" }] } });
    expect(screen.getByText("📱 Ta story")).toBeInTheDocument();
  });

  it("un post qui n'est pas une série de stories garde le texte modifiable", () => {
    renderContent({ editingPost: { id: "p1", story_sequence_detail: { type: "reel" } }, format: "reel" });
    expect(screen.getByText("✍️ Contenu")).toBeInTheDocument();
    expect(document.querySelector("[contenteditable]")).not.toBeNull();
  });
});

describe("relais « ouvrir sur la story N »", () => {
  it("sert une fois (et au double appel du mode strict), puis s'oublie", () => {
    vi.useFakeTimers();
    requestOpenStory(3);
    expect(takeOpenStoryIndex()).toBe(3);
    expect(takeOpenStoryIndex()).toBe(3);
    vi.advanceTimersByTime(1_100);
    expect(takeOpenStoryIndex()).toBe(0);
  });

  it("périmé après 20 s, ignoré pour 0 ou un non-nombre", () => {
    vi.useFakeTimers();
    requestOpenStory(2);
    vi.advanceTimersByTime(21_000);
    expect(takeOpenStoryIndex()).toBe(0);
    requestOpenStory(0);
    expect(takeOpenStoryIndex()).toBe(0);
  });

  it("à préparer : fond photo sans photo, face caméra ; moment de publication", () => {
    expect(storiesPhotosToTake(DETAIL.stories).map((s) => s.number)).toEqual([1, 3]);
    expect(storiesPhotosToTake([{ text: "Sans plan" }])).toEqual([{ number: 1, directive: "une photo pour le fond" }]);
    expect(storiesPublicationMoment(DETAIL)).toBe("le soir");
    expect(storiesPublicationMoment({ stories: [{ timing: "Midi" }] })).toBe("à midi");
    expect(storiesPublicationMoment({ stories: [] })).toBeNull();
  });
});
