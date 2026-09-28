import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OnboardingPhase2Import from "./OnboardingPhase2Import";
import { isValidUrl } from "./OnboardingShared";
import type { Answers } from "@/hooks/use-onboarding";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
// Instagram connection added to this screen now reads the app providers.
// These import/validation tests exercise the screen with a disconnected account.
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-a" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "space-a" }));
vi.mock("@/hooks/use-social-connections", () => ({ useSocialConnections: () => ({ isConnected: () => false, accountNames: {} }) }));
vi.mock("@/lib/social-connect", () => ({ startSocialConnect: vi.fn() }));

const answers = (website = ""): Answers => ({
  prenom: "Léa", activite: "Céramiste", activity_type: "artisane",
  activity_detail: "Je crée des pièces en céramique", canaux: [], desired_channels: [],
  blocage: "", objectif: "", temps: "", instagram: "", website,
  linkedin: "", linkedin_summary: "", change_priority: "",
  product_or_service: "products", uniqueness: "",
});

function show(website: string, uploading = false) {
  const onNext = vi.fn();
  const onLeave = vi.fn();
  render(<OnboardingPhase2Import
    answers={answers(website)} set={vi.fn()} files={[]}
    uploading={uploading} onUpload={vi.fn()} onRemove={vi.fn()}
    onNext={onNext} onLeave={onLeave}
  />);
  return { onNext, onLeave };
}

describe("import de l'onboarding", () => {
  it("retient l'utilisatrice si l'URL du site est invalide", () => {
    const { onNext, onLeave } = show("https://exemple .fr");
    expect(screen.getByRole("textbox", { name: "URL de ton site web" })).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "Continuer →" }));
    expect(onNext).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.getByText(/Vérifie cette adresse/)).toBeInTheDocument();
  });

  it("transmet l'URL normalisée au pré-scraping", () => {
    const { onNext, onLeave } = show("exemple.fr");
    fireEvent.click(screen.getByRole("button", { name: "Continuer →" }));
    expect(onLeave).toHaveBeenCalledWith("https://exemple.fr");
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("attend la fin de l'upload avant d'avancer", () => {
    const { onNext } = show("", true);
    expect(screen.getByRole("button", { name: "Ajout en cours…" })).toBeDisabled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("affiche l'aperçu signé d'une capture du bucket privé", () => {
    render(<OnboardingPhase2Import
      answers={answers()} set={vi.fn()}
      files={[{ id: "file-a", name: "profil.png", url: "user/onboarding/profil.png", previewUrl: "https://signed.example/profil.png" }]}
      uploading={false} onUpload={vi.fn()} onRemove={vi.fn()} onNext={vi.fn()}
    />);
    expect(screen.getByRole("img", { name: "profil.png" })).toHaveAttribute("src", "https://signed.example/profil.png");
  });

  it("rejette les URL qui ressemblent seulement à un lien", () => {
    expect(isValidUrl("https://exemple.fr")).toBe(true);
    expect(isValidUrl("https://exemple .fr")).toBe(false);
    expect(isValidUrl("https://exemple..fr")).toBe(false);
    expect(isValidUrl("ftp://exemple.fr")).toBe(false);
  });
});
