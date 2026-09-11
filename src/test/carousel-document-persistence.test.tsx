import { beforeEach, describe, expect, it } from "vitest";
import {
  saveFlowState,
  loadFlowState,
  setFlowUserId,
} from "@/hooks/use-flow-persistence";
import {
  makeSlide,
  documentOutput,
  readCarouselDocument,
  patchElement,
  getEditorElements,
} from "@/lib/carousel-editor";
import { buildCalendarContent } from "@/features/creer/build-calendar-content";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  setFlowUserId("carousel-test-user");
});
describe("editable carousel persistence", () => {
  it("restores exact edited HTML from the user backup beyond the former two-hour expiry", () => {
    const slide = makeSlide({ title: "Avant" });
    const id = getEditorElements(slide.html).find(
      (e) => e.field === "title",
    )!.id;
    const doc = {
      slides: [
        {
          ...patchElement(slide, id, {
            text: "Après",
            styles: { left: "123px" },
          }),
          locked: true,
        },
        makeSlide(),
      ],
      caption: { body: "Légende" },
    };
    const output = documentOutput(doc, {});
    saveFlowState({
      step: "result",
      selectedFormat: "carousel",
      result: { raw: output.raw },
      visualSlides: output.visualSlides,
    });
    const key = "creer_flow_state_backup:carousel-test-user";
    const backup = JSON.parse(localStorage.getItem(key)!);
    expect(backup.result.raw.visual_html).toBeUndefined();
    backup.ts = Date.now() - 3 * 60 * 60 * 1000;
    localStorage.setItem(key, JSON.stringify(backup));
    sessionStorage.clear();
    const restored = loadFlowState()!;
    const document = readCarouselDocument(
      restored.result.raw,
      restored.visualSlides,
    );
    expect(document.slides[0].html).toContain("Après");
    expect(document.slides[0].html).toContain("123px");
    expect(document.slides[0].locked).toBe(true);
    expect(document.slides[0].id).toBe(doc.slides[0].id);
  });
  it("does not restore another user's persistent backup", () => {
    saveFlowState({
      step: "result",
      result: { raw: { carousel_editor_version: 1, slides: [] } },
      visualSlides: [],
    });
    sessionStorage.clear();
    setFlowUserId("another-user");
    expect(loadFlowState()).toBeNull();
  });
  it.each(["text", "photo", "mix"])(
    "retains the editable document in the %s calendar record",
    (carousel_type) => {
      const output = documentOutput(
        {
          slides: [makeSlide(), makeSlide()],
          caption: { body: "Une légende" },
        },
        { carousel_type },
      );
      const detail = buildCalendarContent("carousel", output.raw).storyDetail;
      expect(detail.carousel_editor_version).toBe(1);
      expect(detail.visual_html).toEqual(output.visualSlides);
      expect(detail.slides[0].editor_id).toBe(output.raw.slides[0].editor_id);
    },
  );
});
