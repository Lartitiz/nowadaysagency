import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DiagnosticView from "./DiagnosticView";
import type { DiagnosticData } from "@/lib/diagnostic-data";

vi.mock("@/hooks/use-pending-brand-review", () => ({ usePendingBrandReview: () => ({ pending: true }) }));
vi.mock("./BrandLearnedSection", () => ({ default: () => null }));
vi.mock("@/components/Confetti", () => ({ default: () => null }));

const data = {
  totalScore: 55,
  summary: "Tu fabriques des savons à froid pour les peaux sensibles.",
  strengths: ["Ton activité est claire", "Ton objectif est net", "Un troisième point"],
  weaknesses: [{ title: "Pas encore de newsletter", why: "" }],
  priorities: [{ title: "Raconter ta fabrication", why: "", channel: "instagram", impact: "high", time: "15 min" }],
  channelScores: [],
} as unknown as DiagnosticData;

describe("fin d'onboarding : un seul récapitulatif", () => {
  it("résume en un écran avec un seul bouton de création", () => {
    const onCreateFirst = vi.fn();
    const onComplete = vi.fn();
    render(<DiagnosticView data={data} prenom="Lina" onComplete={onComplete} onCreateFirst={onCreateFirst} />);
    expect(screen.getByText("Lina, voilà ce que je vois.")).toBeInTheDocument();
    // Deux points forts au plus, la première priorité, l'annonce de la relecture.
    expect(screen.queryByText("Un troisième point")).not.toBeInTheDocument();
    expect(screen.getByText(/Raconter ta fabrication/)).toBeInTheDocument();
    expect(screen.getByText(/je te montre ta fiche de marque à relire/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Créer mon premier contenu" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Créer mon premier contenu" }));
    expect(onCreateFirst).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Aller à mon espace" }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("garde le diagnostic complet à un clic, avec retour au résumé", () => {
    render(<DiagnosticView data={data} prenom="Lina" onComplete={vi.fn()} onCreateFirst={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Voir le diagnostic complet" }));
    expect(screen.getByRole("button", { name: /Suivant/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Revenir au résumé/ }));
    expect(screen.getByRole("button", { name: "Créer mon premier contenu" })).toBeInTheDocument();
  });
});
