// Bouton d'appel à l'action du carrousel texte (lot 8, 14/10/2026) : son
// libellé ne vit plus seulement dans le HTML du visuel. Le modifier ou le
// retirer depuis l'écran de résultat range aussi le libellé dans la slide
// (cta_label, même champ que patchElement de l'éditeur visuel ; "" = retiré).
// Aucun appel réseau.
import React from "react";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CarouselResult from "@/components/creer/formatRenderers/CarouselResult";
import { getSlideCtaText, hasSlideCta } from "@/lib/carousel-html-edit";
import { visualSlidePayload } from "@/lib/visual-slide-payload";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);

const caption = { hook: "Dans mon atelier", body: "Ma méthode.", cta: "", hashtags: [] };
const slides = [1, 2].map((n) => ({ slide_number: n, title: `Titre ${n}`, body: `Texte ${n}` }));
const visuals = [
  { slide_number: 1, html: `<div><h1 data-slide-text="title">Titre 1</h1></div>` },
  { slide_number: 2, html: `<div><h1 data-slide-text="title">Titre 2</h1><div data-slide-cta="1"><span data-slide-text="cta">Enregistre ce post</span></div></div>` },
];

function ctaField(container: HTMLElement): HTMLElement {
  const fields = Array.from(container.querySelectorAll<HTMLElement>('[contenteditable="true"]'));
  const el = fields.find((f) => f.getAttribute("data-placeholder") === "Texte du bouton…");
  if (!el) throw new Error("champ du bouton introuvable");
  return el;
}

describe("carrousel texte — libellé du bouton dans les données", () => {
  it("modifier le bouton met à jour le visuel ET la slide (cta_label)", () => {
    const onSlidesUpdate = vi.fn();
    const onVisualSlidesUpdate = vi.fn();
    const { container } = render(
      <CarouselResult result={{ slides, caption }} visualSlides={visuals} onSlidesUpdate={onSlidesUpdate} onVisualSlidesUpdate={onVisualSlidesUpdate} />,
    );
    const el = ctaField(container);
    fireEvent.focus(el);
    el.innerText = "Dis-moi en commentaire";
    fireEvent.blur(el);

    const nextVisuals = onVisualSlidesUpdate.mock.calls.at(-1)![0];
    expect(getSlideCtaText(nextVisuals[1].html)).toBe("Dis-moi en commentaire");
    const nextSlides = onSlidesUpdate.mock.calls.at(-1)![0];
    expect(nextSlides[1]).toMatchObject({ slide_number: 2, title: "Titre 2", cta_label: "Dis-moi en commentaire" });
    expect(nextSlides[0].cta_label).toBeUndefined();
    expect(onSlidesUpdate.mock.calls.at(-1)![1]).toEqual(caption);
  });

  it("retirer le bouton l'enlève du visuel et vide cta_label", () => {
    const onSlidesUpdate = vi.fn();
    const onVisualSlidesUpdate = vi.fn();
    render(
      <CarouselResult result={{ slides, caption }} visualSlides={visuals} onSlidesUpdate={onSlidesUpdate} onVisualSlidesUpdate={onVisualSlidesUpdate} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retirer le bouton d'appel à l'action" }));
    expect(hasSlideCta(onVisualSlidesUpdate.mock.calls.at(-1)![0][1].html)).toBe(false);
    expect(onSlidesUpdate.mock.calls.at(-1)![0][1].cta_label).toBe("");
  });

  it("sans visuel modifiable, rien n'est écrit dans les données (pas de libellé fantôme)", () => {
    const onSlidesUpdate = vi.fn();
    const { container } = render(<CarouselResult result={{ slides, caption }} visualSlides={visuals} onSlidesUpdate={onSlidesUpdate} />);
    const el = ctaField(container);
    fireEvent.focus(el);
    el.innerText = "Autre libellé";
    fireEvent.blur(el);
    expect(onSlidesUpdate).not.toHaveBeenCalled();
  });

  it("la mise en forme d'une slide texte ne reçoit pas cta_label : le rendu ne change pas", () => {
    const payload = visualSlidePayload({ ...slides[1], cta_label: "Dis-moi en commentaire" }, "text_only", undefined);
    expect(payload).not.toHaveProperty("cta_label");
  });
});
