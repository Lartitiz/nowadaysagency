import PptxGenJS from "pptxgenjs";
import html2canvas from "html2canvas";

export async function exportPinterestVisualPptx(
  pinHtml: string,
  fileName = "epingle-pinterest"
) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "PINTEREST", width: 6.94, height: 10.42 });
  pptx.layout = "PINTEREST";
  pptx.author = "L'Assistant Com'";

  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:1000px;height:1500px;overflow:hidden;z-index:-1;";
  document.body.appendChild(container);

  try {
    container.innerHTML = pinHtml;
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 300));

    const canvas = await html2canvas(container, {
      width: 1000,
      height: 1500,
      scale: 1,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
    });

    const base64 = canvas.toDataURL("image/png");
    const slide = pptx.addSlide();
    slide.addImage({ data: base64, x: 0, y: 0, w: 6.94, h: 10.42 });
  } finally {
    document.body.removeChild(container);
  }

  await pptx.writeFile({ fileName: fileName + ".pptx" });
}

export async function exportPinterestVisualPng(
  pinHtml: string,
  fileName = "epingle-pinterest"
) {
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:1000px;height:1500px;overflow:hidden;z-index:-1;";
  document.body.appendChild(container);

  try {
    container.innerHTML = pinHtml;
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 300));

    const canvas = await html2canvas(container, {
      width: 1000,
      height: 1500,
      scale: 1,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
    });

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName + ".png";
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    document.body.removeChild(container);
  }
}
