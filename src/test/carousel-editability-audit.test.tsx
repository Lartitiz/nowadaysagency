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
const visuals = photoSlides.map((s) => ({
  slide_number: s.slide_number,
  html: `<div style="background:#ffffff"><p data-slide-text="overlay">${s.overlay_text}</p></div>`,
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
    const onVisualSlidesUpdate = vi.fn();
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
        onVisualSlidesUpdate={onVisualSlidesUpdate}
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
    expect(onVisualSlidesUpdate).not.toHaveBeenCalled();
  });

  it("A2: une ancre incompatible déclenche une alerte de visuel périmé", () => {
    const onSlidesUpdate = vi.fn();
    const onVisualSlidesUpdate = vi.fn();
    const { container } = render(
      <CarouselResult
        result={{ slides: textSlides, caption }}
        visualSlides={[
          {
            slide_number: 1,
            html: "<div><h1>Autre formulation visuelle</h1></div>",
          },
        ]}
        onSlidesUpdate={onSlidesUpdate}
        onVisualSlidesUpdate={onVisualSlidesUpdate}
      />,
    );
    editInline(container, "Mon titre corrigé");
    expect(onSlidesUpdate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ title: "Mon titre corrigé" }),
      ]),
      caption,
    );
    expect(onVisualSlidesUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Une slide n’a pas pu être actualisée",
    );
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

  it("A4: une édition de texte conserve l'alerte de couleurs non rendues", () => {
    function Harness() {
      const [result, setResult] = useState({ slides: photoSlides, caption });
      const [html, setHtml] = useState(visuals);
      const [colors, setColors] = useState<any>(null);
      const [stale, setStale] = useState(false);
      return (
        <>
          <output data-testid="stale">{String(stale)}</output>
          <output data-testid="html">{html[0].html}</output>
          <CarouselPhotoResult
            result={result}
            visualSlides={html}
            colors={colors}
            onColorsChange={setColors}
            onSlidesUpdate={(slides, caption) => setResult({ slides, caption })}
            onVisualSlidesUpdate={setHtml}
            onStaleChange={setStale}
            onRegenerateVisuals={() => {}}
          />
        </>
      );
    }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Couleur Principale"), {
      target: { value: "#ff0000" },
    });
    expect(screen.getByTestId("stale").textContent).toBe("true");
    fireEvent.change(screen.getByLabelText("Texte de la slide 1"), {
      target: { value: "Texte corrigé" },
    });
    expect(screen.getByTestId("stale").textContent).toBe("true");
    expect(screen.getByTestId("html").textContent).toContain("#ffffff");
    expect(screen.getByTestId("html").textContent).not.toContain("#ff0000");
  });

  it("A5: la réouverture détecte des visuels anciens", () => {
    const onStaleChange = vi.fn();
    render(
      <CarouselPhotoResult
        result={{
          slides: photoSlides.map((s) => ({
            ...s,
            overlay_text: "Nouveau texte non rendu",
          })),
          caption,
        }}
        visualSlides={visuals}
        onStaleChange={onStaleChange}
        onRegenerateVisuals={() => {}}
      />,
    );
    expect(screen.getByLabelText("Texte de la slide 1")).toHaveValue(
      "Nouveau texte non rendu",
    );
    expect(onStaleChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByText(/depuis le dernier rendu visuel/)).toBeTruthy();
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

  it("A8: les numéros inscrits dans les visuels suivent le déplacement de slide", () => {
    const onVisualSlidesUpdate = vi.fn();
    const vs = textSlides.map((s) => ({
      slide_number: s.slide_number,
      html: `<div><p data-slide-text="title">${s.title}</p><span>${s.slide_number} / 3</span></div>`,
    }));
    render(
      <CarouselResult
        result={{ slides: textSlides, caption }}
        visualSlides={vs}
        onVisualSlidesUpdate={onVisualSlidesUpdate}
      />,
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Descendre la slide" })[0],
    );
    const output = onVisualSlidesUpdate.mock.calls.at(-1)![0];
    expect(output[0].slide_number).toBe(1);
    expect(output[0].html).toContain("1 / 3");
  });
});
