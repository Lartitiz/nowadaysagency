// Glisser une vignette pour changer l'ordre : geste commun au carrousel et aux stories
// (27/11/2026, src/components/creer/thumb-reorder.ts). Le carrousel est couvert par
// carousel-thumbs.test.tsx ; ici la règle « où lâcher » et le glisser des stories.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import StoryResult from "@/components/creer/formatRenderers/StoryResult";
import { edgeScrollSpeed, thumbClick, thumbDragHandlers, thumbIndexAt, type ThumbReorder } from "@/components/creer/thumb-reorder";

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
function Harness({ one }: { one?: boolean }) {
  const [list, setList] = useState<any[]>(one ? [story("Première")] : [story("Première"), story("Deuxième"), story("Troisième")]);
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
    // Le geste est annoncé en toutes lettres, comme sous les vignettes des slides.
    expect(screen.getByText("Glisse une vignette pour changer l’ordre.")).toBeVisible();
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
    expect(screen.queryByText("Glisse une vignette pour changer l’ordre.")).toBeNull();
    fireEvent.pointerDown(thumbs[2], { clientX: 170, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(thumbs[2], { clientX: 10, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(thumbs[2], { clientX: 10, clientY: 50, pointerId: 1 });
    expect(saved()).toEqual(["Première", "Deuxième", "Troisième"]);
  });
});

it("une seule story : rien à glisser, la phrase n'est pas écrite", () => {
  render(<Harness one />);
  expect(document.querySelectorAll("[data-story-thumb]")).toHaveLength(1);
  expect(screen.queryByText("Glisse une vignette pour changer l’ordre.")).toBeNull();
});

describe("le clic qui suit un glissé", () => {
  const pointer = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, currentTarget: { setPointerCapture() {} } }) as any;
  function gesture() {
    const r: ThumbReorder = {
      thumbDrag: { current: null }, justDragged: { current: false },
      setDragSlide: () => {}, setDropAt: () => {}, thumbIndexAt: () => 3, count: () => 4, reorder: vi.fn(),
    };
    const h = thumbDragHandlers(r, 0);
    h.onPointerDown(pointer(0, 0)); h.onPointerMove(pointer(40, 0)); h.onPointerUp(pointer(300, 0));
    return r;
  }
  it("le clic qui termine le glissé n'ouvre rien", () => {
    const r = gesture(); const open = vi.fn();
    thumbClick(r, open)();
    expect(open).not.toHaveBeenCalled();
    expect(r.reorder).toHaveBeenCalledWith(0, 2);
  });
  it("si ce clic n'arrive pas (vignette déplacée dans la page), le clic suivant n'est pas avalé", async () => {
    const r = gesture(); const open = vi.fn();
    await new Promise((done) => setTimeout(done, 5));
    thumbClick(r, open)();
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe("glisser près du bord de l'écran : la page défile", () => {
  it("vitesse : vers le haut près du haut, vers le bas près du bas, rien au milieu, plus vite au bord", () => {
    expect(edgeScrollSpeed(450, 900)).toBe(0);
    expect(edgeScrollSpeed(60, 900)).toBeLessThan(0);
    expect(edgeScrollSpeed(840, 900)).toBeGreaterThan(0);
    expect(Math.abs(edgeScrollSpeed(5, 900))).toBeGreaterThan(Math.abs(edgeScrollSpeed(100, 900)));
    expect(edgeScrollSpeed(895, 900)).toBeGreaterThan(edgeScrollSpeed(800, 900));
  });
  it("s'arrête quand la vignette du bout est entièrement visible, repart si elle est encore cachée", () => {
    // Vers le bas : dernière vignette finie à 700 px (visible) → arrêt ; à 880 px (sous la barre) → ça défile.
    expect(edgeScrollSpeed(840, 900, { top: -300, bottom: 700 })).toBe(0);
    expect(edgeScrollSpeed(840, 900, { top: -300, bottom: 880 })).toBeGreaterThan(0);
    // Vers le haut : première vignette à 180 px (visible) → arrêt ; à -40 px (au-dessus de l'écran) → ça défile.
    expect(edgeScrollSpeed(60, 900, { top: 180, bottom: 1100 })).toBe(0);
    expect(edgeScrollSpeed(60, 900, { top: -40, bottom: 1100 })).toBeLessThan(0);
  });
  const pointer = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, currentTarget: { setPointerCapture() {} } }) as any;
  const base = (): ThumbReorder => ({
    thumbDrag: { current: null }, justDragged: { current: false },
    setDragSlide: () => {}, setDropAt: vi.fn(), thumbIndexAt: () => 0, count: () => 6, reorder: vi.fn(),
  });
  const frame = () => new Promise((done) => requestAnimationFrame(() => done(null)));
  it("stories : la page défile tant que le pointeur reste près du bord, et s'arrête au relâché", async () => {
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const r = { ...base(), edgeScroll: { current: { raf: 0, x: 0, y: 0 } } };
    const h = thumbDragHandlers(r, 5);
    h.onPointerDown(pointer(30, 400)); h.onPointerMove(pointer(30, 20));
    await frame(); await frame(); await frame();
    expect(scrollBy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(scrollBy.mock.calls[0][1]).toBeLessThan(0);
    h.onPointerUp(pointer(30, 20));
    const count = scrollBy.mock.calls.length;
    await frame(); await frame();
    expect(scrollBy.mock.calls.length).toBe(count);
    scrollBy.mockRestore();
  });
  it("carrousel (sans l'option) : la page ne défile jamais", async () => {
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const h = thumbDragHandlers(base(), 5);
    h.onPointerDown(pointer(30, 400)); h.onPointerMove(pointer(30, 20));
    await frame(); await frame();
    expect(scrollBy).not.toHaveBeenCalled();
    h.onPointerUp(pointer(30, 20));
    scrollBy.mockRestore();
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
