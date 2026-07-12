/**
 * Validation de CONTENU d'un .pptx téléchargé (jszip) — le nom de fichier ne
 * suffit pas : les bugs d'export HTML→PPTX (html2canvas) produisent des fichiers
 * qui s'ouvrent mais sont faux (fonds vides, calque texte perdu, labels
 * techniques « Slide N » — cf. régressions corrigées en #415/#420).
 *
 * Vérifie : zip valide, nombre de slides, une image de fond par slide et non
 * quasi-vide, présence de texte éditable, absence de label technique.
 *
 * « Fond raté » se mesure par le TAUX D'ENCRE (fraction de pixels qui diffèrent
 * du fond dominant), pas par la taille du fichier. Le poids en octets est un
 * mauvais juge : un carrousel « texte d'abord » a des fonds volontairement
 * épurés (fond transparent/uni + un peu de texte) qui compressent à ~3 Ko en
 * PNG — c'est SAIN. À l'inverse une capture ratée (html2canvas a rendu du vide)
 * est parfaitement uniforme (0 % d'encre) tout en pouvant peser 5–9 Ko. Seul le
 * taux d'encre sépare les deux : ~0 % = raté, tout contenu réel est bien au-dessus.
 */
import * as fs from "fs";
import JSZip from "jszip";

/**
 * En dessous de ce taux d'encre, l'image est considérée uniforme (capture
 * ratée). Une capture vide est à 0 % pile ; le moindre texte réel dépasse ~0,3 %
 * — le seuil laisse donc une marge confortable des deux côtés.
 */
const FLAT_INK_RATIO = 0.001;
/** Écart par canal (0-255) au-delà duquel un pixel compte comme « encre » (≠ fond). */
const INK_DELTA = 24;

export interface PptxReport {
  slideCount: number;
  mediaCount: number;
  /** Taille de la plus petite image embarquée (octets) — diagnostic seulement. */
  mediaMinBytes: number;
  /** Plus faible taux d'encre parmi les images décodées (−1 si aucune décodée). */
  mediaMinInk: number;
  /** Tous les runs de texte (<a:t>) du document. */
  texts: string[];
  /** Défauts détectés — vide = PPTX sain. */
  problems: string[];
}

/**
 * Taux d'encre d'un PNG : fraction de pixels qui diffèrent nettement de la
 * couleur de fond dominante. Retourne −1 si l'image n'est pas décodable (module
 * absent ou format inattendu) pour laisser l'appelant retomber sur une heuristique.
 */
async function inkRatio(buf: Buffer): Promise<number> {
  let decode: (b: Uint8Array) => { width: number; height: number; data: ArrayLike<number>; channels: number; depth: number };
  try {
    // fast-png : décodeur PNG pur-JS déjà présent (dépendance transitive de jspdf).
    ({ decode } = await import("fast-png"));
  } catch {
    return -1;
  }
  let img: ReturnType<typeof decode>;
  try {
    img = decode(buf);
  } catch {
    return -1;
  }
  const { width, height, data, channels, depth } = img;
  if (!width || !height) return -1;
  const scale = depth === 16 ? 1 / 257 : 1; // ramène tout sur 0-255
  // Accès pixel normalisé → [r, g, b, a] sur 0-255, quel que soit le color type.
  const px = (idx: number): [number, number, number, number] => {
    const i = idx * channels;
    if (channels >= 3) {
      const a = channels === 4 ? data[i + 3] * scale : 255;
      return [data[i] * scale, data[i + 1] * scale, data[i + 2] * scale, a];
    }
    const g = data[i] * scale; // 1 = gris, 2 = gris + alpha
    const a = channels === 2 ? data[i + 1] * scale : 255;
    return [g, g, g, a];
  };
  const total = width * height;
  const stride = Math.max(1, Math.round(Math.sqrt(total / 200_000))); // ≤ ~200k échantillons
  // 1re passe : couleur de fond dominante (histogramme quantifié 5 bits/canal ;
  // les pixels quasi transparents forment un seau « T » à part).
  const hist = new Map<number | "T", number>();
  const bucket = (r: number, g: number, b: number, a: number): number | "T" =>
    a < 8 ? "T" : (((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const [r, g, b, a] = px(y * width + x);
      const k = bucket(r, g, b, a);
      hist.set(k, (hist.get(k) ?? 0) + 1);
    }
  }
  let domKey: number | "T" = "T";
  let domN = -1;
  for (const [k, n] of hist) if (n > domN) { domN = n; domKey = k; }
  const domTransparent = domKey === "T";
  const packed = domTransparent ? 0 : (domKey as number);
  const dr = ((packed >> 10) & 31) << 3;
  const dg = ((packed >> 5) & 31) << 3;
  const db = (packed & 31) << 3;
  // 2e passe : compte les pixels « encre » (≠ fond dominant).
  let ink = 0;
  let seen = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const [r, g, b, a] = px(y * width + x);
      seen++;
      if (domTransparent) {
        if (a >= 8) ink++; // sur fond transparent, tout pixel opaque = contenu
      } else {
        if (a < 8) continue; // pixel transparent sur fond opaque : on ignore
        if (Math.max(Math.abs(r - dr), Math.abs(g - dg), Math.abs(b - db)) > INK_DELTA) ink++;
      }
    }
  }
  return seen ? ink / seen : -1;
}

export async function validatePptx(
  filePath: string,
  opts: { minSlides?: number; expectEditableText?: boolean } = {},
): Promise<PptxReport> {
  const problems: string[] = [];
  const empty: PptxReport = { slideCount: 0, mediaCount: 0, mediaMinBytes: 0, mediaMinInk: -1, texts: [], problems };

  const buf = fs.readFileSync(filePath);
  if (buf.length < 10_000) problems.push(`fichier suspect (${buf.length} octets)`);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    problems.push("le fichier n'est pas un zip/pptx lisible");
    return empty;
  }

  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const slideCount = slideFiles.length;
  const minSlides = opts.minSlides ?? 1;
  if (slideCount < minSlides) problems.push(`${slideCount} slide(s) — au moins ${minSlides} attendues`);

  const mediaFiles = Object.keys(zip.files).filter((n) => /^ppt\/media\//.test(n) && !zip.files[n].dir);
  let mediaMinBytes = Infinity;
  let mediaMinInk = Infinity;
  for (const m of mediaFiles) {
    const b = await zip.files[m].async("nodebuffer");
    if (b.length < mediaMinBytes) mediaMinBytes = b.length;
    // Juge le CONTENU, pas le poids : un fond « texte d'abord » épuré est léger
    // mais plein de sens ; une capture ratée est uniforme (0 % d'encre).
    const ink = await inkRatio(b);
    if (ink >= 0) {
      if (ink < mediaMinInk) mediaMinInk = ink;
      if (ink < FLAT_INK_RATIO) {
        problems.push(
          `fond raté : ${m} — image uniforme (${(ink * 100).toFixed(2)} % d'encre, ${b.length} o), capture vide probable`,
        );
      }
    } else if (b.length < 1_000) {
      // Filet de sécurité si le PNG n'est pas décodable (module absent / format
      // exotique) : un fichier < 1 Ko est de toute façon suspect.
      problems.push(`image quasi vide : ${m} (${b.length} o) — non décodable et minuscule`);
    }
  }
  if (!isFinite(mediaMinBytes)) mediaMinBytes = 0;
  if (!isFinite(mediaMinInk)) mediaMinInk = -1;
  // L'export hybride = une image de fond PAR slide (+ logo éventuel).
  if (mediaFiles.length < slideCount) {
    problems.push(`${mediaFiles.length} image(s) pour ${slideCount} slides — fond(s) manquant(s)`);
  }

  const texts: string[] = [];
  for (const s of slideFiles) {
    const xml = await zip.files[s].async("string");
    for (const m of xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)) texts.push(m[1]);
  }
  if (opts.expectEditableText && !texts.some((t) => t.trim().length > 0)) {
    problems.push("aucun texte éditable dans le PPTX (calque texte perdu — l'hybride n'est plus hybride)");
  }
  const slideLabels = texts.filter((t) => /^\s*Slide\s+\d+\s*$/i.test(t));
  if (slideLabels.length) {
    problems.push(`${slideLabels.length} label(s) technique(s) « Slide N » dans le texte (régression du bug #415)`);
  }

  return { slideCount, mediaCount: mediaFiles.length, mediaMinBytes, mediaMinInk, texts, problems };
}

/** Extrait la plus grosse image du pptx (≈ le fond de slide) pour le regard UX. */
export async function extractLargestMedia(filePath: string, outPath: string): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
    const medias = Object.keys(zip.files).filter((n) => /^ppt\/media\//.test(n) && !zip.files[n].dir);
    let best: { name: string; buf: Buffer } | null = null;
    for (const m of medias) {
      const b = await zip.files[m].async("nodebuffer");
      if (!best || b.length > best.buf.length) best = { name: m, buf: b };
    }
    if (!best) return null;
    fs.writeFileSync(outPath, best.buf);
    return outPath;
  } catch {
    return null;
  }
}
