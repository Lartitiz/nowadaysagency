import PptxGenJS from "pptxgenjs";

interface SlideData {
  slide_number: number;
  role: string;
  title: string;
  body: string;
}

interface VisualSlide {
  slide_number: number;
  html: string;
}

export interface CharterColors {
  color_primary?: string | null;
  color_secondary?: string | null;
  color_accent?: string | null;
  color_background?: string | null;
  color_text?: string | null;
  font_title?: string | null;
  font_body?: string | null;
}

function hexToRgb(hex: string): string {
  // Strip # and return 6-char hex for pptxgenjs
  return hex.replace("#", "").padEnd(6, "0").slice(0, 6);
}

/**
 * Export carousel slides as a PPTX file (portrait 1080x1350 ratio).
 * Uses brand charter colors/fonts for editable native slides.
 */
export async function exportCarouselPptx(
  slides: SlideData[],
  fileName = "carrousel",
  _visualSlides?: VisualSlide[],
  charter?: CharterColors | null
) {
  const pptx = new PptxGenJS();

  // Instagram portrait ratio: 1080x1350 = 4:5
  // PPTX uses inches – 7.5 x 9.375 keeps the 4:5 ratio
  pptx.defineLayout({ name: "INSTAGRAM", width: 7.5, height: 9.375 });
  pptx.layout = "INSTAGRAM";

  const colors = {
    primary: hexToRgb(charter?.color_primary || "#E91E8C"),
    secondary: hexToRgb(charter?.color_secondary || "#1A1A2E"),
    accent: hexToRgb(charter?.color_accent || "#FFE561"),
    background: hexToRgb(charter?.color_background || "#FFFFFF"),
    text: hexToRgb(charter?.color_text || "#1A1A2E"),
  };
  const fonts = {
    title: charter?.font_title || "Arial",
    body: charter?.font_body || "Arial",
  };

  for (const s of slides) {
    const slide = pptx.addSlide();
    addBrandedSlide(slide, s, colors, fonts);
  }

  await pptx.writeFile({ fileName: `${fileName}.pptx` });
}

function addBrandedSlide(
  slide: any,
  s: SlideData,
  colors: { primary: string; secondary: string; accent: string; background: string; text: string },
  fonts: { title: string; body: string }
) {
  slide.background = { color: colors.background };

  // Accent bar at top
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 7.5,
    h: 0.08,
    fill: { color: colors.primary },
  });

  // Slide number badge
  slide.addText(`${s.slide_number}`, {
    x: 0.4,
    y: 0.5,
    w: 0.7,
    h: 0.7,
    fontSize: 22,
    bold: true,
    color: colors.background,
    fontFace: fonts.title,
    align: "center",
    valign: "middle",
    fill: { color: colors.primary },
    shape: "roundRect",
    rectRadius: 0.15,
  });

  // Role / type label
  if (s.role) {
    slide.addText(s.role.toUpperCase(), {
      x: 1.3,
      y: 0.6,
      w: 5,
      h: 0.4,
      fontSize: 10,
      bold: true,
      color: colors.primary,
      fontFace: fonts.body,
      letterSpacing: 2,
    });
  }

  // Title
  slide.addText(s.title, {
    x: 0.6,
    y: 2.2,
    w: 6.3,
    h: 2.5,
    fontSize: 28,
    bold: true,
    color: colors.text,
    fontFace: fonts.title,
    align: "center",
    valign: "middle",
    wrap: true,
    lineSpacingMultiple: 1.2,
  });

  // Decorative line separator
  slide.addShape("rect", {
    x: 3.0,
    y: 4.9,
    w: 1.5,
    h: 0.04,
    fill: { color: colors.accent },
  });

  // Body
  if (s.body) {
    slide.addText(s.body, {
      x: 0.8,
      y: 5.2,
      w: 5.9,
      h: 3.2,
      fontSize: 16,
      color: colors.text,
      fontFace: fonts.body,
      align: "center",
      valign: "top",
      wrap: true,
      lineSpacingMultiple: 1.4,
    });
  }

  // Bottom accent bar
  slide.addShape("rect", {
    x: 0,
    y: 9.295,
    w: 7.5,
    h: 0.08,
    fill: { color: colors.primary },
  });
}
