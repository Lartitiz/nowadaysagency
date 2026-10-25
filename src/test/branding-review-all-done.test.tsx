import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/* Relecture de marque : dès que toutes les cartes sont validées, la page est
   prévenue (onAllDone) pour enregistrer la fiche comme validée — sans attendre
   le bouton de la carte de fin (bug du 25/10/2026 : quitter par le menu laissait
   la fiche « à relire » et /creer bloqué). */

const m = vi.hoisted(() => {
  const from = vi.fn((table: string) => {
    let isWrite = false;
    const result = () => ({ data: isWrite ? [{ id: "saved" }] : [], error: null });
    const q: any = {
      select: () => q, eq: () => q, is: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      insert: () => { isWrite = true; return q; },
      update: () => { isWrite = true; return q; },
      then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
    };
    void table;
    return q;
  });
  return { from };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: m.from } }));
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

const ANALYSIS: AnalysisResult = {
  story: { confidence: "high", full_story: "Histoire" },
  persona: { confidence: "high", description: "Cible" },
  value_proposition: { confidence: "high", key_phrase: "Phrase" },
};

describe("BrandingReview — fiche validée dès que tout est validé", () => {
  it("« Je valide tout » prévient la page une fois, sans passer par la carte de fin", async () => {
    const onAllDone = vi.fn();
    const onDone = vi.fn();
    render(<BrandingReview analysis={ANALYSIS} onDone={onDone} onAllDone={onAllDone} />);
    expect(onAllDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByText("Je valide tout")[0]);
    await screen.findByText(/Fiche validée ! 🎉|à remplir plus tard/);
    await waitFor(() => expect(onAllDone).toHaveBeenCalledTimes(1));
    // La carte de fin reste le chemin de sortie : onDone n'est pas appelé à sa place.
    expect(onDone).not.toHaveBeenCalled();
    // Le bouton de la carte de fin fonctionne toujours, et ne redéclenche pas onAllDone.
    fireEvent.click(screen.getAllByText("Voir mon identité complète →")[0]);
    expect(onDone).toHaveBeenCalledWith(true);
    expect(onAllDone).toHaveBeenCalledTimes(1);
  });

  it("rien validé : la page n'est pas prévenue", () => {
    const onAllDone = vi.fn();
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} onAllDone={onAllDone} />);
    expect(onAllDone).not.toHaveBeenCalled();
  });
});
