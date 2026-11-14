// Choix de Laetitia du 16/10/2026 : « Mes photos » compte pour le carrousel conseillé
// (au moins 3 photos → « Tes photos en fond ») et « Choisir dans mes photos » passe
// en bouton principal dès que la bibliothèque a des photos.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { defaultCarouselMode } from "@/components/creer/CarouselModePicker";
import { recommendContentFormat } from "@/lib/format-recommendation";

const lib = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/hooks/use-library-photo-count", () => ({ useLibraryPhotoCount: () => lib.count }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "workspace_id", value: "test" }) }));
vi.mock("@/components/ui/input-with-voice", () => ({ InputWithVoice: (props: any) => <input {...props} /> }));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({ PhotoLibraryPickerDialog: ({ open }: { open: boolean }) => (open ? <div>Bibliothèque ouverte</div> : null) }));
vi.mock("@/components/photos/StockPhotoPickerDialog", () => ({ StockPhotoPickerDialog: () => null }));

import CreerStepFormat from "@/components/creer/CreerStepFormat";
import { PhotoUploadZone } from "@/components/creer/PhotoUploadZone";

const base = { idea: "Expliquer la fabrication", onNext: vi.fn(), onBack: vi.fn() };
beforeEach(() => { lib.count = 0; });

describe("type de carrousel conseillé", () => {
  it("compte les photos jointes, ou au moins 3 photos dans Mes photos", () => {
    expect(defaultCarouselMode(0)).toBe("text");
    expect(defaultCarouselMode(1)).toBe("photo");
    expect(defaultCarouselMode(0, 2)).toBe("text");
    expect(defaultCarouselMode(0, 3)).toBe("photo");
  });

  it("4 photos dans Mes photos : « Tes photos en fond » choisi et marqué Conseillé", () => {
    lib.count = 4;
    render(<CreerStepFormat {...base} forcedChannel="instagram" />);
    fireEvent.click(screen.getByTestId("creer-format-carousel"));
    expect(screen.getByTestId("carousel-mode-photo")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("carousel-mode-photo")).toHaveTextContent("Conseillé");
    expect(screen.getByTestId("photo-zone-library-main")).toHaveTextContent("Mes photos4 photos");
  });

  it("2 photos dans Mes photos : Texte design reste conseillé", () => {
    lib.count = 2;
    render(<CreerStepFormat {...base} forcedChannel="instagram" />);
    fireEvent.click(screen.getByTestId("creer-format-carousel"));
    expect(screen.getByTestId("carousel-mode-text")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("carousel-mode-text")).toHaveTextContent("Conseillé");
  });

  it("Mes photos lu après coup : bascule tant qu'elle n'a rien choisi, jamais après son choix", () => {
    const { rerender } = render(<CreerStepFormat {...base} forcedChannel="instagram" initialFormat="carousel" />);
    expect(screen.getByTestId("carousel-mode-text")).toHaveAttribute("aria-pressed", "true");
    lib.count = 5;
    rerender(<CreerStepFormat {...base} forcedChannel="instagram" initialFormat="carousel" />);
    expect(screen.getByTestId("carousel-mode-photo")).toHaveAttribute("aria-pressed", "true");

    lib.count = 0;
    const second = render(<CreerStepFormat {...base} forcedChannel="instagram" initialFormat="carousel" />);
    fireEvent.click(second.getAllByTestId("carousel-mode-text").at(-1)!);
    lib.count = 5;
    second.rerender(<CreerStepFormat {...base} forcedChannel="instagram" initialFormat="carousel" />);
    expect(second.getAllByTestId("carousel-mode-text").at(-1)).toHaveAttribute("aria-pressed", "true");
  });

  it("type repris d'un brouillon : jamais remplacé", () => {
    lib.count = 5;
    render(<CreerStepFormat {...base} forcedChannel="instagram" initialFormat="carousel" initialCarouselSubMode="text" />);
    expect(screen.getByTestId("carousel-mode-text")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("zone photos en trois gros boutons (carrousels, 14/11/2026)", () => {
  const props = { maxPhotos: 10, onPhotosChange: vi.fn(), onDescriptionChange: vi.fn(), stockAiContext: { subject: "Ma fabrication" }, layout: "tiles" as const };
  it("Mes photos, L'app choisit, Importer ; site et libres de droit en liens", () => {
    render(<PhotoUploadZone {...props} libraryCount={3} pickFromLibrary={vi.fn()} />);
    expect(screen.getByTestId("photo-zone-library-main")).toHaveTextContent("3 photos");
    expect(screen.getByTestId("photo-zone-auto-pick")).toHaveTextContent("Dans tes photos d'abord");
    expect(screen.getByTestId("photo-zone-import")).toHaveTextContent("Importer");
    expect(screen.getByRole("button", { name: /Depuis mon site ou Instagram/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Photos libres de droit/ })).toBeInTheDocument();
    expect(screen.queryByText(/Glisse tes photos ici/)).not.toBeInTheDocument();
  });
  it("Mes photos vide : « L'app choisit » prend des photos libres de droit", () => {
    render(<PhotoUploadZone {...props} pickFromLibrary={vi.fn()} />);
    expect(screen.getByTestId("photo-zone-auto-pick")).toHaveTextContent("Photos libres de droit");
  });
});

describe("zone photos : Mes photos d'abord", () => {
  const props = { maxPhotos: 10, onPhotosChange: vi.fn(), onDescriptionChange: vi.fn(), stockAiContext: { subject: "Ma fabrication" } };
  it("avec des photos dans Mes photos : gros bouton bibliothèque, l'IA en lien", () => {
    render(<PhotoUploadZone {...props} libraryCount={3} />);
    expect(screen.getByTestId("photo-zone-library-main")).toHaveTextContent("Choisir dans mes photos (3)");
    expect(screen.getByRole("button", { name: /L'IA choisit pour moi/ })).toBeInTheDocument();
    expect(screen.queryByText("L'IA choisit les photos pour moi")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Choisir dans mes photos/ })).toHaveLength(1);
  });
  it("bibliothèque vide : rien ne change (gros bouton IA, lien bibliothèque)", () => {
    render(<PhotoUploadZone {...props} />);
    expect(screen.queryByTestId("photo-zone-library-main")).not.toBeInTheDocument();
    expect(screen.getByText("L'IA choisit les photos pour moi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Choisir dans mes photos/ })).toBeInTheDocument();
  });
});

describe("suite du 17/10/2026", () => {
  it("« Quel format ? » : 3 photos dans Mes photos → carrousel avec tes photos (photo jointe et autres canaux inchangés)", () => {
    expect(recommendContentFormat("instagram", 0, "Mon atelier", 3)).toMatchObject({ format: "carousel", mode: "photo" });
    expect(recommendContentFormat("instagram", 0, "Mon atelier", 2).format).toBe("post");
    expect(recommendContentFormat("instagram", 1, "Mon atelier", 5).format).toBe("post");
    expect(recommendContentFormat("linkedin", 0, "Mon atelier", 5).format).toBe("linkedin");
    expect(recommendContentFormat("linkedin", 4, "Mon chantier")).toMatchObject({ format: "carousel", mode: "photo" });
    expect(recommendContentFormat("linkedin", 1, "Mon chantier").format).toBe("linkedin");
  });

  it("écran « Quel format ? » : Suivant mène au carrousel photo quand Mes photos en a 4", () => {
    lib.count = 4;
    render(<CreerStepFormat {...base} idea="Mon atelier" forcedChannel="instagram" />);
    expect(screen.getByTestId("creer-format-next")).toHaveTextContent("Suivant : Carrousel");
    expect(screen.getByTestId("creer-format-recommendation")).toHaveTextContent("tu as des photos dans « Mes photos »");
    fireEvent.click(screen.getByTestId("creer-format-next"));
    expect(screen.getByTestId("carousel-mode-photo")).toHaveAttribute("aria-pressed", "true");
  });

  it("« Tes photos en fond » sans photo : plus d'alerte, « Suivant » continue (14/11/2026)", () => {
    const onNext = vi.fn();
    lib.count = 4;
    render(<CreerStepFormat {...base} onNext={onNext} forcedChannel="instagram" initialFormat="carousel" initialCarouselSubMode="photo" />);
    expect(screen.getByText("Tes photos (facultatif)")).toBeInTheDocument();
    expect(screen.getByTestId("carousel-photo-later")).toHaveTextContent("Pas de photo sous la main ?");
    fireEvent.click(screen.getByTestId("creer-format-next"));
    expect(screen.queryByTestId("carousel-photo-warning")).not.toBeInTheDocument();
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNext.mock.calls[0][2]).toBe("photo");
    expect(onNext.mock.calls[0][3]).toEqual([]);
  });

  it("mixte « J'ai déjà mes photos » sans photo : l'alerte reste, « Choisir dans mes photos » en premier", () => {
    const onNext = vi.fn();
    lib.count = 4;
    render(<CreerStepFormat {...base} onNext={onNext} forcedChannel="instagram" initialFormat="carousel" initialCarouselSubMode="mix" />);
    fireEvent.click(screen.getByText("J'ai déjà mes photos"));
    expect(screen.queryByTestId("carousel-photo-later")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("creer-format-next"));
    expect(onNext).not.toHaveBeenCalled();
    const liens = screen.getByTestId("carousel-photo-warning").querySelectorAll("button");
    expect(liens[0]).toHaveTextContent("Choisir dans mes photos (4)");
    fireEvent.click(liens[0]);
    expect(screen.getByText("Bibliothèque ouverte")).toBeInTheDocument();
  });
});
