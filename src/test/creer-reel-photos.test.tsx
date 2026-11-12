import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CreerStepFormat from "@/components/creer/CreerStepFormat";
import { ideaAsksForReel, ideaAsksForStory, recommendContentFormat } from "@/lib/format-recommendation";
import { photoCapForFormat } from "@/lib/format-photo-cap";
import { photosToVideoReferences, reelPhotosVideoDraft } from "@/lib/reel-photos-studio";

// Parcours « Reel à partir de photos » (passe qualité du 12/11/2026, compte d'une
// marchande de biens avec ses photos avant / après de travaux).
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u-1" } }) }));
vi.mock("@/hooks/use-library-photo-count", () => ({ useLibraryPhotoCount: () => 0 }));
const plan = vi.hoisted(() => ({ value: "free" }));
const mocks = vi.hoisted(() => ({ upload: vi.fn(), panel: vi.fn() }));
vi.mock("@/hooks/use-user-plan", () => ({ useUserPlan: () => ({ plan: plan.value }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "workspace_id", value: "test" }), useWorkspaceId: () => "ws-1" }));
vi.mock("@/lib/photo-storage", () => ({ uploadPhotoOriginal: (...a: any[]) => mocks.upload(...a) }));
vi.mock("@/features/studio-video/StudioVideoPanel", () => ({ StudioVideoPanel: (p: any) => { mocks.panel(p); return <div data-testid="studio-panel">{p.initialDraft.prompt}</div>; } }));
vi.mock("@/components/creer/PhotoUploadZone", () => ({
  PhotoUploadZone: (p: any) => <div data-testid="photo-zone">{p.initialPhotos?.length ?? 0} photo(s), max {p.maxPhotos}</div>,
}));
vi.mock("@/components/ui/input-with-voice", () => ({ InputWithVoice: (props: any) => <input {...props} /> }));

const photos = [
  { id: "avant", base64: "data:image/jpeg;base64,AAA", name: "avant.jpg" },
  { id: "apres", base64: "data:image/jpeg;base64,BBB", name: "apres.jpg" },
] as any[];
const base = { idea: "Je veux un reel avant / après de mon chantier", onBack: vi.fn() };

describe("recommandation de format", () => {
  it("suit « reel » écrit dans l'idée, même avec plusieurs photos", () => {
    expect(recommendContentFormat("instagram", 2, "Je veux un reel avant/après").format).toBe("reel");
    expect(recommendContentFormat("instagram", 0, "Mes Reels de la semaine").format).toBe("reel");
    expect(recommendContentFormat("instagram", 2, "Mon chantier avant/après")).toMatchObject({ format: "carousel", mode: "photo" });
  });
  it("ne confond pas « reel » avec d'autres mots, et laisse LinkedIn au carrousel (PR #1843)", () => {
    expect(ideaAsksForReel("Un vrai réel changement")).toBe(false);
    expect(ideaAsksForReel("La différence est reelle")).toBe(false);
    expect(ideaAsksForReel("reel")).toBe(true);
    expect(recommendContentFormat("linkedin", 4, "Je veux un reel")).toMatchObject({ format: "carousel", mode: "photo" });
  });
  it("suit « story » écrit dans l'idée, sans confondre avec « storytelling » ni « histoire »", () => {
    expect(recommendContentFormat("instagram", 3, "Mes stories du chantier").format).toBe("story");
    expect(recommendContentFormat("instagram", 0, "une story sur mon atelier").format).toBe("story");
    expect(ideaAsksForStory("Le storytelling de ma marque")).toBe(false);
    expect(ideaAsksForStory("Story")).toBe(true);
    expect(recommendContentFormat("linkedin", 3, "mes stories")).toMatchObject({ format: "carousel" });
  });
  it("garde jusqu'à 10 photos pour Reel, Story et LinkedIn", () => {
    expect(photoCapForFormat("reel")).toBe(10);
    expect(photoCapForFormat("story")).toBe(10);
    expect(photoCapForFormat("linkedin")).toBe(10);
    expect(photoCapForFormat("post")).toBe(1);
  });
});

describe("écran Format avec 2 photos", () => {
  it("propose Carrousel et Reel, conseille Reel quand elle l'a demandé", () => {
    render(<CreerStepFormat {...base} onNext={vi.fn()} forcedChannel="instagram" initialPhotos={photos} />);
    expect(screen.getByTestId("creer-format-carousel")).toBeInTheDocument();
    expect(screen.getByTestId("creer-format-reel")).toBeInTheDocument();
    // Les stories utilisent les photos (une par story) : proposées aussi.
    expect(screen.getByTestId("creer-format-story")).toBeInTheDocument();
    expect(screen.queryByTestId("creer-format-post")).not.toBeInTheDocument();
    expect(screen.queryByText(/forcément sur un carrousel/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Suivant : Reel/ })).toBeInTheDocument();
  });

  it("garde les 2 photos en Reel, dit ce qu'elle obtiendra et renvoie au Studio vidéo", () => {
    const onNext = vi.fn();
    render(<CreerStepFormat {...base} onNext={onNext} forcedChannel="instagram" initialPhotos={photos} />);
    fireEvent.click(screen.getByTestId("creer-format-reel"));
    expect(screen.getByTestId("photo-zone")).toHaveTextContent("2 photo(s), max 10");
    const note = screen.getByTestId("reel-from-photos-note");
    expect(note).toHaveTextContent("un script et un plan de tournage inspirés de tes photos, pas une vidéo toute faite");
    expect(note).toHaveTextContent("avec Premium");
    expect(screen.getByTestId("reel-before-after-hint")).toHaveTextContent("la 1ʳᵉ est lue comme l'avant et la 2ᵉ comme l'après");
    fireEvent.click(screen.getByRole("button", { name: /Suivant/ }));
    const [format, , , sentPhotos, , photoMode] = onNext.mock.calls.at(-1)!;
    expect(format).toBe("reel");
    expect(photoMode).toBe(true);
    expect(sentPhotos).toHaveLength(2);
  });

  it("n'affiche pas l'encart Studio vidéo sans photo", () => {
    render(<CreerStepFormat {...base} onNext={vi.fn()} forcedChannel="instagram" initialFormat="reel" />);
    expect(screen.queryByTestId("reel-from-photos-note")).not.toBeInTheDocument();
  });
});

describe("format présélectionné par une idée", () => {
  it("affiche le format choisi et permet d'en changer en gardant les photos", () => {
    const onNext = vi.fn();
    render(<CreerStepFormat {...base} onNext={onNext} initialChannel="instagram" initialFormat="reel" initialPhotos={photos} />);
    expect(screen.getByTestId("creer-channel-format-chip")).toHaveTextContent("Format : Reel");
    fireEvent.click(screen.getByRole("button", { name: /Changer de format/ }));
    expect(screen.getByText("Quel format Instagram ?")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("creer-format-carousel"));
    expect(screen.getByTestId("creer-channel-format-chip")).toHaveTextContent("Format : Carrousel");
    fireEvent.click(screen.getByRole("button", { name: /Suivant/ }));
    const [format, , subMode, sentPhotos] = onNext.mock.calls.at(-1)!;
    expect(format).toBe("carousel");
    expect(subMode).toBe("photo");
    expect(sentPhotos).toHaveLength(2);
  });

  it("ne montre pas de format à changer pour la newsletter", () => {
    render(<CreerStepFormat {...base} onNext={vi.fn()} forcedChannel="newsletter" />);
    expect(screen.queryByRole("button", { name: /Changer de format/ })).not.toBeInTheDocument();
  });
});

describe("animer ses photos depuis /creer (Studio vidéo)", () => {
  it("range dans « Mes photos » seulement celles qui n'y sont pas, une seule fois, 4 au plus", async () => {
    const upload = vi.fn(async (_f: File, name: string) => `new-${name}`);
    const known = new Map<number, string>();
    const list = [{ name: "a", userPhotoId: "lib-a" }, { name: "b", base64: "data:image/jpeg;base64,AAA" }, { name: "c", base64: "data:image/jpeg;base64,AAA" }, { name: "d", base64: "data:image/jpeg;base64,AAA" }, { name: "e", base64: "data:image/jpeg;base64,AAA" }] as any[];
    const refs = await photosToVideoReferences(list, upload, known);
    expect(refs.map((r) => r.id)).toEqual(["lib-a", "new-b", "new-c", "new-d"]);
    expect(refs.every((r) => r.kind === "photo" && r.role === "subject")).toBe(true);
    await photosToVideoReferences(list, upload, known);
    expect(upload).toHaveBeenCalledTimes(3);
    expect(reelPhotosVideoDraft(refs.slice(0, 2))).toMatchObject({ useImages: true, aspectRatio: "9:16", prompt: expect.stringContaining("Avant / après") });
  });

  it("ouvre le Studio vidéo avec les 2 photos déjà posées", async () => {
    plan.value = "outil";
    mocks.upload.mockImplementation(async ({ name }: any) => ({ photoId: `id-${name}` }));
    render(<CreerStepFormat {...base} onNext={vi.fn()} forcedChannel="instagram" initialPhotos={photos} />);
    fireEvent.click(screen.getByTestId("creer-format-reel"));
    expect(screen.getByTestId("reel-from-photos-note")).not.toHaveTextContent("avec Premium");
    fireEvent.click(screen.getByRole("button", { name: "Animer mes photos" }));
    expect(screen.getByText("Avant")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Préparer mon clip" }));
    await waitFor(() => expect(screen.getByTestId("studio-panel")).toBeInTheDocument());
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-1", workspaceId: "ws-1", purpose: "library" }));
    const draft = mocks.panel.mock.calls.at(-1)![0].initialDraft;
    expect(draft.images.map((i: any) => i.id)).toEqual(["id-avant.jpg", "id-apres.jpg"]);
    plan.value = "free";
  });

  it("en gratuit, dit que la vidéo est dans Premium sans rien envoyer", () => {
    mocks.upload.mockClear();
    render(<CreerStepFormat {...base} onNext={vi.fn()} forcedChannel="instagram" initialPhotos={photos} />);
    fireEvent.click(screen.getByTestId("creer-format-reel"));
    fireEvent.click(screen.getByRole("button", { name: "Animer mes photos" }));
    expect(screen.getByTestId("reel-studio-premium")).toHaveTextContent("comprise dans Premium");
    expect(screen.getByRole("link", { name: "Passer à Premium" })).toHaveAttribute("href", "/pricing");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
