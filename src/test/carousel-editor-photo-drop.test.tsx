// Lot E2 (14/10/2026) : on fige le comportement de l'éditeur avant son découpage.
// Glisser-déposer d'une photo depuis l'ordinateur sur l'aperçu d'une slide :
// elle remplit le cadre visé, s'ajoute aux photos du carrousel et s'annule.
import React, { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { readCarouselDocument } from "@/lib/carousel-editor";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
// La compression passe par un canvas, absent de jsdom : le fichier est gardé tel quel.
vi.mock("@/lib/image-compress", () => ({ compressImageFile: vi.fn(async (f: File) => f) }));
vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const OLD1 = "https://example.com/un.jpg", OLD2 = "https://example.com/deux.jpg";
const raw = { slides: [{ slide_number: 1, title: "Deux cadres", photo_index: 1 }], caption: { body: "L" } };
const twoFrames =
  '<div style="position:relative;width:1080px;height:1350px">' +
  `<div data-pptx-photo="1" style="position:absolute;left:0;top:0;width:540px;height:700px;background-image:url(&quot;${OLD1}&quot;);background-size:cover"></div>` +
  `<div data-pptx-photo="2" style="position:absolute;left:540px;top:0;width:540px;height:700px;background-image:url(&quot;${OLD2}&quot;);background-size:cover;background-position:10% 90%"></div>` +
  '<h1 data-slide-text="title" style="position:absolute;left:80px;top:800px">Deux cadres</h1></div>';
const withEmptyFrame =
  '<div style="position:relative;width:1080px;height:1350px">' +
  `<div data-pptx-photo="1" style="position:absolute;left:0;top:0;width:540px;height:700px;background-image:url(&quot;${OLD1}&quot;);background-size:cover"></div>` +
  '<div data-editor-photo="1" data-editor-photo-empty="1" style="position:absolute;left:560px;top:100px;width:400px;height:400px;background-color:#ececec"></div>' +
  '<h1 data-slide-text="title" style="position:absolute;left:80px;top:800px">Deux cadres</h1></div>';

function Harness({ html, locked = false, onAddPhoto }: { html: string; locked?: boolean; onAddPhoto?: (p: any) => number }) {
  const start = locked ? { ...raw, slides: [{ ...raw.slides[0], editor_locked: true }] } : raw;
  const [r, setR] = useState<any>(start), [v, setV] = useState([{ slide_number: 1, html }]);
  return (
    <>
      <output data-testid="saved">{JSON.stringify({ v, slides: r.slides })}</output>
      <CarouselEditor result={r} visualSlides={v} photos={[]} onAddPhoto={onAddPhoto} onChange={(a, b) => { setR(a); setV(b); }} />
    </>
  );
}
const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;
function setup(html: string, opts: { locked?: boolean; onAddPhoto?: (p: any) => number } = {}) {
  const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);
  render(<Harness html={html} {...opts} />);
  const iframe = screen.getByTitle("Éditeur de la slide 1") as HTMLIFrameElement;
  const doc = iframe.contentDocument!;
  const start = opts.locked ? { ...raw, slides: [{ ...raw.slides[0], editor_locked: true }] } : raw;
  doc.body.innerHTML = readCarouselDocument(start, [{ slide_number: 1, html }]).slides[0].html;
  doc.querySelectorAll<HTMLElement>("[data-pptx-photo],[data-editor-photo]").forEach((el) => {
    el.getBoundingClientRect = () => rect(parseFloat(el.style.left) || 0, parseFloat(el.style.top) || 0, parseFloat(el.style.width) || 0, parseFloat(el.style.height) || 0);
  });
  fireEvent.load(iframe);
  return { width, doc, iframe };
}
const png = () => new File([new Uint8Array([137, 80, 78, 71])], "atelier.png", { type: "image/png" });
// jsdom n'a ni DragEvent ni DataTransfer : un Event du même nom qui porte les fichiers.
const drag = (target: EventTarget, type: string, files: File[], x = 800, y = 300) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { clientX: x, clientY: y, dataTransfer: { types: ["Files"], files, dropEffect: "none" } });
  act(() => { target.dispatchEvent(e); });
  return e;
};
const saved = () => JSON.parse(screen.getByTestId("saved").textContent!);
const savedDoc = () => new DOMParser().parseFromString(saved().v[0].html, "text/html");
const frame = (n: string) => savedDoc().querySelector<HTMLElement>(`[data-pptx-photo="${n}"]`);

describe("glisser une photo depuis l'ordinateur", () => {
  it("la photo lâchée sur un cadre remplit CE cadre, avec un cadrage remis au centre", async () => {
    const onAddPhoto = vi.fn((_photo: any) => 7);
    const { width, doc } = setup(twoFrames, { onAddPhoto });
    try {
      const second = doc.querySelector<HTMLElement>('[data-pptx-photo="2"]')!;
      doc.elementsFromPoint = () => [second];
      drag(doc, "drop", [png()]);
      await waitFor(() => expect(frame("7")).not.toBeNull());
      expect(onAddPhoto).toHaveBeenCalledTimes(1);
      expect(onAddPhoto.mock.calls[0][0]).toMatchObject({ name: "atelier.png", mimeType: "image/png" });
      expect(onAddPhoto.mock.calls[0][0].base64).toMatch(/^data:image\/png;base64,/);
      const filled = frame("7")!;
      expect(filled.style.backgroundImage).toContain("data:image/png;base64,");
      expect(filled.style.backgroundPosition).toBe("50% 50%");
      expect(filled.style.left).toBe("540px");
      // L'autre cadre est intact.
      expect(frame("1")!.style.backgroundImage).toContain(OLD1);
      expect(savedDoc().body.innerHTML).not.toContain(OLD2);
      expect(toast.success).toHaveBeenCalledWith("Photo ajoutée à la slide");
    } finally { width.mockRestore(); }
  });
  it("sans cadre sous le pointeur, un cadre vide reçoit la photo en priorité", async () => {
    const onAddPhoto = vi.fn(() => 3);
    const { width, doc } = setup(withEmptyFrame, { onAddPhoto });
    try {
      drag(doc, "drop", [png()]);
      await waitFor(() => expect(savedDoc().querySelector("[data-editor-photo-empty]")).toBeNull());
      const filled = savedDoc().querySelector<HTMLElement>('[data-pptx-photo="3"],[data-editor-photo="3"]')!;
      expect(filled.style.backgroundImage).toContain("data:image/png;base64,");
      expect(filled.style.left).toBe("560px");
      expect(frame("1")!.style.backgroundImage).toContain(OLD1);
    } finally { width.mockRestore(); }
  });
  it("sans cadre visé ni cadre vide : la première photo de la slide est remplacée", async () => {
    const onAddPhoto = vi.fn(() => 4);
    const { width, doc } = setup(twoFrames, { onAddPhoto });
    try {
      drag(doc, "drop", [png()]);
      await waitFor(() => expect(frame("4")).not.toBeNull());
      expect(frame("4")!.style.left).toBe("0px");
      expect(frame("2")!.style.backgroundImage).toContain(OLD2);
    } finally { width.mockRestore(); }
  });
  it("le dépôt s'annule en une fois et la photo d'avant revient", async () => {
    const { width, doc } = setup(twoFrames, { onAddPhoto: () => 5 });
    try {
      doc.elementsFromPoint = () => [doc.querySelector<HTMLElement>('[data-pptx-photo="2"]')!];
      drag(doc, "drop", [png()]);
      await waitFor(() => expect(frame("5")).not.toBeNull());
      fireEvent.click(screen.getByLabelText("Annuler la modification"));
      expect(frame("5")).toBeNull();
      expect(frame("2")!.style.backgroundImage).toContain(OLD2);
      expect(frame("2")!.style.backgroundPosition).toBe("10% 90%");
    } finally { width.mockRestore(); }
  });
  it("survol avec un fichier : le cadre visé s'éclaire (« Dépose la photo dans ce cadre »), puis s'éteint", () => {
    const { width, doc } = setup(twoFrames, { onAddPhoto: () => 2 });
    try {
      doc.elementsFromPoint = () => [doc.querySelector<HTMLElement>('[data-pptx-photo="2"]')!];
      const over = drag(doc, "dragover", [png()]);
      expect(over.defaultPrevented).toBe(true);
      const target = screen.getByTestId("photo-drop-target");
      expect(target.textContent).toBe("Dépose la photo dans ce cadre");
      expect(target.style.left).toBe("270px");
      expect(target.style.width).toBe("270px");
      act(() => { doc.dispatchEvent(new Event("dragleave", { bubbles: true })); });
      expect(screen.queryByTestId("photo-drop-target")).toBeNull();
    } finally { width.mockRestore(); }
  });
  it("un fichier qui n'est pas une image est ignoré", async () => {
    const onAddPhoto = vi.fn(() => 2);
    const { width, doc } = setup(twoFrames, { onAddPhoto });
    try {
      const before = screen.getByTestId("saved").textContent;
      const e = drag(doc, "drop", [new File(["x"], "notes.pdf", { type: "application/pdf" })]);
      expect(e.defaultPrevented).toBe(false);
      await new Promise((r) => setTimeout(r, 20));
      expect(onAddPhoto).not.toHaveBeenCalled();
      expect(screen.getByTestId("saved").textContent).toBe(before);
    } finally { width.mockRestore(); }
  });
  it("une image d'un format non pris en charge est refusée avec un message", async () => {
    const onAddPhoto = vi.fn(() => 2);
    const { width, doc } = setup(twoFrames, { onAddPhoto });
    try {
      drag(doc, "drop", [new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })]);
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Format non pris en charge. Choisis une photo JPG, PNG ou WEBP."));
      expect(onAddPhoto).not.toHaveBeenCalled();
    } finally { width.mockRestore(); }
  });
  it("slide verrouillée : la photo n'est pas posée", async () => {
    const onAddPhoto = vi.fn(() => 2);
    const { width, doc } = setup(twoFrames, { onAddPhoto, locked: true });
    try {
      const over = drag(doc, "dragover", [png()]);
      expect(over.defaultPrevented).toBe(false);
      drag(doc, "drop", [png()]);
      await new Promise((r) => setTimeout(r, 20));
      expect(onAddPhoto).not.toHaveBeenCalled();
      expect(frame("1")!.style.backgroundImage).toContain(OLD1);
    } finally { width.mockRestore(); }
  });
  it("sans ajout de photo possible (pas d'onAddPhoto), le dépôt ne fait rien", async () => {
    const { width, doc } = setup(twoFrames);
    try {
      const before = screen.getByTestId("saved").textContent;
      const e = drag(doc, "drop", [png()]);
      expect(e.defaultPrevented).toBe(false);
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.getByTestId("saved").textContent).toBe(before);
    } finally { width.mockRestore(); }
  });
  it("si l'ajout aux photos du carrousel échoue (index 0), la slide ne change pas", async () => {
    const onAddPhoto = vi.fn(() => 0);
    const { width, doc } = setup(twoFrames, { onAddPhoto });
    try {
      const before = screen.getByTestId("saved").textContent;
      drag(doc, "drop", [png()]);
      await waitFor(() => expect(onAddPhoto).toHaveBeenCalled());
      expect(screen.getByTestId("saved").textContent).toBe(before);
      expect(toast.success).not.toHaveBeenCalled();
    } finally { width.mockRestore(); }
  });
  it("lâchée à côté de l'aperçu (sur son bord), la photo va dans le cadre choisi", async () => {
    const onAddPhoto = vi.fn(() => 6);
    const { width, doc, iframe } = setup(twoFrames, { onAddPhoto });
    try {
      const second = doc.querySelector<HTMLElement>('[data-pptx-photo="2"]')!;
      act(() => { second.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 800, clientY: 300, button: 0 })); });
      act(() => { second.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, clientX: 800, clientY: 300, button: 0 })); });
      fireEvent.drop(iframe.parentElement!, { dataTransfer: { types: ["Files"], files: [png()] } });
      await waitFor(() => expect(frame("6")).not.toBeNull());
      expect(frame("6")!.style.left).toBe("540px");
      expect(frame("1")!.style.backgroundImage).toContain(OLD1);
    } finally { width.mockRestore(); }
  });
});
