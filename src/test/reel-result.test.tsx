import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReelResult from "@/components/creer/formatRenderers/ReelResult";
import { suggestStockKeywords, searchStockVideos } from "@/lib/stock-videos";
import { listReelVideos } from "@/lib/reel-user-videos";

// ReelMontage appelle le réseau dès son montage (mots-clés IA + Pexels +
// bibliothèque perso) : on mocke les trois libs pour tester le REPLI sans
// toucher ni Supabase ni Pexels.
vi.mock("@/lib/stock-videos", () => ({
  suggestStockKeywords: vi.fn().mockResolvedValue({ keywords: [], primary: "savon" }),
  searchStockVideos: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/reel-user-videos", () => ({
  uploadReelVideo: vi.fn(),
  loadVideoDuration: vi.fn().mockResolvedValue(null),
  listReelVideos: vi.fn().mockResolvedValue([]),
}));

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

// Ouverture du montage vidéo (01/08) : visible pour toutes SANS flag, mais
// REPLIÉ derrière un clic. Raison double : le panneau déplié lance dès son
// montage un appel IA (mots-clés) + une recherche Pexels par section — le
// déplier d'office ferait payer ces appels à chaque affichage de script — et
// le panneau ouvert en bas de page était introuvable. Ces tests verrouillent
// les deux : bouton visible d'emblée, ZÉRO appel avant le clic.
describe("ReelResult — montage vidéo : bouton visible, replié par défaut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche le bouton d'appel sans aucun flag posé", () => {
    window.localStorage.clear();
    render(<ReelResult result={baseResult} />);
    expect(screen.getByText(/Monter la vidéo/)).toBeTruthy();
  });

  it("ne lance AUCUN appel (mots-clés, Pexels, bibliothèque) avant le clic", () => {
    render(<ReelResult result={baseResult} />);
    expect(suggestStockKeywords).not.toHaveBeenCalled();
    expect(searchStockVideos).not.toHaveBeenCalled();
    expect(listReelVideos).not.toHaveBeenCalled();
  });

  it("déplie le panneau au clic, et là seulement les appels partent", async () => {
    render(<ReelResult result={baseResult} />);
    fireEvent.click(screen.getByText(/Monter la vidéo/));
    // Le panneau est là (la mention honnête sur le son en fait partie)…
    expect(await screen.findByText(/son de tes vidéos n'est pas encore conservé/)).toBeTruthy();
    // …et la suggestion de clips démarre.
    await waitFor(() => expect(suggestStockKeywords).toHaveBeenCalledTimes(1));
  });

  it("n'affiche pas le bouton quand le script n'a aucune section", () => {
    render(<ReelResult result={{ ...baseResult, script: [], sections: [] }} />);
    expect(screen.queryByText(/Monter la vidéo/)).toBeNull();
  });
});
