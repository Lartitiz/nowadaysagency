import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import {
  addTextElement,
  captionFromText,
  captionText,
  documentOutput,
  getEditorElements,
  makeSlide,
  patchElement,
  prepareSlideHtml,
  readCarouselDocument,
  renumberDocument,
  replacePhoto,
  restyleSlide,
} from "@/lib/carousel-editor";
vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(cleanup);
const html =
  '<style>p{margin:0}</style><div style="position:relative;width:1080px;height:1350px;color:#123456"><h1 data-slide-text="title">Mon <em>atelier</em></h1><p data-slide-text="body">40 % des pièces sont bleues.</p><strong>40 %</strong></div>';
const raw = {
  slides: [
    {
      slide_number: 1,
      title: "Mon atelier",
      body: "40 % des pièces sont bleues.",
    },
    { slide_number: 2, title: "La suite", body: "Une autre idée" },
  ],
  caption: { body: "Une légende" },
};
const visuals = [
  { slide_number: 1, html },
  {
    slide_number: 2,
    html: '<div><h1 data-slide-text="title">La suite</h1><p data-slide-text="body">Une autre idée</p></div>',
  },
];

describe("carousel editor document", () => {
  it("normalizes HTML once without losing styles, emphasis or stable element ids", () => {
    const once = prepareSlideHtml(html),
      twice = prepareSlideHtml(once);
    expect(twice).toBe(once);
    expect(once).toContain("<em>atelier</em>");
    expect(once).toContain("p{margin:0}");
  });
  it("edits a source number and its decorative duplicate atomically", () => {
    const s = readCarouselDocument(raw, visuals).slides[0],
      el = getEditorElements(s.html).find((e) => e.field === "body")!;
    const next = patchElement(s, el.id, {
      text: "20 % des pièces sont bleues.",
    });
    expect(next.data.body).toContain("20 %");
    expect(next.html).not.toContain("40 %");
    expect(s.html).toContain("40 %");
  });
  it("preserves emphasis for an edit outside the emphasized word", () => {
    const s = readCarouselDocument(raw, visuals).slides[0],
      el = getEditorElements(s.html).find((e) => e.field === "title")!;
    expect(patchElement(s, el.id, { text: "Notre atelier" }).html).toContain(
      "<em>atelier</em>",
    );
  });
  it("restores edited HTML, captions, ids and lock state exactly", () => {
    const doc = readCarouselDocument(raw, visuals);
    doc.slides[0] = {
      ...restyleSlide(doc.slides[0], { "background-color": "#cc1122" }),
      locked: true,
    };
    doc.caption = captionFromText(
      "Accroche\n\nUne légende corrigée\n\n#atelier",
    );
    const out = documentOutput(doc, raw),
      restored = readCarouselDocument(out.raw, out.visualSlides);
    expect(restored.slides.map((s) => s.html)).toEqual(
      doc.slides.map((s) => s.html),
    );
    expect(restored.slides[0].id).toBe(doc.slides[0].id);
    expect(restored.slides[0].locked).toBe(true);
    expect(captionText(restored.caption)).toContain("#atelier");
  });
  it("repairs anchored text in a legacy stale preview on import", () => {
    const doc = readCarouselDocument(
      {
        ...raw,
        slides: raw.slides.map((s) => ({ ...s, title: "Titre corrigé" })),
      },
      visuals,
    );
    expect(doc.slides[0].html).toContain("Titre corrigé");
  });
  it("makes a photo background independently movable and removable without losing text", () => {
    const html = prepareSlideHtml(
      '<div data-pptx-photo="1" style="position:relative;background-image:url(data:image/png;base64,AA==)"><p data-slide-text="title">Un titre</p></div>',
    );
    const photo = getEditorElements(html).find((e) => e.kind === "photo")!;
    const s = { id: "s", data: { photo_index: 1 }, html };
    const removed = patchElement(s, photo.id, { remove: true });
    expect(removed.html).toContain("Un titre");
    expect(removed.html).not.toContain("data:image");
  });
  it("replaces only the selected photo and preserves the other slides", () => {
    const s = makeSlide(
      { title: "Texte" },
      "photo_full",
      "data:image/png;base64,AA==",
    );
    const photo = getEditorElements(s.html).find((e) => e.kind === "photo")!;
    const next = replacePhoto(s, photo.id, "data:image/png;base64,BB==", 2);
    expect(next.html).toContain("BB==");
    expect(next.html).not.toContain("AA==");
    expect(next.data.photo_index).toBe(2);
    expect(s.html).toContain("AA==");
  });
  it("honors a slide lock across text, styles, photo replacement and added text", () => {
    const s = { ...makeSlide(), locked: true },
      id = getEditorElements(s.html)[0].id;
    expect(patchElement(s, id, { text: "Autre" })).toBe(s);
    expect(restyleSlide(s, { color: "red" })).toBe(s);
    expect(addTextElement(s)).toBe(s);
    expect(replacePhoto(s, null, "data:image/png;base64,AA==", 1)).toBe(s);
  });
  it("renumbers both data and displayed pagination after reorder", () => {
    const a = makeSlide({ slide_number: 1 }),
      b = makeSlide({ slide_number: 2 });
    const next = renumberDocument({ slides: [b, a], caption: {} });
    expect(next.slides[0].html).toContain(">1 / 2<");
    expect(next.slides[1].data.slide_number).toBe(2);
  });
  it("clears obsolete freeform text when committing structured edits", () => {
    expect(
      documentOutput(readCarouselDocument(raw, visuals), {
        ...raw,
        edited_text: "ancienne légende",
      }).raw.edited_text,
    ).toBeUndefined();
  });
  it("keeps an added text editable after clearing it completely", () => {
    const slide = addTextElement(makeSlide());
    const text = getEditorElements(slide.html).find(
      (e) => e.text === "Ton texte",
    )!;
    const empty = patchElement(slide, text.id, { text: "" });
    expect(
      getEditorElements(empty.html).find((e) => e.id === text.id)?.kind,
    ).toBe("text");
    expect(
      patchElement(empty, text.id, { text: "Nouveau texte" }).html,
    ).toContain("Nouveau texte");
  });
});

function Harness() {
  const [r, setR] = useState<any>(raw),
    [v, setV] = useState(visuals);
  return (
    <>
      <output data-testid="saved">{JSON.stringify({ r, v })}</output>
      <CarouselEditor
        result={r}
        visualSlides={v}
        onChange={(raw, vs) => {
          setR(raw);
          setV(vs);
        }}
      />
    </>
  );
}
describe("carousel editor interaction", () => {
  it("edits a text in the saved document and restores it with undo/redo", () => {
    render(<Harness />);
    const select = screen.getByLabelText(
      "Élément à modifier",
    ) as HTMLSelectElement;
    fireEvent.change(select, {
      target: {
        value: Array.from(select.options).find((o) =>
          o.text.includes("Mon atelier"),
        )!.value,
      },
    });
    fireEvent.change(screen.getByLabelText("Texte sélectionné"), {
      target: { value: "Notre nouvel atelier" },
    });
    expect(screen.getByTestId("saved").textContent).toContain(
      "Notre nouvel atelier",
    );
    fireEvent.click(screen.getByLabelText("Annuler la modification"));
    expect(screen.getByTestId("saved").textContent).not.toContain(
      "Notre nouvel atelier",
    );
    fireEvent.click(screen.getByLabelText("Rétablir la modification"));
    expect(screen.getByTestId("saved").textContent).toContain(
      "Notre nouvel atelier",
    );
  });
  it("duplicates a slide with its visual, selects it, and supports removal and undo", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Dupliquer" }));
    expect(screen.getByLabelText("Sélectionner la slide 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Supprimer$/ }));
    expect(screen.queryByLabelText("Sélectionner la slide 3")).toBeNull();
    fireEvent.click(screen.getByLabelText("Annuler la modification"));
    expect(screen.getByLabelText("Sélectionner la slide 3")).toBeTruthy();
  });
  it("writes a caption even when the initial generation supplied none", () => {
    const change = vi.fn();
    render(
      <CarouselEditor
        result={{ slides: raw.slides }}
        visualSlides={visuals}
        onChange={change}
      />,
    );
    fireEvent.change(screen.getByLabelText("Légende du carrousel"), {
      target: { value: "Ma nouvelle légende" },
    });
    expect(change.mock.calls.at(-1)![0].caption.fullText).toBe(
      "Ma nouvelle légende",
    );
  });
});
