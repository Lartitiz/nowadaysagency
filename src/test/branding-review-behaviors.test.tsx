import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/* Relecture de marque : comportements de l'écran jamais testés avant la fiche 14
   de docs/robustesse/gros-fichiers.md (lot T, 15/10/2026). « Garder tel quel »,
   « À revoir » rappelé en fin, clavier, swipe, coaching (pas de 2e écriture
   après « On affine ensemble »), bio Instagram, et ce que le fichier exporte
   (les découpages suivants doivent garder ces exports). */

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

import * as BrandingReviewModule from "@/components/branding/BrandingReview";
import BrandingReview, { type AnalysisResult } from "@/components/branding/BrandingReview";

const ANALYSIS: AnalysisResult = {
  story: { confidence: "high", full_story: "Histoire" },
  persona: { confidence: "high", description: "Cible" },
  value_proposition: { confidence: "high", key_phrase: "Phrase" },
};

const currentCard = () => screen.getByText(/^Carte \d sur 7$/).textContent;

beforeEach(() => {
  m.writes.length = 0;
  vi.clearAllMocks();
});

describe("BrandingReview — réponses carte par carte", () => {
  it("« Garder tel quel » valide une section déjà commencée sans rien écrire", async () => {
    const progress = vi.fn().mockResolvedValue(undefined);
    render(<BrandingReview analysis={ANALYSIS} preFilledSections={new Set(["story"])} onProgress={progress} onDone={() => {}} />);
    expect(screen.getByText("Déjà complété")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Garder tel quel"));

    await screen.findByText("1/7 validées");
    expect(progress).toHaveBeenCalledWith(["story"]);
    expect(m.writes).toEqual([]);
    expect(currentCard()).toBe("Carte 2 sur 7");
  });

  it("« À revoir » passe à la carte suivante et la section est rappelée sur la carte de fin", () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);
    fireEvent.click(screen.getByText("À revoir"));
    expect(currentCard()).toBe("Carte 2 sur 7");

    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByText("Suivant"));

    expect(screen.getByText("Il reste des cartes sans réponse")).toBeInTheDocument();
    const rappel = screen.getByRole("button", { name: /Ton histoire/ });
    expect(rappel).toHaveTextContent("à revoir");
    expect(screen.getByRole("button", { name: /Ta proposition de valeur/ })).not.toHaveTextContent("à revoir");
    expect(m.writes).toEqual([]);
  });

  it("« Finir plus tard » existe hors onboarding et disparaît en onboarding", () => {
    const { unmount } = render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);
    expect(screen.getByText("Finir plus tard")).toBeInTheDocument();
    unmount();
    render(<BrandingReview analysis={ANALYSIS} mandatory onDone={() => {}} />);
    expect(screen.queryByText("Finir plus tard")).toBeNull();
  });
});

describe("BrandingReview — navigation", () => {
  it("flèches du clavier : droite = carte suivante, gauche = précédente", () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(currentCard()).toBe("Carte 2 sur 7");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(currentCard()).toBe("Carte 1 sur 7");
  });

  it("flèches ignorées quand on écrit dans un champ", () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);
    const champ = document.createElement("input");
    document.body.appendChild(champ);
    fireEvent.keyDown(champ, { key: "ArrowRight" });
    expect(currentCard()).toBe("Carte 1 sur 7");
    champ.remove();
  });

  it("swipe : moins de 60 px ne change pas de carte, au-delà oui (gauche = suivante, droite = précédente)", () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);
    const swipe = (from: number, to: number) => {
      const titre = screen.getByRole("heading", { level: 2 });
      fireEvent.touchStart(titre, { touches: [{ clientX: from }] });
      fireEvent.touchEnd(titre, { changedTouches: [{ clientX: to }] });
    };
    swipe(200, 150);
    expect(currentCard()).toBe("Carte 1 sur 7");
    swipe(200, 100);
    expect(currentCard()).toBe("Carte 2 sur 7");
    swipe(100, 200);
    expect(currentCard()).toBe("Carte 1 sur 7");
  });
});

describe("BrandingReview — coaching dans la relecture", () => {
  it("à la fin du coaching, la section est validée et marquée « Affiné », sans être réécrite ensuite", async () => {
    const progress = vi.fn().mockResolvedValue(undefined);
    render(<BrandingReview analysis={ANALYSIS} onProgress={progress} onDone={() => {}} />);
    fireEvent.click(screen.getByText("On affine ensemble →"));
    // Pendant le coaching, la carte et les flèches sont coupées.
    expect(screen.queryByText(/^Carte \d sur 7$/)).toBeNull();
    fireEvent.keyDown(window, { key: "ArrowRight" });

    fireEvent.click(screen.getByText("Terminer le coaching story"));

    await screen.findByText("1/7 validées");
    expect(m.toast.success).toHaveBeenCalledWith("Section affinée et sauvegardée ✓");
    expect(progress).toHaveBeenLastCalledWith(["story"]);
    expect(currentCard()).toBe("Carte 2 sur 7");

    fireEvent.click(screen.getByText("Précédent"));
    expect(screen.getByText("Affiné")).toBeInTheDocument();
    expect(screen.getByText("✅ Cette carte est enregistrée.")).toBeInTheDocument();

    // « Je valide tout » écrit les autres sections, jamais l'histoire déjà affinée.
    fireEvent.click(screen.getAllByText("Je valide tout")[0]);
    await screen.findByText(/Fiche validée ! 🎉|à remplir plus tard/);
    const tables = new Set(m.writes.map(w => w.table));
    expect(tables.has("storytelling")).toBe(false);
    expect(tables.has("persona")).toBe(true);
    expect(tables.has("brand_proposition")).toBe(true);
  });
});

describe("BrandingReview — reprise d'onboarding qui remplace la fiche", () => {
  const RAPPEL = /relis tes offres, ton ton et ta stratégie/;

  it("fiche remplacée : la carte de fin invite à relire le reste de l'identité", async () => {
    render(<BrandingReview analysis={{ ...ANALYSIS, allow_overwrite: true }} onDone={() => {}} />);
    fireEvent.click(screen.getAllByText("Je valide tout")[0]);
    await screen.findByText("Ta relecture est terminée");
    expect(screen.getByText(RAPPEL)).toBeInTheDocument();
  });

  it("sans remplacement, pas de rappel", async () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);
    fireEvent.click(screen.getAllByText("Je valide tout")[0]);
    await screen.findByText("Ta relecture est terminée");
    expect(screen.queryByText(RAPPEL)).toBeNull();
  });

  it("remplacement autorisé mais tout gardé tel quel : rien n'a changé, pas de rappel", async () => {
    const tout = new Set(["story", "persona", "value_proposition", "tone_style", "content_strategy", "offers", "charter"]);
    const progress = vi.fn().mockResolvedValue(undefined);
    render(<BrandingReview analysis={{ ...ANALYSIS, allow_overwrite: true }} preFilledSections={tout} onProgress={progress} onDone={() => {}} />);
    for (let i = 0; i < 7; i++) {
      fireEvent.click(screen.getByText("Garder tel quel"));
      if (i < 6) await screen.findByText(`${i + 1}/7 validées`);
    }
    await screen.findByText("Ta relecture est terminée");
    expect(m.writes).toEqual([]);
    expect(screen.queryByText(RAPPEL)).toBeNull();
  });
});

describe("BrandingReview — bio Instagram", () => {
  it("Instagram inaccessible → coller sa bio puis réanalyser avec le texte nettoyé", () => {
    const reanalyze = vi.fn();
    render(<BrandingReview analysis={{ ...ANALYSIS, sources_failed: ["instagram"] }} onReanalyzeWithBio={reanalyze} onDone={() => {}} />);
    fireEvent.click(screen.getByText("Coller ma bio Instagram →"));
    const bouton = screen.getByRole("button", { name: "Réanalyser avec ma bio" });
    expect(bouton).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Colle ta bio Instagram ici..."), { target: { value: "  Céramiste à Lyon  " } });
    expect(screen.getByRole("button", { name: "Réanalyser avec ma bio" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Réanalyser avec ma bio" }));
    expect(reanalyze).toHaveBeenCalledWith("Céramiste à Lyon");
  });

  it("pas d'aide Instagram quand Instagram a été lu", () => {
    render(<BrandingReview analysis={{ ...ANALYSIS, sources_used: ["instagram"] }} onDone={() => {}} />);
    expect(screen.queryByText("Coller ma bio Instagram →")).toBeNull();
  });
});

describe("BrandingReview — exports du fichier", () => {
  it("garde le composant par défaut, CharterSection et normalizeHex (importés ailleurs)", async () => {
    expect(Object.keys(BrandingReviewModule).sort()).toEqual(["CharterSection", "default", "normalizeHex"]);
    expect(typeof BrandingReviewModule.default).toBe("function");
    await waitFor(() => expect(BrandingReviewModule.normalizeHex("#ABC")).toBeTruthy());
  });
});

describe("BrandingReview — proposition de valeur sans conversation", () => {
  // « On affine ensemble » sur cette carte faisait planter l'écran (22/10/2026) :
  // la conversation ne connaît pas cette section, elle a sa propre page.
  it("n'offre pas « On affine ensemble » sur la proposition de valeur", () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);
    expect(screen.getByText("On affine ensemble →")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Aller à « Ta proposition de valeur »"));
    expect(currentCard()).toBe("Carte 3 sur 7");
    expect(screen.queryByText("On affine ensemble →")).toBeNull();
    expect(screen.getByText("C'est bon ✓")).toBeInTheDocument();
  });

  it("une proposition de valeur vide pose sa question de rattrapage, sans bouton de conversation", () => {
    render(<BrandingReview analysis={{ ...ANALYSIS, value_proposition: { confidence: "low" } }} onDone={() => {}} />);
    fireEvent.click(screen.getByLabelText("Aller à « Ta proposition de valeur »"));
    expect(screen.getByText("En une phrase : qu'est-ce que tu apportes, et à qui ?")).toBeInTheDocument();
    expect(screen.queryByText("On affine ensemble →")).toBeNull();
    expect(screen.getByText("Plus tard")).toBeInTheDocument();
  });
});

describe("BrandingReview — carte vide : question de rattrapage (23/10/2026)", () => {
  it("le haut compte les cartes vraiment remplies, au lieu d'une phrase écrite d'avance", () => {
    render(<BrandingReview analysis={{ ...ANALYSIS, overall_confidence: "medium" }} onDone={() => {}} />);
    expect(screen.getByText("J'ai rempli 3 cartes sur 7. Pour les autres, une question courte suffit.")).toBeInTheDocument();
    expect(screen.queryByText(/Bonne base/)).toBeNull();
  });

  it("une carte vide pose sa question, sans « C'est bon », et enregistre la réponse telle quelle", async () => {
    // Forme réelle de l'onboarding : confiance « medium » écrite d'office, aucun contenu.
    render(<BrandingReview analysis={{ ...ANALYSIS, story: { confidence: "medium", full_story: null as any } }} onDone={() => {}} />);
    expect(screen.getByText("Je n'ai rien trouvé sur ton histoire.")).toBeInTheDocument();
    expect(screen.queryByText("C'est bon ✓")).toBeNull();
    const enregistrer = screen.getByText("Enregistrer ma réponse").closest("button")!;
    expect(enregistrer).toBeDisabled();
    fireEvent.change(screen.getByLabelText("En deux phrases, comment ton activité a commencé ?"), { target: { value: "J'ai ouvert mon atelier en 2020." } });
    fireEvent.click(enregistrer);
    await screen.findByText("1/7 validées");
    expect(m.writes.some(w => w.table === "storytelling")).toBe(true);
    expect(currentCard()).toBe("Carte 2 sur 7");
    fireEvent.click(screen.getByText("Précédent"));
    expect(screen.getByText("J'ai ouvert mon atelier en 2020.")).toBeInTheDocument();
  });

  it("« Plus tard » passe à la carte suivante sans rien écrire", () => {
    render(<BrandingReview analysis={{ ...ANALYSIS, story: { confidence: "medium" } }} onDone={() => {}} />);
    fireEvent.click(screen.getByText("Plus tard"));
    expect(currentCard()).toBe("Carte 2 sur 7");
    expect(m.writes).toHaveLength(0);
  });

  it("« Je valide tout » ne fête pas les cartes vides et les rappelle pour plus tard", async () => {
    render(<BrandingReview analysis={ANALYSIS} onDone={() => {}} />);
    fireEvent.click(screen.getAllByText("Je valide tout")[0]);
    await screen.findByText("3/7 validées · 4 à remplir plus tard");
    expect(screen.queryByText("Fiche validée ! 🎉")).toBeNull();
    expect(m.toast.success).toHaveBeenCalledWith("3 cartes enregistrées. 4 cartes restent à remplir : tu les retrouveras dans Mon identité.");
    expect(screen.getByText("Ta relecture est terminée")).toBeInTheDocument();
    expect(screen.getByText("À remplir plus tard dans Mon identité :")).toBeInTheDocument();
    expect(new Set(m.writes.map(w => w.table)).has("offers")).toBe(false);
  });

  it("une partie déjà remplie sans rien de neuf ne montre plus un encadré sur du vide", () => {
    render(<BrandingReview analysis={{ ...ANALYSIS, story: { confidence: "medium" } }} preFilledSections={new Set(["story"])} onDone={() => {}} />);
    expect(screen.getByText(/Tu avais déjà rempli cette partie, et l'analyse n'a rien trouvé de plus/)).toBeInTheDocument();
    expect(screen.queryByText("Compléter les champs vides ✓")).toBeNull();
    expect(screen.getByText("Garder tel quel")).toBeInTheDocument();
  });
});
