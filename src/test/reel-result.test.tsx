import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReelResult from "@/components/creer/formatRenderers/ReelResult";
import { suggestStockKeywords, searchStockVideos } from "@/lib/stock-videos";
import { listReelVideos } from "@/lib/reel-user-videos";

// ReelMontage appelle le réseau dès son montage (mots-clés IA + Pexels +
// bibliothèque perso) : on mocke les trois libs pour tester le PARCOURS sans
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

const planTournage = [
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
];

const captionResult = {
  ...baseResult,
  caption: { text: "Une caption qui complète le script.", cta: "Dis-le moi en commentaire." },
  hashtags: ["#ceramique", "#atelier"],
  cover_text: "Le prix, c'est pas le problème",
  amplification_stories: [
    { text: "Tu flippes pour tes vues ?", sticker_type: "sondage", sticker_options: ["Oui", "Ça va"] },
    { text: "Et toi, ton blocage ?", sticker_type: "question_ouverte", sticker_options: null },
  ],
};

/** Les pastilles du stepper, dans l'ordre. */
const stepDots = () => screen.getAllByRole("button", { name: /^Étape \d+ sur \d+ —/ });

/** Va à l'étape voulue en cliquant sa pastille (le stepper est tout cliquable). */
const goToStep = (n: number) => fireEvent.click(stepDots()[n - 1]);

// ── Le parcours lui-même ────────────────────────────────────────────────
// Avant, tout arrivait d'un bloc : on ne savait pas par où commencer et
// « Publier ou programmer » s'affichait avant même que la vidéo soit tournée.
describe("ReelResult — parcours en 4 étapes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("démarre à l'étape 1 : le script, et RIEN d'autre", () => {
    render(<ReelResult result={{ ...captionResult, plan_tournage: planTournage }} />);
    expect(screen.getByText(/Étape 1 sur 4/)).toBeTruthy();
    expect(screen.getByText(/On m'a dit que c'était un hobby/)).toBeTruthy();
    // Ni le tournage, ni la légende ne sont là tant qu'on n'y est pas allée.
    expect(screen.queryByText("🎥 Ton plan de tournage")).toBeNull();
    expect(screen.queryByText("📝 Caption")).toBeNull();
  });

  it("saute l'étape tournage quand plan_tournage est vide (3 pastilles, pas 4)", () => {
    render(<ReelResult result={captionResult} />);
    expect(screen.getByText(/Étape 1 sur 3/)).toBeTruthy();
    expect(stepDots()).toHaveLength(3);
    // Le bouton d'avancement saute donc directement au montage.
    expect(screen.getByText("Monter ma vidéo")).toBeTruthy();
    expect(screen.queryByText("Passer au tournage")).toBeNull();
  });

  it("n'a pas d'étape montage quand le script n'a aucune section", () => {
    render(<ReelResult result={{ ...captionResult, script: [], sections: [] }} />);
    expect(stepDots()).toHaveLength(2);
    expect(screen.getByText("Écrire ma légende")).toBeTruthy();
  });

  it("avance script → tournage → légende avec le bouton du bas", () => {
    render(<ReelResult result={{ ...captionResult, plan_tournage: planTournage }} />);
    fireEvent.click(screen.getByText("Passer au tournage"));
    expect(screen.getByText(/Étape 2 sur 4/)).toBeTruthy();
    expect(screen.getByText("🎥 Ton plan de tournage")).toBeTruthy();
    expect(screen.getByText("2 plans")).toBeTruthy();
    expect(screen.getByText(/Toi face caméra dans ton atelier/)).toBeTruthy();
    expect(screen.getByText("🎤 Face cam")).toBeTruthy();
    expect(screen.getByText("🎬 B-roll")).toBeTruthy();
    // …et le script n'est plus là : une étape à la fois.
    expect(screen.queryByText(/On m'a dit que c'était un hobby/)).toBeNull();
  });

  it("laisse revenir en arrière ET filer en avant par les pastilles", () => {
    render(<ReelResult result={{ ...captionResult, plan_tournage: planTournage }} />);
    // Saut direct à la dernière étape depuis la première : beaucoup de
    // créatrices ne montent pas dans l'app, leur livrable c'est la légende.
    goToStep(4);
    expect(screen.getByText("📝 Caption")).toBeTruthy();
    goToStep(1);
    expect(screen.getByText(/On m'a dit que c'était un hobby/)).toBeTruthy();
  });

  it("offre une sortie directe vers la légende dès l'étape 1", () => {
    render(<ReelResult result={{ ...captionResult, plan_tournage: planTournage }} />);
    fireEvent.click(screen.getByText(/aller directement à la légende/));
    expect(screen.getByText(/Étape 4 sur 4/)).toBeTruthy();
    expect(screen.getByText("📝 Caption")).toBeTruthy();
  });

  it("remonte l'avancée au parent, isLast seulement à la fin", () => {
    const onStepChange = vi.fn();
    render(<ReelResult result={captionResult} onStepChange={onStepChange} />);
    expect(onStepChange).toHaveBeenLastCalledWith({ step: 1, isLast: false, montageDone: false });
    goToStep(3);
    expect(onStepChange).toHaveBeenLastCalledWith({ step: 3, isLast: true, montageDone: false });
  });
});

// ── Étape 2 : le plan de tournage ───────────────────────────────────────
describe("ReelResult — plan de tournage", () => {
  it("n'affiche RIEN sans plan_tournage (contenus d'avant le chantier)", () => {
    render(<ReelResult result={baseResult} />);
    goToStep(3);
    expect(screen.queryByText("🎥 Ton plan de tournage")).toBeNull();
  });

  it("ne crashe pas si plan_tournage a une forme inattendue", () => {
    const { unmount } = render(<ReelResult result={{ ...baseResult, plan_tournage: "pas un tableau" }} />);
    expect(screen.queryByText("🎥 Ton plan de tournage")).toBeNull();
    unmount();
    render(<ReelResult result={{ ...baseResult, plan_tournage: [{}] }} />);
    fireEvent.click(screen.getByText("Passer au tournage"));
    expect(screen.getByText("🎥 Ton plan de tournage")).toBeTruthy();
  });
});

// ── Étape 4 : caption / hashtags / stories d'amplification ──────────────
// (audit reels 12/07) : champs additifs, générés depuis toujours mais affichés
// seulement depuis ce chantier.
describe("ReelResult — caption et amplification", () => {
  it("affiche caption + hashtags + stories à la dernière étape", () => {
    render(<ReelResult result={captionResult} />);
    goToStep(3);
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
    goToStep(3);
    expect(screen.queryByText("📝 Caption")).toBeNull();
    expect(screen.queryByText("📣 À poster en story dans l'heure")).toBeNull();
  });

  it("ne crashe pas sur des formes inattendues", () => {
    render(
      <ReelResult
        result={{ ...baseResult, caption: "pas un objet", hashtags: "pas un tableau", amplification_stories: [{ sticker_type: "sondage" }] }}
      />,
    );
    goToStep(3);
    expect(screen.queryByText("📝 Caption")).toBeNull();
    expect(screen.queryByText("📣 À poster en story dans l'heure")).toBeNull();
  });
});

// ── Étape 3 : le montage ────────────────────────────────────────────────
// ReelMontage lance dès son montage un appel IA (mots-clés) + une recherche
// Pexels par section : il ne doit se monter QU'À l'arrivée sur son étape, et
// surtout ne plus se démonter ensuite (les clips choisis survivent à un aller-
// retour vers la légende).
describe("ReelResult — montage vidéo : monté seulement à son étape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ne lance AUCUN appel (mots-clés, Pexels, bibliothèque) aux autres étapes", () => {
    render(<ReelResult result={{ ...captionResult, plan_tournage: planTournage }} />);
    goToStep(2);
    goToStep(4);
    expect(suggestStockKeywords).not.toHaveBeenCalled();
    expect(searchStockVideos).not.toHaveBeenCalled();
    expect(listReelVideos).not.toHaveBeenCalled();
  });

  it("monte le panneau à l'arrivée sur l'étape, et là seulement les appels partent", async () => {
    render(<ReelResult result={baseResult} />);
    fireEvent.click(screen.getByText("Monter ma vidéo"));
    // Le panneau est là (la mention honnête sur le son en fait partie)…
    expect(await screen.findByText(/son de tes vidéos n'est pas encore conservé/)).toBeTruthy();
    // …et la suggestion de clips démarre.
    await waitFor(() => expect(suggestStockKeywords).toHaveBeenCalledTimes(1));
  });

  it("garde le panneau vivant quand on repart voir la légende", async () => {
    render(<ReelResult result={captionResult} />);
    goToStep(2);
    await waitFor(() => expect(suggestStockKeywords).toHaveBeenCalledTimes(1));
    goToStep(3);
    goToStep(2);
    // Un seul appel au total : le panneau n'a pas été démonté/remonté.
    expect(suggestStockKeywords).toHaveBeenCalledTimes(1);
  });
});
