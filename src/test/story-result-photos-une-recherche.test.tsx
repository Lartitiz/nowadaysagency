// Fonds photo des stories (12/11/2026) : chaque story à fond photo cherche sa
// photo UNE fois, en parallèle des autres. Avant, chaque photo posée relançait
// les recherches encore en attente (délais en escalier, appels gâchés) et la
// 6e story recevait sa photo ~11 s après le résultat.
// La bibliothèque reste « en chargement » (data undefined) : avant le 12/11 au
// soir, ce cas faisait tourner StoryResult en boucle de rendus.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import StoryResult from "@/components/creer/formatRenderers/StoryResult";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("@/hooks/use-branding", () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock("@/hooks/use-user-photos", () => ({ useUserPhotos: () => ({ data: undefined }) }));
vi.mock("@/hooks/use-open-in-canva", () => ({ useOpenInCanva: () => ({ openInCanva: vi.fn(), openingCanva: false }) }));
vi.mock("@/lib/story-photos", () => ({
  resolveLibraryPhotoUrls: async () => new Map(),
  urlToDataUrl: async (url: string) => url,
  fileToResizedDataUrl: async () => "data:image/jpeg;base64,xx",
}));
vi.mock("@/lib/photo-storage", () => ({ getSignedPhotoUrls: async () => new Map(), uploadPhotoOriginal: vi.fn() }));
vi.mock("@/lib/export-carousel-png", () => ({ exportStoryPng: vi.fn() }));
vi.mock("@/lib/export-story-pptx", () => ({ exportStoryPptx: vi.fn() }));
vi.mock("@/components/RedFlagsChecker", () => ({ default: () => null }));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({ PhotoLibraryPickerDialog: () => null }));
vi.mock("@/lib/stock-photos", () => ({ searchStockPhotos: mocks.search }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invoke }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "workspace-1" }));
vi.mock("@/hooks/use-photo-wishlist", () => ({ usePhotoWishlistMutations: () => ({ addDirective: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.search.mockReset();
  mocks.invoke.mockReset();
});

const photoFor = (q: string, n: number) => ({
  id: `${q}-${n}`,
  url: `https://images.example/${encodeURIComponent(q)}-${n}.jpg`,
  thumbnail: `https://images.example/${encodeURIComponent(q)}-${n}-s.jpg`,
  alt: "",
  photographer: "Alice",
  source_url: "https://example.com/p",
});

const photoStory = (i: number, extra: Record<string, unknown> = {}) => ({
  text: `Story ${i + 1}`,
  face_cam: false,
  format: "photo",
  visual: {
    background: "photo",
    gabarit: "photo_pills",
    photo_directive: `consigne ${i + 1}`,
    photo_query_en: `query ${i + 1}`,
    ...extra,
  },
});

// Parent qui renvoie la séquence modifiée par la prop, comme /creer (CreerUnifie).
function Parent({ initial, onUpdate }: { initial: any[]; onUpdate?: (s: any[]) => void }) {
  const [result, setResult] = useState({ stories: initial });
  return (
    <StoryResult
      result={result}
      onStoriesUpdate={(stories) => {
        onUpdate?.(stories);
        setResult((prev) => ({ ...prev, stories }));
      }}
    />
  );
}

// Attente HORS d'un act() unique : React doit rendre entre deux réponses, sinon
// la recréation des cartes (le défaut d'avant) n'a lieu qu'à la toute fin.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Stories : fonds photo cherchés une seule fois", () => {
  it("6 stories : une recherche par story, toutes les photos posées en quelques secondes", async () => {
    const starts: number[] = [];
    const t0 = Date.now();
    mocks.search.mockImplementation(async (q: string) => {
      starts.push(Date.now() - t0);
      await new Promise((r) => setTimeout(r, 500));
      return [photoFor(q, 1), photoFor(q, 2)];
    });
    mocks.invoke.mockImplementation(async (_fn: string, opts: any) => {
      await new Promise((r) => setTimeout(r, 1000));
      return { data: { ranked_ids: [opts.body.candidates[1].id] }, error: null };
    });
    let last: any[] = [];
    render(<Parent initial={Array.from({ length: 6 }, (_, i) => photoStory(i))} onUpdate={(s) => { last = s; }} />);

    await waitFor(() => expect(last.filter((s) => s.visual.photo_url)).toHaveLength(6), { timeout: 20_000 });
    await sleep(1500); // une recherche relancée en retard aurait le temps de partir

    expect(mocks.search).toHaveBeenCalledTimes(6);
    expect(mocks.invoke).toHaveBeenCalledTimes(6);
    expect(new Set(mocks.search.mock.calls.map((c) => c[0])).size).toBe(6);
    // Départs à peine décalés (250 ms × numéro), pas en escalier.
    expect(Math.max(...starts)).toBeLessThan(2500);
    expect(last).toHaveLength(6);
    last.forEach((s, i) => {
      expect(s.visual.photo_url).toBe(photoFor(`query ${i + 1}`, 2).url);
    });
  });

  it("ne remplace jamais une photo de la bibliothèque ni une photo déjà choisie", async () => {
    mocks.search.mockImplementation(async (q: string) => [photoFor(q, 1), photoFor(q, 2)]);
    mocks.invoke.mockResolvedValue({ data: { ranked_ids: [] }, error: null });
    let last: any[] = [];
    render(
      <Parent
        initial={[
          photoStory(0, { photo_id: "lib-1" }),
          photoStory(1, { photo_url: "https://moi.example/choisie.jpg" }),
          photoStory(2),
        ]}
        onUpdate={(s) => { last = s; }}
      />,
    );
    await waitFor(() => expect(last[2]?.visual.photo_url).toBeTruthy(), { timeout: 10_000 });
    await sleep(1500);

    // Seule la story vide cherche d'office.
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect(last[0].visual.photo_id).toBe("lib-1");
    expect(last[0].visual.photo_url ?? null).toBeNull();
    expect(last[1].visual.photo_url).toBe("https://moi.example/choisie.jpg");
    expect(last[2].visual.photo_url).toBe(photoFor("query 3", 1).url);
  });
});
