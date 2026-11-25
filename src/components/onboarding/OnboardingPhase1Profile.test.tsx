import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OnboardingPhase1Profile from "./OnboardingPhase1Profile";

// Seule question sur l'activité du questionnaire (25/11/2026) : elle doit
// inviter à faire une phrase, plus à répondre « en deux mots ».
describe("écran « Dis-moi qui tu es »", () => {
  it("invite à répondre en une phrase, pas en deux mots", () => {
    render(<OnboardingPhase1Profile prenom="Léa" activite="" onPrenomChange={() => {}} onActiviteChange={() => {}} onNext={() => {}} />);
    expect(screen.getByText("Tu fais quoi ?")).toBeInTheDocument();
    expect(screen.getByText(/une phrase suffit/)).toBeInTheDocument();
    expect(screen.queryByText(/en deux mots/)).toBeNull();
  });
});
