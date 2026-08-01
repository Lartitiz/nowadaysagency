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

// Caption / hashtags / stories d'amplification (audit reels 12/07) : champs
// additifs, générés depuis toujours mais affichés seulement depuis ce chantier.
describe("ReelResult — caption et amplification", () => {
  it("affiche caption + hashtags + stories quand présents", () => {
    render(
      <ReelResult
        result={{
          ...baseResult,
          caption: { text: "Une caption qui complète le script.", cta: "Dis-le moi en commentaire." },
          hashtags: ["#ceramique", "#atelier"],
          cover_text: "Le prix, c'est pas le problème",
          amplification_stories: [
            { text: "Tu flippes pour tes vues ?", sticker_type: "sondage", sticker_options: ["Oui", "Ça va"] },
            { text: "Et toi, ton blocage ?", sticker_type: "question_ouverte", sticker_options: null },
          ],
        }}
      />,
    );
    expect(screen.getByText("📝 Caption")).toBeTruthy();
    expect(screen.getByText(/Une caption qui complète/)).toBeTruthy();
    expect(screen.getByText("#ceramique")).toBeTruthy();
    expect(screen.getByText(/Texte de la cover/)).toBeTruthy();
    expect(screen.getByText("📣 À poster en story dans l'heure")).toBeTruthy();
    expect(screen.getByText("Tu flippes pour tes vues ?")).toBeTruthy();
    expect(screen.getByText("📊 Sondage")).toBeTruthy();
    expect(screen.getByText("Oui · Ça va")).toBeTruthy();
  });

  it("n'affiche RIEN sans caption ni stories (contenus d'avant le chantier)", () => {
    render(<ReelResult result={baseResult} />);
    expect(screen.queryByText("📝 Caption")).toBeNull();
    expect(screen.queryByText("📣 À poster en story dans l'heure")).toBeNull();
  });

  it("ne crashe pas sur des formes inattendues", () => {
    render(
      <ReelResult
        result={{ ...baseResult, caption: "pas un objet", hashtags: "pas un tableau", amplification_stories: [{ sticker_type: "sondage" }] }}
      />,
    );
    expect(screen.queryByText("📝 Caption")).toBeNull();
    expect(screen.queryByText("📣 À poster en story dans l'heure")).toBeNull();
  });
});

// Ouverture du montage vidéo (01/08) : le panneau vivait derrière un flag
// localStorage posé à la main — personne ne le voyait, ni Laetitia ni les
// clientes. Ce test verrouille l'ouverture : sans rien poser dans le
// navigateur, « Monter la vidéo » doit être là.
describe("ReelResult — montage vidéo ouvert à toutes", () => {
  it("affiche le panneau de montage sans aucun flag posé", () => {
    window.localStorage.clear();
    render(<ReelResult result={baseResult} />);
    expect(screen.getByText(/Monter la vidéo/)).toBeTruthy();
  });

  it("dit franchement que le son des vidéos n'est pas encore gardé", () => {
    window.localStorage.clear();
    render(<ReelResult result={baseResult} />);
    expect(screen.getByText(/son de tes vidéos n'est pas encore conservé/)).toBeTruthy();
  });

  it("n'affiche pas le montage quand le script n'a aucune section", () => {
    window.localStorage.clear();
    render(<ReelResult result={{ ...baseResult, script: [], sections: [] }} />);
    expect(screen.queryByText(/Monter la vidéo/)).toBeNull();
  });
});
