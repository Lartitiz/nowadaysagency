// Rendu déterministe des visuels de stories Instagram (1080×1920).
//
// Contrairement aux carrousels (HTML généré par l'IA via carousel-visual),
// les stories sont assemblées en pur TypeScript à partir du plan visuel
// produit par storiesBrief (champ "visual" de chaque story) : le look doit
// imiter le texte natif Instagram (pastilles ligne à ligne), pas un visuel
// designé. Déterministe = zéro slop, zéro coût IA, aperçu instantané quand
// l'utilisatrice édite le texte.
//
// Typographies et habillages : l'ASSEMBLAGE choisi dans la charte
// (story-styles.ts, défaut « A · Éditorial »). Les couleurs viennent de la
// charte, jamais de celle de Nowadays.

import {
  FONT_CLASSIC,
  FONT_MONO,
  STORY_FONTS_HREF,
  STORY_PILL,
  estimateLines,
  getStoryAssemblage,
  resolveStoryStyle,
  type StoryAssemblage,
  type StoryStyleResolved,
  type StoryStyleSettings,
  type StoryTextStyle,
} from "./story-styles";

export const STORY_W = 1080;
export const STORY_H = 1920;

export type StoryGabarit = "photo_pills" | "fond_pills" | "interaction" | "liste" | "citation";

export interface StoryVisualPlan {
  text_position?: "top" | "middle" | "bottom" | null;
  /** Une édition explicite ne doit pas être masquée par les gardes IA. */
  body_pill_edited?: boolean;
  gabarit?: StoryGabarit | string | null;
  background?: "photo" | "fond_couleur" | string | null;
  title_pill?: string | null;
  body_pill?: string | null;
  list_pills?: string[] | null;
  quote?: string | null;
  photo_directive?: string | null;
  /** Requête stock EN (2-4 mots) émise par le brief — sert aux suggestions Pexels (lot C). */
  photo_query_en?: string | null;
  /** Photo de la bibliothèque assignée par la génération (user_photos.id) — lot B. */
  photo_id?: string | null;
  /** Description de la photo de bibliothèque assignée (badge « de ta bibliothèque »). */
  photo_library_description?: string | null;
  /** Photo choisie APRÈS génération (stock Pexels ou upload) : URL stable https ou data:. */
  photo_url?: string | null;
  /** Crédit stock si photo_url vient de Pexels (lot C). */
  photo_stock_credit?: { photographer?: string | null; source_url?: string | null } | null;
}

export interface StoryStickerPlan {
  type?: string | null;
  label?: string | null;
  options?: string[] | null;
}

export interface StoryFrameStory {
  text?: string | null;
  texte?: string | null;
  content?: string | null;
  visual?: StoryVisualPlan | null;
  sticker?: StoryStickerPlan | null;
  face_cam?: boolean | null;
}

/** Couleurs de la charte + réglages story_* (colonnes brand_charter, optionnelles). */
export interface StoryFrameBranding extends StoryStyleSettings {
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

const FONT_LINK = `<link rel="stylesheet" href="${STORY_FONTS_HREF}">`;

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
  /** Couleur des pastilles « couleur » (réglage de la charte). */
  pill: string;
  /** Couleur du texte sur pastille claire (tint). */
  tintInk: string;
}

function buildPalette(branding: StoryFrameBranding | null | undefined, style: StoryStyleResolved): Palette {
  const primary = normalizeHex(branding?.color_primary, "#FB3D80");
  const secondary = normalizeHex(branding?.color_secondary, tintWithWhite(primary, 0.35));
  const background = normalizeHex(branding?.color_background, tintWithWhite(primary, 0.88));
  const ink = normalizeHex(branding?.color_text, "#2A2521");
  const pill = style.pillColor === "secondary" ? secondary : style.pillColor === "ink" ? ink : primary;
  // Sur pastille claire, une couleur secondaire trop pâle serait illisible :
  // on retombe sur la primaire.
  const tintInk = style.pillColor === "secondary" && luminance(secondary) > 0.45 ? primary : pill;
  return { primary, secondary, background, ink, pill, tintInk };
}

interface RenderCtx {
  p: Palette;
  style: StoryStyleResolved;
  asm: StoryAssemblage;
}

type Role = "title" | "body" | "aside" | "quote" | "attribution" | "item";

/**
 * Un bloc de texte façon natif Instagram : une boîte PAR LIGNE ajustée au
 * texte (box-decoration-break:clone), boîtes qui se touchent, coins courts.
 * Mode « nu » = pas de boîte, ombre portée (texte blanc sur photo).
 */
function textBlock(text: string, st: StoryTextStyle, ctx: RenderCtx, role: Role, overrides: Partial<StoryTextStyle> = {}): string {
  const s: StoryTextStyle = { ...st, ...overrides };
  const { p, style } = ctx;
  const radiusEm = style.corners === "droits" ? STORY_PILL.radiusDroitsEm : (s.radiusEm ?? STORY_PILL.radiusEm);
  const base = [
    "display:inline",
    `font-family:${s.font}`,
    `font-size:${Math.round(s.size)}px`,
    `font-weight:${s.weight}`,
    `line-height:${STORY_PILL.lineHeight}`,
    s.italic ? "font-style:italic" : "",
    s.upper ? "text-transform:uppercase" : "",
    // letter-spacing TOUJOURS explicite (jamais "normal") : html2canvas mesure
    // mal les espaces de certaines fontes (italiques → mots collés à l'export) ;
    // un letter-spacing non nul le force à poser chaque caractère.
    `letter-spacing:${s.letterSpacing || "0.01em"}`,
  ];
  let look: string[];
  if (s.mode === "nu") {
    look = [
      "background:transparent",
      "color:#FFFFFF",
      "text-shadow:0 0.05em 0.3em rgba(0,0,0,0.8),0 0 1.1em rgba(0,0,0,0.55)",
    ];
  } else {
    const bg = s.mode === "col" ? p.pill : s.mode === "tint" ? "rgba(255,255,255,0.86)" : "#FFFFFF";
    const color = s.mode === "col" ? textOn(p.pill, p.ink) : s.mode === "tint" ? p.tintInk : p.ink;
    look = [
      "box-decoration-break:clone",
      "-webkit-box-decoration-break:clone",
      `background:${bg}`,
      `color:${color}`,
      `padding:${STORY_PILL.paddingEm}`,
      `border-radius:${radiusEm}em`,
    ];
  }
  const css = [...base, ...look].filter(Boolean).join(";");
  // data-story-pptx : repère de mesure pour l'export PPTX natif (export-story-pptx).
  return `<span data-story-pptx="${role}" data-story-mode="${s.mode}" style="${css}">${escapeHtml(text)}</span>`;
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

/** Facteur de taille du corps selon la longueur du texte (paliers, jamais sous 0.7). */
export function bodyScale(text: string): number {
  const n = (text || "").trim().length;
  if (n > 300) return 0.7;
  if (n > 220) return 0.78;
  if (n > 150) return 0.88;
  return 1;
}

/** Alignement d'une story : réglage de la charte, ou auto (centré ≤ 2 lignes, gauche au-delà). */
function alignFor(ctx: RenderCtx, longest: { text: string; style: StoryTextStyle } | null): "center" | "left" {
  if (ctx.style.align === "centre") return "center";
  if (ctx.style.align === "gauche") return "left";
  if (!longest) return "center";
  return estimateLines(longest.text, longest.style) > 2 ? "left" : "center";
}

function column(align: "center" | "left", extra: string, blocks: string[]): string {
  const items = align === "center" ? "center" : "flex-start";
  return `<div style="height:100%;${SAFE};display:flex;flex-direction:column;align-items:${items};text-align:${align};${extra}">
${blocks.filter(Boolean).map((b) => `<div style="max-width:100%">${b}</div>`).join("\n")}
</div>`;
}

/** Découpe la narration autour du verbatim pour garder le contexte sans répéter la citation. */
function splitAroundQuote(text: string, quote: string): { before: string; quote: string; after: string } | null {
  if (!text || !quote) return null;
  const index = text.toLocaleLowerCase("fr").indexOf(quote.toLocaleLowerCase("fr"));
  if (index < 0) return null;
  return {
    before: text.slice(0, index).replace(/[\s«“"'‘]+$/u, "").trim(),
    quote: text.slice(index, index + quote.length).trim(),
    after: text.slice(index + quote.length).replace(/^[\s»”"'’]+/u, "").trim(),
  };
}

// Zone de sécurité Instagram : ~250px en haut (avatar, ✕) et ~300px en bas (répondre).
const SAFE = "padding:280px 84px 320px";

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

  const style = resolveStoryStyle(branding);
  const asm = getStoryAssemblage(style.assemblage);
  const p = buildPalette(branding, style);
  const ctx: RenderCtx = { p, style, asm };
  const preview = opts.preview !== false;
  const gabarit = (visual.gabarit || "fond_pills") as StoryGabarit;
  const justify = visual.text_position === "top" ? "flex-start"
    : visual.text_position === "bottom" ? "flex-end" : "center";

  const wantsPhoto = visual.background === "photo" && !!opts.photoUrl;
  const onPhoto = wantsPhoto;
  const backgroundCss = wantsPhoto
    ? `background-image:url('${String(opts.photoUrl).replace(/'/g, "%27")}');background-size:cover;background-position:center`
    : `background:${gabarit === "citation" ? p.ink : p.background}`;

  const title = (visual.title_pill || "").trim();
  const body = (visual.body_pill || "").trim();

  // Sur fond couleur, le texte « nu » (blanc + ombre) n'a pas de sens : il
  // devient une pastille blanche. Sur photo, il reste nu.
  const bodyBase: StoryTextStyle = !onPhoto && asm.body.mode === "nu" ? { ...asm.body, mode: "wh" } : asm.body;
  // La pastille porte LE texte de la story (jusqu'à ~350 caractères, décision
  // 07/09 : « le texte un peu long, c'est ça qui fait qu'on lit »). Le corps
  // se réduit par paliers pour que 4 phrases tiennent dans la zone sûre.
  const bodyStyle: StoryTextStyle = { ...bodyBase, size: bodyBase.size * bodyScale(body) };
  const titleStyle: StoryTextStyle = !onPhoto && asm.title.mode === "nu" ? { ...asm.title, mode: "col" } : asm.title;

  let inner = "";

  if (gabarit === "liste") {
    const items = (Array.isArray(visual.list_pills) ? visual.list_pills : []).filter(Boolean).slice(0, 4);
    // Les items d'une liste sont toujours en pastille (jamais nus) et à gauche,
    // comme les listes natives ; le titre reste centré sauf réglage « gauche ».
    const itemStyle: StoryTextStyle = { ...asm.body, mode: asm.body.mode === "nu" ? "wh" : asm.body.mode, size: asm.body.size * 0.92 };
    const titleAlign = style.align === "gauche" ? "flex-start" : "center";
    inner = `<div style="height:100%;${SAFE};display:flex;flex-direction:column;justify-content:${justify};align-items:flex-start;text-align:left;gap:34px">
${title ? `<div style="max-width:100%;align-self:${titleAlign};text-align:${titleAlign === "center" ? "center" : "left"}">${textBlock(title, titleStyle, ctx, "title")}</div>` : ""}
${items.map((it) => `<div style="max-width:100%">${textBlock(it, itemStyle, ctx, "item")}</div>`).join("\n")}
</div>`;
  } else if (gabarit === "citation") {
    const quote = (visual.quote || body || title).trim();
    const narration = String(story?.text || story?.texte || story?.content || "").trim();
    // L'IA remet parfois le verbatim tel quel dans body_pill : ne montrer
    // l'attribution que si elle apporte autre chose que la citation.
    const normalize = (s: string) => s.toLowerCase().replace(/[«»"'’\s.?!,:;()-]/g, "");
    // L'attribution, c'est « qui l'a dit » : une ligne. Depuis que body_pill
    // porte le texte entier de la story (07/09), une citation pouvait recevoir
    // 300 caractères sous le verbatim : au-delà de 80, on ne montre que la
    // citation (le texte reste dans la story, pas sur l'image). Cette garde
    // concerne la génération : une édition explicite reste toujours visible.
    const attribution =
      visual.quote && body && (visual.body_pill_edited || (normalize(body) !== normalize(quote) && body.length <= 80)) ? body : "";
    const quoteStyle: StoryTextStyle = asm.quote
      ? { ...asm.quote, mode: "wh" }
      : { ...asm.title, mode: "wh", size: asm.title.size * 0.92, upper: false, letterSpacing: undefined };
    const narrativeStyle = { ...bodyBase, size: bodyBase.size * bodyScale(narration) };
    const split = splitAroundQuote(narration, quote);
    const quoteText = `« ${split?.quote || quote} »`;
    const align = alignFor(ctx, { text: narration || quoteText, style: narration ? narrativeStyle : quoteStyle });
    // Une story « citation » reste une histoire : le contexte avant et la
    // réaction après le verbatim font partie du visuel. Si le verbatim ne se
    // retrouve pas exactement dans le texte, afficher le texte complet évite
    // toute perte de contenu.
    const blocks = visual.body_pill_edited
      ? [
          textBlock(quoteText, quoteStyle, ctx, "quote"),
          attribution ? textBlock(attribution, { ...asm.aside, size: asm.aside.size * bodyScale(attribution), mode: "col" }, ctx, "attribution") : "",
        ]
      : narration
      ? split
        ? [
            split.before ? textBlock(split.before, narrativeStyle, ctx, "body") : "",
            textBlock(quoteText, { ...quoteStyle, size: quoteStyle.size * bodyScale(narration) }, ctx, "quote"),
            split.after ? textBlock(split.after, narrativeStyle, ctx, "body") : "",
          ]
        : [textBlock(narration, narrativeStyle, ctx, "body")]
      : [
          textBlock(quoteText, quoteStyle, ctx, "quote"),
          attribution ? textBlock(attribution, { ...asm.aside, size: asm.aside.size * bodyScale(attribution), mode: "col" }, ctx, "attribution") : "",
        ];
    inner = column(align, `justify-content:${justify};gap:34px`, blocks);
  } else if (gabarit === "interaction") {
    const align = alignFor(ctx, body ? { text: body, style: bodyStyle } : null);
    inner = `<div style="height:100%;${SAFE};display:flex;flex-direction:column;justify-content:${justify};align-items:${align === "center" ? "center" : "flex-start"};text-align:${align};gap:60px">
${title ? `<div style="max-width:100%">${textBlock(title, titleStyle, ctx, "title")}</div>` : ""}
${body ? `<div style="max-width:100%">${textBlock(body, bodyStyle, ctx, "body")}</div>` : ""}
<div style="align-self:stretch">${stickerZoneHtml(story?.sticker, p, preview, onPhoto)}</div>
</div>`;
  } else if (gabarit === "photo_pills" && wantsPhoto) {
    // Milieu par défaut ; le choix local permet de dégager le sujet de la photo.
    const align = alignFor(ctx, body ? { text: body, style: bodyStyle } : null);
    inner = column(align, `justify-content:${justify};gap:34px`, [
      title ? textBlock(title, titleStyle, ctx, "title") : "",
      body ? textBlock(body, bodyStyle, ctx, "body") : "",
    ]);
  } else {
    // fond_pills, et fallback des gabarits photo sans photo attachée.
    const align = alignFor(ctx, body ? { text: body, style: bodyStyle } : null);
    inner = column(align, `justify-content:${justify};gap:34px`, [
      title ? textBlock(title, titleStyle, ctx, "title") : "",
      body ? textBlock(body, bodyStyle, ctx, "body") : "",
    ]);
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
