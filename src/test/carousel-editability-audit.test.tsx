// Regression coverage from the eight defects reproduced in the carousel audit.
// No network calls.
import React, { useState } from "react";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CarouselResult from "@/components/creer/formatRenderers/CarouselResult";
import CarouselPhotoResult from "@/components/creer/formatRenderers/CarouselPhotoResult";
import { replaceSlideText } from "@/lib/carousel-html-edit";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
vi.mock("@/components/creer/NewsPhotoPickerDialog", () => ({
  default: () => null,
}));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({
  PhotoLibraryPickerDialog: () => null,
}));
vi.mock("@/hooks/use-workspace-query", () => ({
  useWorkspaceId: () => "audit-fixture",
}));
vi.mock("@/lib/photo-storage", () => ({ userPhotoToBase64: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({
  invokeWithTimeout: vi.fn(() => {
    throw new Error("Network forbidden in audit");
  }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(cleanup);

const caption = {
  hook: "Dans mon atelier",
  body: "Je partage ici ma méthode et mes inspirations pour créer des objets faits à la main avec patience.",
  cta: "",
  hashtags: [],
};
const textSlides = [1, 2, 3].map((n) => ({
  slide_number: n,
  title: `Titre ${n}`,
  body: `Texte ${n}`,
}));
const photoSlides = [1, 2].map((n) => ({
  slide_number: n,
  slide_type: "photo_full",
  photo_index: n,
  overlay_text: `Texte ${n}`,
}));

function editInline(container: HTMLElement, value: string) {
  const el = container.querySelector('[contenteditable="true"]') as HTMLElement;
  fireEvent.focus(el);
  el.innerText = value;
  fireEvent.blur(el);
}

describe("Audit carrousel — reproductions de défauts", () => {
  it("A1: la correction automatique met réellement à jour les slides et le parent", () => {
    const onSlidesUpdate = vi.fn();
    const result = {
      slides: [
        { ...textSlides[0], title: "Dans un monde où tout va vite" },
        ...textSlides.slice(1),
      ],
      caption,
    };
    const { container } = render(
      <CarouselResult
        result={result}
        onSlidesUpdate={onSlidesUpdate}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Corriger automatiquement/i }),
    );
    expect(screen.getByText(/expression corrigée/)).toBeTruthy();
    expect(
      (container.querySelector('[contenteditable="true"]') as HTMLElement)
        .innerText,
    ).not.toContain("Dans un monde où");
    expect(onSlidesUpdate).toHaveBeenCalled();
  });

  it("A2: carrousel texte — une retouche remonte, sans aperçu ni alerte « périmé »", () => {
    // Partie visuelle retirée le 16/10/2026 : l'écran ne reçoit plus de visuels
    // (dès qu'il y en a, /creer ouvre l'éditeur visuel à la place).
    const onSlidesUpdate = vi.fn();
    const onStaleChange = vi.fn();
    const { container } = render(
      <CarouselResult
        result={{ slides: textSlides, caption }}
        onSlidesUpdate={onSlidesUpdate}
        onStaleChange={onStaleChange}
      />,
    );
    editInline(container, "Mon titre corrigé");
    expect(onSlidesUpdate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ title: "Mon titre corrigé" }),
      ]),
      caption,
    );
    expect(onStaleChange).toHaveBeenCalledWith(false);
    expect(onStaleChange).not.toHaveBeenCalledWith(true);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.queryByText(/Aperçu des visuels/)).toBeNull();
  });

  it("A3: un nouveau résultat remplace les textes même à numérotation identique", () => {
    const { container, rerender } = render(
      <CarouselResult result={{ slides: textSlides, caption }} />,
    );
    rerender(
      <CarouselResult
        result={{
          slides: textSlides.map((s) => ({ ...s, title: "Nouveau contenu" })),
          caption,
        }}
      />,
    );
    expect(
      (container.querySelector('[contenteditable="true"]') as HTMLElement)
        .innerText,
    ).toBe("Nouveau contenu");
  });

  it("A3 bis: carrousel photo — un nouveau résultat qui ne change que les textes est affiché", () => {
    const { rerender } = render(
      <CarouselPhotoResult result={{ slides: photoSlides, caption }} />,
    );
    rerender(
      <CarouselPhotoResult
        result={{
          slides: photoSlides.map((s) => ({ ...s, overlay_text: "Nouveau contenu" })),
          caption,
        }}
      />,
    );
    expect(screen.getByLabelText("Texte de la slide 1")).toHaveValue("Nouveau contenu");
  });

  it("A3 ter: carrousel photo — l'écho d'une retouche par /creer ne réinitialise rien", () => {
    // Rejoue le vrai onSlidesUpdate de CreerUnifie : nouvelle référence de
    // `result` à chaque retouche, avec les slides et la légende reçues.
    const hashtags = ["#atelier"];
    const linkedinCaption = {
      hook: caption.hook,
      body: caption.body,
      cta: "",
      hashtags,
      fullText: `${caption.hook}\n\n${caption.body}\n\n#atelier`,
    };
    const onSlidesUpdate = vi.fn();
    function Harness() {
      const [result, setResult] = useState<any>({
        raw: { slides: photoSlides, caption: linkedinCaption },
      });
      return (
        <CarouselPhotoResult
          result={result}
          channel="linkedin"
          onSlidesUpdate={(s, c) => {
            onSlidesUpdate(s, c);
            setResult((prev: any) => ({ ...prev, raw: { ...prev.raw, slides: s, caption: c } }));
          }}
        />
      );
    }
    render(<Harness />);
    const tagsInput = screen.getByPlaceholderText("#hashtag1 #hashtag2 #hashtag3");
    // Saisie en cours (virgule finale) : les hashtags enregistrés ne changent pas.
    fireEvent.change(tagsInput, { target: { value: "#atelier," } });
    fireEvent.change(screen.getByLabelText("Texte de la slide 1"), {
      target: { value: "Texte corrigé" },
    });
    expect(screen.getByLabelText("Texte de la slide 1")).toHaveValue("Texte corrigé");
    // La retouche de slide ne réinitialise pas la saisie en cours ailleurs…
    expect(tagsInput).toHaveValue("#atelier,");
    // …et chaque retouche ne remonte qu'une fois (pas de boucle).
    expect(onSlidesUpdate).toHaveBeenCalledTimes(2);
    expect(onSlidesUpdate.mock.calls.at(-1)[0][0].overlay_text).toBe("Texte corrigé");
  });

  // A4 et A5 (16/10/2026) : la partie « visuels » de CarouselPhotoResult a été
  // retirée. Dès qu'il y a des visuels, CreerStepResult ouvre l'éditeur de
  // carrousel ; cet écran n'affiche donc jamais de visuels et signale toujours
  // « à jour », pour lever un état « périmé » laissé par l'éditeur.
  it("A4: couleurs et texte modifiés : la retouche remonte, rien n'est signalé périmé", () => {
    const onStaleChange = vi.fn();
    const onSlidesUpdate = vi.fn();
    function Harness() {
      const [colors, setColors] = useState<any>(null);
      return (
        <CarouselPhotoResult
          result={{ slides: photoSlides, caption }}
          colors={colors}
          onColorsChange={setColors}
          onSlidesUpdate={onSlidesUpdate}
          onStaleChange={onStaleChange}
          onRegenerateVisuals={() => {}}
        />
      );
    }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Couleur Principale"), {
      target: { value: "#ff0000" },
    });
    fireEvent.change(screen.getByLabelText("Texte de la slide 1"), {
      target: { value: "Texte corrigé" },
    });
    expect(onSlidesUpdate.mock.calls.at(-1)[0][0].overlay_text).toBe("Texte corrigé");
    expect(onStaleChange).toHaveBeenCalledWith(false);
    expect(onStaleChange).not.toHaveBeenCalledWith(true);
  });

  it("A5: à l'ouverture, « à jour » est signalé et aucun aperçu ni bannière n'apparaît", () => {
    const onStaleChange = vi.fn();
    const { container } = render(
      <CarouselPhotoResult
        result={{ slides: photoSlides, caption }}
        onStaleChange={onStaleChange}
        onRegenerateVisuals={() => {}}
      />,
    );
    expect(onStaleChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText(/depuis le dernier rendu visuel/)).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("A6: une photo sans texte initial propose un champ pour en ajouter", () => {
    render(
      <CarouselPhotoResult
        result={{
          slides: photoSlides.map((s) => ({ ...s, overlay_text: null })),
          caption,
        }}
      />,
    );
    expect(screen.getByLabelText("Texte de la slide 1")).toHaveValue("");
  });

  it("A7: modifier le texte source corrige son chiffre décoratif dupliqué", () => {
    const html =
      '<div><strong data-pptx-editable="title">40 %</strong><p data-slide-text="body">40 % des pièces sont bleues.</p></div>';
    const updated = replaceSlideText(
      html,
      "body",
      "40 % des pièces sont bleues.",
      "20 % des pièces sont bleues.",
    );
    expect(updated).toContain("20 % des pièces");
    expect(updated).toContain(">20 %</strong>");
  });

  it("A8: déplacer une slide renumérote les slides remontées au parent", () => {
    const onSlidesUpdate = vi.fn();
    render(
      <CarouselResult
        result={{ slides: textSlides, caption }}
        onSlidesUpdate={onSlidesUpdate}
      />,
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Descendre la slide" })[0],
    );
    const output = onSlidesUpdate.mock.calls.at(-1)![0];
    expect(output.map((s: any) => [s.slide_number, s.title])).toEqual([
      [1, "Titre 2"],
      [2, "Titre 1"],
      [3, "Titre 3"],
    ]);
  });
});
