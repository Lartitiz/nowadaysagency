import PptxGenJS from "pptxgenjs";

interface SlideData {
  slide_number: number;
  role: string;
  title: string;
  body: string;
}

/**
 * Export carousel slides as a PPTX file (portrait 1080x1350 ratio).
 */
export async function exportCarouselPptx(slides: SlideData[], fileName = "carrousel") {
  const pptx = new PptxGenJS();

  // Instagram portrait ratio: 1080x1350 = 4:5
  // PPTX uses inches – 7.5 x 9.375 keeps the 4:5 ratio
  pptx.defineLayout({ name: "INSTAGRAM", width: 7.5, height: 9.375 });
  pptx.layout = "INSTAGRAM";

  for (const s of slides) {
    const slide = pptx.addSlide();

    // Background
    slide.background = { color: "FFFFFF" };

    // Slide number badge
    slide.addText(`SLIDE ${s.slide_number}`, {
      x: 0.4,
      y: 0.4,
      w: 1.6,
      h: 0.4,
      fontSize: 10,
      bold: true,
      color: "888888",
      fontFace: "Arial",
    });

    // Title
    slide.addText(s.title, {
      x: 0.6,
      y: 2.5,
      w: 6.3,
      h: 2,
      fontSize: 28,
      bold: true,
      color: "1a1a1a",
      fontFace: "Arial",
      align: "center",
      valign: "middle",
      wrap: true,
    });

    // Body
    if (s.body) {
      slide.addText(s.body, {
        x: 0.8,
        y: 5,
        w: 5.9,
        h: 3,
        fontSize: 16,
        color: "444444",
        fontFace: "Arial",
        align: "center",
        valign: "top",
        wrap: true,
        lineSpacingMultiple: 1.3,
      });
    }
  }

  await pptx.writeFile({ fileName: `${fileName}.pptx` });
}
