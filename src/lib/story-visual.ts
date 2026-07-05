// Rendu déterministe des visuels de stories Instagram (1080×1920).
//
// Contrairement aux carrousels (HTML généré par l'IA via carousel-visual),
// les stories sont assemblées en pur TypeScript à partir du plan visuel
// produit par storiesBrief (champ "visual" de chaque story) : le look doit
// imiter le texte natif Instagram (pastilles surlignées ligne à ligne),
// pas un visuel designé. Déterministe = zéro slop, zéro coût IA, aperçu
// instantané quand l'utilisatrice édite le texte.
//
// Typographies : équivalents libres des styles natifs Instagram
// (SF Pro et Brutal Type ne sont pas librement embarquables) :
// Classic → Inter, Strong → Oswald, Elegant → Playfair Display italique.

export const STORY_W = 1080;
export const STORY_H = 1920;

export type StoryGabarit = "photo_pills" | "fond_pills" | "interaction" | "liste" | "citation";

export interface StoryVisualPlan {
  gabarit?: StoryGabarit | string | null;
  background?: "photo" | "fond_couleur" | string | null;
  title_pill?: string | null;
  body_pill?: string | null;
  list_pills?: string[] | null;
  quote?: string | null;
  photo_directive?: string | null;
}

export interface StoryStickerPlan {
  type?: string | null;
  label?: string | null;
  options?: string[] | null;
}

export interface StoryFrameStory {
  visual?: StoryVisualPlan | null;
  sticker?: StoryStickerPlan | null;
  face_cam?: boolean | null;
}

export interface StoryFrameBranding {
  color_primary?: string | null;
  color_secondary?: string | null;
  color_background?: string | null;
  color_text?: string | null;
}

export interface StoryFrameOptions {
  /** URL (https ou data:) de la photo attachée, utilisée comme fond des gabarits photo. */
  photoUrl?: string | null;
  /** true = aperçu : matérialise la zone sticker. false = export : l'espace reste vide. */
  preview?: boolean;
}

const FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@600;700&family=Oswald:wght@500;600&family=Playfair+Display:ital,wght@1,500;1,600&family=IBM+Plex+Mono:wght@500&display=swap">';

const FONT_CLASSIC = "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_STRONG = "'Oswald', 'Arial Narrow', sans-serif";
const FONT_ELEGANT = "'Playfair Display', Georgia, serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeHex(hex: string | null | undefined, fallback: string): string {
  if (!hex) return fallback;
  const h = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return h;
  if (/^#[0-9a-fA-F]{3}$/.test(h)) {
    return "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  return fallback;
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Texte lisible sur un fond donné : blanc sur foncé, encre sombre sur clair. */
function textOn(bg: string, darkInk: string): string {
  return luminance(bg) > 0.45 ? darkInk : "#FFFFFF";
}

/** Mélange une couleur avec du blanc (ratio 0..1 = part de blanc). */
function tintWithWhite(hex: string, ratio: number): string {
  const mix = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(c + (255 - c) * ratio)
      .toString(16)
      .padStart(2, "0");
  };
  return "#" + mix(1) + mix(3) + mix(5);
}

interface Palette {
  primary: string;
  secondary: string;
  background: string;
  ink: string;
}

function buildPalette(branding: StoryFrameBranding | null | undefined): Palette {
  const primary = normalizeHex(branding?.color_primary, "#FB3D80");
  const secondary = normalizeHex(branding?.color_secondary, tintWithWhite(primary, 0.35));
  const background = normalizeHex(branding?.color_background, tintWithWhite(primary, 0.88));
  const ink = normalizeHex(branding?.color_text, "#2A2521");
  return { primary, secondary, background, ink };
}

/** Une pastille façon texte natif Instagram : fond ligne à ligne (box-decoration-break). */
function pill(text: string, opts: { bg: string; color: string; font: string; size: number; transform?: string; letterSpacing?: string; italic?: boolean; role?: string }): string {
  const style = [
    "display:inline",
    "box-decoration-break:clone",
    "-webkit-box-decoration-break:clone",
    `background:${opts.bg}`,
    `color:${opts.color}`,
    `font-family:${opts.font}`,
    `font-size:${opts.size}px`,
    "font-weight:600",
    `line-height:1.72`,
    "padding:8px 30px",
    "border-radius:18px",
    opts.transform ? `text-transform:${opts.transform}` : "",
    // letter-spacing TOUJOURS explicite (jamais "normal") : html2canvas mesure
    // mal les espaces de certaines fontes (Playfair italique → mots collés à
    // l'export) ; un letter-spacing non nul le force à poser chaque caractère.
    `letter-spacing:${opts.letterSpacing || "0.01em"}`,
    opts.italic ? "font-style:italic" : "",
  ]
    .filter(Boolean)
    .join(";");
  // data-story-pptx : repère de mesure pour l'export PPTX natif (export-story-pptx).
  return `<span data-story-pptx="${opts.role || "text"}" style="${style}">${escapeHtml(text)}</span>`;
}

function titlePillHtml(text: string, p: Palette): string {
  return pill(text, {
    bg: p.primary,
    color: textOn(p.primary, p.ink),
    font: FONT_STRONG,
    size: 66,
    transform: "uppercase",
    letterSpacing: "2px",
    role: "title",
  });
}

function bodyPillHtml(text: string, p: Palette, size = 52): string {
  return pill(text, { bg: "#FFFFFF", color: p.ink, font: FONT_CLASSIC, size, role: "body" });
}

/** Zone sticker : matérialisée en aperçu, espace vide (même encombrement) à l'export. */
function stickerZoneHtml(sticker: StoryStickerPlan | null | undefined, p: Palette, preview: boolean, onPhoto: boolean): string {
  const options = Array.isArray(sticker?.options) ? sticker!.options!.filter(Boolean).slice(0, 4) : [];
  const rows =
    options.length > 0
      ? options
          .map(
            (o, i) =>
              `<div style="padding:20px 32px;font-family:${FONT_CLASSIC};font-weight:700;font-size:38px;color:${i % 2 === 0 ? p.secondary : p.primary};${i > 0 ? "border-top:2px solid #ECE8E2;" : ""}">${escapeHtml(o)}</div>`,
          )
          .join("")
      : `<div style="padding:22px 32px;font-family:${FONT_CLASSIC};font-weight:600;font-size:36px;color:#9A938B">${escapeHtml(sticker?.label || "Ton sticker ici")}</div>`;

  const dashColor = onPhoto ? "rgba(255,255,255,0.95)" : p.primary;
  const captionColor = onPhoto ? "#FFFFFF" : p.ink;
  const typeLabel = sticker?.type ? `sticker ${sticker.type}` : "sticker interactif";

  return `<div data-story-sticker-zone style="${preview ? "" : "visibility:hidden;"}border:4px dashed ${dashColor};border-radius:32px;padding:24px;max-width:640px;margin:0 auto;text-align:center">
<div style="background:#FFFFFF;border-radius:26px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.12)">${rows}</div>
<p style="margin:18px 0 0;font-family:${FONT_MONO};font-size:26px;color:${captionColor}">${escapeHtml(typeLabel)} — à poser dans Instagram</p>
</div>`;
}

// Fragment (pas un document complet) : composable à la fois en srcDoc d'aperçu
// (le navigateur reconstruit html/body autour) et dans l'iframe de capture PNG
// (export-carousel-png), qui fournit son propre wrapper <html>.
function wrapFrame(inner: string, backgroundCss: string): string {
  return `${FONT_LINK}
<style>html,body{margin:0;padding:0;width:${STORY_W}px;height:${STORY_H}px;overflow:hidden}*,*::before,*::after{box-sizing:border-box}</style>
<div data-story-frame style="width:${STORY_W}px;height:${STORY_H}px;position:relative;${backgroundCss}">${inner}</div>`;
}

/**
 * Construit le HTML autonome (1080×1920) du visuel d'une story.
 * Retourne null si la story n'a pas de visuel à rendre (face cam, plan absent).
 */
export function buildStoryFrameHtml(
  story: StoryFrameStory | null | undefined,
  branding: StoryFrameBranding | null | undefined,
  opts: StoryFrameOptions = {},
): string | null {
  const visual = story?.visual;
  if (!visual || story?.face_cam) return null;

  const p = buildPalette(branding);
  const preview = opts.preview !== false;
  const gabarit = (visual.gabarit || "fond_pills") as StoryGabarit;

  const wantsPhoto = visual.background === "photo" && !!opts.photoUrl;
  const onPhoto = wantsPhoto;
  const backgroundCss = wantsPhoto
    ? `background-image:url('${String(opts.photoUrl).replace(/'/g, "%27")}');background-size:cover;background-position:center`
    : `background:${gabarit === "citation" ? p.ink : p.background}`;

  // Zone de sécurité Instagram : ~250px en haut (avatar, ✕) et ~300px en bas (répondre).
  const SAFE = "padding:280px 84px 320px";

  const title = (visual.title_pill || "").trim();
  const body = (visual.body_pill || "").trim();

  let inner = "";

  if (gabarit === "liste") {
    const items = (Array.isArray(visual.list_pills) ? visual.list_pills : []).filter(Boolean).slice(0, 4);
    inner = `<div style="height:100%;${SAFE};display:flex;flex-direction:column;justify-content:center;gap:44px">
${title ? `<div style="text-align:center">${titlePillHtml(title, p)}</div>` : ""}
${items.map((it) => `<div>${bodyPillHtml(it, p, 48)}</div>`).join("\n")}
</div>`;
  } else if (gabarit === "citation") {
    const quote = (visual.quote || body || title).trim();
    // L'IA remet parfois le verbatim tel quel dans body_pill : ne montrer
    // l'attribution que si elle apporte autre chose que la citation.
    const normalize = (s: string) => s.toLowerCase().replace(/[«»"'’\s.?!,:;()-]/g, "");
    const attribution = visual.quote && normalize(body) && normalize(body) !== normalize(quote) ? body : "";
    const quoteBg = tintWithWhite(p.background, 0.5);
    inner = `<div style="height:100%;${SAFE};display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:44px">
<div>${pill(`« ${quote} »`, { bg: quoteBg, color: p.ink, font: FONT_ELEGANT, size: 58, italic: true, role: "quote" })}</div>
${attribution ? `<div>${pill(attribution, { bg: p.primary, color: textOn(p.primary, p.ink), font: FONT_CLASSIC, size: 38, role: "attribution" })}</div>` : ""}
</div>`;
  } else if (gabarit === "interaction") {
    inner = `<div style="height:100%;${SAFE};display:flex;flex-direction:column;justify-content:center;gap:70px;text-align:center">
${title ? `<div>${titlePillHtml(title, p)}</div>` : ""}
${body ? `<div>${bodyPillHtml(body, p)}</div>` : ""}
${stickerZoneHtml(story?.sticker, p, preview, onPhoto)}
</div>`;
  } else if (gabarit === "photo_pills" && wantsPhoto) {
    inner = `<div style="height:100%;${SAFE};display:flex;flex-direction:column;justify-content:flex-end;gap:30px">
${title ? `<div>${titlePillHtml(title, p)}</div>` : ""}
${body ? `<div>${bodyPillHtml(body, p)}</div>` : ""}
</div>`;
  } else {
    // fond_pills, et fallback des gabarits photo sans photo attachée.
    inner = `<div style="height:100%;${SAFE};display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:36px">
${title ? `<div>${titlePillHtml(title, p)}</div>` : ""}
${body ? `<div>${bodyPillHtml(body, p)}</div>` : ""}
</div>`;
  }

  // En aperçu, si le plan demande une photo mais qu'aucune n'est attachée :
  // indication discrète en haut de frame (jamais à l'export).
  if (preview && visual.background === "photo" && !opts.photoUrl) {
    inner += `<div style="position:absolute;top:96px;left:84px;right:84px;text-align:left">
<span style="display:inline-block;background:rgba(0,0,0,0.45);color:#FFF;font-family:${FONT_MONO};font-size:26px;padding:10px 22px;border-radius:99px">📷 ${escapeHtml(visual.photo_directive || "ajoute une photo pour ce fond")}</span>
</div>`;
  }

  return wrapFrame(inner, backgroundCss);
}

/** Construit les frames de toute une séquence ; les stories sans visuel donnent null. */
export function buildStoryFrames(
  stories: StoryFrameStory[] | null | undefined,
  branding: StoryFrameBranding | null | undefined,
  opts: StoryFrameOptions = {},
): ({ story_number: number; html: string } | null)[] {
  if (!Array.isArray(stories)) return [];
  return stories.map((s, i) => {
    const html = buildStoryFrameHtml(s, branding, opts);
    return html ? { story_number: i + 1, html } : null;
  });
}
