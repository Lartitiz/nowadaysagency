import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CharterSection, normalizeHex } from "@/components/branding/BrandingReview";

/* La section charte de la review d'autofill : provenance honnête des couleurs
   (détectées vs proposées par l'IA) et édition directe couleurs/typos.
   Contexte : le chemin onboarding ne lisait pas les CSS externes → palette
   inventée affichée sous « Couleurs détectées » (bug du 24/07). */

const CHARTER = {
  confidence: "low",
  color_primary: "#2F4A3C",
  color_secondary: "#E8B96A",
  color_accent: "#D98C6A",
  color_background: "#FBF7F0",
  font_title: "Libre Baskerville",
  font_body: "Inter",
  mood_keywords: ["joyeux", "éthique"],
};

describe("normalizeHex", () => {
  it("accepte #rrggbb, ajoute le #, étend #rgb, rejette l'invalide", () => {
    expect(normalizeHex("#fb3d80")).toBe("#FB3D80");
    expect(normalizeHex("fb3d80")).toBe("#FB3D80");
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("")).toBeNull();
    expect(normalizeHex("pas-une-couleur")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
  });
});

describe("CharterSection — provenance honnête", () => {
  it("confidence low → « palette proposée », jamais « détectées »", () => {
    render(<CharterSection data={CHARTER} />);
    expect(screen.getByText(/palette proposée d'après ton univers/i)).toBeTruthy();
    expect(screen.queryByText(/couleurs détectées/i)).toBeNull();
    expect(screen.getByText(/je n'ai pas pu lire les couleurs exactes de ton site/i)).toBeTruthy();
  });

  it("confidence high → « couleurs détectées sur ton site », sans avertissement", () => {
    render(<CharterSection data={{ ...CHARTER, confidence: "high" }} />);
    expect(screen.getByText(/couleurs détectées sur ton site/i)).toBeTruthy();
    expect(screen.queryByText(/je n'ai pas pu lire les couleurs exactes/i)).toBeNull();
  });
});

describe("CharterSection — édition directe", () => {
  it("sans onUpdate, pas de bouton Modifier (lecture seule)", () => {
    render(<CharterSection data={CHARTER} />);
    expect(screen.queryByText(/modifier/i)).toBeNull();
  });

  it("modifie une couleur (hex sans #) et une typo, normalise à la validation", () => {
    const onUpdate = vi.fn();
    render(<CharterSection data={CHARTER} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText(/modifier/i));

    const primaryInput = screen.getByDisplayValue("#2F4A3C");
    fireEvent.change(primaryInput, { target: { value: "fb3d80" } });
    const bodyFontInput = screen.getByDisplayValue("Inter");
    fireEvent.change(bodyFontInput, { target: { value: "IBM Plex Mono" } });
    fireEvent.click(screen.getByText("OK"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const updated = onUpdate.mock.calls[0][0];
    expect(updated.color_primary).toBe("#FB3D80");
    expect(updated.color_secondary).toBe("#E8B96A"); // inchangée
    expect(updated.font_body).toBe("IBM Plex Mono");
  });

  it("champ vidé → couleur retirée ; champ invalide → retiré aussi (pas de valeur cassée)", () => {
    const onUpdate = vi.fn();
    render(<CharterSection data={CHARTER} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText(/modifier/i));

    fireEvent.change(screen.getByDisplayValue("#E8B96A"), { target: { value: "" } });
    fireEvent.change(screen.getByDisplayValue("#D98C6A"), { target: { value: "n'importe quoi" } });
    fireEvent.click(screen.getByText("OK"));

    const updated = onUpdate.mock.calls[0][0];
    expect(updated.color_secondary).toBeUndefined();
    expect(updated.color_accent).toBeUndefined();
    expect(updated.color_primary).toBe("#2F4A3C");
  });

  it("Annuler ne propage rien", () => {
    const onUpdate = vi.fn();
    render(<CharterSection data={CHARTER} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText(/modifier/i));
    fireEvent.change(screen.getByDisplayValue("#2F4A3C"), { target: { value: "#111111" } });
    fireEvent.click(screen.getByText(/annuler/i));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("aucune couleur détectée + onUpdate → propose d'ajouter ses couleurs ici", () => {
    const onUpdate = vi.fn();
    render(<CharterSection data={{ confidence: "low", font_title: "Lora" }} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText(/ajouter mes couleurs/i));
    fireEvent.change(screen.getAllByPlaceholderText(/vide = retirer/i)[0], { target: { value: "#91014B" } });
    fireEvent.click(screen.getByText("OK"));
    expect(onUpdate.mock.calls[0][0].color_primary).toBe("#91014B");
  });
});
