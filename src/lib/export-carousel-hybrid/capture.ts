import { type EmojiZone } from "../pptx-font-mapping";
import html2canvas from "html2canvas-pro";
import { waitForClonedTextFonts } from "../export-text-fonts";
import { SLIDE_W_PX, SLIDE_H_PX } from "./types";
import { CAPTURE_TIMEOUT_MS } from "@/lib/export-budget";

// ---------------------------------------------------------------------------
// capture
// ---------------------------------------------------------------------------

// html2canvas peut, sur certains contenus, ne JAMAIS résoudre (rendu async qui pend) —
// `imageTimeout` ne borne que le chargement d'images, pas le rendu. On borne donc chaque
// capture : au-delà du délai, on abandonne CETTE capture et on continue, pour qu'une seule
// slide ne puisse pas bloquer tout l'export (cf. blocage observé en live sur une slide-schéma).
export function raceTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// CAPTURE_TIMEOUT_MS vit désormais dans export-budget.ts (importé en tête) :
// le pont Canva en déduit son budget global, les deux ne doivent plus diverger.

// Échelle de rastérisation html2canvas. Le PNG de fond ne porte QUE le résiduel
// décoratif (texte, formes et photos sont posés en NATIF) → 1.5 suffit largement
// (1620px de large pour une slide de 7.5" = 216 DPI, net pour un PPTX). Baissé de
// 2 à 1.5 : ~44% de pixels en moins à peindre par capture. Historique : 3 → 2 → 1.5.
export const RASTER_SCALE = 1.5;

// Captures de dégradés déco en image séparée (déplaçable dans Canva) PAR SLIDE.
// DÉSACTIVÉ (0, décision produit 27/06) : chaque capture est une passe html2canvas
// qui re-clone tout le DOM → sur les slides-schéma il y en a beaucoup → le temps
// d'export explosait (>4 min observé, cascades de timeouts). Les dégradés restent
// VISIBLES (cuits dans le PNG de fond, rendu identique), juste plus déplaçables
// individuellement dans Canva — ce qu'on ne fait jamais en pratique. C'était LE
// goulot principal de l'export hybride. Remettre >0 réintroduit le coût.
export const MAX_GRADIENT_CAPTURES = 0;

// Emojis ISOLÉS rendus en petite image détourée par slide. Contrairement aux dégradés
// (html2canvas = clone DOM coûteux, désactivé ci-dessus), un emoji est dessiné via
// canvas 2D `fillText` → coût négligeable, pas de clone DOM. Plafond par sécurité.
export const MAX_EMOJI_CAPTURES = 24;

/**
 * Rend un emoji ISOLÉ en petite image PNG détourée au plus près du glyphe (canvas 2D,
 * pas html2canvas). On dessine l'emoji dans un canvas à la taille du content-box (en
 * respectant l'alignement), puis on rogne les marges transparentes → l'image colle
 * pile au dessin (pas un grand bloc vide). Renvoie la position/taille DÉTOURÉE en px
 * (repère iframe), ou null si rien n'a été peint (emoji non rendu) → l'appelant le
 * laisse alors dans le PNG de fond (filet de sûreté, jamais de trou).
 */
export function renderEmojiImage(
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

export async function captureBody(doc: Document): Promise<string> {
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
      onclone: (clone) => waitForClonedTextFonts(clone),
    }),
    CAPTURE_TIMEOUT_MS,
    null,
  );
  if (!canvas) throw new Error("La capture du fond (html2canvas) a expiré.");
  return canvas.toDataURL("image/png");
}
