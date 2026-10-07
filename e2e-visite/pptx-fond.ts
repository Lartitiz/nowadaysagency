/**
 * Reconstitue le FOND RÉEL d'une slide de PPTX pour « le regard » contraste.
 *
 * Pourquoi : l'ancienne capture prenait la PLUS GROSSE image du PPTX. Dans
 * l'export hybride, c'est souvent un calque RGBA quasi transparent (halos,
 * pilules) posé sur un fond natif <p:bg> : affiché seul, un fond noir et deux
 * bulles, sans rapport avec la slide (constat 07/10). Le regard contraste
 * (famille #415, texte clair sur fond clair) était aveugle.
 *
 * Ici on rejoue la pile de la slide, dans l'ordre de peinture, SANS le texte :
 *  1. couleur (ou image) de fond : <p:bg> de la slide, sinon layout, sinon master
 *     (srgbClr, ou schemeClr résolu via le thème) ; blanc par défaut ;
 *  2. chaque <p:pic> (r:embed → ppt/media) à sa position/taille EMU, recadrage
 *     <a:srcRect> compris ;
 *  3. le remplissage uni des formes natives (cartes, aplats) — leur texte est omis.
 * Le compositing est fait par Chromium (déjà là pour Playwright) : PNG/JPEG,
 * alpha et mise à l'échelle sans nouvelle dépendance. Le résultat est opaque.
 */
import * as fs from "fs";
import JSZip from "jszip";
import { chromium } from "@playwright/test";

const OUT_WIDTH = 1080; // px du PNG produit (hauteur au ratio de la slide)

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

const SCHEME_ALIAS: Record<string, string> = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };

/** Couleur d'un fragment <a:solidFill>…</a:solidFill> → rgba CSS, ou null. */
function fillToCss(fill: string, theme: string): string | null {
  let hex = fill.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/)?.[1];
  if (!hex) {
    const scheme = fill.match(/<a:schemeClr val="(\w+)"/)?.[1];
    if (scheme) {
      const key = SCHEME_ALIAS[scheme] ?? scheme;
      const def = theme.match(new RegExp(`<a:${key}>([\\s\\S]*?)</a:${key}>`))?.[1] ?? "";
      hex = def.match(/(?:srgbClr val|lastClr)="([0-9A-Fa-f]{6})"/)?.[1];
    }
  }
  if (!hex) return null;
  const alpha = Number(fill.match(/<a:alpha val="(\d+)"/)?.[1] ?? 100000) / 100000;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex!.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

async function readText(zip: JSZip, name: string): Promise<string> {
  return zip.files[name] ? zip.files[name].async("string") : "";
}

/** Map rId → chemin zip (ppt/…) depuis un fichier .rels, relatif au dossier de `part`. */
async function readRels(zip: JSZip, part: string): Promise<Map<string, string>> {
  const dir = part.replace(/[^/]+$/, "");
  const relXml = await readText(zip, `${dir}_rels/${part.slice(dir.length)}.rels`);
  const out = new Map<string, string>();
  for (const m of relXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1];
    const target = m[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (!id || !target) continue;
    // Résout « ../media/x.png » relativement au dossier de la part.
    const parts = (dir + target).split("/");
    const stack: string[] = [];
    for (const p of parts) {
      if (p === "..") stack.pop();
      else if (p && p !== ".") stack.push(p);
    }
    out.set(id, stack.join("/"));
  }
  return out;
}

async function dataUri(zip: JSZip, name: string): Promise<string | null> {
  const f = zip.files[name];
  if (!f) return null;
  const ext = name.split(".").pop()!.toLowerCase();
  const mime = MIME[ext];
  if (!mime) return null; // emf/wmf… : Chromium ne sait pas les peindre
  return `data:${mime};base64,${await f.async("base64")}`;
}

/** Fond d'une part (slide/layout/master) : { color } ou { image } ou null s'il n'en déclare pas. */
async function partBackground(
  zip: JSZip,
  part: string,
  theme: string,
): Promise<{ color?: string; image?: string } | null> {
  const xml = await readText(zip, part);
  const bg = xml.match(/<p:bg>([\s\S]*?)<\/p:bg>/)?.[1];
  if (!bg) return null;
  const blip = bg.match(/<a:blip\b[^>]*r:embed="([^"]+)"/)?.[1];
  if (blip) {
    const target = (await readRels(zip, part)).get(blip);
    const uri = target ? await dataUri(zip, target) : null;
    if (uri) return { image: uri };
  }
  const solid = bg.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/)?.[0];
  if (solid) {
    const css = fillToCss(solid, theme);
    if (css) return { color: css };
  }
  // <p:bgRef idx="…"><a:schemeClr val="bg1"/></p:bgRef> : on retient la couleur portée.
  const ref = bg.match(/<p:bgRef\b[\s\S]*?<\/p:bgRef>/)?.[0];
  if (ref) {
    const css = fillToCss(ref, theme);
    if (css) return { color: css };
  }
  return null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Construit le HTML de la pile de fond de la slide n (null si la slide n'existe pas). */
export async function buildSlideBackgroundHtml(
  zip: JSZip,
  slideNo = 1,
): Promise<{ html: string; width: number; height: number; layers: number } | null> {
  const slidePart = `ppt/slides/slide${slideNo}.xml`;
  if (!zip.files[slidePart]) return null;
  const pres = await readText(zip, "ppt/presentation.xml");
  const sz = pres.match(/<p:sldSz[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
  const sldW = sz ? Number(sz[1]) : 0;
  const sldH = sz ? Number(sz[2]) : 0;
  if (!sldW || !sldH) return null;
  const k = OUT_WIDTH / sldW; // EMU → px
  const width = OUT_WIDTH;
  const height = Math.round(sldH * k);

  const slideXml = await readText(zip, slidePart);
  const slideRels = await readRels(zip, slidePart);
  // Chaîne d'héritage du fond : slide → layout → master (thème lu sur le master).
  const layoutPart = [...slideRels.values()].find((t) => /slideLayouts\/slideLayout\d+\.xml$/.test(t));
  const masterPart = layoutPart
    ? [...(await readRels(zip, layoutPart)).values()].find((t) => /slideMasters\/slideMaster\d+\.xml$/.test(t))
    : undefined;
  const themePart = masterPart
    ? [...(await readRels(zip, masterPart)).values()].find((t) => /theme\/theme\d+\.xml$/.test(t))
    : undefined;
  const theme = themePart ? await readText(zip, themePart) : "";
  let bg: { color?: string; image?: string } | null = null;
  for (const part of [slidePart, layoutPart, masterPart]) {
    if (part && (bg = await partBackground(zip, part, theme))) break;
  }

  const layers: string[] = [];
  // Ordre de peinture = ordre des éléments dans le spTree, images ET formes mêlées.
  for (const em of slideXml.matchAll(/<p:(pic|sp)>[\s\S]*?<\/p:\1>/g)) {
    const frag = em[0];
    const off = frag.match(/<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/);
    const ext = frag.match(/<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/);
    if (!off || !ext) continue;
    const [x, y, w, h] = [off[1], off[2], ext[1], ext[2]].map((v) => Number(v) * k);
    const rot = Number(frag.match(/<a:xfrm\b[^>]*\brot="(-?\d+)"/)?.[1] ?? 0) / 60000;
    const box = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg)`;
    if (em[1] === "pic") {
      const rid = frag.match(/r:embed="([^"]+)"/)?.[1];
      const target = rid ? slideRels.get(rid) : undefined;
      const uri = target ? await dataUri(zip, target) : null;
      if (!uri) continue;
      // <a:srcRect l t r b> en 1/100000 : part de l'image rognée de chaque côté.
      const sr = frag.match(/<a:srcRect\b([^>]*)\/>/)?.[1] ?? "";
      const cut = (side: string) => Number(sr.match(new RegExp(`\\b${side}="(-?\\d+)"`))?.[1] ?? 0) / 100000;
      const [l, t, r, b] = ["l", "t", "r", "b"].map(cut);
      const iw = w / Math.max(0.01, 1 - l - r);
      const ih = h / Math.max(0.01, 1 - t - b);
      const opacity = Number(frag.match(/<a:alphaModFix amt="(\d+)"/)?.[1] ?? 100000) / 100000;
      layers.push(
        `<div style="position:absolute;overflow:hidden;opacity:${opacity};${box}">` +
          `<img src="${esc(uri)}" style="position:absolute;left:${-l * iw}px;top:${-t * ih}px;width:${iw}px;height:${ih}px"></div>`,
      );
    } else {
      // Forme native : seul son remplissage uni (corps, avant <a:ln>) fait partie du fond.
      const spPr = frag.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/)?.[1] ?? "";
      const solid = spPr.split("<a:ln")[0].match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/)?.[0];
      const css = solid ? fillToCss(solid, theme) : null;
      if (!css) continue;
      const geom = spPr.match(/<a:prstGeom prst="(\w+)"/)?.[1] ?? "rect";
      const radius = geom === "ellipse" ? "50%" : geom === "roundRect" ? `${Math.min(w, h) * 0.1667}px` : "0";
      layers.push(`<div style="position:absolute;background:${css};border-radius:${radius};${box}"></div>`);
    }
  }

  const bgCss = bg?.image
    ? `background:#fff url("${esc(bg.image)}") center/100% 100% no-repeat`
    : `background:${bg?.color ?? "#ffffff"}`;
  const html =
    `<!doctype html><html><body style="margin:0">` +
    `<div id="slide" style="position:relative;overflow:hidden;width:${width}px;height:${height}px;${bgCss}">` +
    layers.join("") +
    `</div></body></html>`;
  return { html, width, height, layers: layers.length };
}

/**
 * Écrit dans `outPath` un PNG opaque du fond de la slide `slideNo` (texte natif
 * exclu). Renvoie le chemin, ou null si la reconstitution échoue.
 */
export async function renderSlideBackground(filePath: string, outPath: string, slideNo = 1): Promise<string | null> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
    const built = await buildSlideBackgroundHtml(zip, slideNo);
    if (!built) return null;
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: built.width, height: built.height } });
    await page.setContent(built.html, { waitUntil: "load" });
    await page.locator("#slide").screenshot({ path: outPath, omitBackground: false });
    return outPath;
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
