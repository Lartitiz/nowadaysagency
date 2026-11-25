import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProductServiceScreen from "./ProductServiceScreen";
import { effectiveActivityDetail, needsActivityDetailQuestion } from "@/features/onboarding/activity-detail";

// Questionnaire d'accueil : l'activité n'est demandée qu'une fois (25/11/2026).
// Écran 1 rempli → l'écran 2 ne repose pas « Et concrètement, tu fais quoi ? »
// et la réponse de l'écran 1 part dans les mêmes cases (profil + diagnostic).

function renderScreen(activite: string, detail = "") {
  const onDetailChange = vi.fn();
  render(
    <ProductServiceScreen
      value="" onChange={() => {}}
      detailValue={detail} onDetailChange={onDetailChange}
      activite={activite} onNext={() => {}}
    />,
  );
  return { onDetailChange };
}

describe("écran « Tu proposes plutôt quoi ? »", () => {
  it("écran 1 rempli : la question sur l'activité n'est plus posée, le choix reste", () => {
    renderScreen("Céramiste, je vends mes pièces en ligne");
    expect(screen.queryByLabelText(/Et concrètement, tu fais quoi/)).toBeNull();
    expect(screen.queryByText(/une phrase suffit/)).toBeNull();
    for (const label of [/Des produits/, /Des services/, /Des biens ou des réalisations/, /Produits et services/]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /étape suivante/ })).toBeInTheDocument();
  });

  it("écran 1 vide : la question reste affichée et sa saisie est transmise", () => {
    const { onDetailChange } = renderScreen("");
    const input = screen.getByLabelText(/Et concrètement, tu fais quoi/);
    fireEvent.change(input, { target: { value: "céramiste à Lyon" } });
    expect(onDetailChange).toHaveBeenCalledWith("céramiste à Lyon");
  });

  it("écran 1 d'un seul caractère : compte comme vide, la question reste", () => {
    renderScreen(" a ");
    expect(screen.getByLabelText(/Et concrètement, tu fais quoi/)).toBeInTheDocument();
  });
});

describe("détail d'activité enregistré et envoyé au diagnostic", () => {
  it("écran 1 rempli : c'est sa réponse qui est transmise", () => {
    expect(effectiveActivityDetail({ activite: "  Céramiste, je vends mes pièces en ligne ", activity_detail: "" }))
      .toBe("Céramiste, je vends mes pièces en ligne");
  });

  it("écran 1 rempli : un ancien détail resté dans un brouillon (plus visible) n'est pas envoyé", () => {
    expect(effectiveActivityDetail({ activite: "Coach sportive", activity_detail: "Céramiste" })).toBe("Coach sportive");
  });

  it("écran 1 vide : c'est la saisie de l'écran 2 qui est transmise", () => {
    expect(needsActivityDetailQuestion("")).toBe(true);
    expect(effectiveActivityDetail({ activite: "", activity_detail: " céramiste à Lyon " })).toBe("céramiste à Lyon");
    expect(effectiveActivityDetail({ activite: null, activity_detail: null })).toBe("");
  });
});
