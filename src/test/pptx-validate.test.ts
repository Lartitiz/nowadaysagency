import { describe, it, expect } from "vitest";
import { encode } from "fast-png";
import JSZip from "jszip";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { validatePptx } from "../../e2e-visite/pptx-validate";

/**
 * Le validateur PPTX en est à sa 4e itération (#544 → #549 → #562 → 17/07) et a
 * produit DEUX faux positifs en prod, à chaque fois sur des fonds légitimement
 * ÉPURÉS. Ces cas verrouillent sa sémantique pour de bon :
 *
 *   aplat plein          → « fond raté »       (vraie capture html2canvas ratée)
 *   voile 100 % semi-transp. → « voile sans fond » (image dessous disparue — bug 17/07)
 *   texture matiérée     → RIEN                (0 % d'encre mais grain réel = légitime)
 *   overlay transparent  → RIEN                (exemption #562)
 *
 * Les valeurs des fixtures sont MESURÉES sur les artefacts réels du 17/07 :
 * voile #1C1C20 alpha 0,30→0,65 / 0 % opaque ; texture papier crème 96 % opaque.
 */

const W = 160;
const H = 200;

/** PNG RGBA construit pixel par pixel. */
function png(fill: (x: number, y: number) => [number, number, number, number]): Buffer {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * W + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return Buffer.from(encode({ width: W, height: H, data, channels: 4, depth: 8 }));
}

// Capture ratée : blanc pur, une seule couleur, opaque.
const APLAT_BLANC = png(() => [255, 255, 255, 255]);

// Bug 17/07 : voile #1C1C20 dégradé verticalement (alpha 0,30→0,65), AUCUN pixel
// opaque — l'image qu'il devait assombrir a disparu.
const VOILE_SANS_FOND = png((_x, y) => [28, 28, 32, Math.round(77 + (96 * y) / H)]);

// Texture papier de marque : crème, opaque, grain fin → 0 % d'encre mais matière
// réelle. Grain INDÉPENDANT par canal, comme la vraie texture (mesurée le 17/07 :
// moyenne 240,7, écart-type 2,1, 68 couleurs exactes, 96 % opaque). L'amplitude
// reste très sous INK_DELTA → le taux d'encre est bien 0 %.
const TEXTURE_PAPIER = png((x, y) => {
  const g = (k: number) => {
    // Hash entier 32 bits (|0 partout : au-delà, les flottants JS écrasent les bits
    // de poids faible et le grain s'effondre sur une seule valeur).
    let h = (x * 374761393 + y * 668265263 + k * 1013904223) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h >>> 0) % 7) - 3; // ±3, très sous INK_DELTA
  };
  return [244 + g(1), 242 + g(2), 238 + g(3), 255];
});

// Overlay hybride légitime : dominante transparente + une pastille opaque (#562).
const OVERLAY_TRANSPARENT = png((x, y) =>
  x > 20 && x < 50 && y > 20 && y < 40 ? [28, 28, 32, 255] : [0, 0, 0, 0],
);

const SLIDE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>
 <p:sp><p:txBody><a:p><a:r><a:t>Un titre bien réel</a:t></a:r></a:p></p:txBody></p:sp>
 </p:spTree></p:cSld></p:sld>`;

/** Fabrique un .pptx minimal contenant ces images, et le valide. */
async function valide(medias: Record<string, Buffer>) {
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", SLIDE_XML);
  for (const [nom, buf] of Object.entries(medias)) zip.file(`ppt/media/${nom}`, buf);
  // Le validateur rejette les fichiers < 10 ko → on rembourre hors de ppt/media.
  zip.file("docProps/thumbnail.txt", "x".repeat(20_000));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pptx-")), "t.pptx");
  fs.writeFileSync(p, buf);
  return validatePptx(p, { minSlides: 1, expectEditableText: true });
}

describe("validatePptx — fond raté vs fond légitimement uniforme", () => {
  it("flagge un APLAT blanc (capture html2canvas ratée)", async () => {
    const r = await valide({ "image-1-1.png": APLAT_BLANC });
    expect(r.problems.join(" ")).toMatch(/fond raté/);
  });

  it("flagge un VOILE 100 % semi-transparent — bug 17/07 (l'image dessous a disparu)", async () => {
    const r = await valide({ "image-1-1.png": VOILE_SANS_FOND });
    expect(r.problems.join(" ")).toMatch(/voile sans fond/);
  });

  it("laisse passer la TEXTURE de marque (0 % d'encre mais grain réel)", async () => {
    const r = await valide({ "image-1-1.png": TEXTURE_PAPIER });
    expect(r.problems).toEqual([]);
  });

  it("laisse passer un overlay à dominante transparente (exemption #562)", async () => {
    const r = await valide({ "image-1-1.png": OVERLAY_TRANSPARENT });
    expect(r.problems).toEqual([]);
  });

  it("ne confond pas texture et aplat quand les deux coexistent", async () => {
    const r = await valide({ "image-1-1.png": TEXTURE_PAPIER, "image-2-1.png": APLAT_BLANC });
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/image-2-1\.png/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Faux positif « fond raté » sur un fond APLAT hybride (21/07).
//
// Dans l'export hybride « éditable », le texte est posé en NATIF par-dessus le
// fond ; un fond aplat (blanc/primaire, tirage normal de l'alternance
// texture/blanc/primaire) est un CHOIX de design, pas une capture ratée. Le poids
// ne tranche pas (un aplat pèse pareil qu'une capture blanche). Seul signal : la
// slide porte-t-elle du texte natif ? `backgroundIsDecorative` n'exempte l'aplat
// QUE des slides qui ont du texte — une slide sans fond ET sans texte reste
// flaggée. Les rels (slideN.xml.rels → media) portent la correspondance fond↔slide.
// ─────────────────────────────────────────────────────────────────────────────

const SLIDE_SANS_TEXTE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>
 </p:spTree></p:cSld></p:sld>`;

const REL = (media: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
  `Target="../media/${media}"/></Relationships>`;

/** .pptx minimal AVEC rels : une slide par entrée, texte natif optionnel. */
async function valideRels(
  slides: { media: string; buf: Buffer; texte: boolean }[],
  opts: Parameters<typeof validatePptx>[1] = {},
) {
  const zip = new JSZip();
  slides.forEach((s, i) => {
    const n = i + 1;
    zip.file(`ppt/slides/slide${n}.xml`, s.texte ? SLIDE_XML : SLIDE_SANS_TEXTE);
    zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, REL(s.media));
    zip.file(`ppt/media/${s.media}`, s.buf);
  });
  zip.file("docProps/thumbnail.txt", "x".repeat(20_000));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pptx-")), "t.pptx");
  fs.writeFileSync(p, buf);
  return validatePptx(p, opts);
}

describe("validatePptx — fond aplat hybride légitime (texte natif par-dessus)", () => {
  it("garde-fou : les aplats sont bien décodés (mediaMinInk ~0, pas -1)", async () => {
    const r = await valideRels([{ media: "image-1-1.png", buf: APLAT_BLANC, texte: true }], { minSlides: 1 });
    expect(r.mediaMinInk).toBeGreaterThanOrEqual(0);
    expect(r.mediaMinInk).toBeLessThan(0.001);
  });

  it("backgroundIsDecorative : exempte l'aplat de la slide AVEC texte, PAS celle sans texte", async () => {
    const r = await valideRels(
      [
        { media: "image-1-1.png", buf: APLAT_BLANC, texte: true }, // fond uni VOULU
        { media: "image-2-1.png", buf: APLAT_BLANC, texte: false }, // vraie capture ratée
      ],
      { minSlides: 2, backgroundIsDecorative: true },
    );
    const fondRates = r.problems.filter((p) => p.startsWith("fond raté"));
    expect(fondRates.some((p) => p.includes("image-1-1.png"))).toBe(false);
    expect(fondRates.some((p) => p.includes("image-2-1.png"))).toBe(true);
  });

  it("export VISUEL (sans backgroundIsDecorative) : l'aplat reste flaggé même avec du texte (strict inchangé)", async () => {
    const r = await valideRels([{ media: "image-1-1.png", buf: APLAT_BLANC, texte: true }], { minSlides: 1 });
    expect(r.problems.some((p) => p.startsWith("fond raté") && p.includes("image-1-1.png"))).toBe(true);
  });

  it("ne masque PAS un VOILE #575 : texture disparue reste flaggée même en décoratif + texte", async () => {
    const r = await valideRels([{ media: "image-1-1.png", buf: VOILE_SANS_FOND, texte: true }], {
      minSlides: 1,
      backgroundIsDecorative: true,
    });
    expect(r.problems.some((p) => p.startsWith("voile sans fond"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Photo occultée (bug Canva 21/07).
//
// Carrousel PHOTO hybride : la photo native est posée en couche BOTTOM, le
// raster de fond par-dessus, avec un « trou » transparent à l'emplacement de
// la photo. La racine charbon des gabarits composés (non annotée
// data-pptx-shape) remplissait ce trou → raster pleine slide 100 % OPAQUE
// par-dessus la photo = carrousel tout noir à l'import Canva. Deux règles :
//   raster pleine slide ~100 % opaque AU-DESSUS d'une image → « photo occultée »
//   raster 100 % voile AU-DESSUS d'une image → RIEN (il assombrit la photo
//   native dessous — à distinguer du voile ORPHELIN #575, image seule)
// ─────────────────────────────────────────────────────────────────────────────

// Aplat charbon #1a1815 opaque : la racine des gabarits cuite dans le raster.
const APLAT_CHARBON = png(() => [26, 24, 21, 255]);
// « Photo » native : contenu contrasté opaque quelconque.
const PHOTO_NATIVE = png((x, y) => [(x * 7) % 256, (y * 5) % 256, 120, 255]);

const SLD_W = 6858000;
const SLD_H = 8572500;
const PRESENTATION_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
  `<p:sldSz cx="${SLD_W}" cy="${SLD_H}"/></p:presentation>`;

const PIC = (rid: string, cx = SLD_W, cy = SLD_H) =>
  `<p:pic><p:blipFill><a:blip r:embed="${rid}"></a:blip></p:blipFill>` +
  `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm></p:spPr></p:pic>`;

/** .pptx minimal : UNE slide, images empilées dans l'ordre de peinture. */
async function valideStack(medias: { nom: string; buf: Buffer; cx?: number; cy?: number }[]) {
  const zip = new JSZip();
  const pics = medias.map((m, i) => PIC(`rId${i + 1}`, m.cx, m.cy)).join("");
  zip.file("ppt/presentation.xml", PRESENTATION_XML);
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree>
 ${pics}
 <p:sp><p:txBody><a:p><a:r><a:t>Un titre bien réel</a:t></a:r></a:p></p:txBody></p:sp>
 </p:spTree></p:cSld></p:sld>`,
  );
  const rels = medias
    .map(
      (m, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${m.nom}"/>`,
    )
    .join("");
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
  );
  for (const m of medias) zip.file(`ppt/media/${m.nom}`, m.buf);
  zip.file("docProps/thumbnail.txt", "x".repeat(20_000));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pptx-")), "t.pptx");
  fs.writeFileSync(p, buf);
  return validatePptx(p, { minSlides: 1, expectEditableText: true, backgroundIsDecorative: true });
}

describe("validatePptx — photo occultée / voile sur photo native (21/07)", () => {
  it("flagge un raster pleine slide opaque posé PAR-DESSUS la photo native", async () => {
    const r = await valideStack([
      { nom: "image-1-1.png", buf: PHOTO_NATIVE },
      { nom: "image-1-2.png", buf: APLAT_CHARBON },
    ]);
    expect(r.problems.some((p) => p.startsWith("photo occultée") && p.includes("image-1-2.png"))).toBe(true);
  });

  it("laisse passer un VOILE posé par-dessus la photo native (il l'assombrit, cas sain)", async () => {
    const r = await valideStack([
      { nom: "image-1-1.png", buf: PHOTO_NATIVE },
      { nom: "image-1-2.png", buf: VOILE_SANS_FOND },
    ]);
    expect(r.problems).toEqual([]);
  });

  it("ne flagge PAS un raster opaque partiel (carte photo mix : le trou est ailleurs)", async () => {
    const r = await valideStack([
      { nom: "image-1-1.png", buf: PHOTO_NATIVE },
      { nom: "image-1-2.png", buf: APLAT_CHARBON, cx: Math.round(SLD_W * 0.5), cy: SLD_H },
    ]);
    expect(r.problems.some((p) => p.startsWith("photo occultée"))).toBe(false);
  });

  it("un voile ORPHELIN (image seule sur la slide) reste « voile sans fond » (#575)", async () => {
    const r = await valideStack([{ nom: "image-1-1.png", buf: VOILE_SANS_FOND }]);
    expect(r.problems.some((p) => p.startsWith("voile sans fond"))).toBe(true);
  });
});
