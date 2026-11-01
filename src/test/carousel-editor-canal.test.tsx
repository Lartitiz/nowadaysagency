// Carrousel LinkedIn : aucune aide propre à Instagram dans l'éditeur (01/11/2026).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(cleanup);

const slides = Array.from({ length: 12 }, (_, i) => ({ slide_number: i + 1, title: `Slide ${i + 1}`, body: "Texte" }));
const visuals = slides.map((s) => ({ slide_number: s.slide_number, html: `<div><h1 data-slide-text="title">${s.title}</h1></div>` }));
const editor = (channel?: "linkedin" | "instagram") =>
  render(<CarouselEditor result={{ slides, caption: {} } as any} visualSlides={visuals} onChange={() => {}} channel={channel} />);

describe("éditeur de carrousel selon le canal", () => {
  it("LinkedIn : ni aperçu Instagram, ni renvoi vers l'appli, légende sur LinkedIn", () => {
    const { container } = editor("linkedin");
    expect(container.textContent).not.toMatch(/instagram/i);
    expect(screen.queryByLabelText("Aperçu Instagram")).toBeNull();
    expect(container.textContent).toContain("ton carrousel sur LinkedIn");
  });

  it("Instagram : l'aperçu et l'aide restent", () => {
    const { container } = editor("instagram");
    expect(screen.getByLabelText("Aperçu Instagram")).toBeTruthy();
    expect(container.textContent).toContain("appli Instagram");
  });
});
