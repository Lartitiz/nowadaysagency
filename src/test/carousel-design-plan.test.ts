import { describe, expect, it } from "vitest";
import { buildCarouselDesignPlan, composeEditorialSlide, describeCarouselDesignPlan } from "../../supabase/functions/_shared/carousel-design-plan";

const charter = { color_background: "#FFF4F8", color_text: "#1A1A1A", color_secondary: "#91014B", color_accent: "#FFE561", font_title: "Libre Baskerville", font_body: "IBM Plex Sans" };
const slides = Array.from({ length: 7 }, (_, i) => ({ slide_number: i + 1, title: i ? "Une autre façon de communiquer" : "Le kraft n'est pas un hasard", body: "La sobriété peut être un choix esthétique. Elle ne prouve pas, à elle seule, la sincérité d'une marque.", role: i === 3 ? "manifesto" : "point", slide_type: "text_only" }));
describe("carousel art direction", () => {
  it("plans a complete, stable sequence without mutating its copy", () => {
    const source = JSON.stringify(slides);
    const plan = buildCarouselDesignPlan(slides);
    expect(plan).toEqual(buildCarouselDesignPlan(slides));
    expect(plan.sequence.map(s => s.slide_number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(plan.sequence.map(s => s.layout)).size).toBeGreaterThanOrEqual(5);
    expect(plan.sequence.filter(s => s.inverted)).toHaveLength(1);
    expect(plan.sequence.filter(s => s.alignment === "center").length).toBeLessThanOrEqual(2);
    expect(JSON.stringify(slides)).toBe(source);
  });
  it("keeps photo and schema semantics in the plan", () => {
    const plan = buildCarouselDesignPlan([{ slide_number: 4, slide_type: "photo_integrated" }, { slide_number: 9, visual_schema: { type: "comparison" } }]);
    expect(plan.sequence.map(s => s.layout)).toEqual(["photo", "schema"]);
    expect(describeCarouselDesignPlan(plan)).toContain("Slide 9");
  });
  it("renders every ordinary slide with its source text and brand fonts", () => {
    const plan = buildCarouselDesignPlan(slides);
    slides.forEach((slide, i) => {
      const rendered = composeEditorialSlide(slide, plan.sequence[i], charter);
      expect(rendered).not.toBeNull();
      expect(rendered!.html).toContain(slide.title);
      expect(rendered!.html).toContain(slide.body);
      expect(rendered!.html).toContain("Libre Baskerville");
      expect(rendered!.html).toContain("IBM Plex Sans");
      expect(rendered!.html).not.toContain("data-pptx-shape=\"pill\"");
      expect(rendered!.html).not.toContain("border-radius");
    });
  });
  it("escapes source HTML without changing the source data", () => {
    const slide = { title: '<img src=x onerror="alert(1)">', body: "A & B" };
    const result = composeEditorialSlide(slide, buildCarouselDesignPlan([slide]).sequence[0], charter)!;
    expect(result.html).toContain("&lt;img");
    expect(result.html).toContain("A &amp; B");
    expect(result.html).not.toContain("<img src=x");
  });
  it("defers excess copy instead of truncating or shrinking it", () => {
    const slide = { title: "Titre", body: "Texte très long. ".repeat(120) };
    expect(composeEditorialSlide(slide, buildCarouselDesignPlan([slide]).sequence[0], charter)).toBeNull();
  });
  it("never flattens photos, schemas, explicit CTA fields or custom references", () => {
    const beat = buildCarouselDesignPlan(slides).sequence[0];
    for (const extra of [{ visual_schema: { type: "stats" } }, { slide_type: "photo_full" }, { cta_label: "Réponds" }]) expect(composeEditorialSlide({ ...slides[0], ...extra }, beat, charter)).toBeNull();
    expect(composeEditorialSlide(slides[0], beat, { ...charter, template_layout_description: "Mon modèle" })).toBeNull();
  });
  it("does not invent empty title or body fields", () => {
    const slide = { title: "", body: "Un verbatim seul." };
    const result = composeEditorialSlide(slide, buildCarouselDesignPlan([slide]).sequence[0], charter)!;
    expect(result.html).not.toContain("data-slide-text=\"title\"");
    expect(result.html).toContain("Un verbatim seul.");
  });
});
