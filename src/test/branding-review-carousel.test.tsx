import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/* La fiche de marque est passée en cartes (une section à l'écran) avec un
   raccourci « Je valide tout ». Deux garde-fous testés ici :
   - une seule carte visible à la fois (sinon on retombe sur la longue page) ;
   - « Je valide tout » ne dit JAMAIS « ta marque est prête » quand une des 7
     écritures a échoué. supabase-js ne lève pas d'exception : il renvoie
     { error }. Sans le garde, l'écran de succès s'affichait sur une fiche
     partiellement enregistrée — le « vert menteur » qu'on traque.

   Depuis PR #735, « Je valide tout » est dupliqué à l'écran : une fois à
   côté du titre (repéré en QA comme trop peu visible en bas de page), une
   fois dans la barre sticky du bas. Même handler, même libellé — donc
   getAllByText(...)[0] volontairement ici, pas un getByText qui casserait. */

const mocks = vi.hoisted(() => {
  const writes: { table: string; op: string }[] = [];
  const failTables = new Set<string>();
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), loading: vi.fn() };
  const from = vi.fn((table: string) => {
    const result = () => ({ data: null, error: failTables.has(table) ? { message: "boom" } : null });
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => result(),
      single: async () => result(),
      insert: (_payload: any) => { writes.push({ table, op: "insert" }); return builder; },
      update: (_payload: any) => { writes.push({ table, op: "update" }); return builder; },
      upsert: (_payload: any) => { writes.push({ table, op: "upsert" }); return builder; },
      then: (res: any) => Promise.resolve(result()).then(res),
    };
    return builder;
  });
  return { writes, failTables, toast, from };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "u1" }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/posthog", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/components/Confetti", () => ({ default: () => <div data-testid="confetti" /> }));
vi.mock("@/components/branding/BrandingCoachingFlow", () => ({ default: () => <div data-testid="coaching" /> }));
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: () => (props: any) => <div {...props} /> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import BrandingReview, { type AnalysisResult } from "@/components/branding/BrandingReview";

const ANALYSIS: AnalysisResult = {
  story: { confidence: "high", full_story: "Camille fabrique ses savons à froid." },
  persona: { confidence: "high", description: "Jeunes mamans sensibles aux étiquettes." },
  value_proposition: { confidence: "high", key_phrase: "Six ingrédients, zéro traduction." },
  tone_style: { confidence: "medium", voice_description: "Directe et chaleureuse.", tone_keywords: ["franche"] },
  content_strategy: { confidence: "medium", pillars: ["Coulisses", "Décryptage"] },
  offers: { confidence: "medium", offers: [{ name: "Savon signature", price: "12 €" }] },
  charter: { confidence: "low", color_primary: "#E8D5C4" },
  sources_used: ["website"],
  overall_confidence: "medium",
};

describe("BrandingReview — fiche en cartes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writes.length = 0;
    mocks.failTables.clear();
  });

  it("n'affiche qu'une carte à la fois et avance avec « Suivant »", () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);

    expect(screen.getByText("Ton histoire")).toBeTruthy();
    expect(screen.queryByText("Tes offres")).toBeNull();
    expect(screen.getByText("Carte 1 sur 7")).toBeTruthy();

    fireEvent.click(screen.getByText("Suivant"));
    expect(screen.getByText("Ton·ta client·e idéal·e")).toBeTruthy();
    expect(screen.queryByText("Ton histoire")).toBeNull();
  });

  it("« Je valide tout » enregistre les 7 sections et annonce la marque prête", async () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);

    // Deux raccourcis identiques à l'écran (header + barre sticky) : on clique le premier.
    fireEvent.click(screen.getAllByText("Je valide tout")[0]);

    await waitFor(() => expect(screen.getByText("Ta marque est prête")).toBeTruthy());
    expect(mocks.toast.success).toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
    // Les 7 sections vivent dans des tables différentes : toutes doivent être écrites.
    const tables = new Set(mocks.writes.map((w) => w.table));
    for (const t of ["storytelling", "persona", "brand_proposition", "brand_profile", "brand_strategy", "offers", "brand_charter"]) {
      expect(tables.has(t)).toBe(true);
    }
    expect(screen.getByText("Fiche validée ! 🎉")).toBeTruthy();
  });

  it("une écriture qui échoue n'affiche PAS l'écran de succès et ramène la carte fautive", async () => {
    mocks.failTables.add("brand_charter");
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);

    fireEvent.click(screen.getAllByText("Je valide tout")[0]);

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(screen.queryByText("Ta marque est prête")).toBeNull();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    // On revient sur la carte qui n'a pas pu être enregistrée.
    expect(screen.getByText("Ta charte graphique")).toBeTruthy();
    expect(screen.getByText("6/7 validées")).toBeTruthy();
  });
});
