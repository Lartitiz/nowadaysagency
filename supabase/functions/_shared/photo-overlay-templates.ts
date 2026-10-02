import { photoEditorialMarkup } from "./photo-editorial.ts";
import { hexLuminance } from "./contrast-guard.ts";

// Composition PAR CODE des slides photo+overlay (chantier gabarits 13/07).
//
// Le modèle ne produit plus le HTML des slides photo : il fournit le CONTENU
// (texte, gabarit, position) et ce module dessine la slide. Lisibilité, safe
// zones, centrage et ancres d'édition/export sont donc garantis par
// construction — plus besoin de réparer a posteriori le HTML du modèle
// (les regex de photo-visual-guards ne couvraient que les variantes déjà vues :
// audit du 13/07, 5 motifs sur 6 passaient au travers).
//
// 8 gabarits validés en maquette avec Laetitia (13/07) :
//   couverture  — titre dans la police de marque + repère de couleur + détail
//   profonde    — texte développé sur une surface locale de la charte
//   etiquette   — repère court dans la casse et les formes de la marque
//   chiffre     — chiffre géant + ligne de contexte
//   liste       — 2-3 points numérotés en couleur d'accent
//   etape       — numéro et titre sur une ligne + corps (processus)
//   citation    — verbatim dans la police de titre + attribution
//   finale      — conclusion + invitation de marque (data-slide-cta)
//
// Contrats respectés (consommés par l'édition live, l'export PPTX hybride et
// pinterest-visual) :
//   - racine <div style="width:1080px;height:1350px;position:relative…">
//   - photo = background-image:url({{PHOTO_N}}) où N = photo_index (1-based),
//     élément annoté data-pptx-photo="N"
//   - overlay_text VERBATIM dans l'élément data-slide-text="overlay"
//     (+ data-pptx-editable="overlay")
//   - CTA de la slide finale : wrapper data-slide-cta, texte data-slide-text="cta"
//   - safe zones : ≥200px de marge basse, ≥96px de marge haute
//   - un seul accent de couleur (charte) par slide, aucun ornement répété

export type PhotoTemplate =
  | "couverture"
  | "profonde"
  | "etiquette"
  | "chiffre"
  | "liste"
  | "etape"
  | "citation"
  | "finale";

export interface PhotoSlideSpec {
  slide_number: number;
  photo_index: number; // 1-based, réutilisable entre slides
  template?: PhotoTemplate | null;
  overlay_text?: string | null;
  kicker?: string | null; // sur-titre court (couverture, liste)
  detail?: string | null; // ligne de détail (couverture, chiffre, etiquette)
  points?: string[] | null; // liste : 2-3 points courts
  big_number?: string | null; // chiffre : "-40 %", "3×", "48 h"
  step_number?: number | null; // etape : numéro du geste/de l'étape (PAS de la slide)
  attribution?: string | null; // citation : qui parle
  cta_label?: string | null; // finale : texte de la pastille d'invitation
  overlay_position?: string | null; // bottom_* | top_* | center
  art_direction?: { treatment: string; emphasis: string | null; position: string; reason: string; surface?: "veil" | "paper"; alignment?: "left" | "center" };
  role?: string | null; // rôle narratif issu de la structure (hook, cta…)
  // Habillage des passages éditoriaux, attribué par assignPhotoStyles
  // (alternance validée par Laetitia le 02/10/2026). Absent = rendu historique.
  photo_style?: PhotoStyle | null;
}

export type PhotoStyle = "bord" | "carte" | "verre" | "colonne";

export interface PhotoCharter {
  color_primary?: string;
  color_secondary?: string;
  border_radius?: string | number;
  color_background?: string;
  color_text?: string;
  color_accent: string;
  font_title: string;
  font_body: string;
  text_alignment?: "left" | "center" | "right";
}

/** Luminance moyenne (0..1) de trois bandes horizontales de la photo, mesurée
 * côté client (canvas). Absente → on suppose une photo claire (voile fort). */
export interface PhotoZoneLuminance {
  top?: number;
  center?: number;
  bottom?: number;
}

const W = 1080;
const H = 1350;
const BOTTOM_SAFE = 220; // > 200px (icône carrousel + crop mobile)
const TOP_SAFE = 110; // > 96px

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cssFont(name: string, fallback: string): string {
  const clean = (name || "").replace(/[^\p{L}\p{N} ._-]/gu, "").trim();
  return clean ? `'${clean}', ${fallback}` : fallback;
}

function wordCount(s: string): number {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

/** Voile dosé sur la luminance MESURÉE de la zone du texte. Sans mesure, on
 * prend le pire cas (photo claire) : le texte blanc reste lisible partout. */
function scrimPeak(lum: number | undefined): number {
  if (typeof lum !== "number" || Number.isNaN(lum)) return 0.78;
  if (lum >= 0.6) return 0.85; // photo claire : voile franc
  if (lum >= 0.35) return 0.72;
  return 0.58; // photo déjà sombre : voile discret
}

/** Tokens from explicit charter fields; no inferred style based on profession. */
function design(ch: PhotoCharter) {
  const hex = (c: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : fallback;
  const background = hex(ch.color_background, "#1a1815");
  const contrast = (a: string, b: string) => {
    const x = hexLuminance(a.slice(1)), y = hexLuminance(b.slice(1));
    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
  };
  const readable = (preferred: string, bg: string) => contrast(preferred, bg) >= 4.5
    ? preferred : hexLuminance(bg.slice(1)) > .179 ? "#000000" : "#FFFFFF";
  const ink = readable(hex(ch.color_text, "#FFFFFF"), background);
  const primary = hex(ch.color_primary, hex(ch.color_accent, ink));
  const heading = readable(hex(ch.color_secondary, primary), background);
  const radiusValue = String(ch.border_radius ?? "0").trim().toLowerCase();
  const named: Record<string, number> = { none: 0, square: 0, sharp: 0, rounded: 24, soft: 24, pill: 48, organic: 36 };
  // Reading surfaces keep usable corners even for a pill-shaped brand.
  const radius = named[radiusValue] ?? (/^\d+(?:\.\d+)?(?:px)?$/.test(radiusValue) ? Math.min(48, Number.parseFloat(radiusValue)) : 0);
  return { background, ink, primary, onPrimary: readable(ink, primary), heading,
    accent: readable(hex(ch.color_accent, primary), background), radius };
}

function readingPanel(inner: string, ch: PhotoCharter, width = 912): string {
  const d = design(ch);
  return `<div data-photo-reading-panel="1" data-pptx-shape="card" style="background:${d.background};color:${d.ink};padding:36px 40px;box-sizing:border-box;width:100%;max-width:${width}px;border-radius:${d.radius}px;">${inner}</div>`;
}

function zoneFor(position: string | null | undefined): keyof PhotoZoneLuminance {
  const p = String(position || "");
  if (/^top/.test(p)) return "top";
  if (p === "center") return "center";
  return "bottom";
}

/** Teinte foncée de la marque pour les voiles : la couleur principale (puis
 * secondaire) EXPLICITE de la charte, assombrie jusqu'à porter un texte blanc
 * quand elle est moyenne ou claire (vu en prod le 02/10/2026 : un vert moyen
 * retombait sur le gris). Sans couleur de charte explicite : null. */
function brandVeilHex(ch: PhotoCharter): string | null {
  const base = [ch.color_primary, ch.color_secondary].find(c => /^#[0-9a-f]{6}$/i.test(String(c || "")));
  if (!base) return null;
  const rgb = [1, 3, 5].map(i => parseInt(base.slice(i, i + 2), 16));
  const toHex = (k: number) => "#" + rgb.map(v => Math.round(v * k).toString(16).padStart(2, "0")).join("");
  for (let k = 1; k > .05; k -= .1) {
    const c = toHex(k);
    if (hexLuminance(c.slice(1)) < .06) return c;
  }
  return null;
}

/** Couleur des voiles "r,g,b" : teinte foncée de la marque, sinon le noir
 * historique. Reconnue par l'export hybride (parseScrimStyle) pour cuire le
 * voile dans la photo. */
function veilRgb(ch: PhotoCharter): string {
  const dark = brandVeilHex(ch);
  if (!dark) return "0,0,0";
  return [1, 3, 5].map(i => parseInt(dark.slice(i, i + 2), 16)).join(",");
}

/** Dégradé ancré au bord porteur du texte (bas par défaut). */
function gradientScrim(position: string | null | undefined, peak: number, heightPct = 54, rgb = "0,0,0"): string {
  if (position === "center") return fullDim(peak, rgb);
  const isTop = /^top/.test(String(position || ""));
  const dir = isTop ? "180deg" : "0deg";
  return `<div data-injected-scrim="1" style="position:absolute;left:0;${isTop ? "top" : "bottom"}:0;width:${W}px;height:${heightPct}%;background:linear-gradient(${dir},rgba(${rgb},${peak}) 0%,rgba(${rgb},0) 100%);"></div>`;
}

/** Voile uniforme (gabarits centrés). */
function fullDim(opacity: number, rgb = "0,0,0"): string {
  return `<div data-injected-scrim="1" style="position:absolute;top:0;left:0;width:${W}px;height:${H}px;background:rgba(${rgb},${opacity});"></div>`;
}

const COLUMN_W = 560; // colonne éditoriale : moitié gauche de la slide

/** Photo de la colonne éditoriale : moitié droite, recadrée sur son centre. */
function photoLayerRight(photoIndex: number): string {
  const n = Math.max(1, Math.round(photoIndex || 1));
  return `<div data-pptx-photo="${n}" style="position:absolute;top:0;left:${COLUMN_W}px;width:${W - COLUMN_W}px;height:${H}px;background-image:url({{PHOTO_${n}}});background-size:cover;background-position:center;"></div>`;
}

function photoLayer(photoIndex: number, zoom = false): string {
  const n = Math.max(1, Math.round(photoIndex || 1));
  // Zoom facultatif, uniquement demandé explicitement par un appelant.
  const sizing = zoom
    ? `background-size:150%;background-position:center 38%;`
    : `background-size:cover;background-position:center;`;
  return `<div data-pptx-photo="${n}" style="position:absolute;top:0;left:0;width:${W}px;height:${H}px;background-image:url({{PHOTO_${n}}});${sizing}"></div>`;
}

function root(fontBody: string, inner: string): string {
  return `<div style="width:${W}px;height:${H}px;position:relative;overflow:hidden;background:#1a1815;font-family:${fontBody};font-size:32px;">${inner}</div>`;
}

/** Bloc de contenu positionné selon overlay_position, safe zones garanties. */
function contentWrap(
  position: string | null | undefined,
  align: "flex-start" | "center" | "flex-end",
  inner: string,
): string {
  const p = String(position || "bottom_center");
  const isTop = /^top/.test(p);
  const isCenter = p === "center";
  const justify = isCenter ? "center" : isTop ? "flex-start" : "flex-end";
  const textAlign = /left$/.test(p) ? "left" : "center";
  const alignItems = /left$/.test(p) ? "flex-start" : align;
  return `<div data-photo-text-layout="${escapeHtml(p)}" style="position:absolute;top:0;left:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;justify-content:${justify};align-items:${alignItems};text-align:${textAlign};padding:${TOP_SAFE}px 84px ${BOTTOM_SAFE}px 84px;box-sizing:border-box;">${inner}</div>`;
}

function kickerHtml(text: string, color = "#FFFFFF"): string {
  return `<div data-pptx-editable="caption" style="position:relative;font-size:32px;line-height:1.3;font-weight:500;color:${color};margin-bottom:20px;">${escapeHtml(text)}</div>`;
}

function detailHtml(text: string, marginTop = 22, color = "#FFFFFF"): string {
  return `<div data-pptx-editable="caption" style="position:relative;font-size:34px;line-height:1.4;font-weight:400;color:${color};margin-top:${marginTop}px;max-width:820px;">${escapeHtml(text)}</div>`;
}

function overlayAnchor(text: string, style: string, tag = "p"): string {
  return `<${tag} data-slide-text="overlay" data-pptx-editable="overlay" style="margin:0;font-weight:400;white-space:pre-wrap;overflow-wrap:anywhere;${style}">${escapeHtml(text)}</${tag}>`;
}

/** Taille du hook de couverture selon sa longueur (règle héros 64-88px). */
function heroSize(text: string): number {
  const wc = wordCount(text);
  if (wc <= 6) return 84;
  if (wc <= 12) return 80;
  if (wc <= 20) return 58;
  return 48; // hook anormalement long : réduit plutôt que clippé par overflow:hidden
}

/** Rétrécit la police quand le texte dépasse la longueur nominale du gabarit.
 * Le chemin composé n'a AUCUN font-size-guard aval (D1/D1-bis gatés
 * !composedByCode) et la racine est en overflow:hidden : sans cette échelle,
 * un texte trop long serait coupé hors cadre par le haut. */
function fitSize(base: number, text: string, nominalWords: number): number {
  const wc = wordCount(text);
  if (wc <= nominalWords) return Math.max(38, base);
  if (wc <= Math.round(nominalWords * 1.4)) return Math.max(38, Math.round(base * 0.85));
  if (wc <= Math.round(nominalWords * 1.8)) return Math.max(38, Math.round(base * 0.72));
  return 38; // Real browser QA flags excess copy; never make it unreadable.
}

// ── Gabarits ────────────────────────────────────────────────────────────────

function tplCouverture(s: PhotoSlideSpec, ch: PhotoCharter, lum?: number): string {
  const fontTitle = cssFont(ch.font_title, "Georgia, serif"), d = design(ch);
  const label = s.kicker ? `<div data-pptx-editable="caption" style="display:inline-block;align-self:inherit;background:${d.primary};color:${d.onPrimary};border-radius:${Math.min(d.radius, 24)}px;padding:12px 20px;font-size:32px;line-height:1.35;margin-bottom:24px;max-width:100%;">${escapeHtml(s.kicker)}</div>` : "";
  const text = s.overlay_text || "";
  const parts = label + overlayAnchor(text, `font-family:${fontTitle};font-size:${heroSize(text)}px;line-height:1.1;letter-spacing:-1px;color:#FFFFFF;max-width:900px;`, "h1") + (s.detail ? detailHtml(s.detail, 28) : "");
  return gradientScrim(s.overlay_position, Math.max(scrimPeak(lum), 0.72), wordCount(text) <= 12 ? 58 : 72, veilRgb(ch)) +
    contentWrap(s.overlay_position || "bottom_left", "center", parts);
}

/** One editable source, several native export frames, full-bleed photograph. */
function editorialOverlay(s: PhotoSlideSpec, ch: PhotoCharter, finale = false): string {
  const d = design(ch), text = s.overlay_text || "";
  const fontBody = cssFont(ch.font_body, "sans-serif"), fontTitle = cssFont(ch.font_title, "Georgia, serif");
  const style = s.photo_style || null;
  const count = wordCount(text);
  const narrow = style === "colonne";
  const size = narrow ? (count > 40 ? 36 : 38) : count > 90 ? 40 : count > 45 ? 42 : 44;
  const emphasis = narrow ? (count > 40 ? 46 : 52) : count > 75 ? 50 : count > 45 ? 56 : finale ? 72 : 64;
  // Un habillage attribué remplace la surface choisie par la direction artistique.
  const paper = !style && s.art_direction?.surface === "paper";
  const glass = style === "verre";
  // Use a dark brand hue where available; the neutral scrim preserves photo
  // colours when the primary is pale. Never identify a subject from luminance.
  const tint = brandVeilHex(ch) || "#161616";
  const r = parseInt(tint.slice(1, 3), 16), g = parseInt(tint.slice(3, 5), 16), b = parseInt(tint.slice(5, 7), 16);
  const glassInk = hexLuminance(d.ink.slice(1)) < .2 ? d.ink : "#1A1A1A";
  const ink = paper ? d.ink : glass ? glassInk : "#FFFFFF";
  const heading = paper ? d.heading : glass ? tint : "#FFFFFF";
  const shadow = paper || glass || style === "carte" || narrow ? "none" : "0 2px 8px rgba(0,0,0,.55)";
  const align = narrow ? "left" : ch.text_alignment || s.art_direction?.alignment || (s.overlay_position === "center" ? "center" : "left");
  const gradient = `linear-gradient(180deg,rgba(${r},${g},${b},0) 0%,rgba(${r},${g},${b},.74) 8%,rgba(${r},${g},${b},.74) 92%,rgba(${r},${g},${b},0) 100%)`;
  const copy = `<div data-photo-editorial-text="${finale ? "finale" : "profonde"}" data-photo-emphasis="${escapeHtml(s.art_direction?.emphasis || "")}" data-slide-text="overlay" style="position:relative;--photo-veil:${gradient};--photo-title-font:${fontTitle};--photo-emphasis-size:${(emphasis / size).toFixed(3)}em;--photo-heading:${heading};font-family:${fontBody};font-size:${size}px;line-height:1.28;font-weight:400;white-space:pre-wrap;text-align:${align};color:${ink};text-shadow:${shadow};">${photoEditorialMarkup(text, finale, s.art_direction?.emphasis)}</div>`;
  const ctaBg = paper || glass ? (glass ? tint : d.primary) : d.background;
  const ctaInk = paper ? d.onPrimary : glass ? "#FFFFFF" : d.ink;
  const parts = (s.kicker ? kickerHtml(s.kicker, heading) : "") + copy +
    (s.detail ? detailHtml(s.detail, 22, ink) : "") + (s.attribution ? detailHtml(s.attribution, 18, ink) : "") +
    (s.cta_label ? `<div data-slide-cta="1" style="position:relative;margin-top:28px;"><span data-slide-text="cta" data-pptx-editable="caption" style="display:inline-block;background:${ctaBg};color:${ctaInk};border-radius:${Math.min(d.radius, 24)}px;padding:14px 24px;font-size:34px;line-height:1.3;text-shadow:none;max-width:100%;overflow-wrap:anywhere;">${escapeHtml(s.cta_label)}</span></div>` : "");
  const position = s.overlay_position || "bottom_left";
  const isTop = /^top/.test(position);
  // Coins : ceux de la charte quand elle en donne, sinon arrondis (maquette).
  const radius = ch.border_radius == null || String(ch.border_radius).trim() === "" ? 28 : d.radius;

  if (style === "carte") {
    // Carte de marque : rectangle plein dans la teinte foncée de la marque.
    const card = `<div data-photo-reading-panel="1" data-photo-editorial-surface="1" data-photo-style="carte" data-pptx-shape="card" style="position:relative;box-sizing:border-box;width:100%;max-width:952px;background:rgba(${r},${g},${b},.93);padding:48px 52px;color:${ink};border-radius:${radius}px;box-shadow:0 16px 48px rgba(0,0,0,.28);">${parts}</div>`;
    return contentWrap(position, "flex-start", card);
  }
  if (glass) {
    // Verre dépoli : copie floutée de la photo DANS la carte (pas de
    // backdrop-filter, que l'export canvas ne sait pas reproduire). La copie est
    // calée sur la photo de fond par les décalages de la carte : quand l'éditeur
    // déplace le texte (positionPhotoText), il met à jour les deux.
    const n = Math.max(1, Math.round(s.photo_index || 1));
    const y = isTop ? "top:110px" : "bottom:200px";
    const blurY = isTop ? "top:-110px" : "bottom:-200px";
    const card = `<div data-photo-glass="1" data-photo-reading-panel="1" data-photo-editorial-surface="1" data-photo-style="verre" style="position:absolute;left:64px;right:64px;${y};box-sizing:border-box;overflow:hidden;border-radius:${radius}px;background:rgba(255,255,255,.64);border:1px solid rgba(255,255,255,.78);padding:48px 52px;color:${ink};pointer-events:auto;">` +
      `<div data-photo-glass-blur="1" aria-hidden="true" style="position:absolute;left:-64px;${blurY};width:${W}px;height:${H}px;background-image:url({{PHOTO_${n}}});background-size:cover;background-position:center;filter:blur(28px);transform:scale(1.08);"></div>` +
      `<div style="position:relative;background:rgba(255,255,255,.46);margin:-48px -52px;padding:48px 52px;">${parts}</div></div>`;
    return `<div data-photo-text-layout="${escapeHtml(position)}" style="position:absolute;top:0;left:0;width:${W}px;height:${H}px;">${card}</div>`;
  }
  if (narrow) {
    // Colonne éditoriale : colonne pleine à gauche, photo décalée à droite
    // (composePhotoSlide), texte centré verticalement. Pas de réglage haut/bas.
    return `<div data-photo-style="colonne" data-pptx-shape="card" style="position:absolute;left:0;top:0;width:${COLUMN_W}px;height:${H}px;background:${tint};"></div>` +
      `<div data-photo-column-text="1" style="position:absolute;left:56px;top:0;width:${COLUMN_W - 112}px;height:${H}px;display:flex;flex-direction:column;justify-content:center;color:${ink};">${parts}</div>`;
  }
  // A pseudo-element follows drag/width edits without becoming an editable
  // object, source text, native text frame or false text-overflow rectangle.
  // Voile ancré au BORD de la photo (maquette validée le 02/10/2026) : opaque
  // côté bord, il s'efface vers le centre. L'ancienne bande flottante (opaque
  // au-dessus ET au-dessous du texte) reste seulement pour un texte centré. Les
  // règles suivent data-photo-text-layout : quand l'éditeur déplace le texte,
  // le voile change de bord tout seul. Arrêts en pourcentage (export canvas).
  const edge = (dir: string) => `linear-gradient(${dir},rgba(${r},${g},${b},0) 0%,rgba(${r},${g},${b},.82) 18%,rgba(${r},${g},${b},.92) 100%)`;
  const veil = paper ? "" : `<style data-photo-editorial-veil="1">[data-photo-editorial-text]::before{content:"";position:absolute;pointer-events:none;left:-84px;right:-84px;top:-70px;bottom:-60px;background:var(--photo-veil);}[data-photo-text-layout^="bottom"] [data-photo-editorial-text]::before{top:-200px;bottom:-480px;background:${edge("180deg")};}[data-photo-text-layout^="top"] [data-photo-editorial-text]::before{top:-320px;bottom:-200px;background:${edge("0deg")};}</style>`;
  const panel = `<div data-photo-reading-panel="1" data-photo-editorial-surface="1" ${style ? `data-photo-style="${style}"` : ""} ${paper ? 'data-pptx-shape="card"' : ""} style="position:relative;box-sizing:border-box;width:100%;max-width:${paper ? 780 : 912}px;${paper ? `background:${d.background};padding:36px;color:${ink};border-radius:${d.radius}px;` : ""}">${parts}</div>`;
  return veil + contentWrap(position, "flex-start", panel);
}

function tplProfonde(s: PhotoSlideSpec, ch: PhotoCharter, lum?: number): string {
  const fontBody = cssFont(ch.font_body, "sans-serif"), d = design(ch);
  const text = s.overlay_text || "";
  if (wordCount(text) > 12) return editorialOverlay(s, ch);
  const usePanel = wordCount([s.kicker, text, s.detail].filter(Boolean).join(" ")) > 28;
  const color = usePanel ? d.ink : "#FFFFFF";
  const parts = (s.kicker ? kickerHtml(s.kicker, usePanel ? d.heading : color) : "") +
    overlayAnchor(text, `font-family:${fontBody};font-size:${fitSize(40, text, 35)}px;line-height:1.45;color:${color};max-width:880px;`) +
    (s.detail ? detailHtml(s.detail, 24, color) : "");
  return (usePanel ? "" : gradientScrim(s.overlay_position, scrimPeak(lum), 54, veilRgb(ch))) +
    contentWrap(s.overlay_position || "bottom_left", "center", usePanel ? readingPanel(parts, ch) : parts);
}

function tplEtiquette(s: PhotoSlideSpec, ch: PhotoCharter, lum?: number): string {
  const d = design(ch);
  const label = overlayAnchor(s.overlay_text || "", `display:inline-block;font-family:${cssFont(ch.font_title, "Georgia, serif")};background:${d.primary};color:${d.onPrimary};border-radius:${d.radius}px;padding:20px 32px;font-size:56px;line-height:1.15;max-width:880px;`, "div");
  // Source casing stays intact; brand geometry replaces the universal uppercase pill.
  const detail = s.detail ? detailHtml(s.detail, 26) : "";
  return (detail ? gradientScrim(s.overlay_position || "bottom_left", scrimPeak(lum), 66, veilRgb(ch)) : "") +
    contentWrap(s.overlay_position || "bottom_left", "center", label + detail);
}

function tplChiffre(s: PhotoSlideSpec, ch: PhotoCharter): string {
  const d = design(ch), num = s.big_number || "";
  const size = num.length > 10 ? 88 : num.length > 6 ? 112 : 144;
  const number = `<div data-pptx-editable="title" style="font-family:${cssFont(ch.font_title, "Georgia, serif")};font-size:${size}px;font-weight:400;line-height:1.05;color:${d.heading};overflow-wrap:anywhere;">${escapeHtml(num)}</div>`;
  const body = s.overlay_text ? overlayAnchor(s.overlay_text, `font-size:${fitSize(40, s.overlay_text, 28)}px;line-height:1.45;color:${d.ink};margin-top:24px;`) : "";
  const parts = (s.kicker ? kickerHtml(s.kicker, d.heading) : "") + number + body + (s.detail ? detailHtml(s.detail, 24, d.ink) : "");
  return contentWrap(s.overlay_position || "bottom_left", "center", readingPanel(parts, ch));
}

function tplListe(s: PhotoSlideSpec, ch: PhotoCharter): string {
  const fontTitle = cssFont(ch.font_title, "Georgia, serif"), d = design(ch);
  const heading = s.overlay_text ? overlayAnchor(s.overlay_text, `font-family:${fontTitle};font-size:${fitSize(48, s.overlay_text, 14)}px;line-height:1.2;color:${d.heading};margin-bottom:28px;`, "h2") : "";
  const points = (s.points || []).map((p, i) => `<div style="display:flex;align-items:baseline;gap:22px;"><span data-pptx-editable="caption" style="font-family:${fontTitle};font-size:36px;color:${d.accent};min-width:38px;">${i + 1}</span><div data-pptx-editable="body" style="font-size:38px;line-height:1.4;color:${d.ink};flex:1;overflow-wrap:anywhere;">${escapeHtml(p)}</div></div>`).join("");
  const parts = (s.kicker ? kickerHtml(s.kicker, d.heading) : "") + heading + `<div style="display:flex;flex-direction:column;gap:18px;">${points}</div>` + (s.detail ? detailHtml(s.detail, 24, d.ink) : "");
  return contentWrap(s.overlay_position || "bottom_left", "center", readingPanel(parts, ch));
}

function tplEtape(s: PhotoSlideSpec, ch: PhotoCharter): string {
  const d = design(ch), fontTitle = cssFont(ch.font_title, "Georgia, serif");
  const n = Math.max(1, Math.round(s.step_number || 1));
  const number = `<div data-pptx-editable="caption" style="font-family:${fontTitle};font-size:88px;line-height:1.05;color:${d.heading};flex-shrink:0;">${String(n).padStart(2, "0")}</div>`;
  const title = s.kicker ? `<div data-pptx-editable="title" style="font-family:${fontTitle};font-size:48px;font-weight:400;line-height:1.15;color:${d.heading};">${escapeHtml(s.kicker)}</div>` : "";
  const body = s.overlay_text ? overlayAnchor(s.overlay_text, `font-size:${fitSize(40, s.overlay_text, 35)}px;line-height:1.45;color:${d.ink};`) : "";
  return contentWrap(s.overlay_position || "bottom_left", "center", readingPanel(`<div style="display:flex;align-items:baseline;gap:24px;margin-bottom:22px;">${number}${title}</div>` + body + (s.detail ? detailHtml(s.detail, 24, d.ink) : ""), ch));
}

function tplCitation(s: PhotoSlideSpec, ch: PhotoCharter): string {
  const d = design(ch);
  const quote = overlayAnchor(s.overlay_text || "", `font-family:${cssFont(ch.font_title, "Georgia, serif")};font-size:${fitSize(48, s.overlay_text || "", 25)}px;line-height:1.3;color:${d.ink};`, "blockquote");
  const who = s.attribution ? `<div data-pptx-editable="caption" style="font-size:32px;line-height:1.4;color:${d.heading};margin-top:28px;">${escapeHtml(s.attribution)}</div>` : "";
  const parts = (s.kicker ? kickerHtml(s.kicker, d.heading) : "") + quote + who + (s.detail ? detailHtml(s.detail, 24, d.ink) : "");
  return contentWrap(s.overlay_position || "bottom_left", "center", readingPanel(parts, ch));
}

function tplFinale(s: PhotoSlideSpec, ch: PhotoCharter, lum?: number): string {
  const d = design(ch), text = s.overlay_text || "";
  if (wordCount(text) > 12) return editorialOverlay(s, ch, true);
  const usePanel = wordCount([s.kicker, text, s.detail, s.cta_label].filter(Boolean).join(" ")) > 28;
  const q = overlayAnchor(text, `font-family:${cssFont(ch.font_title, "Georgia, serif")};font-size:${fitSize(56, text, 20)}px;line-height:1.2;color:${usePanel ? d.ink : "#FFFFFF"};max-width:880px;`, "h2");
  const cta = s.cta_label ? `<div data-slide-cta="1" style="margin-top:30px;"><span data-slide-text="cta" data-pptx-editable="caption" style="display:inline-block;background:${d.primary};color:${d.onPrimary};border-radius:${Math.min(d.radius, 24)}px;padding:16px 24px;font-size:32px;line-height:1.35;max-width:100%;overflow-wrap:anywhere;">${escapeHtml(s.cta_label)}</span></div>` : "";
  const parts = (s.kicker ? kickerHtml(s.kicker, usePanel ? d.heading : "#FFFFFF") : "") + q + (s.detail ? detailHtml(s.detail, 24, usePanel ? d.ink : "#FFFFFF") : "") + cta;
  return (usePanel ? "" : gradientScrim(s.overlay_position, Math.max(scrimPeak(lum), .72), 66, veilRgb(ch))) +
    contentWrap(s.overlay_position || "bottom_left", "center", usePanel ? readingPanel(parts, ch) : parts);
}

// ── Résolution du gabarit ───────────────────────────────────────────────────

const KNOWN: PhotoTemplate[] = [
  "couverture",
  "profonde",
  "etiquette",
  "chiffre",
  "liste",
  "etape",
  "citation",
  "finale",
];

/**
 * Choix DÉTERMINISTE du gabarit : le champ `template` de la structure prime
 * s'il est cohérent avec les champs fournis ; sinon on dérive du contenu.
 * Jamais d'échec : au pire, `profonde` (surface de lecture adaptée à la longueur).
 */
export function resolvePhotoTemplate(
  s: PhotoSlideSpec,
  opts: { isFirst: boolean; isLast: boolean },
): PhotoTemplate {
  const t = (s.template || "").trim() as PhotoTemplate;
  const hasText = !!(s.overlay_text || "").trim();
  if (KNOWN.includes(t)) {
    // Cohérence gabarit/champs : un gabarit qui exige un champ absent est dégradé
    // vers un gabarit dont le champ PORTEUR existe (sinon la dégradation rendait
    // un overlay VIDE : ex. chiffre sans big_number → etiquette sans texte).
    if (t === "chiffre" && !(s.big_number || "").trim()) {
      if ((s.points || []).length >= 2) return "liste";
      if (!hasText) return "etiquette"; // slide sans AUCUN contenu filtrée en amont (photo nue)
      return wordCount(s.overlay_text || "") <= 4 ? "etiquette" : "profonde";
    }
    if (t === "liste" && !(s.points || []).length) {
      if (!hasText && (s.big_number || "").trim()) return "chiffre";
      return "profonde";
    }
    if (t === "citation" && !hasText) {
      if ((s.big_number || "").trim()) return "chiffre";
      if ((s.points || []).length >= 2) return "liste";
      return "profonde";
    }
    // Pastille uppercase à fort letter-spacing : au-delà de ~6 mots elle déborde
    // du cadre (aucun font-size-guard sur le chemin composé).
    if (t === "etiquette" && wordCount(s.overlay_text || "") > 6) return "profonde";
    if (t === "couverture" && !opts.isFirst) return "profonde";
    if (t === "finale" && !opts.isLast) return "profonde";
    return t;
  }
  if (opts.isFirst && hasText) return "couverture";
  if ((s.big_number || "").trim()) return "chiffre";
  if ((s.points || []).length >= 2) return "liste";
  if (typeof s.step_number === "number" && s.step_number > 0) return "etape";
  if ((s.attribution || "").trim() && hasText) return "citation";
  if (opts.isLast && hasText && (/\?\s*$/.test(s.overlay_text || "") || (s.cta_label || "").trim() || /cta|invitation/i.test(s.role || ""))) {
    return "finale";
  }
  if (hasText && wordCount(s.overlay_text || "") <= 4) return "etiquette";
  return "profonde";
}

/**
 * Alternance des habillages éditoriaux (maquette validée le 02/10/2026) :
 * voile du bord, carte de marque, verre dépoli, colonne éditoriale. Seuls les
 * passages rendus en éditorial reçoivent un style ; la couverture garde son
 * dégradé (style « bord »). Jamais deux fois le même style d'affilée ; au plus
 * une colonne par carrousel, sur le passage le plus développé qui y tient
 * (20 à 60 mots), et seulement à partir de trois passages. Un style déjà
 * présent sur une slide (choix explicite) est conservé.
 */
export function assignPhotoStyles(slides: PhotoSlideSpec[]): PhotoSlideSpec[] {
  const nums = slides.map((s, i) => Number(s.slide_number) || i + 1);
  const first = Math.min(...nums), last = Math.max(...nums);
  const editorialTreatments = ["editorial", "quote", "statement", "closing"];
  const eligible = slides.map((s, i) => {
    const text = String(s.overlay_text || "");
    if (!text.trim()) return false;
    const opts = { isFirst: nums[i] === first, isLast: nums[i] === last };
    if (s.art_direction) return editorialTreatments.includes(s.art_direction.treatment);
    const t = resolvePhotoTemplate(s, opts);
    return (t === "profonde" || t === "finale") && wordCount(text) > 12;
  });
  const candidates = slides.map((s, i) => ({ i, words: wordCount(String(s.overlay_text || "")) }))
    .filter(({ i, words }) => eligible[i] && !slides[i].photo_style && words >= 20 && words <= 60);
  const columnAt = eligible.filter(Boolean).length >= 3 && candidates.length
    ? candidates.sort((a, b) => b.words - a.words)[0].i : -1;
  const cycle: PhotoStyle[] = ["carte", "bord", "verre"];
  let k = 0, previous: PhotoStyle | null = null;
  return slides.map((s, i) => {
    if (!eligible[i]) { previous = nums[i] === first ? "bord" : null; return s; }
    let style: PhotoStyle = s.photo_style || (i === columnAt ? "colonne" : cycle[k % 3]);
    if (!s.photo_style && i !== columnAt) {
      if (style === previous) { k++; style = cycle[k % 3]; }
      k++;
    }
    previous = style;
    return { ...s, photo_style: style };
  });
}

export interface ComposedSlide {
  slide_number: number;
  html: string;
  contrast_ok: true;
  legibility: string;
  template: PhotoTemplate | "photo_nue";
}

/**
 * Compose la slide entière. `luminance` = mesure client (0..1 par bande) de la
 * photo de CETTE slide ; absente → pire cas (photo claire, voile fort).
 */
export function composePhotoSlide(
  s: PhotoSlideSpec,
  charter: PhotoCharter,
  opts: { isFirst: boolean; isLast: boolean; luminance?: PhotoZoneLuminance; zoomOnRepeat?: boolean },
): ComposedSlide {
  const fontBody = cssFont(charter.font_body, "sans-serif");
  const hasText = !!(s.overlay_text || "").trim();
  const hasAnyContent = hasText || (s.points || []).length > 0 || (s.big_number || "").trim();

  if (!hasAnyContent) {
    // Photo nue (photo dump, respiration) : aucun voile, aucune ancre — légitime.
    return {
      slide_number: s.slide_number,
      html: root(fontBody, photoLayer(s.photo_index, opts.zoomOnRepeat)),
      contrast_ok: true,
      legibility: "photo nue, aucun texte",
      template: "photo_nue",
    };
  }

  const template = resolvePhotoTemplate(s, opts);
  const lum = (opts.luminance || {})[zoneFor(s.overlay_position)];

  const bodyByTemplate: Record<PhotoTemplate, (x: PhotoSlideSpec, c: PhotoCharter, l?: number) => string> = {
    couverture: tplCouverture,
    profonde: tplProfonde,
    etiquette: tplEtiquette,
    chiffre: tplChiffre,
    liste: tplListe,
    etape: tplEtape,
    citation: tplCitation,
    finale: tplFinale,
  };
  const art = s.art_direction;
  const editorial = !!art && ["editorial", "quote", "statement", "closing"].includes(art.treatment);
  const inner = editorial
    ? editorialOverlay(s, charter, art!.treatment === "closing")
    : bodyByTemplate[template](s, charter, lum);
  // La colonne n'est attribuée qu'aux passages éditoriaux (assignPhotoStyles) ;
  // si le passage n'est finalement pas éditorial, la photo reste plein cadre.
  const column = s.photo_style === "colonne" && inner.includes('data-photo-style="colonne"');
  const measured = typeof lum === "number" ? `luminance mesurée ${lum.toFixed(2)}` : "luminance non mesurée (pire cas)";
  return {
    slide_number: s.slide_number,
    html: root(fontBody, (column ? photoLayerRight(s.photo_index) : photoLayer(s.photo_index, opts.zoomOnRepeat)) + inner),
    contrast_ok: true,
    legibility: `photo-editorial-v3-art-direction${s.photo_style ? ` · habillage ${s.photo_style}` : ""} · gabarit ${template}, palette de marque et surface de lecture (${measured})`,
    template,
  };
}
