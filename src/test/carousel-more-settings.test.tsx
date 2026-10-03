// Réglages en plus (03/10/2026) : la retouche de la photo vaut aussi pour la copie floue du verre.
import { expect, it } from "vitest";
import { getEditorElements, patchElement, prepareSlideHtml } from "@/lib/carousel-editor";
import { composePhotoSlide } from "../../supabase/functions/_shared/photo-overlay-templates";

it("a black-and-white photo turns its frosted-glass copy black-and-white too", () => {
  const { html } = composePhotoSlide(
    { slide_number: 1, photo_index: 1, overlay_text: "Texte sur le verre.", overlay_position: "top_left", photo_style: "verre",
      art_direction: { treatment: "editorial", position: "top_left", emphasis: null, reason: "t", surface: "veil", alignment: "left" } } as never,
    { color_accent: "#91014B", color_primary: "#91014B", font_title: "Georgia", font_body: "Arial" } as never,
    { isFirst: false, isLast: false },
  );
  const slide = { id: "s", data: {}, html: prepareSlideHtml(html.replace(/\{\{PHOTO_1\}\}/g, "https://example.com/p.jpg")) };
  const photo = getEditorElements(slide.html).find((e) => e.kind === "photo")!;
  const next = patchElement(slide, photo.id, { styles: { filter: "brightness(1) contrast(1) saturate(0)" } });
  const blur = new DOMParser().parseFromString(next.html, "text/html").querySelector<HTMLElement>("[data-photo-glass-blur]")!;
  expect(blur.getAttribute("data-photo-filter")).toContain("saturate(0)");
  const back = patchElement(next, photo.id, { styles: { filter: "" } });
  expect(new DOMParser().parseFromString(back.html, "text/html").querySelector("[data-photo-glass-blur]")!.hasAttribute("data-photo-filter")).toBe(false);
});
