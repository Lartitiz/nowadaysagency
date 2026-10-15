import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Contrat d'ORDRE DES CALQUES de l'export hybride (fiche 15 de
 * docs/robustesse/gros-fichiers.md, test 4, posé après le lot 2).
 *
 * Le vrai exporteur tourne de bout en bout ; seuls les outils du navigateur
 * sont remplacés : le cadre caché (jsdom ne charge pas `srcdoc`), la
 * photographie de la slide, pptxgenjs (une fausse présentation note chaque
 * appel, dans l'ordre) et les détecteurs de blocs (qui demandent une vraie
 * mise en page). On vérifie ce qu'aucun autre test ne voit :
 *   fond sous photo → photo → formes → image de fond → pastilles → emojis →
 *   texte → logo ; l'ordre des slides malgré le traitement par lots ;
 *   onProgress ; returnBlob ; editor_id ; les deux issues d'une erreur.
 */

type Appel = { slide: number; op: string; detail?: unknown };
const journal: Appel[] = [];
const fonds: Record<number, unknown> = {};
let ecrit: { blob?: boolean; fileName?: string } = {};

vi.mock("pptxgenjs", () => {
  class FausseSlide {
    constructor(private n: number) {}
    addShape(kind: string, opts: { fill?: { color?: string } }) {
      journal.push({ slide: this.n, op: `shape:${kind}`, detail: opts.fill?.color });
    }
    addImage(opts: { data: string }) {
      journal.push({ slide: this.n, op: "image", detail: opts.data.slice(0, 40) });
    }
    addText(text: unknown) {
      const t = typeof text === "string" ? text : (text as { text: string }[]).map((r) => r.text).join("");
      journal.push({ slide: this.n, op: "text", detail: t });
    }
    set background(v: unknown) {
      fonds[this.n] = v;
    }
  }
  return {
    default: class {
      private n = 0;
      layout = "";
      author = "";
      defineLayout() {}
      addSlide() {
        this.n += 1;
        return new FausseSlide(this.n);
      }
      async write() {
        ecrit = { blob: true };
        return new Blob(["pptx"]);
      }
      async writeFile(o: { fileName: string }) {
        ecrit = { fileName: o.fileName };
      }
    },
  };
});

vi.mock("html2canvas-pro", () => ({ default: vi.fn() }));
vi.mock("@sentry/react", () => ({ captureMessage: vi.fn() }));
vi.mock("@/lib/carousel-media", () => ({
  inlineSlidesMedia: async (s: unknown) => s,
  inlineCarouselMedia: async (u: string) => u,
}));
vi.mock("@/lib/export-logo", () => ({ fetchLogoAsBase64: async (u: string | null) => (u ? "data:image/png;base64,LOGO" : null) }));
vi.mock("@/lib/pptx-mixed-text", async (orig) => ({ ...(await orig<object>()), promoteMixedText: () => {} }));

// Cadre caché : un vrai document jsdom, sans srcdoc ; les rectangles sont lus
// dans l'attribut data-r="x,y,w,h". `data-retard` retarde une slide (lots).
const echecs: Record<string, Error> = {};
vi.mock("@/lib/export-carousel-hybrid/iframe", () => ({
  mountIframe: async (html: string) => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const win = iframe.contentWindow as unknown as typeof globalThis;
    win.Element.prototype.getBoundingClientRect = function (this: Element) {
      const [x, y, w, h] = (this.getAttribute("data-r") || "0,0,0,0").split(",").map(Number);
      return { x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
    };
    iframe.contentDocument!.body.innerHTML = html;
    const retard = iframe.contentDocument!.querySelector("[data-retard]")?.getAttribute("data-retard");
    if (retard) await new Promise((r) => setTimeout(r, Number(retard)));
    return iframe;
  },
  // C'est en attendant les images que l'export rencontre ses erreurs (image
  // manquante → ExportImageError) : `data-echec` en simule une.
  waitReady: async (iframe: HTMLIFrameElement) => {
    const cle = iframe.contentDocument!.querySelector("[data-echec]")?.getAttribute("data-echec");
    if (cle) throw echecs[cle];
  },
}));

vi.mock("@/lib/export-carousel-hybrid/capture", async (orig) => ({
  ...(await orig<object>()),
  captureBody: async () => "data:image/png;base64,RASTER",
  renderEmojiImage: (z: { rect: { x: number; y: number; w: number; h: number } }) => ({ data: "data:image/png;base64,EMOJI", ...z.rect }),
}));

// Détecteurs de blocs : lus dans des attributs simples du HTML de test.
const rect = (el: Element) => {
  const [x, y, w, h] = (el.getAttribute("data-r") || "0,0,0,0").split(",").map(Number);
  return { x, y, w, h };
};
const style = {
  color: "#1A1A1A", fontFamily: "Arial", fontSizePx: 40, fontWeight: 400, fontStyle: "normal",
  textAlign: "left" as const, textTransform: "none", lineHeight: 50, letterSpacingPx: 0,
};
vi.mock("@/lib/pptx-font-mapping", async (orig) => ({
  ...(await orig<object>()),
  extractAnnotatedBlocks: (doc: Document) =>
    Array.from(doc.querySelectorAll("[data-pptx-editable]")).map((el) => ({
      el, text: el.textContent || "", rect: rect(el), style, kind: el.getAttribute("data-pptx-editable"),
    })),
  extractEditableBlocks: () => [],
  extractShapeBlocks: (doc: Document) =>
    Array.from(doc.querySelectorAll("[data-pptx-shape]")).map((el) => ({
      el, type: el.getAttribute("data-pptx-shape"), rect: rect(el), fill: el.getAttribute("data-fill") || "EEEEEE", borderRadiusPx: 0,
    })),
  extractHeuristicShapes: () => [],
  extractStandaloneEmojiZones: (doc: Document) =>
    Array.from(doc.querySelectorAll<HTMLElement>("[data-emoji]")).map((el) => ({
      el, rect: rect(el), emoji: el.textContent || "", fontSizePx: 60, fontFamily: "Arial", fontWeight: 400, fontStyle: "normal", textAlign: "left",
    })),
}));

// Photos : jsdom ne décode aucune image → échec immédiat (photo posée sans recadrage).
class ImageSansDecodage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(v: string) {
    if (v) setTimeout(() => this.onerror?.(), 0);
  }
}

const PHOTO = "data:image/jpeg;base64,PHOTO";

/** Slide à photo EN ENCART dans une carte opaque, avec forme, pastille, emoji et texte. */
const SLIDE_COMPLETE = `
  <div id="racine" style="background-color: rgb(246, 244, 240)" data-r="0,0,1080,1350">
    <div id="carte" style="background-color: rgb(255, 255, 255)" data-r="80,80,920,1190">
      <div data-pptx-photo="1" data-r="80,80,920,660"></div>
      <h2 data-pptx-editable="title" data-r="128,800,800,60">Un geste à la fois</h2>
      <div data-pptx-shape="card" data-fill="F0E6DC" data-r="128,900,824,200"></div>
      <div data-pptx-shape="pill" data-fill="FB3D80" data-r="128,1140,300,60">
        <span data-pptx-editable="caption" data-r="140,1145,200,50">LIEN EN BIO</span>
      </div>
      <span data-emoji data-r="900,1140,60,60">✨</span>
    </div>
  </div>`;

async function exporter(
  slides: { slide_number: number; html: string }[],
  opts: { photos?: { base64: string }[]; slidesData?: unknown[]; logo?: string | null; returnBlob?: boolean; onProgress?: (a: number, b: number) => void } = {},
) {
  const { exportCarouselHybridPptx } = await import("@/lib/export-carousel-hybrid-pptx");
  return exportCarouselHybridPptx(
    slides,
    (opts.slidesData as never) ?? null,
    { color_background: "#FFF4F8", color_text: "#1A1A1A" },
    "test",
    opts.photos,
    opts.logo ?? null,
    { returnBlob: opts.returnBlob, onProgress: opts.onProgress },
  );
}

beforeEach(() => {
  journal.length = 0;
  for (const k of Object.keys(fonds)) delete fonds[Number(k)];
  ecrit = {};
  vi.stubGlobal("Image", ImageSansDecodage);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

describe("export hybride — ordre des calques d'une slide", () => {
  it("fond sous photo → photo → formes → image de fond → pastilles → emojis → texte → logo", async () => {
    await exporter([{ slide_number: 1, html: SLIDE_COMPLETE }], { photos: [{ base64: PHOTO }], logo: "https://logo" });
    expect(journal.map((a) => `${a.op}${a.detail ? ` ${a.detail}` : ""}`)).toEqual([
      "shape:rect FFFFFF", // la carte blanche déborde de la photo : repeinte SOUS la photo
      `image ${PHOTO}`, // photo d'origine (non recadrée : jsdom ne décode pas)
      "shape:rect F0E6DC", // forme native
      "image data:image/png;base64,RASTER", // image de fond photographiée
      "shape:rect FB3D80", // pastille élargie, au-dessus de l'image de fond
      "image data:image/png;base64,EMOJI", // emoji isolé
      "text Un geste à la fois",
      "text LIEN EN BIO",
      "image data:image/png;base64,LOGO", // logo tout en haut
    ]);
    // La racine, le plus grand fond effacé, devient le fond natif de la slide.
    expect(fonds[1]).toEqual({ color: "F6F4F0" });
  });

  it("photo retouchée dans l'éditeur (editor_id) : la photo reste dans l'image de fond", async () => {
    await exporter([{ slide_number: 1, html: SLIDE_COMPLETE }], {
      photos: [{ base64: PHOTO }],
      slidesData: [{ slide_number: 1, editor_id: "e1" }],
    });
    expect(journal.some((a) => a.detail === PHOTO)).toBe(false);
    expect(journal.filter((a) => a.op === "image")).toHaveLength(2); // fond + emoji
  });
});

describe("export hybride — plusieurs slides", () => {
  it("garde l'ordre des slides malgré le traitement par lots, et suit l'avancement", async () => {
    const progres: [number, number][] = [];
    const slides = [1, 2, 3, 4].map((n) => ({
      slide_number: n,
      // La slide 1 finit en dernier : son texte doit quand même aller sur la slide 1.
      html: `<div ${n === 1 ? 'data-retard="30"' : ""} data-r="0,0,1080,1350"><p data-pptx-editable="body" data-r="100,100,800,60">Slide ${n}</p></div>`,
    }));
    await exporter(slides, { onProgress: (a, b) => progres.push([a, b]) });
    const textes = journal.filter((a) => a.op === "text").map((a) => [a.slide, a.detail]);
    expect(textes).toEqual(expect.arrayContaining([[1, "Slide 1"], [2, "Slide 2"], [3, "Slide 3"], [4, "Slide 4"]]));
    expect(progres).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]]);
    expect(ecrit.fileName).toMatch(/\.pptx$/);
  });

  it("returnBlob : rend le PowerPoint sans le télécharger (pont Canva)", async () => {
    const out = await exporter([{ slide_number: 1, html: `<p data-pptx-editable="body" data-r="0,0,500,60">Bonjour</p>` }], { returnBlob: true });
    expect(out).toBeInstanceOf(Blob);
    expect(ecrit).toEqual({ blob: true });
  });
});

describe("export hybride — erreurs", () => {
  it("une erreur ordinaire sur une slide : fond uni de la charte, les autres slides continuent", async () => {
    echecs.panne = new Error("cadre en panne");
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    await exporter([
      { slide_number: 1, html: `<div data-echec="panne"></div>` },
      { slide_number: 2, html: `<p data-pptx-editable="body" data-r="0,0,500,60">Suite</p>` },
    ]);
    expect(fonds[1]).toEqual({ color: "FFF4F8" });
    expect(journal.filter((a) => a.slide === 2 && a.op === "text")).toHaveLength(1);
    erreur.mockRestore();
  });

  it("une image manquante (ExportImageError) fait échouer tout l'export", async () => {
    const { ExportImageError } = await import("@/lib/export-image-readiness");
    echecs.image = new ExportImageError();
    await expect(exporter([{ slide_number: 1, html: `<div data-echec="image"></div>` }])).rejects.toBeInstanceOf(ExportImageError);
  });
});
