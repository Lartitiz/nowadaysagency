import { afterEach, describe, expect, it, vi } from "vitest";

const h2c = vi.hoisted(() => ({ options: [] as Array<Record<string, unknown>> }));
vi.mock("html2canvas-pro", () => ({
  default: vi.fn(async (_el: unknown, options: Record<string, unknown>) => {
    h2c.options.push(options);
    return { toBlob: (cb: (b: Blob) => void) => cb(new Blob(["x"], { type: "image/jpeg" })) };
  }),
}));

import { waitForClonedTextFonts } from "@/lib/export-text-fonts";
import { renderCarouselSlidesToBlobs } from "@/lib/export-carousel-png";

function fakeFonts(doc: Document) {
  const load = vi.fn(async () => []);
  Object.defineProperty(doc, "fonts", { configurable: true, value: { ready: Promise.resolve(), load } });
  return load;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

// Comme la copie de html2canvas : un document de cadre, avec sa propre fenêtre.
function cloneDocument(): Document {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  return frame.contentDocument!;
}

describe("polices dans la copie html2canvas (sous-titre aux mots collés)", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    h2c.options = [];
  });

  it("attend la feuille Google Fonts de la copie puis charge la police de chaque texte", async () => {
    const doc = cloneDocument();
    doc.head.innerHTML = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre%20Baskerville">';
    doc.body.innerHTML = `<p data-slide-text="body" style="font-family:'Libre Baskerville';font-size:40px;font-weight:500">Pour toi qui gères ta com toute seule</p>`;
    const load = fakeFonts(doc);

    let done = false;
    const wait = waitForClonedTextFonts(doc).then(() => { done = true; });
    await flush();
    // Feuille pas encore chargée : html2canvas mesurerait les mots avec la police de secours.
    expect(done).toBe(false);
    expect(load).not.toHaveBeenCalled();

    doc.querySelector("link")!.dispatchEvent(new Event("load"));
    await wait;
    expect(load).toHaveBeenCalledWith(expect.stringContaining("Libre Baskerville"), "Pour toi qui gères ta com toute seule");
  });

  it("une feuille en erreur ne bloque pas le rendu", async () => {
    const doc = cloneDocument();
    doc.head.innerHTML = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X">';
    fakeFonts(doc);
    const wait = waitForClonedTextFonts(doc);
    doc.querySelector("link")!.dispatchEvent(new Event("error"));
    await expect(wait).resolves.toBeUndefined();
  });

  it("le rendu calendrier / Instagram attend les polices dans la copie avant de mesurer", async () => {
    const appendChild = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      const out = appendChild(node);
      if (node instanceof HTMLIFrameElement) setTimeout(() => node.dispatchEvent(new Event("load")), 0);
      return out;
    });

    await renderCarouselSlidesToBlobs([{ slide_number: 1, html: "<p data-slide-text=\"body\">Pour toi</p>" }]);

    const onclone = h2c.options[0]?.onclone as ((doc: Document) => Promise<void>) | undefined;
    expect(onclone).toBeTypeOf("function");
    const clone = cloneDocument();
    clone.head.innerHTML = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre%20Baskerville">';
    clone.body.innerHTML = `<p data-slide-text="body" style="font-family:'Libre Baskerville'">Pour toi</p>`;
    const load = fakeFonts(clone);
    let done = false;
    const pending = onclone!(clone).then(() => { done = true; });
    await flush();
    expect(done).toBe(false);
    clone.querySelector("link")!.dispatchEvent(new Event("load"));
    await pending;
    expect(load).toHaveBeenCalled();
    vi.restoreAllMocks();
  }, 20000);
});
