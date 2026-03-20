import PptxGenJS from "pptxgenjs";
import html2canvas from "html2canvas";

interface VisualSlide {
  slide_number: number;
  html: string;
}

function waitForImages(container: HTMLElement, timeoutMs = 3000): Promise<void> {
  const imgs = Array.from(container.querySelectorAll("img"));
  if (imgs.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);

    Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((res) => {
            if (img.complete && img.naturalWidth > 0) return res();
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
          })
      )
    ).then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function waitForIframePaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export async function exportCarouselVisualPptx(
  visualSlides: VisualSlide[],
  fileName = "carrousel-visuels"
) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "INSTAGRAM", width: 7.5, height: 9.375 });
  pptx.layout = "INSTAGRAM";
  pptx.author = "L'Assistant Com'";

  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:1080px;height:1350px;overflow:hidden;z-index:-1;";
  document.body.appendChild(container);

  try {
    for (const vs of visualSlides) {
      container.innerHTML = vs.html;
      await document.fonts.ready;
      await waitForImages(container);
      await new Promise((r) => setTimeout(r, 800));
      await waitForIframePaint();

      const canvas = await html2canvas(container, {
        width: 1080,
        height: 1350,
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
        imageTimeout: 5000,
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
