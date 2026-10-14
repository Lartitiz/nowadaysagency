import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PhotoMissingDialog from "@/components/creer/PhotoMissingDialog";

// Fenêtre « Ce carrousel gagnerait à avoir des photos » (lot B du découpage
// de CreerUnifie) : seule fenêtre de /creer sans test en rendu réel.
function mount(rawType: "photo" | "mix" | null) {
  const props = { onOpenChange: vi.fn(), onContinueText: vi.fn(), onAddPhotos: vi.fn() };
  render(<PhotoMissingDialog open rawType={rawType} {...props} />);
  return props;
}

describe("PhotoMissingDialog", () => {
  it.each<["photo" | "mix", string]>([
    ["mix", "mixte (texte + photos)"],
    ["photo", "photo"],
  ])("carrousel %s → nomme « %s »", (rawType, label) => {
    mount(rawType);
    expect(screen.getByText("Ce carrousel gagnerait à avoir des photos")).toBeVisible();
    expect(screen.getByText(label, { selector: "strong" })).toBeVisible();
  });

  it("« Annuler » ferme la fenêtre sans rien lancer", () => {
    const p = mount("photo");
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
    expect(p.onContinueText).not.toHaveBeenCalled();
    expect(p.onAddPhotos).not.toHaveBeenCalled();
  });

  it("« Continuer en texte » appelle onContinueText seulement", () => {
    const p = mount("mix");
    fireEvent.click(screen.getByRole("button", { name: "Continuer en texte" }));
    expect(p.onContinueText).toHaveBeenCalledTimes(1);
    expect(p.onAddPhotos).not.toHaveBeenCalled();
  });

  it("« Ajouter des photos » appelle onAddPhotos seulement", () => {
    const p = mount("mix");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter des photos" }));
    expect(p.onAddPhotos).toHaveBeenCalledTimes(1);
    expect(p.onContinueText).not.toHaveBeenCalled();
  });

  it("fermée : rien n'est affiché", () => {
    render(<PhotoMissingDialog open={false} rawType={null} onOpenChange={vi.fn()} onContinueText={vi.fn()} onAddPhotos={vi.fn()} />);
    expect(screen.queryByText("Ce carrousel gagnerait à avoir des photos")).toBeNull();
  });
});
