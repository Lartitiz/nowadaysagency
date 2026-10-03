// Éléments encore figés (relevé du 03/10/2026) : décors des slides IA, cadre
// photo des slides mixtes, phrase mise en valeur.
import { describe, expect, it } from "vitest";
import {
  getEditorElements,
  isPassiveShape,
  listLayers,
  patchElement,
  prepareSlideHtml,
  setEmphasis,
  type EditorSlide,
} from "@/lib/carousel-editor";
import { collectInspectables } from "@/lib/carousel-quality";
import { composePhotoSlide } from "../../supabase/functions/_shared/photo-overlay-templates";

const dom = (html: string) => new DOMParser().parseFromString(html, "text/html");
// Slide « TIMELINE » telle que le modèle la dessine (gabarit du prompt carousel-visual).
const timeline = `<div data-pptx-shape="background" style="width:1080px;height:1350px;position:relative;background:#FFF4F8">
<div style="position:absolute;inset:0;background-image:radial-gradient(#91014B22 2px, transparent 2px);background-size:24px 24px"></div>
<h1 data-pptx-editable="title" style="font-size:64px">Mes étapes</h1>
<div style="position:relative;padding-left:60px">
  <div style="position:absolute;left:24px;top:0;bottom:0;width:3px;background:linear-gradient(to bottom, #91014B, #FFE561)"></div>
  <div style="display:flex;gap:20px">
    <div data-pptx-shape="pill" style="width:52px;height:52px;background:#91014B;color:#FFF">01</div>
    <div style="flex:1;background:#FFF;border-radius:12px;padding:24px"><p data-pptx-editable="body" style="font-size:32px">Préparer</p></div>
  </div>
  <div style="height:2px;background:#91014B;margin:24px 0"></div>
  <svg viewBox="0 0 100 20" width="400"><path d="M0 10 Q 25 0 50 10 T 100 10" stroke="#91014B" fill="none"/></svg>
</div></div>`;

describe("AI slide decorations", () => {
  const slide: EditorSlide = { id: "t", data: {}, html: prepareSlideHtml(timeline) };
  it("timeline line, separator, box and drawing become layers; the texture stays passive", () => {
    const labels = listLayers(slide.html).map((l) => l.label);
    expect(labels.filter((l) => l === "Décor").length).toBeGreaterThanOrEqual(2);
    expect(labels).toContain("Encadré");
    expect(labels).toContain("Dessin");
    expect(labels).toContain("Texture de fond");
    const doc = dom(slide.html);
    const texture = doc.querySelector<HTMLElement>('[data-editor-shape="texture"]')!;
    expect(isPassiveShape(texture)).toBe(true);
    // Stable : préparer deux fois ne change rien.
    expect(prepareSlideHtml(slide.html)).toBe(slide.html);
  });
  it("decorations stay out of the quality check (no new blocking issue)", () => {
    // jsdom ne mesure rien : on vérifie l'attribut qui les écarte du contrôle.
    dom(slide.html).querySelectorAll('[data-editor-shape="decor"],[data-editor-shape="dessin"],[data-editor-shape="texture"]').forEach((el) =>
      expect(el.getAttribute("data-decorative")).toBe("true"));
    document.body.innerHTML = dom(slide.html).body.innerHTML;
    const ids = collectInspectables(document).map((i) => i.el.getAttribute("data-editor-shape"));
    expect(ids.filter((v) => v === "decor" || v === "dessin" || v === "texture")).toHaveLength(0);
  });
  it("a decoration can be recoloured and moved", () => {
    const line = getEditorElements(slide.html).find((e) => e.name === "decor" && !e.frame)!;
    const moved = patchElement(slide, line.id, { styles: { left: "40px", "background-color": "#000000" } });
    const el = dom(moved.html).querySelector<HTMLElement>(`[data-editor-id="${line.id}"]`)!;
    expect(el.style.left).toBe("40px");
  });
  it("leaves photo templates without spurious decorations", () => {
    const { html } = composePhotoSlide(
      { slide_number: 2, photo_index: 1, overlay_text: "Un texte sur la carte en verre.", overlay_position: "top_left", photo_style: "verre",
        photo_format: { step: { index: 1, total: 3, label: "le début" } },
        art_direction: { treatment: "editorial", position: "top_left", emphasis: null, reason: "t", surface: "veil", alignment: "left" } } as never,
      { color_accent: "#5C7A5A", color_primary: "#5C7A5A", font_title: "Georgia", font_body: "Arial" } as never,
      { isFirst: false, isLast: false },
    );
    const prepared = prepareSlideHtml(html);
    expect(prepared).not.toContain('data-editor-shape="decor"');
  });
});

describe("emphasis sentence", () => {
  const { html } = composePhotoSlide(
    { slide_number: 3, photo_index: 1, overlay_text: "Première phrase assez longue pour être lue. Deuxième phrase qui mérite d'être mise en avant. Et une troisième pour finir.", overlay_position: "bottom_left",
      art_direction: { treatment: "editorial", position: "bottom_left", emphasis: null, reason: "t", surface: "veil", alignment: "left" } } as never,
    { color_accent: "#91014B", color_primary: "#91014B", font_title: "Georgia", font_body: "Arial" } as never,
    { isFirst: false, isLast: false },
  );
  const slide: EditorSlide = { id: "e", data: { art_direction: { emphasis: null } }, html: prepareSlideHtml(html) };
  const text = getEditorElements(slide.html).find((e) => e.emphasis)!;
  it("lists the sentences and switches the emphasised one", () => {
    expect(text.emphasis!.choices).toContain("Deuxième phrase qui mérite d'être mise en avant.");
    const next = setEmphasis(slide, text.id, { sentence: "Deuxième phrase qui mérite d'être mise en avant." });
    const part = dom(next.html).querySelector('[data-photo-text-part="emphasis"]')!;
    expect(part.textContent).toContain("Deuxième phrase");
    expect(next.data.art_direction.emphasis).toBe("Deuxième phrase qui mérite d'être mise en avant.");
    // Le texte complet ne change pas.
    expect(getEditorElements(next.html).find((e) => e.id === text.id)!.text).toBe(text.text);
  });
  it("has its own colour, kept when the text colour changes", () => {
    const coloured = setEmphasis(slide, text.id, { color: "#ffe561" });
    const recoloured = patchElement(coloured, text.id, { styles: { color: "#ffffff" } });
    const el = dom(recoloured.html).querySelector<HTMLElement>(`[data-editor-id="${text.id}"]`)!;
    expect(el.style.getPropertyValue("--photo-heading").toLowerCase()).toBe("#ffe561");
  });
});
