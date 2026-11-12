import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CreerStepResult from "@/components/creer/CreerStepResult";
import { resolveSafeStep } from "@/features/creer/creer-step";

// Chantier 2 des stories (12/11/2026) : une seule façon de retoucher le texte
// d'une séquence, la case « Texte de la story » de chaque story. Le bouton
// « Éditer le texte » (grand texte « --- STORY 1 --- ») ne s'affiche plus
// pour les stories ; les autres formats le gardent.
vi.mock("@/components/creer/formatRenderers/StoryResult", () => ({ default: () => <p>Stories</p> }));
vi.mock("@/components/creer/formatRenderers/PostResult", () => ({ default: () => <p>Post</p> }));
vi.mock("@/components/creer/ResultActions", () => ({ default: () => null }));
vi.mock("@/components/creer/GenerationTimeHint", () => ({ default: () => null }));
vi.mock("@/components/Confetti", () => ({ default: () => null }));

afterEach(cleanup);

function mount(format: string, result: unknown) {
  return render(
    <MemoryRouter>
      <CreerStepResult
        result={result}
        format={format}
        generating={false}
        onEdit={vi.fn()}
        onReset={vi.fn()}
        onRegenerate={vi.fn()}
        onCopy={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("Stories : une seule façon de modifier le texte", () => {
  it("ne montre pas « Éditer le texte » pour une séquence de stories", () => {
    mount("story", { stories: [{ text: "Première story" }] });
    expect(screen.getByText("Stories")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Éditer le texte/ })).not.toBeInTheDocument();
  });

  it("garde « Éditer le texte » pour un post", () => {
    mount("post", { content: "Mon post" });
    expect(screen.getByRole("button", { name: /Éditer le texte/ })).toBeInTheDocument();
  });

  it("un brouillon de stories resté sur l'ancienne étape « Modifier » rouvre le résultat", () => {
    const flags = { canalConflict: false, hasIdea: true, photoCount: 0 };
    const base = { step: "edit", selectedFormat: "story", editContent: "--- STORY 1 (texte) ---\nBonjour" } as any;
    expect(resolveSafeStep({ ...base, result: { raw: { stories: [] } } }, flags)).toBe("result");
    expect(resolveSafeStep(base, flags)).toBe("format");
    expect(resolveSafeStep({ ...base, selectedFormat: "post" }, flags)).toBe("edit");
  });
});
