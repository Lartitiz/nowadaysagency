import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { creerStepCredits } from "@/components/creer/creer-step-credits";

// QA du 12/11/2026 : en Premium, « Illimité » en haut et « 269 crédits
// restants » sur l'étape de /creer. Plan gratuit : le vrai chiffre reste.
const text = (node: ReturnType<typeof creerStepCredits>) => (node ? render(<>{node}</>).container.textContent : null);

describe("crédits affichés sur les étapes de /creer", () => {
  it("plan gratuit : le vrai chiffre", () => {
    expect(text(creerStepCredits({ loading: false, plan: "free", totalLimit: 23, remaining: 7 }))).toContain("7 crédits restants");
    expect(text(creerStepCredits({ loading: false, plan: "free", totalLimit: 23, remaining: 1 }))).toContain("1 crédit restant");
  });

  it("Premium et Binôme : rien, comme la pastille « Illimité »", () => {
    expect(creerStepCredits({ loading: false, plan: "outil", totalLimit: 200, remaining: 269 })).toBeNull();
    expect(creerStepCredits({ loading: false, plan: "binome", totalLimit: 400, remaining: 380 })).toBeNull();
    expect(creerStepCredits({ loading: false, plan: "free", totalLimit: 9999, remaining: 50 })).toBeNull();
  });

  it("pendant le chargement ou sans limite : rien", () => {
    expect(creerStepCredits({ loading: true, plan: "free", totalLimit: 23, remaining: 7 })).toBeNull();
    expect(creerStepCredits({ loading: false, plan: "free", totalLimit: 23, remaining: Infinity })).toBeNull();
  });
});
