import PptxGenJS from "pptxgenjs";
import html2canvas from "html2canvas";

interface VisualSlide {
  slide_number: number;
  html: string;
}

export async function exportCarouselVisualPptx(
  visualSlides: VisualSlide[],
  fileName = "carrousel-visuels"
) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "INSTAGRAM", width: 7.5, height: 9.375 });
  pptx.layout = "INSTAGRAM";
  pptx.author = "Nowadays Agency";

  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:1080px;height:1350px;overflow:hidden;z-index:-1;";
  document.body.appendChild(container);

  try {
    for (const vs of visualSlides) {
      container.innerHTML = vs.html;
      await document.fonts.ready;
      await new Promise((r) => setTimeout(r, 300));

      const canvas = await html2canvas(container, {
        width: 1080,
        height: 1350,
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
      });

      const base64 = canvas.toDataURL("image/png");
      const slide = pptx.addSlide();
      slide.addImage({ data: base64, x: 0, y: 0, w: 7.5, h: 9.375 });
    }
  } finally {
    document.body.removeChild(container);
  }

  await pptx.writeFile({ fileName: fileName + ".pptx" });
}
