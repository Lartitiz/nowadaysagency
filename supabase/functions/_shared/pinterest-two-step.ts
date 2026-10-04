// ÉPINGLES PINTEREST EN DEUX APPELS (04/10/2026, chantier « séparation
// écriture / design »). Utilisé par pinterest-visual et pinterest-photo-brief.
//
// Avant : un seul appel IA écrivait le texte ET le HTML du visuel. L'export PNG
// lit le HTML, l'export PPTX éditable lit pin_data : deux copies du texte qui
// pouvaient diverger (mesuré par `[pinterest:pin-data-mismatch]`).
//
// Maintenant :
//   1. appel « rédaction » : UNIQUEMENT le texte (pin_data / texte d'overlay,
//      titre et description SEO) ;
//   2. appel « mise en forme » : reçoit ce texte FINAL et produit le HTML avec
//      le même système de design qu'avant, sans droit de toucher aux mots ;
//   3. le CODE vérifie le HTML : chaque mot du texte présent, aucun mot ajouté
//      (hors chiffres, emojis, symboles, watermark et tags de structure). Écart
//      → une relance de l'appel 2 avec l'écart signalé ; nouvel écart (ou plus
//      de temps, ou IA en erreur) → rendu simple construit par le code depuis
//      le texte (aux couleurs de la charte, texte complet). Le design cède,
//      jamais le texte : pas d'épingle sans texte ni avec du texte inventé.

import { visibleTextOfHtml } from "./pinterest-pin-guards.ts";
import type { UsageSink } from "./anthropic.ts";

// ── Temps ───────────────────────────────────────────────────────────────────
// Une requête edge Supabase est coupée à 150 s. On garde une marge : passé ce
// budget, le design cède (rendu par le code) au lieu de risquer le 504.
export const PIN_REQUEST_BUDGET_MS = 135_000;
/** Appel 1 (texte seul, ~1 000 tokens de sortie) : plafond par tentative. */
export const PIN_WRITE_TIMEOUT_MS = 60_000;
/** Appel 2 : plafond par tentative (le HTML est la sortie la plus longue). */
export const PIN_DESIGN_MAX_ATTEMPT_MS = 110_000;
/** En dessous de ce temps restant, on ne lance même pas l'appel 2. */
export const PIN_DESIGN_MIN_ATTEMPT_MS = 30_000;
/** Appel 2 : premier essai + une relance au plus. */
export const PIN_DESIGN_MAX_ATTEMPTS = 2;

/** Indication fixe de l'overlay photo (consigne de design, pas du texte rédigé). */
export const PHOTO_OVERLAY_HINT = "📷 Ajoute ta photo dans Canva ou PowerPoint";

/** Tags de structure que le design peut afficher sans qu'ils viennent de l'appel 1. */
const STRUCTURAL_WORDS_BY_PIN_TYPE: Record<string, string[]> = {
  avant_apres: ["AVANT", "APRÈS"],
};

// ── Normalisation ───────────────────────────────────────────────────────────

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss");
}

/** Mots comparables : minuscules, sans accents ; ponctuation, emojis et symboles ignorés. */
export function textTokens(s: string): string[] {
  return norm(s || "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Texte des `content: "…"` d'un <style> : visible à l'écran (pseudo-éléments). */
function cssContentText(html: string): string {
  const out: string[] = [];
  for (const block of (html || "").match(/<style[\s\S]*?<\/style>/gi) || []) {
    for (const m of block.matchAll(/content\s*:\s*(["'])((?:(?!\1).)*)\1/g)) out.push(m[2]);
  }
  return out.join(" ");
}

// ── Textes de l'appel 1 ─────────────────────────────────────────────────────

export interface PinTextField {
  /** Nom du champ (pour la télémétrie et le message de relance). */
  field: string;
  text: string;
}

export interface PinTextSpec {
  /** Textes qui DOIVENT apparaître en entier dans le HTML. */
  required: PinTextField[];
  /** Textes que le HTML PEUT afficher en plus (watermark, tags de structure, indication fixe). */
  optional: string[];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** Textes affichés d'une épingle visuelle, depuis pin_data (source unique PNG + PPTX). */
// deno-lint-ignore no-explicit-any
export function pinDataTextSpec(pinData: any): PinTextSpec {
  const required: PinTextField[] = [];
  const push = (field: string, v: unknown) => {
    const t = str(v);
    if (t) required.push({ field, text: t });
  };
  push("badge_label", pinData?.badge_label);
  push("main_title", pinData?.main_title);
  if (Array.isArray(pinData?.elements)) {
    pinData.elements.forEach((el: Record<string, unknown> | null, i: number) => {
      push(`elements[${i}].label`, el?.label);
      push(`elements[${i}].description`, el?.description);
    });
  }
  push("cta_text", pinData?.cta_text);
  const optional = [
    ...(str(pinData?.watermark) ? [pinData.watermark as string] : []),
    ...(STRUCTURAL_WORDS_BY_PIN_TYPE[pinData?.pin_type] || []),
  ];
  return { required, optional };
}

/** Textes de l'overlay d'une épingle photo. */
// deno-lint-ignore no-explicit-any
export function photoOverlayTextSpec(overlayText: any): PinTextSpec {
  const required: PinTextField[] = [];
  for (const k of ["badge", "title", "subtitle", "cta"]) {
    const t = str(overlayText?.[k]);
    if (t) required.push({ field: `overlay_text.${k}`, text: t });
  }
  return { required, optional: [PHOTO_OVERLAY_HINT] };
}

/**
 * L'emoji d'un élément est un choix de DESIGN (appel 2) : s'il arrive de
 * l'appel 1, on le retire (même patron que stripWriterLayoutFields des
 * carrousels). Ne touche à aucun texte.
 */
// deno-lint-ignore no-explicit-any
export function stripWriterDesignFields(pinData: any): any {
  if (!pinData || typeof pinData !== "object" || !Array.isArray(pinData.elements)) return pinData;
  return {
    ...pinData,
    elements: pinData.elements.map((el: unknown) => {
      if (!el || typeof el !== "object") return el;
      const { emoji: _emoji, ...rest } = el as Record<string, unknown>;
      return rest;
    }),
  };
}

// ── Validation du HTML de l'appel 2 ─────────────────────────────────────────

export interface TextFidelityReport {
  ok: boolean;
  /** Champs absents ou incomplets du HTML (`words` = mots introuvables ; vide = ordre modifié). */
  missing: Array<{ field: string; words: string[] }>;
  /** Mots visibles du HTML qui ne viennent d'aucun texte autorisé. */
  added: string[];
}

/**
 * Compare le texte VISIBLE du HTML aux textes de l'appel 1. Normalisation :
 * casse, accents, espaces, ponctuation, entités HTML, balises (un mot coupé
 * par une balise est recollé). Tolérés en plus du texte : chiffres seuls
 * (numéros d'étapes), lettres isolées, emojis et symboles (ignorés), textes
 * optionnels (watermark, tags AVANT/APRÈS, indication photo).
 */
export function checkHtmlTextFidelity(html: string, spec: PinTextSpec): TextFidelityReport {
  const cssText = cssContentText(html);
  const spaced = textTokens(visibleTextOfHtml(html) + " " + cssText);
  const present = new Set([...spaced, ...textTokens(visibleTextOfHtml(html, ""))]);

  // Un texte doit apparaître EN ENTIER ET DANS L'ORDRE : comparaison sur le
  // texte compacté (sans espaces ni ponctuation, donc insensible aux balises
  // qui coupent un mot). Un mot isolé doit en plus être un mot entier.
  const compactHtml = spaced.join("");
  const missing: TextFidelityReport["missing"] = [];
  for (const { field, text } of spec.required) {
    const toks = textTokens(text);
    if (!toks.length) continue;
    const inOrder = compactHtml.includes(toks.join("")) && (toks.length > 1 || present.has(toks[0]));
    if (inOrder) continue;
    // Mots absents ; liste vide = tous présents mais dans un autre ordre / ailleurs.
    missing.push({ field, words: [...new Set(toks.filter((w) => !present.has(w)))] });
  }

  const vocab = new Set<string>();
  for (const t of [...spec.required.map((f) => f.text), ...spec.optional]) for (const w of textTokens(t)) vocab.add(w);
  const allowed = (w: string) => vocab.has(w) || /^\p{N}+$/u.test(w) || w.length <= 1;
  const added = new Set<string>();
  spaced.forEach((w, i) => {
    if (allowed(w)) return;
    // Mot coupé par une balise : « orga » + « niser » forment un mot autorisé.
    for (let start = Math.max(0, i - 3); start <= i; start++) {
      for (let end = i; end <= Math.min(spaced.length - 1, start + 3); end++) {
        if (end === start) continue;
        if (vocab.has(spaced.slice(start, end + 1).join(""))) return;
      }
    }
    added.add(w);
  });

  return { ok: missing.length === 0 && added.size === 0, missing, added: [...added] };
}

/** Message de relance pour l'appel 2 (contient le texte : jamais journalisé). */
export function describeFidelityGap(report: TextFidelityReport, spec: PinTextSpec): string {
  const lines: string[] = [];
  for (const m of report.missing) {
    const original = spec.required.find((f) => f.field === m.field)?.text ?? "";
    const detail = m.words.length ? `mots absents : ${m.words.join(", ")}` : "texte découpé, réordonné ou modifié";
    lines.push(`- ${m.field} doit apparaître en entier, mot pour mot et dans cet ordre : « ${original} » (${detail})`);
  }
  if (report.added.length) {
    lines.push(`- Mots ajoutés qui ne figurent dans aucun texte fourni (à retirer) : ${report.added.join(", ")}`);
  }
  return `⚠️ CORRECTION OBLIGATOIRE : ta mise en forme précédente a été REJETÉE car elle ne reprenait pas les textes fournis mot pour mot.
${lines.join("\n")}
Recommence la mise en forme : affiche CHAQUE texte fourni en entier, exactement tel quel, et n'ajoute aucun autre mot.`;
}

// ── Emojis choisis par l'appel 2 → pin_data (export PPTX) ───────────────────

const EMOJI_RE = /^[^\p{L}\p{N}<>&"']{1,8}$/u;

/**
 * Reporte dans pin_data les emojis que l'appel 2 a choisis et AFFICHÉS dans le
 * HTML : le PPTX éditable montre alors les mêmes que le PNG. Un emoji invalide
 * (lettres, chiffres) ou absent du HTML est ignoré.
 */
// deno-lint-ignore no-explicit-any
export function applyDesignEmojis(pinData: any, emojis: unknown, html: string): any {
  if (!pinData || !Array.isArray(pinData.elements) || !Array.isArray(emojis)) return pinData;
  return {
    ...pinData,
    elements: pinData.elements.map((el: Record<string, unknown>, i: number) => {
      const e = typeof emojis[i] === "string" ? (emojis[i] as string).trim() : "";
      if (!el || typeof el !== "object" || !e || !EMOJI_RE.test(e) || !html.includes(e)) return el;
      return { ...el, emoji: e };
    }),
  };
}

// ── Coût : un seul débit pour les deux appels ───────────────────────────────

/** Cumule l'usage d'un appel dans le total (callAnthropic écrase son UsageSink). */
export function addUsage(total: UsageSink, part: UsageSink): void {
  total.input_tokens = (total.input_tokens || 0) + (part.input_tokens || 0);
  total.output_tokens = (total.output_tokens || 0) + (part.output_tokens || 0);
  total.total_tokens = (total.total_tokens || 0) + (part.total_tokens || 0);
  if (!total.model && part.model) total.model = part.model;
}

// ── Rendu de repli construit par le code ────────────────────────────────────

export interface PinCharter {
  color_primary: string;
  color_secondary: string;
  color_background: string;
  color_text: string;
  font_title: string;
  font_body: string;
  border_radius: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cssFont(f: string): string {
  return `'${f.replace(/['"\\;<>]/g, "")}'`;
}

function cssColor(c: string, fallback: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(c.trim()) ? c.trim() : fallback;
}

function cssLength(r: string): string {
  return /^\d{1,3}(px|rem|em|%)$/.test(r.trim()) ? r.trim() : "12px";
}

/** Lignes estimées d'un texte dans une largeur donnée (police jusqu'à monospace : 0,6 em/caractère). */
function lines(text: string, sizePx: number, widthPx: number): number {
  const perLine = Math.max(1, Math.floor(widthPx / (sizePx * 0.6)));
  return Math.max(1, Math.ceil([...text].length / perLine));
}

interface FallbackItem { label: string; description?: string; marker?: string; emoji?: string; side?: unknown }

/**
 * Échelle de police : la plus grande qui fait tenir tout le texte dans
 * 1000×1500 (rien de coupé par l'overflow), plancher 20px pour le corps.
 */
function pickScale(blocks: Array<{ text: string; base: number; width: number; pad: number }>): number {
  for (let s = 1; s >= 0.45; s -= 0.05) {
    let h = 0;
    for (const b of blocks) {
      const size = Math.max(20, Math.round(b.base * s));
      h += (b.text ? lines(b.text, size, b.width) * size * 1.45 : size) + b.pad * s;
    }
    if (h <= 1280) return s;
  }
  return 0.45;
}

// deno-lint-ignore no-explicit-any
function itemsOf(pinData: any): FallbackItem[] {
  const els = Array.isArray(pinData?.elements) ? pinData.elements : [];
  return els
    .filter((el: any) => el && typeof el === "object" && str(el.label))
    .map((el: any, i: number) => ({
      label: el.label as string,
      description: str(el.description) ?? undefined,
      marker: typeof el.number === "number" ? String(el.number) : String(i + 1),
      emoji: typeof el.emoji === "string" ? el.emoji : undefined,
      side: el.side,
    }));
}

/**
 * Épingle simple et lisible, aux couleurs de la charte, avec TOUT le texte de
 * pin_data (et rien d'autre que des numéros / symboles). Utilisée quand la
 * mise en forme IA ne reprend pas le texte fidèlement ou n'est pas arrivée.
 */
// deno-lint-ignore no-explicit-any
export function buildFallbackPinHtml(pinData: any, ch: PinCharter): string {
  const primary = cssColor(ch.color_primary, "#FB3D80");
  const secondary = cssColor(ch.color_secondary, "#91014b");
  const bg = cssColor(ch.color_background, "#FFF4F8");
  const text = cssColor(ch.color_text, "#1A1A2E");
  const radius = cssLength(ch.border_radius);
  const fTitle = cssFont(ch.font_title);
  const fBody = cssFont(ch.font_body);
  const pinType = String(pinData?.pin_type || "");
  const items = itemsOf(pinData);
  const badge = str(pinData?.badge_label);
  const title = str(pinData?.main_title) || "";
  const cta = str(pinData?.cta_text);
  const watermark = str(pinData?.watermark);

  const blocks = [
    ...(badge ? [{ text: badge, base: 22, width: 900, pad: 40 }] : []),
    { text: title, base: 60, width: 900, pad: 40 },
    // pad = marges internes de la carte + espace entre les blocs (estimation prudente).
    ...items.flatMap((it) => [
      { text: it.label, base: 32, width: 760, pad: 76 },
      ...(it.description ? [{ text: it.description, base: 28, width: 760, pad: 8 }] : []),
    ]),
    // Avant/après : deux zones (padding, tag pilule) + flèche ; schéma : flèche.
    ...(pinType === "avant_apres" ? [{ text: "AVANT", base: 22, width: 900, pad: 140 }, { text: "APRÈS", base: 22, width: 900, pad: 140 }, { text: "", base: 40, width: 900, pad: 20 }] : []),
    ...(pinType === "schema_visuel" ? [{ text: "", base: 40, width: 900, pad: 20 }] : []),
    ...(cta ? [{ text: cta, base: 26, width: 900, pad: 24 }] : []),
    ...(watermark ? [{ text: watermark, base: 20, width: 900, pad: 16 }] : []),
  ];
  const s = pickScale(blocks);
  const px = (base: number, min = 20) => `${Math.max(min, Math.round(base * s))}px`;
  const gap = `${Math.round(18 * s)}px`;

  const pill = (label: string, color = primary) =>
    `<div style="display:inline-block;align-self:center;background:${color};color:#FFFFFF;font-family:${fBody};font-weight:600;font-size:${px(22)};text-transform:uppercase;letter-spacing:2px;padding:8px 24px;border-radius:100px">${esc(label)}</div>`;
  const marker = (it: FallbackItem) =>
    pinType === "checklist"
      ? `<div style="flex:0 0 auto;width:${px(40)};height:${px(40)};background:${primary};border-radius:8px;color:#FFFFFF;font-size:${px(26)};display:flex;align-items:center;justify-content:center">✓</div>`
      : `<div style="flex:0 0 auto;min-width:${px(48)};height:${px(48)};background:${primary};border-radius:${radius};color:#FFFFFF;font-family:${fBody};font-weight:600;font-size:${px(26)};display:flex;align-items:center;justify-content:center">${esc(it.marker || "")}</div>`;
  const card = (it: FallbackItem, opts: { bg?: string; color?: string; showMarker?: boolean } = {}) =>
    `<div style="display:flex;gap:20px;align-items:flex-start;background:${opts.bg || "#FFFFFF"};border-radius:${radius};box-shadow:0 4px 24px rgba(0,0,0,0.06);padding:${Math.round(26 * s)}px 30px;width:100%;box-sizing:border-box">` +
    (opts.showMarker === false ? "" : marker(it)) +
    `<div style="flex:1;min-width:0">` +
    `<div style="font-family:${fTitle};font-weight:400;font-size:${px(32)};line-height:1.35;color:${opts.color || text}">${it.emoji ? `${esc(it.emoji)} ` : ""}${esc(it.label)}</div>` +
    (it.description ? `<div style="font-family:${fBody};font-size:${px(28)};line-height:1.5;color:${opts.color || text};margin-top:6px">${esc(it.description)}</div>` : "") +
    `</div></div>`;

  let body: string;
  if (pinType === "avant_apres") {
    // deno-lint-ignore no-explicit-any
    const all = itemsOf(pinData) as any[];
    const half = Math.ceil(all.length / 2);
    const isBefore = (it: any, i: number) =>
      it.side === "before" || (it.side !== "after" && (it.emoji?.includes("❌") || (!it.emoji?.includes("✅") && i < half)));
    const before = all.filter((it, i) => isBefore(it, i));
    const after = all.filter((it, i) => !isBefore(it, i));
    const zone = (tag: string, list: FallbackItem[], zoneBg: string, emoji: string) =>
      `<div style="background:${zoneBg};border-radius:${radius};padding:${Math.round(24 * s)}px;width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:${gap}">` +
      pill(tag, tag === "AVANT" ? "#6B6B6B" : primary) +
      list.map((it) => card({ ...it, emoji: it.emoji || emoji }, { showMarker: false })).join("") +
      `</div>`;
    body = zone("AVANT", before, "#F0F0F0", "❌") +
      `<div aria-hidden="true" style="color:${primary};font-size:${px(40)};line-height:1">↓</div>` +
      zone("APRÈS", after, bg, "✅");
  } else if (pinType === "schema_visuel" && items.length) {
    // deno-lint-ignore no-explicit-any
    const all = items as any[];
    const ci = Math.max(0, (Array.isArray(pinData?.elements) ? pinData.elements : []).findIndex((e: any) => e?.number === 0));
    const center = all[Math.min(ci, all.length - 1)];
    const others = all.filter((x) => x !== center);
    body = `<div style="border:3px solid ${primary};border-radius:${radius};width:100%;box-sizing:border-box">${card(center, { showMarker: false })}</div>` +
      `<div aria-hidden="true" style="color:${primary};font-size:${px(40)};line-height:1">↓</div>` +
      `<div style="display:flex;flex-direction:column;gap:${gap};width:100%">${others.map((it) => card(it, { showMarker: false })).join("")}</div>`;
  } else {
    body = items.map((it) => card(it)).join("");
  }

  return `<div style="width:1000px;height:1500px;position:relative;overflow:hidden;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${gap};padding:${s < 0.75 ? 30 : 60}px 50px;font-family:${fBody};background:${bg};color:${text}">` +
    (badge ? pill(badge) : "") +
    `<div style="font-family:${fTitle};font-weight:400;font-size:${px(60, 40)};line-height:1.2;color:${secondary};text-align:center">${esc(title)}</div>` +
    body +
    (cta ? `<div style="font-family:${fBody};font-style:italic;font-size:${px(26)};color:${text};text-align:center">${esc(cta)}</div>` : "") +
    (watermark ? `<div style="font-family:${fBody};font-size:20px;color:${text};opacity:0.6">${esc(watermark)}</div>` : "") +
    `</div>`;
}

/** Overlay photo simple (dégradé de la charte + texte complet + indication photo). */
// deno-lint-ignore no-explicit-any
export function buildFallbackOverlayHtml(overlayText: any, ch: PinCharter): string {
  const primary = cssColor(ch.color_primary, "#FB3D80");
  const secondary = cssColor(ch.color_secondary, "#91014b");
  const bg = cssColor(ch.color_background, "#FFF4F8");
  const text = cssColor(ch.color_text, "#1A1A2E");
  const fTitle = cssFont(ch.font_title);
  const fBody = cssFont(ch.font_body);
  const badge = str(overlayText?.badge);
  const title = str(overlayText?.title) || "";
  const subtitle = str(overlayText?.subtitle);
  const cta = str(overlayText?.cta);
  const s = pickScale([
    ...(badge ? [{ text: badge, base: 22, width: 900, pad: 40 }] : []),
    { text: title, base: 68, width: 900, pad: 40 },
    ...(subtitle ? [{ text: subtitle, base: 32, width: 900, pad: 24 }] : []),
    ...(cta ? [{ text: cta, base: 26, width: 900, pad: 24 }] : []),
  ]);
  const px = (base: number, min: number) => `${Math.max(min, Math.round(base * s))}px`;
  return `<div style="width:1000px;height:1500px;position:relative;overflow:hidden;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:60px 50px;font-family:${fBody};background:linear-gradient(160deg, ${bg} 0%, ${primary}20 50%, ${secondary}30 100%);color:${text};text-align:center">` +
    (badge ? `<div style="display:inline-block;background:${primary};color:#FFFFFF;font-family:${fBody};font-weight:600;font-size:${px(22, 20)};text-transform:uppercase;letter-spacing:2px;padding:8px 24px;border-radius:100px">${esc(badge)}</div>` : "") +
    `<div style="font-family:${fTitle};font-weight:400;font-size:${px(68, 36)};line-height:1.2;color:${secondary}">${esc(title)}</div>` +
    (subtitle ? `<div style="font-family:${fBody};font-size:${px(32, 18)};line-height:1.5;color:${text}">${esc(subtitle)}</div>` : "") +
    (cta ? `<div style="font-family:${fBody};font-style:italic;font-size:${px(26, 18)};color:${text}">${esc(cta)}</div>` : "") +
    `<div style="position:absolute;bottom:40px;left:0;right:0;font-family:${fBody};font-size:18px;color:${text};opacity:0.6">${esc(PHOTO_OVERLAY_HINT)}</div>` +
    `</div>`;
}

// ── Orchestration de l'appel 2 ──────────────────────────────────────────────

export type DesignOutcome = "ai" | "ai_retry" | "fallback";

export interface DesignRunResult<T> {
  /** HTML final (déjà passé par `finalize`). */
  html: string;
  /** Données annexes de la tentative retenue (ex. emojis) ; absentes en repli. */
  extra?: T;
  outcome: DesignOutcome;
  attempts: number;
}

export interface DesignRunOptions<T> {
  source: string;
  pinType: string;
  spec: PinTextSpec;
  /** Appel 2. `gapNote` = écart à corriger (relance), `timeoutMs` = plafond de la tentative. */
  callDesign: (gapNote: string | null, timeoutMs: number) => Promise<{ html: string; extra?: T }>;
  /** Post-traitement déterministe (gardes contraste / police / polices). */
  finalize: (html: string) => string;
  /** Rendu de repli construit par le code (non finalisé). */
  fallback: () => string;
  /** Échéance absolue (ms epoch) au-delà de laquelle on ne lance plus d'appel 2. */
  deadline: number;
  /** Durée de l'appel 1 (télémétrie). */
  writeMs?: number;
  now?: () => number;
}

/**
 * Appel 2 + validation par le code + relance unique + repli. Journalise une
 * ligne `[pinterest:design]` (compteurs uniquement, jamais le texte).
 */
export async function designWithTextFidelity<T>(o: DesignRunOptions<T>): Promise<DesignRunResult<T>> {
  const now = o.now ?? Date.now;
  const t0 = now();
  const reasons: string[] = [];
  let missingFields = 0;
  let addedWords = 0;
  let gap: string | null = null;
  let attempts = 0;
  let lastMs = 0;
  let result: DesignRunResult<T> | null = null;

  while (attempts < PIN_DESIGN_MAX_ATTEMPTS) {
    const remaining = o.deadline - now();
    const needed = attempts === 0 ? PIN_DESIGN_MIN_ATTEMPT_MS : Math.max(PIN_DESIGN_MIN_ATTEMPT_MS, Math.round(lastMs * 1.1));
    if (remaining < needed) {
      reasons.push(attempts === 0 ? "no_time" : "no_time_for_retry");
      break;
    }
    attempts++;
    const ta = now();
    let out: { html: string; extra?: T };
    try {
      out = await o.callDesign(gap, Math.min(PIN_DESIGN_MAX_ATTEMPT_MS, remaining - 2_000));
    } catch (err) {
      lastMs = now() - ta;
      reasons.push(`ai_error:${(err as { status?: number })?.status ?? "unknown"}`);
      gap = null;
      continue;
    }
    lastMs = now() - ta;
    if (typeof out?.html !== "string" || !out.html.trim()) {
      reasons.push("empty_html");
      continue;
    }
    const html = o.finalize(out.html);
    const report = checkHtmlTextFidelity(html, o.spec);
    if (report.ok) {
      result = { html, extra: out.extra, outcome: attempts === 1 ? "ai" : "ai_retry", attempts };
      break;
    }
    reasons.push("text_mismatch");
    missingFields += report.missing.length;
    addedWords += report.added.length;
    gap = describeFidelityGap(report, o.spec);
  }

  if (!result) result = { html: o.finalize(o.fallback()), outcome: "fallback", attempts };

  console.log("[pinterest:design]", JSON.stringify({
    source: o.source,
    pin_type: o.pinType,
    outcome: result.outcome,
    attempts,
    reasons,
    missing_fields: missingFields,
    added_words: addedWords,
    write_ms: o.writeMs ?? null,
    design_ms: now() - t0,
  }));
  return result;
}
