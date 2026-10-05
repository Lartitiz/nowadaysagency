import { describe, expect, it } from "vitest";
import { LINKEDIN_PDF_PAGE, slidesToPdfBlob } from "@/lib/carousel-pdf";

// JPEG 4×5 (rose framboise) : l'image est étirée sur toute la page.
const JPEG = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAFAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwBtFFFB9Uf/2Q==", "base64"));

async function pdfText(blob: Blob): Promise<string> {
  return Buffer.from(await blob.arrayBuffer()).toString("latin1");
}

describe("carrousel LinkedIn en PDF (document)", () => {
  it("une page par slide, au format 1080×1350", async () => {
    for (const count of [1, 3, 20]) {
      const text = await pdfText(await slidesToPdfBlob(Array.from({ length: count }, () => JPEG)));
      expect(text.startsWith("%PDF-")).toBe(true);
      expect(text.match(/\/Type \/Page\b(?!s)/g)?.length).toBe(count);
      const boxes = [...text.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((m) => m[1].trim().split(/\s+/).map(Number));
      expect(boxes.length).toBe(count);
      for (const box of boxes) expect(box).toEqual([0, 0, LINKEDIN_PDF_PAGE.w, LINKEDIN_PDF_PAGE.h]);
      // Une même image est partagée par jsPDF entre les pages qui la répètent.
      expect(text.match(/\/Subtype \/Image/g)?.length).toBe(1);
    }
  });

  it("accepte les Blob rendus par l'export PNG", async () => {
    const blob = new Blob([JPEG], { type: "image/jpeg" });
    const text = await pdfText(await slidesToPdfBlob([blob, blob]));
    expect(text.match(/\/Type \/Page\b(?!s)/g)?.length).toBe(2);
  });

  it("refuse un carrousel vide", async () => {
    await expect(slidesToPdfBlob([])).rejects.toThrow("Aucune slide");
  });
});
