// Panneau des calques (03/10/2026) : ordre, masquer, monter/descendre, retirer puis remettre.
import { describe, expect, it } from "vitest";
import {
  getEditorElements,
  listLayers,
  makeSlide,
  moveLayer,
  patchElement,
  prepareSlideHtml,
  removeLayer,
  restoreLayer,
  setLayerHidden,
  type EditorSlide,
} from "@/lib/carousel-editor";
import { composePhotoSlide } from "../../supabase/functions/_shared/photo-overlay-templates";

const charter = { color_accent: "#5C7A5A", color_primary: "#5C7A5A", font_title: "Georgia", font_body: "Arial" };
const glassSlide = (): EditorSlide => {
  const { html } = composePhotoSlide(
    {
      slide_number: 2,
      photo_index: 1,
      overlay_text: "Choisir peu demande de choisir juste.",
      overlay_position: "top_left",
      photo_style: "verre",
      art_direction: { treatment: "editorial", position: "top_left", emphasis: null, reason: "t", surface: "veil", alignment: "left" },
    } as never,
    charter as never,
    { isFirst: false, isLast: false },
  );
  return { id: "s", data: { overlay_text: "Choisir peu demande de choisir juste." }, html: prepareSlideHtml(html.replace(/\{\{PHOTO_1\}\}/g, "https://example.com/p.jpg")) };
};
const dom = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("layers panel", () => {
  it("lists layers top first, with the text nested under its glass frame", () => {
    const layers = listLayers(glassSlide().html);
    expect(layers[layers.length - 1].kind).toBe("photo");
    const glass = layers.findIndex((l) => l.role === "glass");
    expect(layers[glass].topLevel).toBe(true);
    expect(layers[glass + 1]).toMatchObject({ kind: "text", depth: 1, topLevel: false });
    expect(layers[glass + 1].label).toContain("Choisir peu");
  });
  it("hides and shows a layer without losing its display", () => {
    const slide = makeSlide({ title: "Titre", body: "Corps" }, "text_only");
    const title = getEditorElements(slide.html).find((e) => e.field === "title")!;
    const hidden = setLayerHidden(slide, title.id, true);
    expect(dom(hidden.html).querySelector<HTMLElement>(`[data-editor-id="${title.id}"]`)!.style.display).toBe("none");
    expect(listLayers(hidden.html).find((l) => l.id === title.id)!.hidden).toBe(true);
    const shown = setLayerHidden(hidden, title.id, false);
    const el = dom(shown.html).querySelector<HTMLElement>(`[data-editor-id="${title.id}"]`)!;
    expect(el.style.display).toBe("");
    expect(el.hasAttribute("data-editor-hidden")).toBe(false);
  });
  it("moves a layer under the photo and back above it", () => {
    const slide = glassSlide();
    const layers = listLayers(slide.html);
    const glass = layers.find((l) => l.role === "glass")!;
    let next = slide;
    // Le cadre descend jusque sous la photo.
    for (let i = 0; i < layers.filter((l) => l.topLevel).length; i++) next = moveLayer(next, glass.id, "down");
    const tops = listLayers(next.html).filter((l) => l.topLevel);
    expect(tops[tops.length - 1].id).toBe(glass.id);
    next = moveLayer(next, glass.id, "up");
    const after = listLayers(next.html).filter((l) => l.topLevel);
    expect(after[after.length - 2].id).toBe(glass.id);
    expect(after[after.length - 1].kind).toBe("photo");
  });
  it("removes a text, keeps it in the removed list and restores it with its source field", () => {
    const slide = makeSlide({ title: "Titre", body: "Corps" }, "text_only");
    const body = getEditorElements(slide.html).find((e) => e.field === "body")!;
    const removed = removeLayer(slide, body.id);
    expect(removed.html).not.toContain(">Corps<");
    expect(removed.data.editor_removed).toHaveLength(1);
    const back = restoreLayer(removed, 0);
    expect(back.html).toContain(">Corps<");
    expect(back.data.body).toBe("Corps");
    expect(back.data.editor_removed).toHaveLength(0);
    // Réinséré au même endroit : après le titre.
    const els = getEditorElements(back.html).filter((e) => e.kind === "text").map((e) => e.field);
    expect(els.indexOf("body")).toBeGreaterThan(els.indexOf("title"));
  });
  it("restores a removed glass background around the text edited since", () => {
    const slide = glassSlide();
    const glass = listLayers(slide.html).find((l) => l.role === "glass")!;
    const unwrapped = removeLayer(slide, glass.id);
    expect(unwrapped.html).not.toContain("data-photo-glass-blur");
    const text = getEditorElements(unwrapped.html).find((e) => e.kind === "text" && e.text.includes("Choisir"))!;
    const edited = patchElement(unwrapped, text.id, { text: "Texte retouché" });
    const back = restoreLayer(edited, 0);
    const doc = dom(back.html);
    expect(doc.querySelector("[data-photo-glass] [data-photo-glass-blur]")).not.toBeNull();
    expect(doc.querySelector("[data-photo-glass]")!.textContent).toContain("Texte retouché");
    expect(doc.querySelectorAll("[data-photo-glass]")).toHaveLength(1);
    expect(back.html).not.toContain("data-editor-unwrapped");
  });
  it("ignores locked slides", () => {
    const slide = { ...makeSlide({ title: "T" }, "text_only"), locked: true };
    const id = getEditorElements(slide.html)[0].id;
    expect(setLayerHidden(slide, id, true)).toBe(slide);
    expect(removeLayer(slide, id)).toBe(slide);
  });
});
