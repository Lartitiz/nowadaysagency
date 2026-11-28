// Loom du 28/11/2026 : après « Je te pose des questions », tout ce qu'elle a
// raconté doit se voir sous son idée, suivre en « Partir de photos », et ne pas
// être redemandé à l'étape Précisions.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import CreerStepIdea from "@/components/creer/CreerStepIdea";
import { storyContextForQuestions, type StoryAnswer, type TakenStory } from "@/features/creer/story/story-answers";

const ANSWERS: StoryAnswer[] = [
  { id: "scene", question: "Raconte-moi la dernière fois…", answer: "Une cliente facilitatrice parlait comme une directrice financière." },
  { id: "ressenti", question: "Qu'as-tu ressenti ?", answer: "De la fierté, je me sens hyper touchée." },
  { id: "declic", question: "Que veux-tu que tes lectrices retiennent ?", answer: "Les plus grandes transformations se font sur la stratégie de marque." },
];
const SUBJECT = "Elle parlait comme une directrice financière, pas comme elle";

vi.mock("@/components/creer/StoryQuestionsDialog", () => ({
  default: (p: any) => (p.open ? <button onClick={() => p.onKeep(SUBJECT, ANSWERS)}>Garder l'histoire</button> : null),
}));
vi.mock("@/components/dashboard/ContentCoachingDialog", () => ({ default: () => null }));
vi.mock("@/components/creer/CreerTransformTab", () => ({ default: () => null }));
vi.mock("@/components/creer/PhotoUploadZone", () => ({ PhotoUploadZone: () => null }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "workspace_id", value: null }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/app-breadcrumb", () => ({ useHideAppBreadcrumb: () => {} }));
vi.mock("@/lib/ideas-to-develop", () => ({ fetchIdeasToDevelop: () => Promise.resolve([]) }));

afterEach(cleanup);

function Harness() {
  const [idea, setIdea] = useState("");
  const [photoSubject, setPhotoSubject] = useState("Un ancien sujet de photos");
  const [photoEntry, setPhotoEntry] = useState(false);
  const [story, setStory] = useState<TakenStory | null>(null);
  return (
    <MemoryRouter>
      <CreerStepIdea
        onNext={() => {}} onCoachingSelect={() => {}} onPhotosNext={() => {}}
        initialIdea={idea} onIdeaChange={setIdea}
        initialPhotos={[]} onPhotosChange={() => {}}
        initialPhotoDescription="" onPhotoDescriptionChange={() => {}}
        initialPhotoSubject={photoSubject} onPhotoSubjectChange={setPhotoSubject}
        photoEntry={photoEntry} onPhotoEntryChange={setPhotoEntry}
        onStoryTaken={(subject, answers) => setStory({ subject, answers })}
        story={story} onStoryDrop={() => setStory(null)}
      />
    </MemoryRouter>
  );
}

describe("histoire gardée, visible sous l'idée", () => {
  it("montre toutes ses réponses, la suit en « Partir de photos », et peut être retirée", () => {
    render(<Harness />);
    expect(screen.queryByTestId("story-attached")).toBeNull();
    fireEvent.click(screen.getByText(/Je te pose des questions/));
    fireEvent.click(screen.getByText("Garder l'histoire"));

    const box = screen.getByTestId("story-attached");
    expect(box.textContent).toContain("3 réponses");
    for (const a of ANSWERS) expect(box.textContent).toContain(a.answer);

    // L'ancien sujet photo est remplacé : l'histoire reste attachée côté photos.
    fireEvent.click(screen.getByTestId("creer-start-photos"));
    expect((screen.getByLabelText(/De quoi veux-tu parler/) as HTMLTextAreaElement).value).toBe(SUBJECT);
    expect(screen.getByTestId("story-attached")).toBeTruthy();

    // Un autre sujet : l'histoire n'est plus montrée (elle ne partirait plus).
    fireEvent.change(screen.getByLabelText(/De quoi veux-tu parler/), { target: { value: "Mes nouveaux bijoux d'automne" } });
    expect(screen.queryByTestId("story-attached")).toBeNull();
  });

  it("« Ne pas l'utiliser » retire l'histoire", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText(/Je te pose des questions/));
    fireEvent.click(screen.getByText("Garder l'histoire"));
    fireEvent.click(screen.getByTestId("story-attached-drop"));
    expect(screen.queryByTestId("story-attached")).toBeNull();
  });
});

describe("Précisions : ne pas redemander l'histoire", () => {
  it("la consigne interdit les questions déjà répondues et autorise zéro question", () => {
    const ctx = storyContextForQuestions({ subject: SUBJECT, answers: ANSWERS });
    expect(ctx).toContain("ne pose AUCUNE question dont la réponse est déjà dans cette histoire");
    expect(ctx).toContain("ne pose aucune question");
    expect(ctx).toContain("stratégie de marque");
  });
});
