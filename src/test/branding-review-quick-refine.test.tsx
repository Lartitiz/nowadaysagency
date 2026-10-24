import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/* « On affine ensemble » en une passe pendant l'onboarding (23/10/2026) :
   questions fixes sur un écran, un seul appel à branding-quick-refine, carte
   proposée puis enregistrée avec les écritures habituelles. Hors onboarding,
   la conversation reste. */

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: invoke }));
const m = vi.hoisted(() => {
  const writes: { table: string; op: string }[] = [];
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
  const from = vi.fn((table: string) => {
    let isWrite = false;
    const result = () => ({ data: isWrite ? [{ id: "saved" }] : [], error: null });
    const q: any = {
      select: () => q, eq: () => q, is: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      insert: () => { isWrite = true; writes.push({ table, op: "insert" }); return q; },
      update: () => { isWrite = true; writes.push({ table, op: "update" }); return q; },
      then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
    };
    return q;
  });
  return { writes, toast, from };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: m.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "u1" }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/lib/posthog-lazy", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/components/Confetti", () => ({ default: () => null }));
// Faux coaching : un bouton qui termine l'affinage comme le vrai (onComplete).
vi.mock("@/components/branding/BrandingCoachingFlow", () => ({
  default: ({ section, onComplete }: { section: string; onComplete: () => void }) => (
    <button onClick={onComplete}>Terminer le coaching {section}</button>
  ),
}));
vi.mock("@/components/branding/BrandLogoSuggestion", () => ({ BrandLogoSuggestion: () => null }));
vi.mock("@/components/photos/BrandPhotosPicker", () => ({ BrandPhotosPicker: () => null }));
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: () => ({ children }: any) => <div>{children}</div> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import BrandingReview, { type AnalysisResult } from "@/components/branding/BrandingReview";

const ANALYSIS: AnalysisResult = {
  story: { confidence: "medium", full_story: "Ancienne histoire" },
  persona: { confidence: "high", description: "Cible" },
  value_proposition: { confidence: "high", key_phrase: "Phrase" },
};

const currentCard = () => screen.getByText(/^Carte \d sur 7$/).textContent;

beforeEach(() => {
  m.writes.length = 0;
  invoke.mockReset();
  vi.clearAllMocks();
});

describe("BrandingReview — « On affine ensemble » en une passe (onboarding)", () => {
  it("3 questions, un seul appel à l'IA, la carte proposée puis enregistrée", async () => {
    invoke.mockResolvedValue({ data: { section_data: { full_story: "Tout a commencé avec un savon." } }, error: null });
    render(<BrandingReview analysis={ANALYSIS} mandatory onDone={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Je corrige/ }));
    expect(screen.getByLabelText("Qu'est-ce qui t'a donné envie de te lancer ?")).toBeInTheDocument();
    expect(screen.getByLabelText("Où tu veux emmener ton activité ?")).toBeInTheDocument();
    expect(screen.queryByText(/^Carte \d sur 7$/)).toBeNull();
    const reecrire = screen.getByText("Réécrire ma carte").closest("button")!;
    expect(reecrire).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Qu'est-ce qui t'a donné envie de te lancer ?"), { target: { value: "La peau de ma fille." } });
    fireEvent.click(reecrire);
    await screen.findByText("Tout a commencé avec un savon.");
    expect(invoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = invoke.mock.calls[0];
    expect(fn).toBe("branding-quick-refine");
    expect(opts.body.section).toBe("story");
    expect(opts.body.answers[0]).toEqual({ question: "Qu'est-ce qui t'a donné envie de te lancer ?", answer: "La peau de ma fille." });
    expect(opts.body.context.persona).toEqual({ description: "Cible" });

    fireEvent.click(screen.getByText("Enregistrer cette version"));
    await screen.findByText("1/7 validées");
    expect(m.writes.some(w => w.table === "storytelling")).toBe(true);
    expect(currentCard()).toBe("Carte 2 sur 7");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("« Revenir à mes cartes » ne coûte rien et revient sur la même carte", () => {
    render(<BrandingReview analysis={ANALYSIS} mandatory onDone={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Je corrige/ }));
    fireEvent.click(screen.getByText("Revenir à mes cartes"));
    expect(currentCard()).toBe("Carte 1 sur 7");
    expect(invoke).not.toHaveBeenCalled();
    expect(m.writes).toHaveLength(0);
  });

  it("une erreur de l'IA s'affiche et garde les réponses", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "Le service est momentanément indisponible. Réessaie dans quelques instants.", code: "NETWORK" } });
    render(<BrandingReview analysis={ANALYSIS} mandatory onDone={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Je corrige/ }));
    fireEvent.change(screen.getByLabelText("Un moment difficile ou un déclic dont tu te souviens ?"), { target: { value: "Un marché raté." } });
    fireEvent.click(screen.getByText("Réécrire ma carte"));
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Un moment difficile ou un déclic dont tu te souviens ?") as HTMLTextAreaElement).value).toBe("Un marché raté.");
    expect(m.writes).toHaveLength(0);
  });

  it("en onboarding, la proposition de valeur s'affine aussi en une passe", () => {
    render(<BrandingReview analysis={ANALYSIS} mandatory onDone={() => {}} />);
    fireEvent.click(screen.getByLabelText("Aller à « Ta proposition de valeur »"));
    fireEvent.click(screen.getByRole("button", { name: /Je corrige/ }));
    expect(screen.getByLabelText("Quel problème tu règles pour elle ?")).toBeInTheDocument();
  });

  it("hors onboarding, « On affine ensemble » garde la conversation", () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Je corrige/ }));
    expect(screen.getByText("Terminer le coaching story")).toBeInTheDocument();
    expect(screen.queryByText("Réécrire ma carte")).toBeNull();
  });

  // Partie déjà remplie, rien de neuf : « Garder tel quel » ou « Je corrige »
  // (2 boutons au plus depuis le 24/10/2026), qui ouvre la conversation.
  it("une partie déjà remplie avant garde la conversation, même en onboarding", () => {
    render(<BrandingReview analysis={{ ...ANALYSIS, story: { confidence: "medium" } }} preFilledSections={new Set(["story"])} mandatory onDone={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Je corrige/ }));
    expect(screen.getByText("Terminer le coaching story")).toBeInTheDocument();
  });
});
