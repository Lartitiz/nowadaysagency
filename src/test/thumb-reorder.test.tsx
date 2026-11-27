// Glisser une vignette pour changer l'ordre : geste commun au carrousel et aux stories
// (27/11/2026, src/components/creer/thumb-reorder.ts). Le carrousel est couvert par
// carousel-thumbs.test.tsx ; ici la règle « où lâcher » et le glisser des stories.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import StoryResult from "@/components/creer/formatRenderers/StoryResult";
import { thumbIndexAt } from "@/components/creer/thumb-reorder";

vi.mock("@/hooks/use-branding", () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock("@/hooks/use-user-photos", () => { const data: unknown[] = []; return { useUserPhotos: () => ({ data }) }; });
vi.mock("@/hooks/use-open-in-canva", () => ({ useOpenInCanva: () => ({ openInCanva: vi.fn(), openingCanva: false }) }));
vi.mock("@/lib/story-photos", () => ({ resolveLibraryPhotoUrls: async () => new Map(), urlToDataUrl: async (url: string) => url }));
vi.mock("@/lib/photo-storage", () => ({ getSignedPhotoUrls: async () => new Map() }));
vi.mock("@/lib/export-carousel-png", () => ({ exportStoryPng: vi.fn() }));
vi.mock("@/lib/export-story-pptx", () => ({ exportStoryPptx: vi.fn() }));
vi.mock("@/components/RedFlagsChecker", () => ({ default: () => null, fixRedFlags: (text: string) => text }));
vi.mock("@/components/creer/formatRenderers/StoryPhotoSuggestions", () => ({ default: () => null }));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({ PhotoLibraryPickerDialog: () => null }));

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  // jsdom n'a pas PointerEvent : sans lui, la position du pointeur est perdue.
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  });
});
const width = window.innerWidth;
afterEach(() => { cleanup(); Object.defineProperty(window, "innerWidth", { configurable: true, value: width }); });

const rect = (left: number, top: number, w: number, h: number) => ({ left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
/** Pose des vignettes de 64 × 120 px en colonne (ordinateur) ou en rangée. */
function place(selector: string, layout: "column" | "row") {
  const thumbs = Array.from(document.querySelectorAll<HTMLElement>(selector));
  thumbs.forEach((t, i) => (t.getBoundingClientRect = () => (layout === "column" ? rect(0, i * 130, 64, 120) : rect(i * 74, 0, 64, 120))));
  return thumbs;
}

describe("où lâcher une vignette", () => {
  function Dots({ n }: { n: number }) { return <>{Array.from({ length: n }, (_, i) => <i key={i} data-dot={i} />)}</>; }
  it("en rangée : avant la vignette dont on passe la moitié en largeur, sinon à la fin", () => {
    render(<Dots n={3} />); place("[data-dot]", "row");
    expect(thumbIndexAt("[data-dot]", 10, 50)).toBe(0);
    expect(thumbIndexAt("[data-dot]", 40, 50)).toBe(1);
    expect(thumbIndexAt("[data-dot]", 100, 50)).toBe(1);
    expect(thumbIndexAt("[data-dot]", 400, 50)).toBe(3);
  });
  it("en colonne (reconnue toute seule) : la moitié en hauteur", () => {
    render(<Dots n={3} />); place("[data-dot]", "column");
    expect(thumbIndexAt("[data-dot]", 30, 20, "auto")).toBe(0);
    expect(thumbIndexAt("[data-dot]", 30, 100, "auto")).toBe(1);
    expect(thumbIndexAt("[data-dot]", 30, 200, "auto")).toBe(2);
    expect(thumbIndexAt("[data-dot]", 30, 900, "auto")).toBe(3);
  });
});

const story = (text: string): any => ({ text, face_cam: false, visual: { gabarit: "fond_pills", background: "fond_couleur", body_pill: text } });
function Harness() {
  const [list, setList] = useState<any[]>([story("Première"), story("Deuxième"), story("Troisième")]);
  return (<><output data-testid="saved">{JSON.stringify(list.map((s) => s.text))}</output>
    <StoryResult result={{ stories: list }} onStoriesUpdate={setList} /></>);
}
const saved = () => JSON.parse(screen.getByTestId("saved").textContent!);

describe("stories : glisser une vignette pour changer l'ordre", () => {
  it("ordinateur : la 3e glissée tout en haut passe en premier, puis redescend tout en bas", () => {
    render(<Harness />);
    let thumbs = place("[data-story-thumb]", "column");
    expect(thumbs).toHaveLength(3);
    expect(thumbs[0]).toHaveAttribute("title", "Clique pour ouvrir, glisse pour changer l’ordre");
    fireEvent.pointerDown(thumbs[2], { clientX: 30, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(thumbs[2], { clientX: 30, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(thumbs[2], { clientX: 30, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(thumbs[2], { clientX: 30, clientY: 10, pointerId: 1 });
    expect(saved()).toEqual(["Troisième", "Première", "Deuxième"]);
    // La story déplacée reste celle qu'on regarde.
    expect(screen.getByRole("button", { name: "Voir la story 1" })).toHaveAttribute("aria-current", "step");
    thumbs = place("[data-story-thumb]", "column");
    fireEvent.pointerDown(thumbs[0], { clientX: 30, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(thumbs[0], { clientX: 30, clientY: 800, pointerId: 1 });
    fireEvent.pointerUp(thumbs[0], { clientX: 30, clientY: 800, pointerId: 1 });
    expect(saved()).toEqual(["Première", "Deuxième", "Troisième"]);
  });

  it("un simple clic ouvre toujours la story, sans rien déplacer", () => {
    render(<Harness />);
    const thumbs = place("[data-story-thumb]", "column");
    fireEvent.pointerDown(thumbs[1], { clientX: 30, clientY: 190, pointerId: 1 });
    fireEvent.pointerUp(thumbs[1], { clientX: 30, clientY: 190, pointerId: 1 });
    fireEvent.click(thumbs[1]);
    expect(thumbs[1]).toHaveAttribute("aria-current", "step");
    expect(saved()).toEqual(["Première", "Deuxième", "Troisième"]);
  });

  it("téléphone : pas de glisser (la rangée défile au doigt), l'ordre reste dans le menu « … »", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    render(<Harness />);
    const thumbs = place("[data-story-thumb]", "row");
    expect(thumbs[0]).not.toHaveAttribute("title");
    fireEvent.pointerDown(thumbs[2], { clientX: 170, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(thumbs[2], { clientX: 10, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(thumbs[2], { clientX: 10, clientY: 50, pointerId: 1 });
    expect(saved()).toEqual(["Première", "Deuxième", "Troisième"]);
  });
});

it("les deux bandes de vignettes passent par le geste commun", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
  for (const file of ["components/creer/CarouselEditorParts/SlideStrip.tsx", "components/stories/StoryStrip.tsx"]) {
    const code = read(file);
    expect(code, file).toContain("thumbDragHandlers(");
    expect(code, `${file} : geste réécrit à la main`).not.toMatch(/onPointerMove=/);
  }
});
