import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/* Cartes courtes de la relecture (chantier 5, 24/10/2026) : l'essentiel en
   3 à 5 lignes, « Voir le détail » pour le reste. On replie l'affichage
   seulement : « C'est juste » et « Je valide tout » enregistrent la section
   entière, détail compris. */

const m = vi.hoisted(() => {
  const saved: Record<string, unknown> = {};
  const save = (key: string) => vi.fn(async (data: unknown) => { saved[key] = data; });
  const SAVE_FNS = {
    story: save("story"), persona: save("persona"), value_proposition: save("value_proposition"), tone_style: save("tone_style"),
    content_strategy: save("content_strategy"), offers: save("offers"), charter: save("charter"),
  };
  return { saved, SAVE_FNS };
});

vi.mock("@/lib/branding-review-save", () => ({
  SAVE_FNS: m.SAVE_FNS,
  QUERY_KEYS: new Proxy({}, { get: () => [] }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "u1" }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/posthog-lazy", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/components/Confetti", () => ({ default: () => null }));
vi.mock("@/components/branding/BrandingCoachingFlow", () => ({ default: () => null }));
vi.mock("@/components/branding/BrandLogoSuggestion", () => ({ BrandLogoSuggestion: () => null }));
vi.mock("@/components/photos/BrandPhotosPicker", () => ({ BrandPhotosPicker: () => null }));
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: () => ({ children }: any) => <div>{children}</div> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import BrandingReview, { type AnalysisResult } from "@/components/branding/BrandingReview";

const TONE: NonNullable<AnalysisResult["tone_style"]> = {
  confidence: "medium",
  voice_description: "Directe et chaleureuse",
  tone_keywords: ["joyeux", "direct", "engagé", "doux"],
  i_do: ["Tutoyer"],
  i_never_do: ["Culpabiliser"],
  fights: ["Le marketing agressif"],
};
const ANALYSIS: AnalysisResult = {
  story: { confidence: "medium", full_story: "Histoire" },
  persona: { confidence: "medium", description: "Cible", frustrations: ["a", "b", "c", "d"], goals: ["Vendre"] },
  value_proposition: { confidence: "medium", key_phrase: "Phrase clé", problem: "Le problème" },
  tone_style: TONE,
  content_strategy: { confidence: "medium", pillars: ["P1", "P2"] },
};

const goTo = (titre: RegExp) => fireEvent.click(screen.getByRole("button", { name: titre }));

beforeEach(() => {
  for (const k of Object.keys(m.saved)) delete m.saved[k];
  vi.clearAllMocks();
});

describe("BrandingReview — cartes courtes", () => {
  it("Ton & style : la phrase et 3 mots, le reste derrière « Voir le détail »", () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);
    goTo(/Aller à « Ton & style »/);
    expect(screen.getByText("Directe et chaleureuse")).toBeInTheDocument();
    expect(screen.getByText("engagé")).toBeInTheDocument();
    expect(screen.queryByText("doux")).toBeNull();
    expect(screen.queryByText(/Culpabiliser/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Voir le détail/ }));
    expect(screen.getByText("doux")).toBeInTheDocument();
    expect(screen.getByText(/Culpabiliser/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Replier/ }));
    expect(screen.queryByText(/Culpabiliser/)).toBeNull();
  });

  it("« C'est juste » sur une carte repliée enregistre toute la section", async () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);
    goTo(/Aller à « Ton & style »/);
    fireEvent.click(screen.getByRole("button", { name: /C'est juste/ }));
    await waitFor(() => expect(m.saved.tone_style).toEqual(TONE));
  });

  it("« Je valide tout » enregistre aussi ce qui est replié", async () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);
    fireEvent.click(screen.getByText("Je valide tout"));
    await waitFor(() => expect(m.saved.persona).toEqual(ANALYSIS.persona));
    expect(m.saved.tone_style).toEqual(TONE);
    expect(m.saved.value_proposition).toEqual(ANALYSIS.value_proposition);
  });

  it("une carte sans rien de plus à montrer n'a pas de « Voir le détail »", () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);
    expect(screen.getByText("Histoire")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Voir le détail/ })).toBeNull();
  });

  it("Ta cible : la description et 3 frustrations au plus", () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);
    goTo(/Aller à « Ton·ta client·e idéal·e »/);
    expect(screen.getByText("• c")).toBeInTheDocument();
    expect(screen.queryByText("• d")).toBeNull();
    expect(screen.queryByText("Vendre")).toBeNull();
  });
});
