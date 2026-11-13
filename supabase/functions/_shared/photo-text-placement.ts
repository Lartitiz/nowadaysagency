// Placement du texte sur une photo plein cadre, calculé EN CODE (13/11/2026).
//
// Avant : l'IA de direction artistique choisissait « en haut / en bas / au
// centre » à l'œil, sans savoir jusqu'où le bloc de texte descendrait. Un texte
// de deux paragraphes posé « en haut » d'un portrait finissait sur le visage
// (vu par Laetitia le 13/11/2026). Désormais l'IA indique seulement où se
// trouve le sujet à protéger (visage, produit, geste) en % de la hauteur de la
// photo ; ce module estime la hauteur du texte et choisit la bande qui ne le
// touche pas. Aucun appel IA, aucune donnée modifiée.
//
// Les tailles reprennent celles des gabarits de photo-overlay-templates.ts
// (slide 1080 × 1350, marges 110 px en haut et 220 px en bas). L'estimation est
// calée sur une slide réelle ; la marge de 24 px autour du sujet absorbe
// l'écart d'une police plus large.

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
const TOP_SAFE = 110;
const BOTTOM_SAFE = 220;
/** Marge gardée autour du sujet (px de slide) : le texte ne le frôle pas. */
const SUBJECT_MARGIN = 24;

export type TextPosition = "top_left" | "bottom_left" | "center";
/** Zone verticale du sujet sur la SLIDE, en fractions 0..1 de sa hauteur. */
export interface SubjectZone { top: number; bottom: number }
export interface ImageSize { width: number; height: number }

const words = (s: unknown) => String(s || "").trim().split(/\s+/).filter(Boolean);

/** Dimensions lues dans l'en-tête JPEG, PNG ou WebP (base64 ou data URL). null si illisible. */
export function imageSizeFromBase64(raw: unknown): ImageSize | null {
  if (typeof raw !== "string" || !raw) return null;
  const b64 = raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;
  let bytes: Uint8Array;
  try {
    // L'en-tête suffit, sauf JPEG où le bloc SOF peut venir après l'EXIF : 256 Ko lus au plus.
    // 349 524 est un multiple de 4 : le début tronqué reste du base64 valide.
    const bin = atob(b64.replace(/\s/g, "").slice(0, 349_524));
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch { return null; }
  const at = (i: number) => bytes[i] ?? 0;
  const ok = (w: number, h: number) => w > 0 && h > 0 ? { width: w, height: h } : null;
  // PNG : IHDR
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) {
    return ok((at(16) << 24 | at(17) << 16 | at(18) << 8 | at(19)) >>> 0, (at(20) << 24 | at(21) << 16 | at(22) << 8 | at(23)) >>> 0);
  }
  // WebP : RIFF....WEBP
  if (at(0) === 0x52 && at(1) === 0x49 && at(8) === 0x57 && at(9) === 0x45) {
    const kind = String.fromCharCode(at(12), at(13), at(14), at(15));
    if (kind === "VP8X") return ok(1 + (at(24) | at(25) << 8 | at(26) << 16), 1 + (at(27) | at(28) << 8 | at(29) << 16));
    if (kind === "VP8 ") return ok((at(26) | at(27) << 8) & 0x3fff, (at(28) | at(29) << 8) & 0x3fff);
    if (kind === "VP8L") {
      const b = at(21) | at(22) << 8 | at(23) << 16 | at(24) << 24;
      return ok((b & 0x3fff) + 1, ((b >>> 14) & 0x3fff) + 1);
    }
    return null;
  }
  // JPEG : premier bloc SOF (C0..CF sauf C4, C8, CC)
  if (at(0) === 0xff && at(1) === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (at(i) !== 0xff) { i++; continue; }
      const marker = at(i + 1);
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = at(i + 2) << 8 | at(i + 3);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return ok(at(i + 7) << 8 | at(i + 8), at(i + 5) << 8 | at(i + 6));
      }
      if (len < 2) return null;
      i += 2 + len;
    }
  }
  return null;
}

/**
 * Zone du sujet donnée en % de la hauteur de la PHOTO → zone sur la SLIDE.
 * La photo est posée en `background-size:cover; background-position:center` :
 * une photo plus haute que 4:5 perd le même nombre de pixels en haut et en bas.
 * Sans dimensions connues, on suppose que la photo remplit la hauteur.
 */
export function subjectZoneOnSlide(topPct: unknown, bottomPct: unknown, size: ImageSize | null): SubjectZone | null {
  const t = Number(topPct), b = Number(bottomPct);
  if (topPct == null || bottomPct == null || !Number.isFinite(t) || !Number.isFinite(b)) return null;
  const top = Math.min(t, b) / 100, bottom = Math.max(t, b) / 100;
  if (bottom <= 0 || top >= 1 || bottom - top < 0.02) return null;
  let shown = SLIDE_H, offset = 0;
  if (size && size.width > 0 && size.height > 0) {
    const scale = Math.max(SLIDE_W / size.width, SLIDE_H / size.height);
    shown = size.height * scale;
    offset = (shown - SLIDE_H) / 2;
  }
  const toSlide = (f: number) => Math.min(1, Math.max(0, (f * shown - offset) / SLIDE_H));
  const zone = { top: toSlide(Math.max(0, top)), bottom: toSlide(Math.min(1, bottom)) };
  return zone.bottom - zone.top > 0.005 ? zone : null;
}

/** Lignes d'un texte dans une largeur donnée (largeur moyenne d'un caractère ≈ 0,5 em ;
 * calé le 13/11/2026 sur une slide réelle à police large : ~400 px mesurés). */
function lines(text: string, fontPx: number, widthPx: number): number {
  const perLine = Math.max(8, Math.floor(widthPx / (fontPx * 0.5)));
  let count = 0;
  for (const paragraph of String(text || "").split("\n")) {
    let line = 0, n = 1;
    for (const w of words(paragraph)) {
      const len = w.length;
      if (line && line + 1 + len > perLine) { n++; line = len; } else line += (line ? 1 : 0) + len;
    }
    count += n;
  }
  return count;
}
const block = (text: unknown, fontPx: number, lineHeight: number, widthPx: number) =>
  String(text || "").trim() ? lines(String(text), fontPx, widthPx) * fontPx * lineHeight : 0;
const fitSize = (base: number, text: unknown, nominal: number) => {
  const wc = words(text).length;
  if (wc <= nominal) return Math.max(38, base);
  if (wc <= Math.round(nominal * 1.4)) return Math.max(38, Math.round(base * 0.85));
  if (wc <= Math.round(nominal * 1.8)) return Math.max(38, Math.round(base * 0.72));
  return 38;
};

type Slide = Record<string, any>;

/**
 * Hauteur estimée (px de slide) du bloc de texte d'une slide photo, selon le
 * traitement choisi (catalogue de la direction artistique). Un peu large exprès.
 */
export function estimateTextHeight(s: Slide, treatment: string, emphasis: string | null): number {
  const text = String(s.overlay_text || "");
  const W = 912, PANEL = 72;
  const kicker = s.kicker ? block(s.kicker, 32, 1.3, W) + 20 : 0;
  const detail = (s.detail ? block(s.detail, 34, 1.4, 820) + 22 : 0) + (s.attribution ? block(s.attribution, 34, 1.4, 820) + 18 : 0);
  const cta = s.cta_label ? 34 * 1.3 + 28 + 30 : 0;
  let h: number;
  if (treatment === "list") {
    const points = (Array.isArray(s.points) ? s.points : []).reduce((sum: number, p: unknown) => sum + block(p, 36, 1.4, W - 140) + 18, 0);
    h = kicker + (text.trim() ? block(text, fitSize(48, text, 14), 1.2, W - 80) + 28 : 0) + points + detail + PANEL;
  } else if (treatment === "number") {
    const num = String(s.big_number || ""), size = num.length > 10 ? 88 : num.length > 6 ? 112 : 144;
    h = kicker + block(num, size, 1.05, W - 80) + (text.trim() ? block(text, fitSize(40, text, 28), 1.45, W - 80) + 24 : 0) + detail + PANEL;
  } else {
    const finale = treatment === "closing";
    const count = words(text).length;
    if (count > 12 || treatment === "statement") {
      // Gabarit éditorial : un passage mis en valeur plus grand, le reste en corps.
      const body = count > 90 ? 40 : count > 45 ? 42 : 44;
      const big = count > 75 ? 50 : count > 45 ? 56 : finale ? 72 : 64;
      const em = treatment === "statement" ? text : emphasis && text.includes(emphasis) ? emphasis : "";
      const rest = em ? text.replace(em, " ").trim() : text;
      const parts = (em ? 1 : 0) + (rest ? Math.max(1, Math.ceil(rest.length / 125)) : 0);
      h = kicker + block(em, big, 1.28, W) + block(rest, body, 1.28, W) + Math.max(0, parts - 1) * 18 + detail + cta;
    } else {
      const size = finale ? fitSize(56, text, 20) : fitSize(40, text, 35);
      const panel = words([s.kicker, text, s.detail, s.cta_label].filter(Boolean).join(" ")).length > 28 ? PANEL : 0;
      h = kicker + block(text, size, finale ? 1.2 : 1.45, 880) + detail + cta + panel;
    }
    if (s.photo_format?.step) h += 60;
  }
  return Math.round(h);
}

/** Bande verticale (px de slide) occupée par le texte à cette position. */
export function textBand(position: TextPosition, heightPx: number): { top: number; bottom: number } {
  const h = Math.min(heightPx, SLIDE_H - TOP_SAFE - BOTTOM_SAFE);
  if (position === "top_left") return { top: TOP_SAFE, bottom: TOP_SAFE + h };
  if (position === "bottom_left") return { top: SLIDE_H - BOTTOM_SAFE - h, bottom: SLIDE_H - BOTTOM_SAFE };
  const mid = (TOP_SAFE + SLIDE_H - BOTTOM_SAFE) / 2;
  return { top: mid - h / 2, bottom: mid + h / 2 };
}

export interface Placement { position: TextPosition; overlap_px: number; conflict: boolean; moved: boolean }

/**
 * Choisit la position du texte qui ne couvre pas le sujet. Ordre : la position
 * proposée, puis en bas, en haut, au centre. Si aucune n'est libre, la moins
 * couvrante (à égalité : en bas, sur le corps plutôt que sur le visage).
 */
export function placeTextAvoidingSubject(zone: SubjectZone | null, heightPx: number, preferred: TextPosition): Placement {
  if (!zone) return { position: preferred, overlap_px: 0, conflict: false, moved: false };
  const sTop = zone.top * SLIDE_H - SUBJECT_MARGIN, sBottom = zone.bottom * SLIDE_H + SUBJECT_MARGIN;
  const overlap = (p: TextPosition) => {
    const b = textBand(p, heightPx);
    return Math.max(0, Math.min(b.bottom, sBottom) - Math.max(b.top, sTop));
  };
  const order = [...new Set<TextPosition>([preferred, "bottom_left", "top_left", "center"])];
  const free = order.find((p) => overlap(p) === 0);
  if (free) return { position: free, overlap_px: 0, conflict: false, moved: free !== preferred };
  const tie: TextPosition[] = ["bottom_left", "top_left", "center"];
  const best = [...tie].sort((a, b) => overlap(a) - overlap(b) || tie.indexOf(a) - tie.indexOf(b))[0];
  return { position: best, overlap_px: Math.round(overlap(best)), conflict: true, moved: best !== preferred };
}
