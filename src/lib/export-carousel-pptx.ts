import PptxGenJS from "pptxgenjs";

// ═══ TYPES ═══

interface SlideData {
  slide_number: number;
  role: string;
  title: string;
  body: string;
  visual_suggestion?: string;
}

interface VisualSlide {
  slide_number: number;
  html: string;
}

export interface CharterColors {
  color_primary?: string | null;
  color_secondary?: string | null;
  color_accent?: string | null;
  color_background?: string | null;
  color_text?: string | null;
  font_title?: string | null;
  font_body?: string | null;
}

// ═══ HELPERS ═══

function hex(color: string): string {
  return color.replace("#", "").padEnd(6, "0").slice(0, 6);
}

/** Classify the slide role into a design category */
function classifyRole(role: string, slideIndex: number, totalSlides: number): string {
  const r = (role || "").toLowerCase().trim();
  if (slideIndex === 0 || r.includes("hook") || r.includes("accroche")) return "hook";
  if (slideIndex === totalSlides - 1 || r.includes("cta") || r.includes("appel") || r.includes("action")) return "cta";
  if (r.includes("sépar") || r.includes("separ") || r.includes("transition") || r.includes("rupture")) return "separator";
  if (r.includes("dark") || r.includes("punchline") || r.includes("punch")) return "dark_box";
  if (r.includes("context") || r.includes("story") || r.includes("intro") || r.includes("récit")) return "context";
  if (r.includes("espoir") || r.includes("hope") || r.includes("solution") || r.includes("bonne nouvelle")) return "hope";
  return "tip";
}

/** Accent colors that rotate for tip slides */
const ACCENT_ROTATION = ["3498db", "27AE60", "E67E22", "9B59B6", "FB3D80"];

/** Factory: soft card shadow (never reuse pptxgenjs option objects) */
const makeShadow = () => ({
  type: "outer" as const,
  blur: 8,
  offset: 3,
  angle: 135,
  color: "000000",
  opacity: 0.08,
});

/** Factory: badge pill */
function makeBadge(
  text: string,
  x: number,
  y: number,
  fillColor: string,
  fonts: { body: string },
): [PptxGenJS.TextProps[], PptxGenJS.TextPropsOptions] {
  return [
    [{ text: text.toUpperCase(), options: { fontSize: 10, bold: true, color: "FFFFFF", fontFace: fonts.body } }],
    {
      x,
      y,
      w: Math.max(1.6, text.length * 0.13 + 0.5),
      h: 0.35,
      align: "center",
      valign: "middle",
      fill: { color: fillColor },
      shape: "roundRect" as any,
      rectRadius: 0.18,
      charSpacing: 1.5,
    },
  ];
}

// ═══ MAIN EXPORT ═══

export async function exportCarouselPptx(
  slides: SlideData[],
  fileName = "carrousel",
  _visualSlides?: VisualSlide[],
  charter?: CharterColors | null
) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "INSTAGRAM", width: 7.5, height: 9.375 });
  pptx.layout = "INSTAGRAM";
  pptx.author = "Nowadays Agency";

  const c = {
    primary: hex(charter?.color_primary || "#FB3D80"),
    secondary: hex(charter?.color_secondary || "#91014b"),
    accent: hex(charter?.color_accent || "#FFE561"),
    bg: hex(charter?.color_background || "#FFF4F8"),
    text: hex(charter?.color_text || "#1A1A2E"),
  };
  const f = {
    title: charter?.font_title || "Libre Baskerville",
    body: charter?.font_body || "IBM Plex Mono",
  };

  const W = 7.5;
  const H = 9.375;
  const PAD_X = 0.55;
  const PAD_Y = 0.42;
  const CONTENT_W = W - PAD_X * 2;

  let tipIndex = 0;

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const category = classifyRole(s.role, i, slides.length);
    const slide = pptx.addSlide();

    switch (category) {
      case "hook":
        buildHookSlide(slide, s, c, f, W, H, PAD_X, CONTENT_W);
        break;
      case "context":
        buildContextSlide(slide, s, c, f, W, H, PAD_X, PAD_Y, CONTENT_W);
        break;
      case "tip":
        buildTipSlide(slide, s, c, f, W, H, PAD_X, PAD_Y, CONTENT_W, tipIndex);
        tipIndex++;
        break;
      case "separator":
        buildSeparatorSlide(slide, s, c, f, W, H);
        break;
      case "dark_box":
        buildDarkBoxSlide(slide, s, c, f, W, H, PAD_X, CONTENT_W);
        break;
      case "hope":
        buildHopeSlide(slide, s, c, f, W, H, PAD_X, PAD_Y, CONTENT_W);
        break;
      case "cta":
        buildCtaSlide(slide, s, c, f, W, H, PAD_X, CONTENT_W);
        break;
      default:
        buildTipSlide(slide, s, c, f, W, H, PAD_X, PAD_Y, CONTENT_W, tipIndex);
        tipIndex++;
    }
  }

  await pptx.writeFile({ fileName: `${fileName}.pptx` });
}

// ═══ SLIDE BUILDERS ═══

type Colors = { primary: string; secondary: string; accent: string; bg: string; text: string };
type Fonts = { title: string; body: string };

/**
 * HOOK (slide 1) — Fond pâle, grande carte blanche centrée, badge pilule, titre fort
 */
function buildHookSlide(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  slide.background = { color: c.bg };

  // Decorative angled rectangle top-right (no circles)
  slide.addShape("rect", {
    x: W - 2.2,
    y: -0.3,
    w: 2.5,
    h: 2.5,
    fill: { color: c.primary, transparency: 90 },
    rotate: 15,
  });

  // White card centered (~70% of slide)
  const cardW = CONTENT_W * 0.88;
  const cardH = 5.0;
  const cardX = (W - cardW) / 2;
  const cardY = (H - cardH) / 2 + 0.3;

  slide.addShape("roundRect", {
    x: cardX,
    y: cardY,
    w: cardW,
    h: cardH,
    fill: { color: "FFFFFF" },
    rectRadius: 0.15,
    shadow: makeShadow(),
  });

  // Badge pilule on top of card
  const roleLabel = s.role || "ANALOGIE";
  const [badgeText, badgeOpts] = makeBadge(roleLabel, 0, 0, c.primary, f);
  const badgeW = badgeOpts.w as number;
  slide.addText(badgeText, {
    ...badgeOpts,
    x: (W - badgeW) / 2,
    y: cardY + 0.4,
  });

  // Title inside card — highlight last significant word
  const titleParts = highlightLastSignificantWord(s.title, c.primary, c.secondary);
  slide.addText(titleParts, {
    x: cardX + 0.4,
    y: cardY + 1.1,
    w: cardW - 0.8,
    h: cardH - 1.8,
    fontSize: 28,
    fontFace: f.title,
    color: c.secondary,
    align: "center",
    valign: "middle",
    wrap: true,
    lineSpacingMultiple: 1.25,
  });

  // Small decorative square bottom-right of card
  slide.addShape("rect", {
    x: cardX + cardW - 0.25,
    y: cardY + cardH - 0.25,
    w: 0.15,
    h: 0.15,
    fill: { color: c.primary },
    rectRadius: 0.02,
  });
}

/**
 * CONTEXT / STORYTELLING — Titre + corps, barre latérale accent
 */
function buildContextSlide(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, PAD_Y: number, CONTENT_W: number
) {
  slide.background = { color: "FFFFFF" };

  // Title
  slide.addText(s.title, {
    x: PAD_X + 0.1,
    y: 1.5,
    w: CONTENT_W - 0.2,
    h: 1.8,
    fontSize: 24,
    fontFace: f.title,
    color: c.secondary,
    align: "left",
    valign: "middle",
    wrap: true,
    lineSpacingMultiple: 1.2,
  });

  // Accent bar left of body
  if (s.body) {
    const bodyY = 3.6;
    const bodyH = 4.2;
    slide.addShape("rect", {
      x: PAD_X,
      y: bodyY,
      w: 0.06,
      h: Math.min(bodyH, 3.0),
      fill: { color: c.primary },
    });

    slide.addText(s.body, {
      x: PAD_X + 0.3,
      y: bodyY,
      w: CONTENT_W - 0.5,
      h: bodyH,
      fontSize: 16,
      fontFace: f.body,
      color: c.text,
      align: "left",
      valign: "top",
      wrap: true,
      lineSpacingMultiple: 1.5,
    });
  }

  // Bottom accent line
  slide.addShape("rect", {
    x: PAD_X,
    y: H - 0.5,
    w: 1.8,
    h: 0.04,
    fill: { color: c.accent },
  });
}

/**
 * TIP / PÉDAGOGIQUE — Badge pilule, titre, corps avec barre colorée latérale
 */
function buildTipSlide(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, PAD_Y: number, CONTENT_W: number,
  tipIndex: number
) {
  slide.background = { color: "FFFFFF" };
  const accentColor = ACCENT_ROTATION[tipIndex % ACCENT_ROTATION.length];

  // Badge pilule top-left
  const label = s.role || `${String(s.slide_number).padStart(2, "0")}`;
  const [badgeText, badgeOpts] = makeBadge(label, PAD_X, 0.6, accentColor, f);
  slide.addText(badgeText, badgeOpts);

  // Title
  slide.addText(s.title, {
    x: PAD_X,
    y: 1.4,
    w: CONTENT_W,
    h: 2.0,
    fontSize: 24,
    fontFace: f.title,
    color: c.secondary,
    align: "left",
    valign: "middle",
    wrap: true,
    lineSpacingMultiple: 1.2,
  });

  // White card with colored left bar for body
  if (s.body) {
    const cardY = 3.8;
    const cardH = 4.0;
    const cardX = PAD_X;
    const cardW = CONTENT_W;

    // Card background
    slide.addShape("rect", {
      x: cardX,
      y: cardY,
      w: cardW,
      h: cardH,
      fill: { color: "FFFFFF" },
      shadow: makeShadow(),
    });

    // Left accent bar
    slide.addShape("rect", {
      x: cardX,
      y: cardY,
      w: 0.06,
      h: cardH,
      fill: { color: accentColor },
    });

    // Body text
    slide.addText(s.body, {
      x: cardX + 0.4,
      y: cardY + 0.3,
      w: cardW - 0.7,
      h: cardH - 0.6,
      fontSize: 16,
      fontFace: f.body,
      color: c.text,
      align: "left",
      valign: "top",
      wrap: true,
      lineSpacingMultiple: 1.5,
    });
  }
}

/**
 * SÉPARATEUR — Fond rose vif plein, titre blanc centré, numéro décoratif
 */
function buildSeparatorSlide(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number
) {
  slide.background = { color: c.primary };

  // "n o w a d a y s" en haut, espacé
  slide.addText("n o w a d a y s", {
    x: 0,
    y: 0.5,
    w: W,
    h: 0.4,
    fontSize: 10,
    fontFace: f.body,
    color: "FFFFFF",
    align: "center",
    valign: "middle",
    charSpacing: 3,
    bold: true,
  });

  // Title centré en blanc
  slide.addText(s.title, {
    x: 0.8,
    y: 2.5,
    w: W - 1.6,
    h: 4.0,
    fontSize: 28,
    fontFace: f.title,
    color: "FFFFFF",
    align: "center",
    valign: "middle",
    wrap: true,
    lineSpacingMultiple: 1.3,
  });

  // Grand numéro décoratif en bas, semi-transparent
  const decorNum = String(s.slide_number).padStart(2, "0");
  slide.addText(decorNum, {
    x: (W - 3) / 2,
    y: H - 1.8,
    w: 3,
    h: 2.5,
    fontSize: 96,
    fontFace: f.title,
    color: "FFFFFF",
    align: "center",
    valign: "top",
    transparency: 85,
  });
}

/**
 * DARK BOX — Fond sombre, texte blanc, mot en jaune accent
 */
function buildDarkBoxSlide(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  slide.background = { color: "1A1A1A" };

  // Title with accent word in yellow
  const titleParts = highlightLastSignificantWord(s.title, c.accent, "FFFFFF");
  slide.addText(titleParts, {
    x: PAD_X + 0.3,
    y: 2.0,
    w: CONTENT_W - 0.6,
    h: 3.5,
    fontSize: 26,
    fontFace: f.title,
    color: "FFFFFF",
    align: "center",
    valign: "middle",
    wrap: true,
    lineSpacingMultiple: 1.3,
  });

  // Body
  if (s.body) {
    slide.addText(s.body, {
      x: PAD_X + 0.3,
      y: 5.8,
      w: CONTENT_W - 0.6,
      h: 2.5,
      fontSize: 15,
      fontFace: f.body,
      color: "FFFFFF",
      align: "center",
      valign: "top",
      wrap: true,
      lineSpacingMultiple: 1.5,
      transparency: 20,
    });
  }

  // Small accent bar bottom center
  slide.addShape("rect", {
    x: (W - 1.5) / 2,
    y: H - 0.8,
    w: 1.5,
    h: 0.04,
    fill: { color: c.accent },
  });
}

/**
 * HOPE / ESPOIR — Fond jaune accent, badge, titre + corps
 */
function buildHopeSlide(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, PAD_Y: number, CONTENT_W: number
) {
  slide.background = { color: c.accent };

  // Decorative angled rect top-left
  slide.addShape("rect", {
    x: -0.5,
    y: -0.3,
    w: 2.0,
    h: 2.0,
    fill: { color: "FFFFFF", transparency: 85 },
    rotate: -12,
  });

  // Badge
  const roleLabel = s.role || "ESPOIR";
  const [badgeText, badgeOpts] = makeBadge(roleLabel, 0, 0, c.primary, f);
  const badgeW = badgeOpts.w as number;
  slide.addText(badgeText, {
    ...badgeOpts,
    x: (W - badgeW) / 2,
    y: 2.8,
  });

  // Title
  slide.addText(s.title, {
    x: PAD_X + 0.2,
    y: 3.4,
    w: CONTENT_W - 0.4,
    h: 1.5,
    fontSize: 24,
    fontFace: f.title,
    color: c.primary,
    align: "center",
    valign: "middle",
    wrap: true,
    lineSpacingMultiple: 1.2,
  });

  // Body
  if (s.body) {
    slide.addText(s.body, {
      x: PAD_X + 0.4,
      y: 5.2,
      w: CONTENT_W - 0.8,
      h: 2.8,
      fontSize: 15,
      fontFace: f.body,
      color: c.text,
      align: "center",
      valign: "top",
      wrap: true,
      lineSpacingMultiple: 1.5,
    });
  }

  // Decorative angled rect bottom-right
  slide.addShape("rect", {
    x: W - 1.5,
    y: H - 1.5,
    w: 2.0,
    h: 2.0,
    fill: { color: "FFFFFF", transparency: 85 },
    rotate: 15,
  });
}

/**
 * CTA (dernière slide) — Fond pâle, carte blanche, CTA rose, badge "lien en bio"
 */
function buildCtaSlide(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  slide.background = { color: c.bg };

  // White card
  const cardW = CONTENT_W * 0.75;
  const cardH = 3.2;
  const cardX = (W - cardW) / 2;
  const cardY = (H - cardH) / 2 - 0.5;

  slide.addShape("roundRect", {
    x: cardX,
    y: cardY,
    w: cardW,
    h: cardH,
    fill: { color: "FFFFFF" },
    rectRadius: 0.15,
    shadow: makeShadow(),
  });

  // CTA title inside card
  slide.addText(s.title, {
    x: cardX + 0.4,
    y: cardY + 0.3,
    w: cardW - 0.8,
    h: 1.4,
    fontSize: 22,
    fontFace: f.title,
    color: c.primary,
    align: "center",
    valign: "middle",
    wrap: true,
    lineSpacingMultiple: 1.2,
  });

  // Body inside card
  if (s.body) {
    slide.addText(s.body, {
      x: cardX + 0.4,
      y: cardY + 1.7,
      w: cardW - 0.8,
      h: 1.2,
      fontSize: 14,
      fontFace: f.body,
      color: c.text,
      align: "center",
      valign: "top",
      wrap: true,
      lineSpacingMultiple: 1.4,
    });
  }

  // "Lien en bio" pill badge below card
  const [pillText, pillOpts] = makeBadge("lien en bio", 0, 0, c.primary, f);
  const pillW = pillOpts.w as number;
  slide.addText(pillText, {
    ...pillOpts,
    x: (W - pillW) / 2,
    y: cardY + cardH + 0.5,
  });
}

// ═══ TEXT HELPERS ═══

/**
 * Highlight the last significant word (4+ chars) in accent color.
 * Returns rich text array for pptxgenjs.
 */
function highlightLastSignificantWord(
  text: string,
  accentColor: string,
  baseColor: string
): PptxGenJS.TextProps[] {
  if (!text) return [{ text: "", options: {} }];

  const words = text.split(/\s+/);
  let targetIndex = -1;
  for (let i = words.length - 1; i >= 0; i--) {
    const clean = words[i].replace(/[.,;:!?…"'()]/g, "");
    if (clean.length >= 4) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1) {
    return [{ text, options: { color: baseColor } }];
  }

  const before = words.slice(0, targetIndex).join(" ");
  const accent = words[targetIndex];
  const after = words.slice(targetIndex + 1).join(" ");

  const parts: PptxGenJS.TextProps[] = [];
  if (before) parts.push({ text: before + " ", options: { color: baseColor } });
  parts.push({ text: accent, options: { color: accentColor, italic: true } });
  if (after) parts.push({ text: " " + after, options: { color: baseColor } });

  return parts;
}
