import PptxGenJS from "pptxgenjs";
import html2canvas from "html2canvas-pro";
import * as Sentry from "@sentry/react";
import {
  mapFontToPptx,
  normalizeHex,
  pxToInches,
  fontSizePxToPt,
  fontSizePxToPtRaw,
  MIN_FONT_PT,
  letterSpacingPxToCharSpacing,
  extractEditableBlocks,
  extractAnnotatedBlocks,
  extractShapeBlocks,
  extractHeuristicShapes,
  extractGradientDecoZones,
  extractStandaloneEmojiZones,
  type EditableBlock,
  type ShapeBlock,
  type TextRun,
  type EmojiZone,
} from "./pptx-font-mapping";
import { fetchLogoAsBase64, getPptxLogoRect } from "./export-logo";

interface VisualSlide {
  slide_number: number;
  html: string;
}

/**
 * Photo native fournie à l'export hybride pour insertion couche bottom (non-rasterisée).
 * `base64` DOIT être une data URL complète (préfixée `data:image/<mime>;base64,...`).
 * pptxgenjs `addImage({ data })` attend ce format.
 */
export interface OriginalPhoto {
  base64: string;
  mimeType?: string;
}

interface PhotoZone {
  el: HTMLElement;
  photoIndex: number; // 1-indexé
  rect: { x: number; y: number; w: number; h: number };
  type: "img" | "background";
}

interface SlideData {
  slide_number: number;
  overlay_text?: string | null;
  overlay_position?: string | null;
  overlay_style?: string | null;
  title?: string | null;
  body?: string | null;
}

export interface HybridCharter {
  color_text?: string | null;
  color_primary?: string | null;
  color_background?: string | null;
  font_title?: string | null;
  font_body?: string | null;
}

const SLIDE_W_PX = 1080;
const SLIDE_H_PX = 1350;
const PPTX_W_IN = 7.5;
const PPTX_H_IN = 9.375;
const PX_PER_IN = SLIDE_W_PX / PPTX_W_IN; // 144

// ---------------------------------------------------------------------------
// Mesure des dimensions source d'une image (pour calcul d'un crop proportionnel)
// ---------------------------------------------------------------------------

async function measureImageNatural(
  dataUrl: string,
  timeoutMs = 5000,
): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => { img.src = ""; resolve(null); }, timeoutMs);
    img.onload = () => { clearTimeout(t); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Pré-recadrage "cover" centré au ratio cible via canvas.
// Garantit que l'image arrive dans pptxgenjs au ratio exact du cadre →
// aucun srcRect généré, aucune déformation.
// ---------------------------------------------------------------------------

async function cropToRatioBase64(
  dataUrl: string,
  targetRatio: number, // w/h du cadre de destination
  timeoutMs = 5000,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => { img.src = ""; resolve(null); }, timeoutMs);
    img.onload = () => {
      clearTimeout(t);
      try {
        const sw = img.naturalWidth;
        const sh = img.naturalHeight;
        if (!sw || !sh || !isFinite(targetRatio) || targetRatio <= 0) {
          resolve(null);
          return;
        }
        const srcRatio = sw / sh;
        // Fenêtre source à conserver (crop centré "cover")
        let cw = sw;
        let chh = sh;
        let ox = 0;
        let oy = 0;
        if (srcRatio > targetRatio) {
          cw = Math.round(sh * targetRatio);
          ox = Math.round((sw - cw) / 2);
        } else if (srcRatio < targetRatio) {
          chh = Math.round(sw / targetRatio);
          oy = Math.round((sh - chh) / 2);
        }
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = chh;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, ox, oy, cw, chh, 0, 0, cw, chh);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = dataUrl;
  });
}


// ---------------------------------------------------------------------------
// iframe mounting + readiness
// ---------------------------------------------------------------------------

async function mountIframe(html: string): Promise<HTMLIFrameElement> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;top:-99999px;left:-99999px;width:${SLIDE_W_PX}px;height:${SLIDE_H_PX}px;border:0;z-index:-1;pointer-events:none;`;
  iframe.setAttribute("aria-hidden", "true");

  const fontLinks = Array.from(document.head.querySelectorAll("link"))
    .filter((l) => /fonts\.(googleapis|gstatic|bunny)/i.test(l.getAttribute("href") || ""))
    .map((l) => l.outerHTML)
    .join("\n");

  // NB: tous les descendants d'un bloc annoté sont masqués pour éviter le double-rendu
  // dans la rasterisation html2canvas (sinon les spans avec couleur explicite restent visibles
  // sous le bloc éditable PPTX rajouté par-dessus).
  // Si un descendant doit rester visible (badge, sticker, illustration), ne pas annoter le
  // parent en data-pptx-editable — annoter chaque sous-bloc texte individuellement.
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8" />${fontLinks}
<style>
  html, body { margin:0; padding:0; width:${SLIDE_W_PX}px; height:${SLIDE_H_PX}px; overflow:hidden; background:transparent; }
  *, *::before, *::after { box-sizing: border-box; }
  [data-pptx-hide="true"],
  [data-pptx-hide="true"] * {
    color: transparent !important;
    text-shadow: none !important;
    -webkit-text-fill-color: transparent !important;
    background-clip: text !important;
    -webkit-background-clip: text !important;
    background-image: none !important;
  }
  [data-pptx-hide="true"]::before,
  [data-pptx-hide="true"]::after,
  [data-pptx-hide="true"] *::before,
  [data-pptx-hide="true"] *::after {
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
    text-shadow: none !important;
  }
  /* Masquage des zones photo : visibility (pas display) pour préserver le layout
     et garder getBoundingClientRect valide. Le background-image est traité
     en JS pour conserver les gradients overlay (cf. extractPhotoZones). */
  [data-pptx-photo-hide="true"] img,
  [data-pptx-photo-hide="true"] picture,
  [data-pptx-photo-hide="true"] svg image {
    visibility: hidden !important;
  }
  /* Masquage des shapes structurels rendus en pptxgenjs natif :
     on retire UNIQUEMENT le fond/ombre du shape lui-même, JAMAIS celui des descendants
     (le texte enfant doit rester visible dans le PNG si non annoté éditable).
     PAS de sélecteur descendant ici, contrairement à data-pptx-hide. */
  [data-pptx-shape-hide="true"] {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
    box-shadow: none !important;
    border-color: transparent !important;
  }
</style></head><body>${html}</body></html>`;

  document.body.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("iframe load timeout")), 8000);
    iframe.addEventListener(
      "load",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

  return iframe;
}

async function waitReady(iframe: HTMLIFrameElement): Promise<void> {
  const doc = iframe.contentDocument;
  if (!doc) return;
  try {
    if ((doc as any).fonts?.ready) {
      await Promise.race([(doc as any).fonts.ready, new Promise((r) => setTimeout(r, 5000))]);
    }
  } catch {
    /* noop */
  }
  const imgs = Array.from(doc.querySelectorAll("img"));
  if (imgs.length > 0) {
    await Promise.race([
      Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((res) => {
              if (img.complete && img.naturalWidth > 0) return res();
              img.addEventListener("load", () => res(), { once: true });
              img.addEventListener("error", () => res(), { once: true });
            }),
        ),
      ),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
  }
  // 2 frames pour laisser le layout se stabiliser. ⚠️ requestAnimationFrame est
  // MIS EN PAUSE par le navigateur quand l'onglet est en arrière-plan (ce qui
  // arrive dès qu'on ouvre l'onglet Canva). Sans garde-fou, cette attente ne se
  // résout JAMAIS → l'export (et donc « Ouvrir dans Canva ») se fige à l'infini.
  // On la course contre un setTimeout qui, lui, se déclenche même en arrière-plan.
  await Promise.race([
    new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    new Promise<void>((r) => setTimeout(r, 300)),
  ]);
  await new Promise((r) => setTimeout(r, 200));
}

// ---------------------------------------------------------------------------
// capture
// ---------------------------------------------------------------------------

// html2canvas peut, sur certains contenus, ne JAMAIS résoudre (rendu async qui pend) —
// `imageTimeout` ne borne que le chargement d'images, pas le rendu. On borne donc chaque
// capture : au-delà du délai, on abandonne CETTE capture et on continue, pour qu'une seule
// slide ne puisse pas bloquer tout l'export (cf. blocage observé en live sur une slide-schéma).
function raceTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const CAPTURE_TIMEOUT_MS = 25000;

// Échelle de rastérisation html2canvas. Le PNG de fond ne porte QUE le résiduel
// décoratif (texte, formes et photos sont posés en NATIF) → 1.5 suffit largement
// (1620px de large pour une slide de 7.5" = 216 DPI, net pour un PPTX). Baissé de
// 2 à 1.5 : ~44% de pixels en moins à peindre par capture. Historique : 3 → 2 → 1.5.
const RASTER_SCALE = 1.5;

// Captures de dégradés déco en image séparée (déplaçable dans Canva) PAR SLIDE.
// DÉSACTIVÉ (0, décision produit 27/06) : chaque capture est une passe html2canvas
// qui re-clone tout le DOM → sur les slides-schéma il y en a beaucoup → le temps
// d'export explosait (>4 min observé, cascades de timeouts). Les dégradés restent
// VISIBLES (cuits dans le PNG de fond, rendu identique), juste plus déplaçables
// individuellement dans Canva — ce qu'on ne fait jamais en pratique. C'était LE
// goulot principal de l'export hybride. Remettre >0 réintroduit le coût.
const MAX_GRADIENT_CAPTURES = 0;

// Emojis ISOLÉS rendus en petite image détourée par slide. Contrairement aux dégradés
// (html2canvas = clone DOM coûteux, désactivé ci-dessus), un emoji est dessiné via
// canvas 2D `fillText` → coût négligeable, pas de clone DOM. Plafond par sécurité.
const MAX_EMOJI_CAPTURES = 24;

/**
 * Rend un emoji ISOLÉ en petite image PNG détourée au plus près du glyphe (canvas 2D,
 * pas html2canvas). On dessine l'emoji dans un canvas à la taille du content-box (en
 * respectant l'alignement), puis on rogne les marges transparentes → l'image colle
 * pile au dessin (pas un grand bloc vide). Renvoie la position/taille DÉTOURÉE en px
 * (repère iframe), ou null si rien n'a été peint (emoji non rendu) → l'appelant le
 * laisse alors dans le PNG de fond (filet de sûreté, jamais de trou).
 */
function renderEmojiImage(
  zone: EmojiZone,
  scale: number,
): { data: string; x: number; y: number; w: number; h: number } | null {
  const cw = Math.max(1, Math.ceil(zone.rect.w * scale));
  const ch = Math.max(1, Math.ceil(zone.rect.h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.textBaseline = "middle";
  ctx.textAlign = zone.textAlign;
  ctx.font = `${zone.fontStyle} ${zone.fontWeight} ${zone.fontSizePx}px ${zone.fontFamily}`;
  const tx =
    zone.textAlign === "center"
      ? zone.rect.w / 2
      : zone.textAlign === "right"
        ? zone.rect.w
        : 0;
  try {
    ctx.fillText(zone.emoji, tx, zone.rect.h / 2);
  } catch {
    return null;
  }

  // Détourage : bbox des pixels non transparents.
  let img: ImageData;
  try {
    img = ctx.getImageData(0, 0, cw, ch);
  } catch {
    return null; // canvas "tainted" (ne devrait pas arriver : aucun pixel externe)
  }
  const d = img.data;
  let minX = cw;
  let minY = ch;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (d[(y * cw + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null; // rien dessiné → laissé dans le fond (sûr)

  const tcw = maxX - minX + 1;
  const tch = maxY - minY + 1;
  const trimmed = document.createElement("canvas");
  trimmed.width = tcw;
  trimmed.height = tch;
  const tctx = trimmed.getContext("2d");
  if (!tctx) return null;
  tctx.drawImage(canvas, minX, minY, tcw, tch, 0, 0, tcw, tch);
  const data = trimmed.toDataURL("image/png");
  if (!data || data.length < 64) return null;

  return {
    data,
    x: zone.rect.x + minX / scale,
    y: zone.rect.y + minY / scale,
    w: tcw / scale,
    h: tch / scale,
  };
}

async function captureBody(doc: Document): Promise<string> {
  const canvas = await raceTimeout(
    html2canvas(doc.body, {
      width: SLIDE_W_PX,
      height: SLIDE_H_PX,
      windowWidth: SLIDE_W_PX,
      windowHeight: SLIDE_H_PX,
      scale: RASTER_SCALE,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
      imageTimeout: 8000,
    }),
    CAPTURE_TIMEOUT_MS,
    null,
  );
  if (!canvas) throw new Error("La capture du fond (html2canvas) a expiré.");
  return canvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// overlay slide (fallback) : photo + overlay_text court
// ---------------------------------------------------------------------------

/** Find the smallest element whose textContent contains the overlay text. */
function findOverlayElement(doc: Document, overlayText: string): HTMLElement | null {
  const target = overlayText.trim().toLowerCase();
  if (!target || target.length < 3) return null;

  const all = Array.from(doc.body.querySelectorAll<HTMLElement>("*"));
  let best: HTMLElement | null = null;
  let bestLen = Infinity;

  for (const el of all) {
    const txt = (el.textContent || "").trim().toLowerCase();
    if (!txt) continue;
    const matches = txt === target || txt.includes(target);
    if (!matches) continue;
    if (txt.length < bestLen) {
      best = el;
      bestLen = txt.length;
    }
  }
  return best;
}

interface BlockRender {
  text: string;
  /** Runs typographiques inline. Si présent + length >= 2 → exporté en multi-runs. */
  runs?: TextRun[];
  rect: { x: number; y: number; w: number; h: number };
  style: EditableBlock["style"];
  kind: EditableBlock["kind"];
}

function blockFromElement(el: HTMLElement, doc: Document, kind: EditableBlock["kind"]): BlockRender | null {
  const win = doc.defaultView;
  if (!win) return null;
  const cs = win.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  if (r.width < 20 || r.height < 10) return null;
  const fontSizePx = parseFloat(cs.fontSize) || 24;
  const weight = parseInt(cs.fontWeight, 10) || 400;
  return {
    text: (el.textContent || "").trim(),
    rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    style: {
      color: cs.color || "#FFFFFF",
      fontFamily: cs.fontFamily || "",
      fontSizePx,
      fontWeight: weight,
      fontStyle: cs.fontStyle || "normal",
      textAlign:
        cs.textAlign === "center" || cs.textAlign === "right" || cs.textAlign === "left"
          ? (cs.textAlign as "left" | "center" | "right")
          : "left",
      textTransform: cs.textTransform || "none",
      lineHeight: parseFloat(cs.lineHeight) || fontSizePx * 1.25,
      letterSpacingPx: parseFloat(cs.letterSpacing) || 0,
    },
    kind,
  };
}

function applyTextTransform(text: string, transform: string): string {
  switch (transform) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "capitalize":
      return text.replace(/\b\w/g, (c) => c.toUpperCase());
    default:
      return text;
  }
}

/**
 * Retire les `url(data:image/...)` d'un `background-image` CSS tout en conservant
 * les autres couches (gradients linear/radial/conic, autres URLs non-data).
 * Split sur les virgules **top-level** uniquement (les virgules dans les
 * parenthèses des gradients ne séparent pas les couches).
 * Retourne `"none"` si plus aucune couche ne reste.
 */
function stripDataUrlsFromBackground(bgImage: string): string {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < bgImage.length; i++) {
    const c = bgImage[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      parts.push(bgImage.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(bgImage.slice(start).trim());
  const kept = parts.filter((p) => p && !/^url\(\s*["']?data:image\//i.test(p));
  return kept.length > 0 ? kept.join(", ") : "none";
}

/**
 * Détecte les zones photo dans le HTML d'une slide.
 *
 * Strategy A (priorité) : éléments annotés [data-pptx-photo="N"] par Sonnet.
 * Strategy B (fallback) : détection défensive sur <img src="data:image/..."> et
 *   éléments avec background-image: url(data:image/...). photoIndex = ordre
 *   d'apparition (1-indexé).
 *
 * Ne masque PAS les éléments — c'est à l'appelant de gérer le cycle
 * masquage / capture / unmask en fonction de la disponibilité des
 * originalPhotos correspondants.
 */
function extractPhotoZones(doc: Document, fallbackPhotoIndex?: number): PhotoZone[] {
  const win = doc.defaultView;
  if (!win) return [];

  const zones: PhotoZone[] = [];
  const seen = new Set<HTMLElement>();

  const pushZone = (el: HTMLElement, photoIndex: number, type: "img" | "background") => {
    if (seen.has(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    if (r.y > SLIDE_H_PX || r.x > SLIDE_W_PX) return;
    if (r.y + r.height < 0 || r.x + r.width < 0) return;
    seen.add(el);
    zones.push({
      el,
      photoIndex,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      type,
    });
  };

  // Strategy A — annotations explicites Sonnet
  const annotated = Array.from(doc.querySelectorAll<HTMLElement>("[data-pptx-photo]"));
  if (annotated.length > 0) {
    // Garde-fou P3 : warn si même photoIndex apparaît 2× sur la même slide
    const indexCounts = new Map<number, number>();
    for (const el of annotated) {
      const raw = el.getAttribute("data-pptx-photo");
      const idx = raw ? parseInt(raw, 10) : NaN;
      if (!Number.isInteger(idx) || idx < 1) {
        console.warn(`[hybrid] data-pptx-photo invalide: "${raw}", ignoré`);
        continue;
      }
      indexCounts.set(idx, (indexCounts.get(idx) || 0) + 1);
      const isImg = el.tagName === "IMG";
      pushZone(el, idx, isImg ? "img" : "background");
    }
    for (const [idx, count] of indexCounts) {
      if (count > 1) {
        console.warn(
          `[hybrid] photoIndex ${idx} annoté ${count} fois sur la même slide — la photo sera insérée plusieurs fois`,
        );
      }
    }
    return zones;
  }

  // Strategy B (fallback) — détection défensive
  // BUG FIX : on traite UN slide par iframe, donc autoIndex repartait à 1 à chaque
  // slide → toutes les slides récupéraient originalPhotos[0] (même photo partout dans
  // le PPTX alors que l'aperçu était correct). On amorce le compteur sur le photo_index
  // réel de la slide (fourni par slidesData) pour réinjecter la bonne photo native.
  let autoIndex = Number.isInteger(fallbackPhotoIndex) && (fallbackPhotoIndex as number) >= 1
    ? (fallbackPhotoIndex as number)
    : 1;

  // <img> base64
  const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>("img"));
  for (const img of imgs) {
    const src = img.getAttribute("src") || "";
    if (!src.startsWith("data:image/")) continue;
    pushZone(img, autoIndex++, "img");
  }

  // background-image: url(data:image/...)
  const all = Array.from(doc.body.querySelectorAll<HTMLElement>("*"));
  for (const el of all) {
    if (seen.has(el)) continue;
    const cs = win.getComputedStyle(el);
    const bg = cs.backgroundImage || "";
    if (!/url\(["']?data:image\//i.test(bg)) continue;
    pushZone(el, autoIndex++, "background");
  }

  return zones;
}

/**
 * Neutralise (pour la capture) les fonds UNIS et OPAQUES peints DERRIÈRE une
 * zone photo masquée : l'élément de zone lui-même et chaque ancêtre que la
 * zone recouvre entièrement.
 *
 * Sans ça, le raster « bouche le trou » : la racine des gabarits photo
 * composés porte `background:#1a1815` SANS annotation data-pptx-shape
 * (contrairement aux slides mix) → une fois la photo masquée, ce charbon est
 * peint OPAQUE dans le PNG posé PAR-DESSUS la photo native → la photo est
 * invisible, toute la slide est un bloc noir (vu en prod le 21/07 dans Canva
 * sur un carrousel photo immo).
 *
 * On ne touche NI aux background-image (texture de marque : la retirer la
 * perdrait des deux côtés, cf. #575) NI aux fonds semi-transparents (voiles :
 * leur alpha traverse le PNG et reste fidèle sur la photo native). Les
 * éléments déjà promus en shape natif (data-pptx-shape-hide) sont déjà
 * transparents ici → ignorés naturellement.
 *
 * Retourne la couleur du plus GRAND fond neutralisé (hex sans #), à reporter
 * sur slide.background — filet visuel si la photo native manque à l'arrivée.
 */
function clearOpaqueBackdropsBehindZone(zone: PhotoZone, doc: Document): string | null {
  const win = doc.defaultView;
  if (!win) return null;
  const zr = zone.rect;
  let best: { color: string; area: number } | null = null;
  let el: HTMLElement | null = zone.el;
  while (el && el !== doc.body && el !== doc.documentElement) {
    const r = el.getBoundingClientRect();
    const covered =
      zr.x <= r.left + 1 && zr.y <= r.top + 1 &&
      zr.x + zr.w >= r.right - 1 && zr.y + zr.h >= r.bottom - 1;
    if (covered) {
      const cs = win.getComputedStyle(el);
      // Pour l'élément de zone lui-même, le background-image (photo, gradients
      // conservés) est géré par le masquage de zone — seul son background-color
      // nous concerne. Pour un ancêtre, une image de fond = on ne touche à rien.
      const bgImage = el === zone.el ? "none" : (cs.backgroundImage || "none");
      const bgColor = cs.backgroundColor || "transparent";
      const alphaM = bgColor.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/i);
      const opaque =
        bgColor !== "transparent" &&
        bgColor !== "rgba(0, 0, 0, 0)" &&
        (!alphaM || parseFloat(alphaM[1]) >= 0.99);
      if (opaque && bgImage === "none") {
        el.style.setProperty("background-color", "transparent", "important");
        const area = r.width * r.height;
        if (!best || area > best.area) best = { color: normalizeHex(bgColor, "FFFFFF"), area };
      }
    }
    el = el.parentElement;
  }
  return best ? best.color : null;
}

/** Police à chasse fixe ? (IBM Plex Mono, Courier…) */
function isMonoFont(fontFamily: string | undefined | null): boolean {
  return /mono|courier/i.test(fontFamily || "");
}

/**
 * Largeur CIBLE (en pouces) d'un bloc texte dans PowerPoint.
 *
 * Le navigateur rend les webfonts réelles ; PowerPoint/Canva substituent
 * souvent (Libre Baskerville, IBM Plex Mono rarement installées) par des
 * polices aux métriques plus larges → un texte re-wrappe, gagne des lignes et
 * chevauche le bloc du dessous (vu en prod sur 4 slides d'un même carrousel).
 *
 * - Bloc UNE LIGNE en mono : largeur EXACTE calculable (chasse fixe 0.6 em)
 *   + letter-spacing + marge de gravure 6 %.
 * - Sinon : slack forfaitaire — 25 % pour les mono (substitution Courier plus
 *   large + letter-spacing), 18 % pour le reste (serif de substitution).
 */
function desiredTextWidthIn(block: BlockRender): number {
  const wRaw = pxToInches(block.rect.w, PX_PER_IN);
  const mono = isMonoFont(block.style.fontFamily);
  const singleLine = !block.text.includes("\n") && block.rect.h < block.style.lineHeight * 1.6;
  if (mono && singleLine) {
    const fontPt = fontSizePxToPt(block.style.fontSizePx, PX_PER_IN);
    const spacingPt = letterSpacingPxToCharSpacing(block.style.letterSpacingPx, PX_PER_IN) || 0;
    const n = block.text.length;
    const estIn = (n * fontPt * 0.6 + Math.max(0, n - 1) * spacingPt) / 72 * 1.06;
    return Math.max(wRaw, estIn);
  }
  const ratio = mono ? 0.25 : 0.18;
  return wRaw + Math.max(0.12, wRaw * ratio);
}

/**
 * Contexte géométrique du bloc au moment du placement (audit fidélité 10/07) :
 * ses voisins texte et les cartes natives de la slide. Permet (1) de borner le
 * slack de largeur au bord intérieur de la carte parente et (2) de rendre le
 * plancher MIN_FONT_PT conditionnel à la place réellement disponible.
 */
interface BlockLayoutContext {
  siblings: BlockRender[];
  cards: ShapeBlock[];
}

/** Marge intérieure conservée entre le texte et le bord de sa carte (px). */
const CARD_INSET_PX = 10;
/**
 * Respiration minimale conservée au-dessus du bloc suivant (fraction de
 * ligne). 0.35 laissait encore un « baiser » d'une ligne sous police
 * substituée (mesuré sur process_visible colonne étroite) — 0.5 l'absorbe.
 */
const BUDGET_GAP_LINES = 0.5;

/**
 * Plus petite CARTE native contenant entièrement le bloc (tolérance 2 px).
 * Les PILULES sont exclues : elles sont élargies nativement pour épouser leur
 * label (#420) — borner le label à la pilule d'origine casserait ce mécanisme.
 */
function parentCardOf(block: BlockRender, cards: ShapeBlock[]): ShapeBlock | null {
  const b = block.rect;
  let best: ShapeBlock | null = null;
  for (const c of cards) {
    if (c.type !== "card") continue;
    const r = c.rect;
    const contains =
      b.x >= r.x - 2 && b.y >= r.y - 2 && b.x + b.w <= r.x + r.w + 2 && b.y + b.h <= r.y + r.h + 2;
    if (!contains) continue;
    if (!best || r.w * r.h < best.rect.w * best.rect.h) best = c;
  }
  return best;
}

/**
 * Espace vertical (px) dont dispose le bloc avant le premier obstacle : le
 * prochain bloc texte qui le recouvre horizontalement, sinon le bas de sa
 * carte, sinon le bas de la slide. C'est le budget que le plancher
 * MIN_FONT_PT n'a pas le droit de dépasser.
 */
function verticalBudgetPx(block: BlockRender, ctx: BlockLayoutContext, card: ShapeBlock | null): number {
  const b = block.rect;
  let limit = SLIDE_H_PX;
  for (const s of ctx.siblings) {
    if (s === block) continue;
    if (s.rect.y <= b.y + 1) continue; // au-dessus ou même ligne
    const overlap = Math.min(b.x + b.w, s.rect.x + s.rect.w) - Math.max(b.x, s.rect.x);
    if (overlap < Math.min(b.w, s.rect.w) * 0.15) continue; // pas la même colonne
    limit = Math.min(limit, s.rect.y);
  }
  if (card) limit = Math.min(limit, card.rect.y + card.rect.h - CARD_INSET_PX);
  const gap = block.style.lineHeight * BUDGET_GAP_LINES;
  return Math.max(0, limit - b.y - gap);
}

/**
 * Jusqu'où (en pt) le bloc peut grossir sans déborder de sa boîte élargie
 * (largeur `wIn`, budget vertical `budgetPx`). Estimation déterministe :
 * nb de lignes HTML mesuré × inflation. En grossissant d'un facteur f, les
 * caractères par ligne baissent en 1/f (→ lignes × f) et la hauteur de ligne
 * monte en f → hauteur totale ≈ f². Une seule ligne (wrap:false) : la largeur
 * mesurée rect.w grossit en f et doit tenir dans la boîte.
 */
function maxFitPt(block: BlockRender, wIn: number, budgetPx: number, isSingleLine: boolean): number {
  const naturalPt = fontSizePxToPtRaw(block.style.fontSizePx, PX_PER_IN);
  if (naturalPt <= 0) return MIN_FONT_PT;
  const lhPx = Math.max(1, block.style.lineHeight);
  const wPx = Math.max(wIn * PX_PER_IN, block.rect.w * 0.9);
  let f: number;
  if (isSingleLine) {
    // rect.w = largeur du BLOC (souvent toute la carte), pas celle du texte.
    // Estime la largeur du texte lui-même (em moyen prudent : 0.72 par
    // caractère, 1.25 par emoji) pour autoriser la montée des labels courts
    // dans une carte large, sans jamais risquer de traverser la boîte.
    let ems = 0;
    for (const chr of block.text) ems += /\p{Extended_Pictographic}/u.test(chr) ? 1.25 : 0.72;
    const estTextPx =
      Math.min(block.rect.w, ems * block.style.fontSizePx) +
      Math.max(0, block.text.length - 1) * (block.style.letterSpacingPx || 0);
    const fWidth = wPx / Math.max(1, estTextPx);
    const fHeight = budgetPx / lhPx;
    f = Math.min(fWidth, fHeight);
  } else {
    // Ne PAS créditer la boîte élargie d'une réduction du nombre de lignes :
    // PowerPoint garde souvent le wrap HTML (mesuré : un ×0.85 optimiste
    // laissait encore un chevauchement d'une ligne). Lignes = lignes HTML.
    const linesHtml = Math.max(1, Math.round(block.rect.h / lhPx));
    f = Math.sqrt(budgetPx / Math.max(1, linesHtml * lhPx));
  }
  return Math.floor(naturalPt * Math.max(1, f) * 10) / 10;
}

function addBlockToSlide(
  slide: PptxGenJS.Slide,
  block: BlockRender,
  charter: HybridCharter | null | undefined,
  ctx: BlockLayoutContext,
) {
  let x = pxToInches(block.rect.x, PX_PER_IN);
  const y = pxToInches(block.rect.y, PX_PER_IN);
  const wRaw = pxToInches(block.rect.w, PX_PER_IN);
  // Slack LARGEUR (cf. desiredTextWidthIn) : étendu SELON L'ALIGNEMENT pour ne
  // pas décaler le texte, borné aux bords de la slide. La boîte reste
  // transparente : la largeur en plus n'est occupée que si le texte en a
  // réellement besoin.
  const wDesired = desiredTextWidthIn(block);
  const wSafety = wDesired - wRaw;
  let w = wDesired;
  if (block.style.textAlign === "center") {
    x -= wSafety / 2;
  } else if (block.style.textAlign === "right") {
    x -= wSafety;
  }
  // Le slack s'arrête au bord INTÉRIEUR de la carte parente, pas au bord de
  // slide (audit 10/07 : le texte traversait la bordure des cartes voisines
  // sur comparison/matrix_2x2). Hors carte : bords de slide comme avant.
  const parentCard = parentCardOf(block, ctx.cards);
  const minX = parentCard ? pxToInches(parentCard.rect.x + CARD_INSET_PX, PX_PER_IN) : 0;
  const maxX2 = parentCard
    ? Math.min(PPTX_W_IN, pxToInches(parentCard.rect.x + parentCard.rect.w - CARD_INSET_PX, PX_PER_IN))
    : PPTX_W_IN;
  if (x < minX) {
    w -= minX - x;
    x = minX;
  }
  w = Math.min(w, maxX2 - x);
  // Garde-fou : une carte anormalement étroite ne doit jamais produire une
  // boîte nulle/négative (le bloc sauterait) — on retombe sur la boîte HTML.
  if (w < wRaw * 0.5) {
    x = pxToInches(block.rect.x, PX_PER_IN);
    w = Math.min(wRaw, PPTX_W_IN - x);
  }
  // Marge de sécurité proportionnelle à la taille de police (≈ demi-ligne),
  // plancher 0.15" — absorbe les écarts de wrapping HTML vs PowerPoint
  // (métriques de fonts, kerning, arrondis lineSpacing/charSpacing).
  const safetyMargin = Math.max(
    0.15,
    pxToInches(block.style.fontSizePx, PX_PER_IN) * 0.5,
  );
  const h = Math.min(
    PPTX_H_IN - y,
    pxToInches(block.rect.h, PX_PER_IN) + safetyMargin,
  );

  const isTitleish = block.kind === "title" || block.kind === "overlay";
  const fontFace = mapFontToPptx(
    block.style.fontFamily || (isTitleish ? charter?.font_title : charter?.font_body),
  );
  const charterTextFallback = normalizeHex(charter?.color_text, "FFFFFF");
  const color = normalizeHex(block.style.color, charterTextFallback);
  const charSpacing = letterSpacingPxToCharSpacing(block.style.letterSpacingPx, PX_PER_IN);

  // Un bloc rendu sur UNE seule ligne en HTML ne doit JAMAIS re-wrapper dans
  // PowerPoint : ses métriques (mono + letter-spacing surtout) y sont plus
  // larges et cassent les petits labels malgré le slack de largeur
  // (« ENTREPRI/SES » hors pilule, « LE/CONSTAT », « LIEN EN [BIO] » — vus en
  // prod). La boîte est transparente : le léger débord éventuel est bénin,
  // contrairement à un wrap qui déborde verticalement sur l'élément du dessous.
  const isSingleLine =
    !block.text.includes("\n") &&
    block.rect.h < block.style.lineHeight * 1.6;

  // Boîte MULTI-LIGNE bloquée par le bord de la slide (colonne collée à
  // droite, pleine largeur…) : elle ne peut pas absorber le slack → le texte
  // re-wrapperait quand même et gagnerait des lignes sur le bloc du dessous
  // (vu en prod : deux paragraphes superposés). On réduit la police au prorata
  // du déficit (plancher 80 % — mesuré : une colonne collée au bord droit
  // demandait 84 %, le plancher 88 % laissait encore une ligne de chevauche-
  // ment) : le wrap redevient ≈ celui du HTML. Les blocs une-ligne sont en
  // wrap:false → jamais concernés.
  // ── Taille de police : plancher MIN_FONT_PT layout-aware (audit 10/07) ──
  // Base = taille naturelle px→pt, fidèle au HTML. La règle de déficit de
  // largeur (#425) s'applique sur cette base. Puis, si la base est sous
  // MIN_FONT_PT (#179, lisibilité Canva), on monte vers 15pt UNIQUEMENT tant
  // que le bloc tient dans son budget vertical (prochain bloc texte / bas de
  // carte) et dans sa boîte élargie. C'est ce que `fit:"shrink"` promettait,
  // mais PowerPoint n'applique pas normAutofit à l'ouverture → le plancher
  // aveugle produisait des chevauchements (mesurés sur 8 templates + 1
  // carrousel réel, cf. audit fidélité 10/07).
  const naturalPt = fontSizePxToPtRaw(block.style.fontSizePx, PX_PER_IN);
  let fontSize = naturalPt;
  if (naturalPt < MIN_FONT_PT) {
    const budgetPx = verticalBudgetPx(block, ctx, parentCard);
    const fitPt = maxFitPt(block, w, budgetPx, isSingleLine);
    fontSize = Math.max(naturalPt, Math.min(MIN_FONT_PT, fitPt));
    if (fontSize < MIN_FONT_PT) {
      console.debug(
        `[hybrid] plancher ${MIN_FONT_PT}pt refusé (place manquante) : ${fontSize}pt gardés pour « ${block.text.slice(0, 40)} »`,
      );
    }
  }
  // La règle de déficit de largeur (#425) s'applique EN DERNIER, sur la taille
  // éventuellement montée : elle protège du re-wrap de SUBSTITUTION de police
  // (boîte clampée à la carte = slack inabsorbable), que le budget vertical ne
  // modélise pas. L'inverser annulait sa protection (mesuré : colonnes
  // process_visible toujours en collision à l'itération 1 du lot 1).
  if (!isSingleLine && w < wDesired - 0.01) {
    fontSize = Math.round(fontSize * Math.max(0.8, w / wDesired) * 10) / 10;
  }

  const frameOptions: PptxGenJS.TextPropsOptions = {
    x,
    y,
    w,
    h,
    fontFace,
    fontSize,
    bold: block.style.fontWeight >= 600,
    italic: block.style.fontStyle === "italic",
    color,
    align: block.style.textAlign,
    valign: "top",
    wrap: !isSingleLine,
    margin: 0,
    // « Réduire le texte en cas de débordement » : si malgré les slacks le texte
    // dépasse encore la boîte (métriques de police exotiques), PowerPoint le
    // rétrécit au lieu de le laisser déborder sur l'élément d'en dessous
    // (dernière ligne rognée au bord d'une carte, vue en prod).
    fit: "shrink",
    charSpacing: charSpacing || undefined,
    lineSpacingMultiple: Math.max(0.9, Math.min(1.6, block.style.lineHeight / Math.max(1, block.style.fontSizePx))),
  };

  // Multi-runs path: preserve inline italic/bold/color/surligneur from
  // <span>/<em>/<strong>. Un run unique passe aussi ici s'il porte un
  // surligneur (sinon il serait perdu par le chemin texte plat).
  if (block.runs && (block.runs.length >= 2 || block.runs.some((r) => r.highlight))) {
    const pptxRuns = block.runs.map((r) => ({
      text: applyTextTransform(r.text, block.style.textTransform),
      options: {
        bold: r.bold,
        italic: r.italic,
        color: r.color,
        // Surligneur natif PowerPoint (CR-2) : suit le texte au re-wrap,
        // contrairement à des bandes posées aux positions de ligne HTML.
        highlight: r.highlight,
      },
    }));
    slide.addText(pptxRuns, frameOptions);
    return;
  }

  // Flat text path (unchanged behavior).
  slide.addText(applyTextTransform(block.text, block.style.textTransform), frameOptions);
}

// ---------------------------------------------------------------------------
// main export
// ---------------------------------------------------------------------------

export async function exportCarouselHybridPptx(
  visualSlides: VisualSlide[],
  slidesData: SlideData[] | null | undefined,
  charter: HybridCharter | null | undefined,
  fileName = "carrousel-editable",
  originalPhotos?: OriginalPhoto[],
  logoUrl?: string | null,
  opts?: { returnBlob?: boolean },
): Promise<Blob | void> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "INSTAGRAM", width: PPTX_W_IN, height: PPTX_H_IN });
  pptx.layout = "INSTAGRAM";
  pptx.author = "L'Assistant Com'";

  // Pré-charge le logo une seule fois (sera ajouté en top layer sur chaque slide)
  const logoBase64 = await fetchLogoAsBase64(logoUrl);
  const logoSize = logoBase64 ? await measureImageNatural(logoBase64) : null;

  // Cache des recadrages photo, clé par (photoIndex + ratio cadre arrondi).
  // Une même photo peut servir plusieurs cadres de ratios différents → on cache par ratio.
  const cropCache = new Map<string, string | null>();




  // Pré-création des slides DANS L'ORDRE → l'ordre du carrousel est figé, même si les
  // rendus (parallélisés plus bas) se terminent dans le désordre.
  const slideObjs = visualSlides.map(() => pptx.addSlide());

  async function renderSlideAt(i: number) {
    const vs = visualSlides[i];
    const data = slidesData?.find((s) => s.slide_number === vs.slide_number) || slidesData?.[i];
    const slide = slideObjs[i];
    const tSlide0 = performance.now(); // perf instrumentation
    const perf: Record<string, number> = {}; // perf instrumentation (sous-phases)

    const iframe = await mountIframe(vs.html);
    perf.mount = Math.round(performance.now() - tSlide0);
    try {
      const tReady = performance.now();
      await waitReady(iframe);
      perf.waitReady = Math.round(performance.now() - tReady);
      const doc = iframe.contentDocument!;
      const win = doc.defaultView!;

      const blocks: BlockRender[] = [];

      // ---- Strategy A (priority): explicit [data-pptx-editable] annotations
      const annotated = extractAnnotatedBlocks(doc);
      if (annotated.length > 0) {
        for (const ab of annotated) {
          if (ab.rect.y > SLIDE_H_PX || ab.rect.x > SLIDE_W_PX) continue;
          if (ab.rect.y + ab.rect.h < 0) continue;
          blocks.push({ text: ab.text, runs: ab.runs, rect: ab.rect, style: ab.style, kind: ab.kind });
          (ab.el as HTMLElement).setAttribute("data-pptx-hide", "true");
        }
      } else {
        // ---- Strategy B (fallback) : short overlay_text on photo slides
        const overlayText = (data?.overlay_text || "").trim();
        if (overlayText && overlayText.length <= 200) {
          const el = findOverlayElement(doc, overlayText);
          if (el) {
            const blk = blockFromElement(el, doc, "overlay");
            if (blk) {
              blk.text = overlayText;
              blocks.push(blk);
              el.setAttribute("data-pptx-hide", "true");
            }
          }
        } else {
          // ---- Strategy C (fallback) : heuristic detection
          const detected = extractEditableBlocks(doc, {
            minFontPx: 20,
            minTextLen: 3,
            maxBlocks: 8,
          });
          for (const eb of detected) {
            if (eb.rect.y > SLIDE_H_PX || eb.rect.x > SLIDE_W_PX) continue;
            if (eb.rect.y + eb.rect.h < 0) continue;
            blocks.push({ text: eb.text, rect: eb.rect, style: eb.style, kind: eb.kind });
            (eb.el as HTMLElement).setAttribute("data-pptx-hide", "true");
          }
        }
      }

      // ---- FILET texte : balaye le texte visible NON encore capturé.
      // Strategy A est "tout ou rien" : dès qu'un bloc est annoté data-pptx-editable,
      // les légendes/textes NON annotés restaient cuits dans le PNG (non éditables).
      // On complète donc avec le détecteur heuristique (déjà éprouvé en Strategy C),
      // en n'ajoutant QUE ce qui n'a pas déjà été capturé (data-pptx-hide).
      const supplementalText = extractEditableBlocks(doc, {
        minFontPx: 12,
        minTextLen: 2,
        maxBlocks: 16,
        skipAnnotated: true,
      });
      for (const eb of supplementalText) {
        if (eb.rect.y > SLIDE_H_PX || eb.rect.x > SLIDE_W_PX) continue;
        if (eb.rect.y + eb.rect.h < 0) continue;
        // Déjà capturé par Strategy A/B/C (le texte porte alors data-pptx-hide).
        if ((eb.el as HTMLElement).closest('[data-pptx-hide="true"]')) continue;
        // CONTENEUR d'un bloc déjà capturé : son textContent répète le texte du
        // descendant annoté/capturé → deux calques superposés dans le PPTX (vu en
        // prod : eyebrow annoté "caption" + son wrapper pleine largeur re-capturé
        // ici). On saute le conteneur ; son éventuel texte propre reste cuit dans
        // le PNG de fond (visible, juste non éditable) — échec sûr.
        if ((eb.el as HTMLElement).querySelector('[data-pptx-editable],[data-pptx-hide="true"]')) continue;
        blocks.push({ text: eb.text, rect: eb.rect, style: eb.style, kind: eb.kind });
        (eb.el as HTMLElement).setAttribute("data-pptx-hide", "true");
      }

      // ---- Strategy D : extract structural shapes (background, card, pill, highlight)
      // Doit s'exécuter APRÈS extractAnnotatedBlocks (qui pose data-pptx-hide sur les
      // textes — sans impact sur la géométrie des shapes parents) et AVANT captureBody.
      // Le CSS [data-pptx-hide="true"] *  ne touche PAS aux background-color, donc lire
      // cs.backgroundColor sur un parent shape reste valide.
      const SHAPE_CAP_PER_SLIDE = 20;
      // Annotés (data-pptx-shape) + FILET heuristique (traits/barres + pastilles
      // non annotés). Les heuristiques passent par le même pipeline de masquage
      // (data-pptx-shape-hide) et de rendu natif que les annotés.
      const allShapes = [...extractShapeBlocks(doc), ...extractHeuristicShapes(doc)];
      const usableShapes: ShapeBlock[] = [];
      for (const sb of allShapes) {
        if (sb.type !== "background") {
          if (sb.rect.y > SLIDE_H_PX || sb.rect.x > SLIDE_W_PX) continue;
          if (sb.rect.y + sb.rect.h < 0 || sb.rect.x + sb.rect.w < 0) continue;
        }
        usableShapes.push(sb);
      }
      if (usableShapes.length > SHAPE_CAP_PER_SLIDE) {
        console.warn(`[hybrid] ${usableShapes.length} shapes annotés sur slide ${vs.slide_number}, capé à ${SHAPE_CAP_PER_SLIDE}`);
        // On garde priorité à background + plus grands shapes (les plus visibles)
        usableShapes.sort((a, b) => {
          if (a.type === "background") return -1;
          if (b.type === "background") return 1;
          return b.rect.w * b.rect.h - a.rect.w * a.rect.h;
        });
        usableShapes.length = SHAPE_CAP_PER_SLIDE;
      }
      for (const sb of usableShapes) {
        (sb.el as HTMLElement).setAttribute("data-pptx-shape-hide", "true");
      }

      // ---- Dégradés déco → IMAGES séparées déplaçables (décision produit).
      // pptxgenjs ne fait pas de fond dégradé natif : au lieu de laisser ces éléments
      // cuits dans le PNG de fond monolithique, on capture chacun en image indépendante
      // (déplaçable dans Canva). On capture AVANT de masquer (sinon l'élément est vidé) ;
      // en cas d'échec on NE masque PAS → l'élément reste dans le fond = sûr (pas de trou).
      const gradientImages: { data: string; x: number; y: number; w: number; h: number }[] = [];
      // Plafonné aux N plus GRANDES zones (les plus visibles) : chaque capture est
      // une passe html2canvas (re-clone DOM complet) → coût qui explose sinon sur
      // les slides-schéma. Le reste est laissé cuit dans le fond (sûr, juste non
      // déplaçable individuellement dans Canva).
      // Court-circuit perf : si plafond = 0, on saute TOUT (même le DOM-walk) → les
      // dégradés restent cuits dans le PNG de fond (rendu identique). C'était le goulot.
      const gradientZones = MAX_GRADIENT_CAPTURES > 0
        ? [...extractGradientDecoZones(doc)]
            .sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)
            .slice(0, MAX_GRADIENT_CAPTURES)
        : [];
      for (const gz of gradientZones) {
        try {
          const gcanvas = await raceTimeout(
            html2canvas(gz.el, {
              scale: RASTER_SCALE,
              backgroundColor: null,
              useCORS: true,
              allowTaint: true,
              logging: false,
              imageTimeout: 8000,
            }),
            15000,
            null,
          );
          if (!gcanvas) continue; // capture trop longue → laissé cuit dans le fond (sûr)
          const gdata = gcanvas.toDataURL("image/png");
          if (!gdata || gdata.length < 64) continue; // capture vide → laissé cuit (sûr)
          const x = Math.max(0, pxToInches(gz.rect.x, PX_PER_IN));
          const y = Math.max(0, pxToInches(gz.rect.y, PX_PER_IN));
          const w = Math.min(PPTX_W_IN - x, pxToInches(gz.rect.w, PX_PER_IN));
          const h = Math.min(PPTX_H_IN - y, pxToInches(gz.rect.h, PX_PER_IN));
          if (w <= 0 || h <= 0) continue;
          // Succès → masquer du PNG de fond (data-pptx-shape-hide vide background/bg-image)
          // puis mémoriser pour pose en couche séparée après le fond.
          (gz.el as HTMLElement).setAttribute("data-pptx-shape-hide", "true");
          gradientImages.push({ data: gdata, x, y, w, h });
        } catch (e) {
          console.warn("[hybrid] capture dégradé déco échouée, laissé dans le fond", e);
        }
      }

      // ---- Emojis ISOLÉS → petite image détourée déplaçable (au lieu d'un texte-emoji
      // que Canva rastérise à l'import). Rendu via canvas 2D `fillText` (PAS html2canvas
      // → aucun clone DOM, coût négligeable). Les emojis COLLÉS à du texte restent en
      // texte éditable (gérés par les blocs texte, pas ici). On rend AVANT de masquer ;
      // en cas d'échec de rendu on NE masque PAS → l'emoji reste cuit dans le fond (sûr).
      const emojiImages: { data: string; x: number; y: number; w: number; h: number }[] = [];
      const emojiZones = extractStandaloneEmojiZones(doc).slice(0, MAX_EMOJI_CAPTURES);
      for (const ez of emojiZones) {
        // Anti-doublon : un emoji déjà à l'intérieur d'un bloc texte capturé (annoté ou
        // via le filet → l'ancêtre porte data-pptx-hide) est rendu en texte natif. On
        // tourne APRÈS les passes texte, donc ce test attrape ces cas → pas de double.
        if (ez.el.closest('[data-pptx-hide="true"]')) continue;
        const rendered = renderEmojiImage(ez, RASTER_SCALE);
        if (!rendered) continue; // emoji non rendu → laissé dans le fond (sûr)
        const x = Math.max(0, pxToInches(rendered.x, PX_PER_IN));
        const y = Math.max(0, pxToInches(rendered.y, PX_PER_IN));
        const w = Math.min(PPTX_W_IN - x, pxToInches(rendered.w, PX_PER_IN));
        const h = Math.min(PPTX_H_IN - y, pxToInches(rendered.h, PX_PER_IN));
        if (w <= 0 || h <= 0) continue;
        // Succès → masquer l'emoji du PNG de fond (visibility : préserve le layout, et
        // cache bien un emoji COULEUR, contrairement à color:transparent qui ne le
        // masquerait pas) puis mémoriser pour pose en image séparée après le fond.
        ez.el.style.setProperty("visibility", "hidden", "important");
        emojiImages.push({ data: rendered.data, x, y, w, h });
      }

      // ---- Photo zones extraction + filtering on availability
      // Si originalPhotos n'est pas fourni → usableZones vide → fallback total :
      // les photos restent visibles dans le rasterisé (comportement legacy).
      const allZones = extractPhotoZones(doc, (data as any)?.photo_index);
      const usableZones: PhotoZone[] = [];
      for (const zone of allZones) {
        const photo = originalPhotos?.[zone.photoIndex - 1];
        if (!photo?.base64) {
          // Pas de photo native dispo : on warn (P4) seulement si l'appelant a tenté
          // de fournir des photos (sinon c'est juste le mode legacy).
          if (originalPhotos && originalPhotos.length > 0) {
            try {
              Sentry.captureMessage("[hybrid] photo native introuvable", {
                level: "warning",
                extra: {
                  photoIndex: zone.photoIndex,
                  slideNumber: vs.slide_number,
                  providedCount: originalPhotos.length,
                },
              });
            } catch {
              /* Sentry non initialisé : noop */
            }
          }
          continue;
        }
        usableZones.push(zone);
      }

      // ---- Mask usable zones in iframe so captureBody produit du transparent dessus
      // Fond opaque derrière une zone masquée (racine charbon des gabarits photo
      // composés) : neutralisé pour que le trou du raster reste transparent au-dessus
      // de la photo native, et reporté en fond NATIF de slide (cf. helper).
      let photoBackdrop: string | null = null;
      for (const zone of usableZones) {
        if (zone.type === "img") {
          const target = zone.el.parentElement || zone.el;
          target.setAttribute("data-pptx-photo-hide", "true");
        } else {
          // background : retirer l'url(data:...) inline tout en conservant gradients
          const cs = win.getComputedStyle(zone.el);
          const cleaned = stripDataUrlsFromBackground(cs.backgroundImage || "");
          // !important via setProperty pour battre les classes Tailwind / CSS overlay
          zone.el.style.setProperty("background-image", cleaned, "important");
        }
        const cleared = clearOpaqueBackdropsBehindZone(zone, doc);
        if (cleared && !photoBackdrop) photoBackdrop = cleared;
      }

      // Force layout flush après masquage texte + photos
      void win.document.body.offsetHeight;
      await new Promise((r) => setTimeout(r, 50));

      const tCapture = performance.now();
      const bg = await captureBody(doc);
      perf.captureBody = Math.round(performance.now() - tCapture);

      // ---- Z-ORDER (bottom → top) :
      // 1. Photos natives (couche bottom)
      // 2. Fond rasterisé transparent sur zones photo (couche middle)
      // 3. Blocs texte éditables (couche top)
      for (const zone of usableZones) {
        const photo = originalPhotos![zone.photoIndex - 1]; // garanti par filtre ci-dessus
        // Clamp dans les limites de la slide pour éviter les coordonnées négatives
        const xRaw = pxToInches(zone.rect.x, PX_PER_IN);
        const yRaw = pxToInches(zone.rect.y, PX_PER_IN);
        const wRaw = pxToInches(zone.rect.w, PX_PER_IN);
        const hRaw = pxToInches(zone.rect.h, PX_PER_IN);
        const x = Math.max(0, xRaw);
        const y = Math.max(0, yRaw);
        const w = Math.min(PPTX_W_IN - x, wRaw - (x - xRaw));
        const h = Math.min(PPTX_H_IN - y, hRaw - (y - yRaw));
        if (w <= 0 || h <= 0) continue;
        const frameRatio = w / h;
        const cacheKey = `${zone.photoIndex}:${frameRatio.toFixed(3)}`;
        let cropped = cropCache.get(cacheKey);
        if (cropped === undefined) {
          cropped = await cropToRatioBase64(photo.base64, frameRatio);
          cropCache.set(cacheKey, cropped);
        }
        try {
          slide.addImage({
            data: cropped ?? photo.base64,
            x, y, w, h,
            ...(cropped ? {} : { sizing: { type: "cover", w, h } }),
          });
        } catch (e) {
          console.warn("[hybrid] addImage(originalPhoto) failed", e);
        }
      }

      // ---- Pose des shapes natifs (couche middle-bas) entre photos (bottom)
      // et PNG de fond (middle-haut). Le PNG sera transparent là où les shapes
      // ont été masqués via data-pptx-shape-hide → les shapes natifs restent visibles.
      // Le texte ENFANT non annoté reste rendu dans le PNG (pas masqué) → il s'affiche
      // par-dessus le shape natif visuellement (PNG posé après).
      const drawNativeShape = (sb: ShapeBlock, wMul = 1, centered = false) => {
        const wBase = pxToInches(sb.rect.w, PX_PER_IN);
        const wRaw = wBase * wMul;
        // Élargissement symétrique quand le label interne est centré (pilule CTA
        // au milieu d'une carte) — sinon on étend à droite (label ancré à gauche).
        const xRaw = pxToInches(sb.rect.x, PX_PER_IN) - (centered ? (wRaw - wBase) / 2 : 0);
        const yRaw = pxToInches(sb.rect.y, PX_PER_IN);
        const hRaw = pxToInches(sb.rect.h, PX_PER_IN);
        const x = Math.max(0, xRaw);
        const y = Math.max(0, yRaw);
        const w = Math.min(PPTX_W_IN - x, wRaw - (x - xRaw));
        const h = Math.min(PPTX_H_IN - y, hRaw - (y - yRaw));
        if (w <= 0 || h <= 0) return;
        const radiusInches = pxToInches(sb.borderRadiusPx, PX_PER_IN);
        const cappedRadius = Math.min(radiusInches, Math.min(w, h) / 2);
        try {
          slide.addShape("roundRect", {
            x, y, w, h,
            // L'alpha CSS devient une transparency native : une carte-voile
            // rgba(255,255,255,0.06) sur fond sombre reste un voile (et pas un
            // aplat blanc opaque qui rend son texte clair illisible).
            fill: {
              color: sb.fill,
              ...(sb.fillAlpha !== undefined && sb.fillAlpha < 1
                ? { transparency: Math.round((1 - sb.fillAlpha) * 100) }
                : {}),
            },
            line: sb.border
              ? { color: sb.border.color, width: sb.border.widthPt, dashType: sb.border.dashType }
              : { type: "none" },

            rectRadius: cappedRadius,
            ...(sb.shadow && {
              shadow: {
                type: "outer" as const,
                blur: sb.shadow.blurPt,
                offset: sb.shadow.offsetPt,
                angle: sb.shadow.angle,
                color: sb.shadow.color,
                opacity: sb.shadow.opacity,
              },
            }),
          });
        } catch (e) {
          console.warn("[hybrid] addShape failed for shape type", sb.type, e);
        }
      };
      // PILULES à label une-ligne : le texte est posé en wrap:false (il ne
      // re-wrappe jamais) mais les métriques PowerPoint (mono + letter-spacing)
      // le rendent jusqu'à ~30 % plus large que le HTML → il déborderait de la
      // pilule (« ENTREPRI|SES » dont la fin atterrit en blanc sur fond clair,
      // vu en prod). On élargit ces pilules d'autant ET on les pose AU-DESSUS
      // du PNG de fond : dessinée dessous, l'extension serait cachée par les
      // pixels opaques du PNG (le trou du masquage est à la taille HTML). Leur
      // visuel étant entièrement retiré du PNG (bg/bordure/ombre via
      // data-pptx-shape-hide), les poser au-dessus est visuellement équivalent.
      const deferredPills: Array<{ sb: ShapeBlock; centered: boolean; wMul: number }> = [];
      for (const sb of usableShapes) {
        if (sb.type === "background") {
          // Fond unique : on l'applique directement à slide.background plutôt
          // qu'un addShape pleine slide (plus léger + édition "Format de l'arrière-plan").
          slide.background = { color: sb.fill };
          continue;
        }
        const innerLabel =
          sb.type === "pill"
            ? blocks.find(
                (b) =>
                  !b.text.includes("\n") &&
                  b.rect.h < b.style.lineHeight * 1.6 &&
                  b.rect.x >= sb.rect.x && b.rect.y >= sb.rect.y &&
                  b.rect.x + b.rect.w <= sb.rect.x + sb.rect.w + 1 &&
                  b.rect.y + b.rect.h <= sb.rect.y + sb.rect.h + 1,
              )
            : undefined;
        if (innerLabel) {
          // Largeur cible = largeur CIBLE du label (estimation mono exacte ou
          // slack, cf. desiredTextWidthIn) + le padding horizontal HTML des
          // deux côtés — au lieu d'un ×1.3 forfaitaire qui restait court sur
          // les labels longs (« MÉCANISME SYSTÉMIQUE » débordant, vu en prod).
          const padIn = Math.max(0, pxToInches(innerLabel.rect.x - sb.rect.x, PX_PER_IN));
          const pillRawIn = pxToInches(sb.rect.w, PX_PER_IN);
          const pillDesired = desiredTextWidthIn(innerLabel) + padIn * 2;
          deferredPills.push({
            sb,
            centered: innerLabel.style.textAlign === "center",
            wMul: Math.max(1, pillDesired / Math.max(0.01, pillRawIn)),
          });
          continue;
        }
        drawNativeShape(sb);
      }
      // Fond neutralisé derrière les photos → fond NATIF de la slide (derrière la
      // photo native ; visible seulement si celle-ci manque). Un shape background
      // annoté garde la priorité (slides mix : déjà posé ci-dessus).
      if (photoBackdrop && !usableShapes.some((s) => s.type === "background")) {
        slide.background = { color: photoBackdrop };
      }
      const shadowedCount = usableShapes.filter((s) => s.type !== "background" && s.shadow).length;
      if (shadowedCount > 0) {
        console.debug(`[hybrid] shapes natifs ombrés sur slide ${vs.slide_number} : ${shadowedCount}/${usableShapes.length}`);
      }


      slide.addImage({ data: bg, x: 0, y: 0, w: PPTX_W_IN, h: PPTX_H_IN });

      // Pilules élargies (cf. deferredPills) : au-dessus du PNG, sous le texte.
      for (const dp of deferredPills) drawNativeShape(dp.sb, dp.wMul, dp.centered);

      // Dégradés déco : posés APRÈS le fond (donc visibles + déplaçables individuellement
      // dans Canva) et AVANT le texte (qui reste au-dessus).
      for (const gi of gradientImages) {
        try {
          slide.addImage({ data: gi.data, x: gi.x, y: gi.y, w: gi.w, h: gi.h });
        } catch (e) {
          console.warn("[hybrid] addImage(dégradé déco) failed", e);
        }
      }

      // Emojis isolés : petites images détourées, posées après le fond → élément
      // indépendant déplaçable/redimensionnable dans Canva (vrai emoji couleur).
      for (const ei of emojiImages) {
        try {
          slide.addImage({ data: ei.data, x: ei.x, y: ei.y, w: ei.w, h: ei.h });
        } catch (e) {
          console.warn("[hybrid] addImage(emoji) failed", e);
        }
      }

      for (const b of blocks) {
        try {
          addBlockToSlide(slide, b, charter, { siblings: blocks, cards: usableShapes });
        } catch (e) {
          console.warn("[hybrid] addBlockToSlide failed", e);
        }
      }

      // ---- Logo de marque (top layer, opt-in via logoUrl) ----
      if (logoBase64) {
        try {
          const padding = 0.3;
          const hLogo = PPTX_H_IN * 0.07;            // hauteur fixe (7% de la slide)
          const ratio = logoSize && logoSize.h > 0 ? logoSize.w / logoSize.h : 2.2; // fallback
          const wLogo = hLogo * ratio;               // largeur déduite du ratio réel
          const xLogo = PPTX_W_IN - wLogo - padding;
          const yLogo = PPTX_H_IN - hLogo - padding;
          slide.addImage({ data: logoBase64, x: xLogo, y: yLogo, w: wLogo, h: hLogo });
        } catch (e) {
          console.warn("[hybrid] addImage(logo) failed", e);
        }
      }
    } catch (e) {
      console.error("[hybrid] slide capture failed", e);
      slide.background = { color: normalizeHex(charter?.color_background, "FFFFFF") };
    } finally {
      iframe.remove();
      console.log(`[hybrid][perf] slide ${vs.slide_number} rendue en ${Math.round(performance.now() - tSlide0)}ms — mount=${perf.mount ?? "?"} waitReady=${perf.waitReady ?? "?"} captureBody=${perf.captureBody ?? "?"}`);
    }
  }

  // Rendu par LOTS CONCURRENTS : la rastérisation html2canvas (scale 3) est le poste le
  // plus lourd ; en traiter quelques-unes en parallèle réduit fortement le temps total.
  // L'ordre du deck est garanti par la pré-création des slides ci-dessus, et chaque slide
  // a son propre iframe (aucun état partagé hormis cropCache, sûr en mono-thread JS).
  const RENDER_CONCURRENCY = 3;
  const tAll0 = performance.now(); // perf instrumentation
  for (let start = 0; start < visualSlides.length; start += RENDER_CONCURRENCY) {
    await Promise.all(
      visualSlides
        .slice(start, start + RENDER_CONCURRENCY)
        .map((_, k) => renderSlideAt(start + k)),
    );
  }
  console.log(`[hybrid][perf] ${visualSlides.length} slides rasterisées en ${Math.round(performance.now() - tAll0)}ms (scale ${RASTER_SCALE}, gradient-captures ${MAX_GRADIENT_CAPTURES})`);

  // Pour le pont Canva : renvoyer le PPTX en Blob (à uploader puis importer) plutôt
  // que de déclencher un téléchargement.
  if (opts?.returnBlob) {
    return (await pptx.write({ outputType: "blob" })) as Blob;
  }
  await pptx.writeFile({ fileName: fileName + ".pptx" });
}
