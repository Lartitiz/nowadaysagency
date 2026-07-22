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
//   couverture  — affiche éditoriale : kicker + hook serif géant + détail
//   profonde    — texte long lisible sur dégradé bas, photo visible aux 2/3
//   etiquette   — pastille fine centrée (AVANT/APRÈS, connecteur) + sous-ligne
//   chiffre     — chiffre géant + ligne de contexte
//   liste       — 2-3 points numérotés en couleur d'accent
//   etape       — numéro fantôme + titre + corps (processus slide à slide)
//   citation    — verbatim italique + attribution
//   finale      — question ouverte + invitation en pastille (data-slide-cta)
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
  role?: string | null; // rôle narratif issu de la structure (hook, cta…)
}

export interface PhotoCharter {
  color_accent: string;
  font_title: string;
  font_body: string;
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
  const clean = (name || "").replace(/['"]/g, "").trim();
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

function dimOpacity(lum: number | undefined): number {
  if (typeof lum !== "number" || Number.isNaN(lum)) return 0.36;
  if (lum >= 0.6) return 0.44;
  if (lum >= 0.35) return 0.34;
  return 0.24;
}

function zoneFor(position: string | null | undefined): keyof PhotoZoneLuminance {
  const p = String(position || "");
  if (/^top/.test(p)) return "top";
  if (p === "center") return "center";
  return "bottom";
}

/** Dégradé ancré au bord porteur du texte (bas par défaut). */
function gradientScrim(position: string | null | undefined, peak: number, heightPct = 54): string {
  const isTop = /^top/.test(String(position || ""));
  const dir = isTop ? "180deg" : "0deg";
  return `<div data-injected-scrim="1" style="position:absolute;left:0;${isTop ? "top" : "bottom"}:0;width:${W}px;height:${heightPct}%;background:linear-gradient(${dir},rgba(0,0,0,${peak}) 0%,rgba(0,0,0,0) 100%);"></div>`;
}

/** Voile uniforme (gabarits centrés). */
function fullDim(opacity: number): string {
  return `<div data-injected-scrim="1" style="position:absolute;top:0;left:0;width:${W}px;height:${H}px;background:rgba(0,0,0,${opacity});"></div>`;
}

function photoLayer(photoIndex: number, zoom = false): string {
  const n = Math.max(1, Math.round(photoIndex || 1));
  // Zoom narratif : quand la MÊME photo porte deux slides consécutives, la
  // seconde passe en plan serré (150 %) — jamais deux slides identiques d'affilée.
  const sizing = zoom
    ? `background-size:150%;background-position:center 38%;`
    : `background-size:cover;background-position:center;`;
  return `<div data-pptx-photo="${n}" style="position:absolute;top:0;left:0;width:${W}px;height:${H}px;background-image:url({{PHOTO_${n}}});${sizing}"></div>`;
}

function root(fontBody: string, inner: string): string {
  return `<div style="width:${W}px;height:${H}px;position:relative;overflow:hidden;background:#1a1815;font-family:${fontBody};">${inner}</div>`;
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
  return `<div style="position:absolute;top:0;left:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;justify-content:${justify};align-items:${alignItems};text-align:${textAlign};padding:${TOP_SAFE}px 84px ${BOTTOM_SAFE}px 84px;box-sizing:border-box;">${inner}</div>`;
}

function kickerHtml(text: string): string {
  return `<div style="font-size:26px;letter-spacing:6px;text-transform:uppercase;color:rgba(255,255,255,0.85);margin-bottom:18px;">${escapeHtml(text)}</div>`;
}

function detailHtml(text: string, marginTop = 22): string {
  return `<div style="font-size:29px;line-height:1.5;color:rgba(255,255,255,0.85);margin-top:${marginTop}px;max-width:820px;">${escapeHtml(text)}</div>`;
}

function overlayAnchor(text: string, style: string, tag = "p"): string {
  return `<${tag} data-slide-text="overlay" data-pptx-editable="overlay" style="margin:0;${style}">${escapeHtml(text)}</${tag}>`;
}

/** Taille du hook de couverture selon sa longueur (règle héros 64-88px). */
function heroSize(text: string): number {
  const wc = wordCount(text);
  if (wc <= 6) return 84;
  if (wc <= 12) return 72;
  if (wc <= 20) return 58;
  return 48; // hook anormalement long : réduit plutôt que clippé par overflow:hidden
}

/** Rétrécit la police quand le texte dépasse la longueur nominale du gabarit.
 * Le chemin composé n'a AUCUN font-size-guard aval (D1/D1-bis gatés
 * !composedByCode) et la racine est en overflow:hidden : sans cette échelle,
 * un texte trop long serait coupé hors cadre par le haut. */
function fitSize(base: number, text: string, nominalWords: number): number {
  const wc = wordCount(text);
  if (wc <= nominalWords) return base;
  if (wc <= Math.round(nominalWords * 1.4)) return Math.round(base * 0.85);
  if (wc <= Math.round(nominalWords * 1.8)) return Math.round(base * 0.72);
  return Math.round(base * 0.62);
}

// ── Gabarits ────────────────────────────────────────────────────────────────

function tplCouverture(s: PhotoSlideSpec, ch: PhotoCharter, lum?: number): string {
  const fontTitle = cssFont(ch.font_title, "Georgia, serif");
  const parts: string[] = [];
  if (s.kicker) parts.push(kickerHtml(s.kicker));
  const text = s.overlay_text || "";
  parts.push(
    overlayAnchor(
      text,
      `font-family:${fontTitle};font-size:${heroSize(text)}px;line-height:1.06;color:#FFFFFF;max-width:900px;`,
      "h1",
    ),
  );
  if (s.detail) parts.push(detailHtml(s.detail));
  // Bloc haut (kicker + hero + detail) : dégradé rallongé pour couvrir le sommet.
  return gradientScrim(s.overlay_position, Math.max(scrimPeak(lum), 0.72), 66) +
    contentWrap(s.overlay_position || "bottom_center", "center", parts.join(""));
}

function tplProfonde(s: PhotoSlideSpec, ch: PhotoCharter, lum?: number): string {
  const fontBody = cssFont(ch.font_body, "sans-serif");
  const text = s.overlay_text || "";
  const inner = overlayAnchor(
    text,
    `font-family:${fontBody};font-size:${fitSize(40, text, 25)}px;line-height:1.45;color:#FFFFFF;max-width:880px;`,
  );
  return gradientScrim(s.overlay_position, scrimPeak(lum)) +
    contentWrap(s.overlay_position || "bottom_center", "center", inner);
}

function tplEtiquette(s: PhotoSlideSpec, ch: PhotoCharter, lum?: number): string {
  const fontTitle = cssFont(ch.font_title, "Georgia, serif");
  const pill = overlayAnchor(
    s.overlay_text || "",
    `display:inline-block;border:2px solid rgba(255,255,255,0.92);border-radius:999px;padding:16px 44px;font-size:32px;letter-spacing:7px;text-transform:uppercase;color:#FFFFFF;`,
    "div",
  );
  const sub = s.detail
    ? `<div style="font-family:${fontTitle};font-style:italic;font-size:34px;color:rgba(255,255,255,0.9);margin-top:26px;">${escapeHtml(s.detail)}</div>`
    : "";
  return fullDim(dimOpacity(lum)) +
    contentWrap(s.overlay_position || "center", "center", pill + sub);
}

function tplChiffre(s: PhotoSlideSpec, ch: PhotoCharter, lum?: number): string {
  const fontTitle = cssFont(ch.font_title, "Georgia, serif");
  const num = `<div style="font-family:${fontTitle};font-size:170px;line-height:1;color:#FFFFFF;">${escapeHtml(s.big_number || "")}</div>`;
  const line = s.overlay_text
    ? overlayAnchor(
      s.overlay_text,
      `font-size:${fitSize(32, s.overlay_text, 15)}px;line-height:1.5;color:rgba(255,255,255,0.9);max-width:760px;margin-top:20px;`,
    )
    : "";
  return fullDim(Math.max(dimOpacity(lum), 0.3)) +
    contentWrap(s.overlay_position || "center", "center", num + line);
}

function tplListe(s: PhotoSlideSpec, ch: PhotoCharter, lum?: number): string {
  const fontTitle = cssFont(ch.font_title, "Georgia, serif");
  const accent = ch.color_accent || "#FFFFFF";
  const parts: string[] = [];
  if (s.kicker) parts.push(kickerHtml(s.kicker));
  if (s.overlay_text) {
    parts.push(overlayAnchor(
      s.overlay_text,
      `font-family:${fontTitle};font-size:${fitSize(44, s.overlay_text, 12)}px;line-height:1.2;color:#FFFFFF;margin-bottom:26px;max-width:880px;`,
      "h2",
    ));
  }
  const points = (s.points || []).slice(0, 3).map((p, i) =>
    `<div style="font-size:34px;line-height:1.7;color:#FFFFFF;"><span style="font-family:${fontTitle};font-style:italic;color:${accent};margin-right:14px;">${i + 1}</span>${escapeHtml(p)}</div>`
  ).join("");
  parts.push(`<div style="display:flex;flex-direction:column;gap:10px;">${points}</div>`);
  // Bloc haut (kicker + titre + points) : dégradé rallongé pour couvrir le sommet.
  return gradientScrim(s.overlay_position, Math.max(scrimPeak(lum), 0.72), 66) +
    contentWrap(s.overlay_position || "bottom_left", "center", parts.join(""));
}

function tplEtape(s: PhotoSlideSpec, ch: PhotoCharter, lum?: number): string {
  const fontTitle = cssFont(ch.font_title, "Georgia, serif");
  const n = Math.max(1, Math.round(s.step_number || 1));
  const ghost = `<div style="font-family:${fontTitle};font-style:italic;font-size:96px;line-height:1;color:rgba(255,255,255,0.55);">${String(n).padStart(2, "0")}</div>`;
  const title = s.kicker
    ? `<div style="font-family:${fontTitle};font-size:52px;line-height:1.15;color:#FFFFFF;margin-top:14px;max-width:880px;">${escapeHtml(s.kicker)}</div>`
    : "";
  const body = s.overlay_text
    ? overlayAnchor(
      s.overlay_text,
      `font-size:${fitSize(34, s.overlay_text, 25)}px;line-height:1.55;color:rgba(255,255,255,0.92);max-width:840px;margin-top:18px;`,
    )
    : "";
  return fullDim(dimOpacity(lum)) + gradientScrim(s.overlay_position, 0.5) +
    contentWrap(s.overlay_position || "bottom_left", "center", ghost + title + body);
}

function tplCitation(s: PhotoSlideSpec, ch: PhotoCharter, lum?: number): string {
  const fontTitle = cssFont(ch.font_title, "Georgia, serif");
  const accent = ch.color_accent || "#FFFFFF";
  const mark = `<div style="font-family:${fontTitle};font-size:110px;line-height:0.5;color:${accent};">“</div>`;
  const quote = overlayAnchor(
    s.overlay_text || "",
    `font-family:${fontTitle};font-style:italic;font-size:${fitSize(46, s.overlay_text || "", 25)}px;line-height:1.4;color:#FFFFFF;max-width:840px;margin-top:26px;`,
    "blockquote",
  );
  const who = s.attribution
    ? `<div style="font-size:24px;letter-spacing:4px;text-transform:uppercase;color:rgba(255,255,255,0.85);margin-top:28px;">${escapeHtml(s.attribution)}</div>`
    : "";
  return fullDim(Math.max(dimOpacity(lum), 0.34)) +
    contentWrap(s.overlay_position || "center", "center", mark + quote + who);
}

function tplFinale(s: PhotoSlideSpec, ch: PhotoCharter, lum?: number): string {
  const fontTitle = cssFont(ch.font_title, "Georgia, serif");
  const q = overlayAnchor(
    s.overlay_text || "",
    `font-family:${fontTitle};font-size:${fitSize(52, s.overlay_text || "", 20)}px;line-height:1.25;color:#FFFFFF;max-width:880px;`,
    "h2",
  );
  const cta = s.cta_label
    ? `<div data-slide-cta="1" style="margin-top:30px;"><span data-slide-text="cta" style="display:inline-block;border:2px solid rgba(255,255,255,0.85);border-radius:999px;padding:14px 36px;font-size:28px;color:#FFFFFF;">${escapeHtml(s.cta_label)}</span></div>`
    : "";
  return gradientScrim(s.overlay_position, Math.max(scrimPeak(lum), 0.72)) +
    contentWrap(s.overlay_position || "bottom_center", "center", q + cta);
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
 * Jamais d'échec : au pire, `profonde` (lisible pour tout texte ≤ 25 mots).
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
  const lum = (opts.luminance || {})[zoneFor(
    template === "etiquette" || template === "chiffre" || template === "citation"
      ? (s.overlay_position || "center")
      : s.overlay_position,
  )];

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
  const inner = bodyByTemplate[template](s, charter, lum);
  const measured = typeof lum === "number" ? `luminance mesurée ${lum.toFixed(2)}` : "luminance non mesurée (pire cas)";
  return {
    slide_number: s.slide_number,
    html: root(fontBody, photoLayer(s.photo_index, opts.zoomOnRepeat) + inner),
    contrast_ok: true,
    legibility: `gabarit ${template}, voile dosé (${measured})`,
    template,
  };
}
