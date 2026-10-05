/**
 * Filet des dépendances de l'export PDF (jspdf → fflate, dompurify).
 *
 * Les exports PDF de l'app (synthèses, guide de voix, récap proposition,
 * carrousel LinkedIn) passent tous par `jsPDF.addImage` + `output()`. jspdf
 * compresse les images PNG (et le texte si `compress: true`) avec fflate ;
 * dompurify est son nettoyeur HTML (et celui de posthog). Ces deux paquets sont
 * forcés par overrides / lock pour des correctifs de sécurité : ce test vérifie
 * qu'un vrai PDF sort toujours, et que le flux compressé se relit.
 */
import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";

// fflate et dompurify ne sont pas des dépendances directes (knip refuse un
// import non déclaré) : on relit le zlib avec Node, et dompurify est chargé par
// son nom tel que jspdf / posthog le résolvent.
const latin1 = (b: Uint8Array) => Buffer.from(b).toString("latin1");

// 4×4 px, RVB rose plein (PNG fabriqué à la main) et sa version JPEG.
const PNG_4X4 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGM4IRcFRwzEcQAPMhQBlbcBGQAAAABJRU5ErkJggg==";
const JPEG_4X4 =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAABKADAAQAAAABAAAABAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgABAAEAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+X6KKK0P9QD/2Q==";

/** Extrait les flux `stream … endstream` marqués /FlateDecode d'un PDF. */
function flateStreams(bytes: Uint8Array): Uint8Array[] {
  const text = latin1(bytes); // 1 octet = 1 caractère
  const out: Uint8Array[] = [];
  const re = /\/FlateDecode[\s\S]*?stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    const end = text.indexOf("endstream", start);
    out.push(bytes.slice(start, end));
  }
  return out;
}

describe("export PDF (jspdf + fflate)", () => {
  it("produit un PDF lisible avec texte compressé, PNG et JPEG", async () => {
    const jsPDF = (await import("jspdf")).default;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    pdf.text("Synthèse de marque — test", 10, 10);
    pdf.addImage(PNG_4X4, "PNG", 10, 20, 40, 40);
    pdf.addPage();
    pdf.addImage(JPEG_4X4, "JPEG", 10, 10, 40, 40);

    const bytes = new Uint8Array(pdf.output("arraybuffer"));
    expect(bytes.length).toBeGreaterThan(500);
    expect(latin1(bytes.slice(0, 5))).toBe("%PDF-");
    expect(latin1(bytes.slice(-7))).toContain("%%EOF");
    expect(pdf.getNumberOfPages()).toBe(2);

    // Chaque flux compressé (texte des pages + image PNG) doit se décompresser.
    const streams = flateStreams(bytes);
    expect(streams.length).toBeGreaterThanOrEqual(3);
    const inflated = streams.map((s) => new Uint8Array(inflateSync(s)));
    inflated.forEach((d) => expect(d.length).toBeGreaterThan(0));
    expect(inflated.some((d) => latin1(d).includes("test) Tj"))).toBe(true);
  });

  it("output('blob') renvoie un PDF non vide (chemin du carrousel LinkedIn)", async () => {
    const jsPDF = (await import("jspdf")).default;
    const doc = new jsPDF({ orientation: "portrait", unit: "px", format: [1080, 1350] });
    doc.addImage(JPEG_4X4, "JPEG", 0, 0, 1080, 1350);
    doc.addPage([1080, 1350], "portrait");
    doc.addImage(PNG_4X4, "PNG", 0, 0, 1080, 1350);
    const blob: Blob = doc.output("blob");
    expect(blob.size).toBeGreaterThan(500);
    // jsdom n'implémente pas Blob.arrayBuffer → FileReader.
    const buf = await new Promise<ArrayBuffer>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.readAsArrayBuffer(blob.slice(0, 5));
    });
    const head = new Uint8Array(buf);
    expect(latin1(head)).toBe("%PDF-");
  });
});

describe("dompurify", () => {
  it("retire le script et les gestionnaires d'événements", async () => {
    const name = "dompurify";
    const DOMPurify = (await import(/* @vite-ignore */ name)).default;
    expect(DOMPurify.version).toBe("3.4.16");
    const clean = DOMPurify.sanitize('<p onclick="x()">ok<img src=x onerror=alert(1)><script>alert(1)</script></p>');
    expect(clean).toBe('<p>ok<img src="x"></p>');
  });
});
