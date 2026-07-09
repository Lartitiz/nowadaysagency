/**
 * Validation de CONTENU d'un .pptx téléchargé (jszip) — le nom de fichier ne
 * suffit pas : les bugs d'export HTML→PPTX (html2canvas) produisent des fichiers
 * qui s'ouvrent mais sont faux (fonds vides, calque texte perdu, labels
 * techniques « Slide N » — cf. régressions corrigées en #415/#420).
 *
 * Vérifie : zip valide, nombre de slides, une image de fond par slide et non
 * quasi-vide, présence de texte éditable, absence de label technique.
 */
import * as fs from "fs";
import JSZip from "jszip";

export interface PptxReport {
  slideCount: number;
  mediaCount: number;
  /** Taille de la plus petite image embarquée (octets) — un fond raté est minuscule. */
  mediaMinBytes: number;
  /** Tous les runs de texte (<a:t>) du document. */
  texts: string[];
  /** Défauts détectés — vide = PPTX sain. */
  problems: string[];
}

export async function validatePptx(
  filePath: string,
  opts: { minSlides?: number; expectEditableText?: boolean } = {},
): Promise<PptxReport> {
  const problems: string[] = [];
  const empty: PptxReport = { slideCount: 0, mediaCount: 0, mediaMinBytes: 0, texts: [], problems };

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
  for (const m of mediaFiles) {
    const b = await zip.files[m].async("nodebuffer");
    if (b.length < mediaMinBytes) mediaMinBytes = b.length;
    // Un fond 1080×1350 même très plat pèse > 3 Ko ; en dessous = capture ratée
    // (html2canvas a rendu du vide/transparent).
    if (b.length < 3_000) problems.push(`image quasi vide : ${m} (${b.length} o) — fond raté probable`);
  }
  if (!isFinite(mediaMinBytes)) mediaMinBytes = 0;
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

  return { slideCount, mediaCount: mediaFiles.length, mediaMinBytes, texts, problems };
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
