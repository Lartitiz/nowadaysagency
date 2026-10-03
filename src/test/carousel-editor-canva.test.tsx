// Audit « comme Canva » (03/10/2026) : chaque calque d'une slide photo se choisit,
// se déplace, se règle et se retire sans casser le texte ni l'export.
import { describe, expect, it } from "vitest";
import {
  addShapeElement,
  duplicateElement,
  getEditorElements,
  makeSlide,
  patchElement,
  positionPhotoText,
  prepareSlideHtml,
  replacePhoto,
  setShapeFill,
  setVeilAlpha,
  veilAlpha,
  type EditorSlide,
} from "@/lib/carousel-editor";
import { parseScrimStyle } from "@/lib/export-carousel-hybrid-pptx";
import { composePhotoSlide } from "../../supabase/functions/_shared/photo-overlay-templates";

const charter = { color_accent: "#5C7A5A", color_primary: "#5C7A5A", font_title: "Georgia", font_body: "Arial" };
const art = { treatment: "editorial", position: "bottom_left", emphasis: null, reason: "t", surface: "veil", alignment: "left" } as const;
const PHOTO = "https://example.com/plat.jpg";

function photoSlide(photo_style?: string, extra: Record<string, unknown> = {}): EditorSlide {
  const { html } = composePhotoSlide(
    {
      slide_number: 2,
      photo_index: 1,
      overlay_text: "Choisir peu demande en revanche de choisir juste : un motif qui vous parle.",
      overlay_position: "top_left",
      photo_style,
      art_direction: art,
      ...extra,
    } as any,
    charter,
    { isFirst: false, isLast: false },
  );
  return { id: "s", data: { overlay_text: "Choisir peu…" }, html: prepareSlideHtml(html.replace(/\{\{PHOTO_1\}\}/g, PHOTO)) };
}
const dom = (html: string) => new DOMParser().parseFromString(html, "text/html");
const find = (slide: EditorSlide, pick: (e: ReturnType<typeof getEditorElements>[number]) => boolean) =>
  getEditorElements(slide.html).find(pick)!;

describe("frosted-glass frame", () => {
  it("is a selectable frame that moves down with its text and keeps the blur aligned", () => {
    const slide = photoSlide("verre");
    const glass = find(slide, (e) => e.role === "glass");
    expect(glass).toBeTruthy();
    expect(glass.frame).toBe(true);
    const moved = patchElement(slide, glass.id, { styles: { position: "absolute", left: "64px", top: "700px" } });
    const doc = dom(moved.html);
    const card = doc.querySelector<HTMLElement>("[data-photo-glass]")!;
    const blur = doc.querySelector<HTMLElement>("[data-photo-glass-blur]")!;
    expect(card.style.top).toBe("700px");
    expect(card.style.bottom).toBe("");
    // Ancré par les deux côtés : il garde sa largeur au lieu de s'étirer.
    expect(card.style.width).toBe("952px");
    expect(card.style.right).toBe("");
    expect(blur.style.top).toBe("-700px");
    expect(blur.style.left).toBe("-64px");
    expect(card.textContent).toContain("Choisir peu");
  });
  it("blur follows photo reframing, zoom and replacement", () => {
    const slide = photoSlide("verre");
    const photo = find(slide, (e) => e.kind === "photo");
    const reframed = patchElement(slide, photo.id, {
      styles: { "background-position": "50% 0%", transform: "scale(1.5)" },
    });
    let blur = dom(reframed.html).querySelector<HTMLElement>("[data-photo-glass-blur]")!;
    expect(blur.style.backgroundPosition).toBe("50% 0%");
    expect(blur.style.transform).toContain("scale(1.5)");
    const replaced = replacePhoto(reframed, photo.id, "https://example.com/autre.jpg", 2);
    blur = dom(replaced.html).querySelector<HTMLElement>("[data-photo-glass-blur]")!;
    expect(blur.style.backgroundImage).toContain("autre.jpg");
  });
  it("keeps a moved glass frame's blur aligned after a position preset", () => {
    const slide = photoSlide("verre");
    const glass = find(slide, (e) => e.role === "glass");
    const moved = patchElement(slide, glass.id, { styles: { left: "120px", top: "300px" } });
    const preset = positionPhotoText(moved, "bottom_left");
    const doc = dom(preset.html);
    expect(doc.querySelector<HTMLElement>("[data-photo-glass-blur]")!.style.left).toBe("-120px");
    expect(doc.querySelector<HTMLElement>("[data-photo-glass-blur]")!.style.bottom).toBe("-200px");
  });
  it("fill opacity makes the glass clearer, and removing the frame keeps the text", () => {
    const slide = photoSlide("verre");
    const glass = find(slide, (e) => e.role === "glass");
    const clearer = setShapeFill(slide, glass.id, "#ffffff", 0.3);
    expect(dom(clearer.html).querySelector<HTMLElement>("[data-photo-glass]")!.style.backgroundColor).toBe("rgba(255, 255, 255, 0.3)");
    const removed = patchElement(slide, glass.id, { remove: true });
    expect(removed.html).not.toContain("data-photo-glass-blur");
    expect(removed.data.overlay_text).toBe("Choisir peu…");
    expect(dom(removed.html).body.textContent).toContain("Choisir peu demande");
  });
});

describe("brand card, column and veil", () => {
  it("removing a brand card keeps its text", () => {
    const slide = photoSlide("carte");
    const card = find(slide, (e) => e.kind === "shape" && !!e.frame);
    const removed = patchElement(slide, card.id, { remove: true });
    expect(removed.data.overlay_text).toBe("Choisir peu…");
    expect(dom(removed.html).body.textContent).toContain("Choisir peu demande");
  });
  it("the column band carries its text so both move together", () => {
    const slide = photoSlide("colonne");
    const band = find(slide, (e) => e.kind === "shape" && !!e.frame);
    expect(band).toBeTruthy();
    const doc = dom(slide.html);
    expect(doc.querySelector('[data-photo-style="colonne"] [data-photo-column-text]')).not.toBeNull();
    expect(prepareSlideHtml(slide.html)).toBe(slide.html);
  });
  it("the veil is listed and its strength stays readable by the PowerPoint export", () => {
    const { html } = composePhotoSlide(
      { slide_number: 1, photo_index: 1, overlay_text: "Le titre de couverture", overlay_position: "bottom_left" } as any,
      charter,
      { isFirst: true, isLast: false },
    );
    const slide: EditorSlide = { id: "c", data: {}, html: prepareSlideHtml(html) };
    const veil = find(slide, (e) => e.role === "veil");
    expect(veil).toBeTruthy();
    const softer = setVeilAlpha(slide, veil.id, 0.4);
    const el = dom(softer.html).querySelector<HTMLElement>("[data-injected-scrim]")!;
    expect(veilAlpha(el.getAttribute("style") || "")).toBeCloseTo(0.4);
    // jsdom ignore les dégradés en CSSOM : on relit la déclaration écrite.
    const gradient = (el.getAttribute("style") || "").match(/linear-gradient\([^;]*\)/)?.[0] || "";
    expect(parseScrimStyle(gradient, "")?.alpha).toBeCloseTo(0.4);
    // Un déplacement par le menu garde l'intensité choisie.
    const preset = positionPhotoText(softer, "top_left");
    expect(veilAlpha(dom(preset.html).querySelector("[data-injected-scrim]")!.getAttribute("style") || "")).toBeCloseTo(0.4);
  });
});

describe("adding and duplicating", () => {
  it("adds a shape under the texts and selects it", () => {
    const slide = photoSlide("verre");
    const out = addShapeElement(slide);
    expect(out.id).toBeTruthy();
    const doc = dom(out.slide.html);
    const shape = doc.querySelector<HTMLElement>(`[data-editor-id="${out.id}"]`)!;
    expect(shape.getAttribute("data-pptx-shape")).toBe("card");
    expect(shape.compareDocumentPosition(doc.querySelector("[data-photo-glass]")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(out.slide.html).not.toContain("data-editor-new");
  });
  it("duplicates a text without linking the copy to the source field", () => {
    const slide = makeSlide({ title: "Titre", body: "Corps" }, "text_only");
    const title = find(slide, (e) => e.field === "title");
    const out = duplicateElement(slide, title.id);
    expect(out.id).toBeTruthy();
    expect(out.id).not.toBe(title.id);
    const copies = getEditorElements(out.slide.html).filter((e) => e.text === "Titre");
    expect(copies).toHaveLength(2);
    expect(copies.filter((e) => e.field === "title")).toHaveLength(1);
    const edited = patchElement(out.slide, out.id!, { text: "Copie" });
    expect(edited.data.title).toBe("Titre");
  });
  it("the dark band of a full-photo layout is a selectable frame", () => {
    const slide = makeSlide({ title: "T", body: "B", photo_index: 1 }, "photo_full", PHOTO);
    expect(getEditorElements(slide.html).some((e) => e.kind === "shape" && e.frame)).toBe(true);
  });
});
