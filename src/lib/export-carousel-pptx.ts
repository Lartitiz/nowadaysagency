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

/**
 * Render an HTML string to a canvas image at 1080x1350 (Instagram 4:5).
 */
async function renderHtmlToImage(html: string): Promise<string> {
  const html2canvas = (await import("html2canvas")).default;

  // Create an off-screen container
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "1080px";
  container.style.height = "1350px";
  container.style.overflow = "hidden";
  container.style.zIndex = "-1";
  document.body.appendChild(container);

  // Use an iframe to isolate the HTML and its styles
  const iframe = document.createElement("iframe");
  iframe.style.width = "1080px";
  iframe.style.height = "1350px";
  iframe.style.border = "none";
  iframe.style.overflow = "hidden";
  container.appendChild(iframe);

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
    iframe.srcdoc = html;
  });

  // Wait for fonts/images to load
  await new Promise((r) => setTimeout(r, 600));

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc?.body) {
    document.body.removeChild(container);
    throw new Error("Failed to render slide HTML");
  }

  const canvas = await html2canvas(iframeDoc.body, {
    width: 1080,
    height: 1350,
    scale: 1,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const dataUrl = canvas.toDataURL("image/png");
  document.body.removeChild(container);
  return dataUrl;
}

/**
 * Export carousel slides as a PPTX file (portrait 1080x1350 ratio).
 * If visualSlides (HTML) are provided, renders them as images.
 * Otherwise falls back to text-only slides.
 */
export async function exportCarouselPptx(
  slides: SlideData[],
  fileName = "carrousel",
  visualSlides?: VisualSlide[]
) {
  const pptx = new PptxGenJS();

  // Instagram portrait ratio: 1080x1350 = 4:5
  // PPTX uses inches – 7.5 x 9.375 keeps the 4:5 ratio
  pptx.defineLayout({ name: "INSTAGRAM", width: 7.5, height: 9.375 });
  pptx.layout = "INSTAGRAM";

  // If we have visual HTML slides, render them as images
  if (visualSlides && visualSlides.length > 0) {
    for (const vs of visualSlides) {
      const slide = pptx.addSlide();
      try {
        const imgData = await renderHtmlToImage(vs.html);
        slide.addImage({
          data: imgData,
          x: 0,
          y: 0,
          w: 7.5,
          h: 9.375,
        });
      } catch (err) {
        console.warn(`Failed to render slide ${vs.slide_number} as image, using text fallback`, err);
        const textSlide = slides.find((s) => s.slide_number === vs.slide_number);
        if (textSlide) {
          addTextSlide(slide, textSlide);
        }
      }
    }
  } else {
    // Text-only fallback
    for (const s of slides) {
      const slide = pptx.addSlide();
      addTextSlide(slide, s);
    }
  }

  await pptx.writeFile({ fileName: `${fileName}.pptx` });
}

function addTextSlide(slide: any, s: SlideData) {
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
