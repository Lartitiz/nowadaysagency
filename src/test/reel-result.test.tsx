import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ReelResult from "@/components/creer/formatRenderers/ReelResult";

// Le plan de tournage (shot list) est un champ ADDITIF du JSON reel : les
// contenus générés avant le chantier « scripts Reels » ne l'ont pas et le
// renderer ne doit alors rien afficher (ni crasher — règle #107).
const baseResult = {
  format_type: "face_cam_confession",
  duree_cible: "45 sec",
  script: [
    {
      section: "hook",
      timing: "0-3 sec",
      format_visuel: "Face cam",
      texte_parle: "On m'a dit que c'était un hobby.",
      texte_overlay: "UN HOBBY ?",
      cut: null,
      tip: null,
    },
  ],
  sections: [
    {
      section: "hook",
      timing: "0-3 sec",
      format_visuel: "Face cam",
      texte_parle: "On m'a dit que c'était un hobby.",
      texte_overlay: "UN HOBBY ?",
      cut: null,
      tip: null,
    },
  ],
};

describe("ReelResult — plan de tournage", () => {
  it("affiche la shot list quand plan_tournage est présent", () => {
    render(
      <ReelResult
        result={{
          ...baseResult,
          plan_tournage: [
            {
              plan: "Toi face caméra dans ton atelier, lumière de la fenêtre",
              type: "face_cam",
              sert_pour: "hook + cta",
              duree: "1 prise de 60 sec",
              conseil: "Téléphone à hauteur des yeux",
            },
            {
              plan: "Gros plan sur tes mains qui émaillent une tasse",
              type: "b_roll",
              sert_pour: "plan de coupe body 1",
              duree: "10 sec de rush",
              conseil: null,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("🎥 Ton plan de tournage")).toBeTruthy();
    expect(screen.getByText("2 plans")).toBeTruthy();
    expect(screen.getByText(/Toi face caméra dans ton atelier/)).toBeTruthy();
    expect(screen.getByText("🎤 Face cam")).toBeTruthy();
    expect(screen.getByText("🎬 B-roll")).toBeTruthy();
    expect(screen.getByText(/Téléphone à hauteur des yeux/)).toBeTruthy();
  });

  it("n'affiche RIEN sans plan_tournage (contenus d'avant le chantier)", () => {
    render(<ReelResult result={baseResult} />);
    expect(screen.queryByText("🎥 Ton plan de tournage")).toBeNull();
  });

  it("ne crashe pas si plan_tournage a une forme inattendue", () => {
    render(<ReelResult result={{ ...baseResult, plan_tournage: "pas un tableau" }} />);
    expect(screen.queryByText("🎥 Ton plan de tournage")).toBeNull();
    render(<ReelResult result={{ ...baseResult, plan_tournage: [{}] }} />);
    expect(screen.getByText("🎥 Ton plan de tournage")).toBeTruthy();
  });
});
