import { afterEach, describe, expect, it, vi } from "vitest";
import { contrastRatio, inspectSlide } from "@/lib/carousel-quality";
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
function fixture(
  css = "",
  bounds = {
    left: 80,
    top: 100,
    right: 800,
    bottom: 250,
    width: 720,
    height: 150,
  },
) {
  document.body.innerHTML = `<div style="background-color:rgb(255,255,255)"><p data-editor-id="t" data-pptx-editable="body" style="font-size:48px;color:rgb(0,0,0);${css}">Un texte</p></div>`;
  const el = document.querySelector("p")!;
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue(bounds as DOMRect);
  vi.spyOn(document, "createRange").mockReturnValue({
    selectNodeContents() {},
    getBoundingClientRect: () => bounds,
  } as any);
  const original = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((e) => {
    const actual = original(e);
    return new Proxy(actual, {
      get: (target, key) => {
        if (
          key === "backgroundImage" &&
          e.getAttribute("style")?.includes("linear-gradient")
        )
          return "linear-gradient(red, blue)";
        if (key === "backgroundColor")
          return target.backgroundColor || "rgba(0, 0, 0, 0)";
        if (
          ["opacity", "filter", "mixBlendMode", "backgroundImage"].includes(
            String(key),
          )
        )
          return (
            (target as any)[key] ||
            (
              {
                opacity: "1",
                filter: "none",
                mixBlendMode: "normal",
                backgroundImage: "none",
              } as any
            )[key]
          );
        return (target as any)[key];
      },
    });
  });
  return el;
}
describe("carousel quality checks", () => {
  it("uses exact WCAG luminance ratios", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBe(21);
    expect(contrastRatio([100, 100, 100], [100, 100, 100])).toBe(1);
    expect(contrastRatio([119, 119, 119], [255, 255, 255])).toBeLessThan(4.5);
  });
  it("accepts readable text inside the canvas", () => {
    fixture();
    expect(inspectSlide(document, 0)).toEqual([]);
  });
  it("flags clipped text on its exact slide and element", () => {
    fixture("", {
      left: 80,
      top: 1300,
      right: 800,
      bottom: 1450,
      width: 720,
      height: 150,
    });
    expect(inspectSlide(document, 3)).toContainEqual(
      expect.objectContaining({
        slide: 3,
        elementId: "t",
        kind: "overflow",
        severity: "error",
      }),
    );
  });
  it("blocks unreadable font sizes and measured low contrast", () => {
    fixture("font-size:20px;color:rgb(220,220,220)");
    const issues = inspectSlide(document, 0);
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "size",
        severity: "error",
        fix: { "font-size": "38px" },
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "contrast",
        severity: "warning",
        fix: { color: "#000000" },
      }),
    );
  });
  it("only advises on an essential text that is readable but tight", () => {
    fixture("font-size:34px");
    expect(inspectSlide(document, 0)).toContainEqual(
      expect.objectContaining({ kind: "size", severity: "warning" }),
    );
  });
  it("accepts secondary microcopy at 30 px and blocks below it", () => {
    const el = fixture("font-size:30px");
    el.dataset.pptxEditable = "caption";
    expect(inspectSlide(document, 0).some((i) => i.kind === "size")).toBe(false);
    el.style.fontSize = "22px";
    expect(inspectSlide(document, 0)).toContainEqual(
      expect.objectContaining({
        kind: "size",
        severity: "error",
        fix: { "font-size": "30px" },
      }),
    );
  });

  it("warns about safe margins without blocking publication", () => {
    fixture("", {
      left: 20,
      top: 100,
      right: 800,
      bottom: 250,
      width: 780,
      height: 150,
    });
    expect(inspectSlide(document, 0)).toContainEqual(
      expect.objectContaining({ kind: "margin", severity: "warning" }),
    );
  });
  it("does not claim to measure contrast on gradients", () => {
    fixture(
      "background-image:linear-gradient(red,blue);color:rgb(240,240,240)",
    );
    const issues = inspectSlide(document, 0);
    expect(issues.some((i) => i.kind === "manual")).toBe(true);
    expect(issues.some((i) => i.kind === "contrast")).toBe(false);
  });
  it("does not treat intentionally cropped photos as clipped text", () => {
    const el = fixture("", {
      left: -100,
      top: -100,
      right: 1200,
      bottom: 1500,
      width: 1300,
      height: 1600,
    });
    el.setAttribute("data-editor-photo", "true");
    expect(inspectSlide(document, 0)).toEqual([]);
  });
  it("ignores decorative page numbers and hidden text", () => {
    const el = fixture("font-size:14px");
    el.dataset.pptxEditable = "page_number";
    expect(inspectSlide(document, 0)).toEqual([]);
    el.dataset.pptxEditable = "body";
    el.style.display = "none";
    expect(inspectSlide(document, 0)).toEqual([]);
  });
  it("does not judge an SVG pictogram wrapper as tiny text (bug 28/09)", () => {
    const el = fixture("font-size:16px");
    el.innerHTML = '<svg><text font-size="36">🧼</text></svg>';
    expect(inspectSlide(document, 0).filter((i) => i.kind === "size")).toEqual([]);
  });
  it("keeps the secondary floor for a CTA the editor tagged body", () => {
    const el = fixture("font-size:34px");
    el.dataset.slideText = "cta";
    expect(inspectSlide(document, 0).filter((i) => i.kind === "size")).toEqual([]);
    el.dataset.slideText = "";
    expect(inspectSlide(document, 0).filter((i) => i.kind === "size")).toHaveLength(1);
  });
});

it("warns about dense photo copy without pretending to identify the subject", () => {
  const el = fixture("", {left:84,top:300,right:996,bottom:1130,width:912,height:830});
  el.setAttribute("data-photo-editorial-text", "profonde");
  expect(inspectSlide(document, 1)).toContainEqual(expect.objectContaining({kind:"manual",severity:"warning",message:expect.stringContaining("grande partie de la photo")}));
});

// QA du 12/11/2026 : « Contraste… à vérifier » sur les 5 slides photo, en jargon,
// même quand le texte est posé sur un panneau de lecture opaque.
describe("texte sur photo : panneau de lecture ou photo nue", () => {
  const photoSlide = (panelStyle: string | null) => {
    const text = `<p data-editor-id="t" data-pptx-editable="body" style="font-size:48px;color:rgb(20,20,20)">Un texte</p>`;
    document.body.innerHTML = `<div style="background-color:rgb(26,24,21)"><div data-pptx-photo="1"></div>${
      panelStyle === null ? text : `<div data-photo-reading-panel="1" style="${panelStyle}">${text}</div>`
    }</div>`;
    const box = { left: 80, top: 100, right: 800, bottom: 250, width: 720, height: 150 } as DOMRect;
    vi.spyOn(document.querySelector("p")!, "getBoundingClientRect").mockReturnValue(box);
    vi.spyOn(document.querySelector("[data-pptx-photo]")!, "getBoundingClientRect").mockReturnValue(
      { left: 0, top: 0, right: 1080, bottom: 1350, width: 1080, height: 1350 } as DOMRect,
    );
    vi.spyOn(document, "createRange").mockReturnValue({ selectNodeContents() {}, getBoundingClientRect: () => box } as any);
    // jsdom ne calcule pas ces propriétés : mêmes valeurs par défaut qu'un navigateur.
    const defaults: Record<string, string> = { opacity: "1", filter: "none", mixBlendMode: "normal", backgroundImage: "none", backgroundColor: "rgba(0, 0, 0, 0)" };
    const original = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((e) => {
      const actual = original(e);
      return new Proxy(actual, { get: (t, k) => (t as any)[k] || defaults[String(k)] || (t as any)[k] });
    });
  };

  it("panneau opaque sur la photo : pas d'alerte, le contraste est mesuré", () => {
    photoSlide("background-color:rgb(255,250,240)");
    const issues = inspectSlide(document, 0);
    expect(issues.some((i) => i.kind === "manual")).toBe(false);
    expect(issues.some((i) => i.kind === "contrast")).toBe(false);
  });

  it("carte à 93 % : mesurée elle aussi", () => {
    photoSlide("background-color:rgba(255,250,240,0.93)");
    expect(inspectSlide(document, 0).some((i) => i.kind === "manual")).toBe(false);
  });

  it("panneau qui ressort mal : conseil mesuré, en mots simples", () => {
    photoSlide("background-color:rgb(40,40,40)");
    const contrast = inspectSlide(document, 0).find((i) => i.kind === "contrast");
    expect(contrast?.message).toMatch(/ressort peu sur son fond/);
    expect(contrast?.message).not.toMatch(/[Cc]ontraste/);
  });

  it("texte posé directement sur la photo : un conseil sans jargon", () => {
    photoSlide(null);
    const manual = inspectSlide(document, 0).find((i) => i.kind === "manual");
    expect(manual?.message).toMatch(/regarde sur ton téléphone s'il se lit bien/);
    expect(manual?.message).not.toMatch(/[Cc]ontraste/);
  });
});
