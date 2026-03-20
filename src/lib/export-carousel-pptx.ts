import PptxGenJS from "pptxgenjs";

// ═══ TYPES ═══

interface SlideData {
  slide_number: number;
  role: string;
  title: string;
  body: string;
  visual_suggestion?: string;
  visual_schema?: any;
  // ═══ CHAMPS PHOTO ═══
  slide_type?: "photo_full" | "photo_integrated" | "text_only";
  photo_index?: number | null;
  photo_layout?: "top_photo" | "left_photo" | "right_photo" | "card_photo";
  overlay_text?: string | null;
  overlay_position?: "bottom_left" | "bottom_center" | "top_left" | "top_center" | "center";
  overlay_style?: "sensoriel" | "narratif" | "minimal" | "technique";
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

/** Accent colors that rotate for tip slides, starting with the brand primary */
function getAccentRotation(primary: string): string[] {
  return [primary, "3498db", "27AE60", "E67E22", "9B59B6"];
}

/** Factory: soft card shadow (never reuse pptxgenjs option objects) */
const makeShadow = () => ({
  type: "outer" as const,
  blur: 8,
  offset: 3,
  angle: 135,
  color: "000000",
  opacity: 0.08,
});

/** Factory: light card shadow */
const makeLightShadow = () => ({
  type: "outer" as const,
  blur: 4,
  offset: 2,
  angle: 135,
  color: "000000",
  opacity: 0.04,
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
    [{ text: text.toUpperCase(), options: { fontSize: 11, bold: true, color: "FFFFFF", fontFace: fonts.body } }],
    {
      x,
      y,
      w: Math.max(1.6, text.length * 0.13 + 0.5),
      h: 0.38,
      align: "center",
      valign: "middle",
      fill: { color: fillColor },
      shape: "roundRect" as any,
      rectRadius: 0.19,
      charSpacing: 2,
    },
  ];
}

/** Pick badge color: use accent if dark enough, otherwise fall back to primary */
function safeBadgeColor(accent: string, primary: string): string {
  const r = parseInt(accent.slice(0, 2), 16);
  const g = parseInt(accent.slice(2, 4), 16);
  const b = parseInt(accent.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? primary : accent;
}

/**
 * Compress a base64 photo for PPTX export.
 * Resizes to max 1920px wide and re-encodes as JPEG quality 0.75.
 */
function compressPhotoForPptx(base64: string, maxWidth = 1920, quality = 0.75): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = Math.round(h * (maxWidth / w));
        w = maxWidth;
      }
      if (w === img.width && img.width <= maxWidth) {
        resolve(base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(base64); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`);
    img.src = base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
  });
}


export async function exportCarouselPptx(
  slides: SlideData[],
  fileName = "carrousel",
  _visualSlides?: VisualSlide[],
  charter?: CharterColors | null,
  photos?: { base64: string }[]
) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "INSTAGRAM", width: 7.5, height: 9.375 });
  pptx.layout = "INSTAGRAM";
  pptx.author = "L'Assistant Com'";

  // ═══ Pré-compression des photos pour réduire la taille du PPTX ═══
  let compressedPhotos: { base64: string }[] | undefined;
  if (photos && photos.length > 0) {
    compressedPhotos = await Promise.all(
      photos.map(async (p) => ({
        base64: await compressPhotoForPptx(p.base64),
      }))
    );
  }

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

    // ═══ Slides photo (carrousel mix/photo) ═══
    if (s.slide_type === "photo_full" && photos?.length) {
      buildPhotoFullSlide(slide, s, c, f, W, H, photos);
      continue;
    }
    if (s.slide_type === "photo_integrated" && photos?.length) {
      buildPhotoIntegratedSlide(slide, s, c, f, W, H, PAD_X, PAD_Y, CONTENT_W, photos);
      if (category === "tip") tipIndex++;
      continue;
    }

    // If visual_schema is present and supported, use schema builder instead
    const supportedSchemaTypes = ["checklist", "before_after", "comparison", "stats", "timeline", "equation", "matrix_2x2", "pyramid", "flowchart", "scale"];
    if (s.visual_schema && s.visual_schema.type && supportedSchemaTypes.includes(s.visual_schema.type)) {
      buildSchemaSlide(slide, s, c, f, W, H, PAD_X, CONTENT_W);
      if (category === "tip") tipIndex++;
      continue;
    }

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

// ═══ PHOTO BUILDERS ═══

/**
 * PHOTO FULL — Photo plein écran via addImage + texte overlay éditable par-dessus
 */
function buildPhotoFullSlide(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, photos: { base64: string }[]
) {
  slide.background = { color: "000000" };

  const photoIdx = (s.photo_index || 1) - 1;
  const photo = photos[photoIdx] || photos[0];
  if (photo) {
    const raw = photo.base64;
    const data = raw.startsWith("data:") ? raw : `data:image/jpeg;base64,${raw}`;
    slide.addImage({
      data,
      x: 0, y: 0, w: W, h: H,
      sizing: { type: "cover", w: W, h: H },
    });
  }

  const overlayText = s.overlay_text || s.title || "";
  if (!overlayText) return;

  const style = s.overlay_style || "sensoriel";
  const position = s.overlay_position || "bottom_center";

  let textY: number, textH: number, align: "left" | "center" | "right";
  let valign: "top" | "middle" | "bottom";

  switch (position) {
    case "top_left":
      textY = 0.4; textH = 3.0; align = "left"; valign = "top"; break;
    case "top_center":
      textY = 0.4; textH = 3.0; align = "center"; valign = "top"; break;
    case "center":
      textY = (H - 3.0) / 2; textH = 3.0; align = "center"; valign = "middle"; break;
    case "bottom_left":
      textY = H - 3.5; textH = 3.0; align = "left"; valign = "bottom"; break;
    case "bottom_center":
    default:
      textY = H - 3.5; textH = 3.0; align = "center"; valign = "bottom"; break;
  }

  const isBottom = position === "bottom_left" || position === "bottom_center" || !position;
  const isTop = position === "top_left" || position === "top_center";

  if (isBottom) {
    slide.addShape("rect", {
      x: 0, y: H - 4.0, w: W, h: 4.0,
      fill: { color: "000000", transparency: 40 },
    });
  } else if (isTop) {
    slide.addShape("rect", {
      x: 0, y: 0, w: W, h: 3.5,
      fill: { color: "000000", transparency: 40 },
    });
  } else {
    slide.addShape("roundRect", {
      x: 0.5, y: textY - 0.3, w: W - 1.0, h: textH + 0.6,
      fill: { color: "000000", transparency: 50 },
      rectRadius: 0.15,
    });
  }

  let fontSize: number, fontFace: string, bold: boolean, italic: boolean;
  switch (style) {
    case "sensoriel":
      fontSize = 28; fontFace = f.title; bold = false; italic = true; break;
    case "narratif":
      fontSize = 22; fontFace = f.body; bold = false; italic = false; break;
    case "minimal":
      fontSize = 32; fontFace = f.body; bold = true; italic = false; break;
    case "technique":
      fontSize = 18; fontFace = f.body; bold = false; italic = false; break;
    default:
      fontSize = 24; fontFace = f.title; bold = false; italic = true;
  }

  // Highlight du dernier mot significatif pour narratif et minimal
  if (style === "narratif" || style === "minimal") {
    const accentColor = c.accent || c.primary;
    const parts = highlightLastSignificantWord(overlayText, accentColor, "FFFFFF");
    slide.addText(parts, {
      x: 0.6, y: textY, w: W - 1.2, h: textH,
      fontSize, fontFace, bold, italic,
      align, valign, wrap: true, lineSpacingMultiple: 1.3,
    });
  } else {
    slide.addText(overlayText, {
      x: 0.6, y: textY, w: W - 1.2, h: textH,
      fontSize, fontFace, bold, italic, color: "FFFFFF",
      align, valign, wrap: true, lineSpacingMultiple: 1.3,
    });
  }
}

/**
 * PHOTO INTEGRATED — Photo positionnée selon photo_layout + texte éditable
 */
function buildPhotoIntegratedSlide(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, _PAD_Y: number, CONTENT_W: number,
  photos: { base64: string }[]
) {
  slide.background = { color: "FFFFFF" };

  const photoIdx = (s.photo_index || 1) - 1;
  const photo = photos[photoIdx] || photos[0];
  const layout = s.photo_layout || "top_photo";

  let photoData = "";
  if (photo) {
    const raw = photo.base64;
    photoData = raw.startsWith("data:") ? raw : `data:image/jpeg;base64,${raw}`;
  }

  const roleLabel = s.role || "CONTENU";
  const [badgeText, badgeOpts] = makeBadge(roleLabel, PAD_X, 0.5, c.primary, f);

  switch (layout) {
    case "top_photo": {
      const photoH = H * 0.55;
      const textAreaY = photoH + 0.2;
      const textAreaH = H - photoH - 0.4;

      if (photoData) {
        slide.addImage({
          data: photoData,
          x: 0, y: 0, w: W, h: photoH,
          sizing: { type: "cover", w: W, h: photoH },
        });
      }
      slide.addText(badgeText, { ...badgeOpts, y: photoH - 0.6 });

      if (s.title) {
        slide.addText(s.title, {
          x: PAD_X, y: textAreaY + 0.1, w: CONTENT_W, h: 1.2,
          fontSize: 22, fontFace: f.title, color: c.secondary,
          align: "left", valign: "top", wrap: true, lineSpacingMultiple: 1.2,
        });
      }
      if (s.body) {
        slide.addText(s.body, {
          x: PAD_X, y: textAreaY + 1.4, w: CONTENT_W, h: textAreaH - 1.6,
          fontSize: 15, fontFace: f.body, color: c.text,
          align: "left", valign: "top", wrap: true, lineSpacingMultiple: 1.5,
        });
      }
      break;
    }

    case "left_photo": {
      const photoW = W * 0.45;
      const textX = photoW + 0.3;
      const textW = W - photoW - 0.3 - PAD_X;

      if (photoData) {
        slide.addImage({
          data: photoData,
          x: 0, y: 0, w: photoW, h: H,
          sizing: { type: "cover", w: photoW, h: H },
        });
      }
      slide.addText(badgeText, { ...badgeOpts, x: textX });

      if (s.title) {
        slide.addText(s.title, {
          x: textX, y: 1.3, w: textW, h: 2.0,
          fontSize: 22, fontFace: f.title, color: c.secondary,
          align: "left", valign: "top", wrap: true, lineSpacingMultiple: 1.2,
        });
      }
      if (s.body) {
        slide.addText(s.body, {
          x: textX, y: 3.5, w: textW, h: H - 4.5,
          fontSize: 15, fontFace: f.body, color: c.text,
          align: "left", valign: "top", wrap: true, lineSpacingMultiple: 1.5,
        });
      }
      break;
    }

    case "right_photo": {
      const photoW = W * 0.45;
      const textW = W - photoW - 0.3 - PAD_X;

      if (photoData) {
        slide.addImage({
          data: photoData,
          x: W - photoW, y: 0, w: photoW, h: H,
          sizing: { type: "cover", w: photoW, h: H },
        });
      }
      slide.addText(badgeText, badgeOpts);

      if (s.title) {
        slide.addText(s.title, {
          x: PAD_X, y: 1.3, w: textW, h: 2.0,
          fontSize: 22, fontFace: f.title, color: c.secondary,
          align: "left", valign: "top", wrap: true, lineSpacingMultiple: 1.2,
        });
      }
      if (s.body) {
        slide.addText(s.body, {
          x: PAD_X, y: 3.5, w: textW, h: H - 4.5,
          fontSize: 15, fontFace: f.body, color: c.text,
          align: "left", valign: "top", wrap: true, lineSpacingMultiple: 1.5,
        });
      }
      break;
    }

    case "card_photo": {
      slide.background = { color: c.bg };

      if (photoData) {
        slide.addImage({
          data: photoData,
          x: 0, y: 0, w: W, h: H,
          sizing: { type: "cover", w: W, h: H },
        });
        slide.addShape("rect", {
          x: 0, y: 0, w: W, h: H,
          fill: { color: "FFFFFF", transparency: 30 },
        });
      }

      const cardW = CONTENT_W * 0.85;
      const cardH = 5.5;
      const cardX = (W - cardW) / 2;
      const cardY = (H - cardH) / 2;

      slide.addShape("roundRect", {
        x: cardX, y: cardY, w: cardW, h: cardH,
        fill: { color: "FFFFFF" },
        rectRadius: 0.15,
        shadow: makeShadow(),
      });

      const bW = badgeOpts.w as number;
      slide.addText(badgeText, { ...badgeOpts, x: (W - bW) / 2, y: cardY + 0.4 });

      if (s.title) {
        slide.addText(s.title, {
          x: cardX + 0.4, y: cardY + 1.1, w: cardW - 0.8, h: 1.8,
          fontSize: 22, fontFace: f.title, color: c.secondary,
          align: "center", valign: "middle", wrap: true, lineSpacingMultiple: 1.2,
        });
      }
      if (s.body) {
        slide.addText(s.body, {
          x: cardX + 0.4, y: cardY + 3.0, w: cardW - 0.8, h: cardH - 3.4,
          fontSize: 15, fontFace: f.body, color: c.text,
          align: "center", valign: "top", wrap: true, lineSpacingMultiple: 1.5,
        });
      }
      break;
    }

    default: {
      const photoH = H * 0.55;
      if (photoData) {
        slide.addImage({
          data: photoData,
          x: 0, y: 0, w: W, h: photoH,
          sizing: { type: "cover", w: W, h: photoH },
        });
      }
      if (s.title) {
        slide.addText(s.title, {
          x: PAD_X, y: photoH + 0.3, w: CONTENT_W, h: 1.2,
          fontSize: 22, fontFace: f.title, color: c.secondary,
          align: "left", valign: "top", wrap: true,
        });
      }
      if (s.body) {
        slide.addText(s.body, {
          x: PAD_X, y: photoH + 1.6, w: CONTENT_W, h: H - photoH - 2.0,
          fontSize: 15, fontFace: f.body, color: c.text,
          align: "left", valign: "top", wrap: true, lineSpacingMultiple: 1.5,
        });
      }
    }
  }
}

/**
 * HOOK (slide 1) — Fond pâle, grande carte blanche centrée, badge pilule, titre fort
 */
function buildHookSlide(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  slide.background = { color: c.bg };

  // Decorative angled rectangle top-right
  slide.addShape("rect", {
    x: W - 2.2,
    y: -0.3,
    w: 2.5,
    h: 2.5,
    fill: { color: c.primary, transparency: 90 },
    rotate: 15,
  });

  // Decorative angled rectangle bottom-left
  slide.addShape("rect", {
    x: -0.5,
    y: H - 2.0,
    w: 1.8,
    h: 1.8,
    fill: { color: c.accent, transparency: 85 },
    rotate: -8,
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

  // Badge pilule centered on top of card
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
    x: cardX + cardW - 0.28,
    y: cardY + cardH - 0.28,
    w: 0.18,
    h: 0.18,
    fill: { color: c.primary },
    rectRadius: 0.02,
  });
}

/**
 * CONTEXT / STORYTELLING — Badge pilule, titre, corps dans carte blanche avec barre latérale
 */
function buildContextSlide(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, PAD_Y: number, CONTENT_W: number
) {
  slide.background = { color: "FFFFFF" };

  // Badge pilule top-left
  const roleLabel = s.role || "CONTEXTE";
  const [badgeText, badgeOpts] = makeBadge(roleLabel, PAD_X, 0.6, c.primary, f);
  slide.addText(badgeText, badgeOpts);

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

  // Body in white card with light shadow + left accent bar
  if (s.body) {
    const bodyY = 3.6;
    const bodyH = 4.2;
    const cardX = PAD_X;
    const cardW = CONTENT_W;

    // Card background with light shadow
    slide.addShape("rect", {
      x: cardX,
      y: bodyY,
      w: cardW,
      h: bodyH,
      fill: { color: "FFFFFF" },
      shadow: makeLightShadow(),
    });

    // Left accent bar
    slide.addShape("rect", {
      x: cardX,
      y: bodyY,
      w: 0.06,
      h: bodyH,
      fill: { color: c.primary },
    });

    // Emoji lightbulb at top of card
    slide.addText("💡", {
      x: cardX + 0.3,
      y: bodyY + 0.2,
      w: 0.5,
      h: 0.5,
      fontSize: 24,
      align: "left",
      valign: "top",
    });

    // Body text
    slide.addText(s.body, {
      x: cardX + 0.3,
      y: bodyY + 0.7,
      w: cardW - 0.5,
      h: bodyH - 1.0,
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
 * TIP / PÉDAGOGIQUE — Badge pilule, titre avec highlight, corps dans carte avec barre colorée
 */
function buildTipSlide(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, PAD_Y: number, CONTENT_W: number,
  tipIndex: number
) {
  slide.background = { color: "FFFFFF" };
  const accentRotation = getAccentRotation(c.primary);
  const accentColor = accentRotation[tipIndex % accentRotation.length];

  // Badge pilule top-left
  const label = s.role || `${String(s.slide_number).padStart(2, "0")}`;
  const [badgeText, badgeOpts] = makeBadge(label, PAD_X, 0.6, accentColor, f);
  slide.addText(badgeText, badgeOpts);

  // Title with highlighted last significant word
  const titleParts = highlightLastSignificantWord(s.title, accentColor, c.secondary);
  slide.addText(titleParts, {
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

    // Card background with light shadow
    slide.addShape("rect", {
      x: cardX,
      y: cardY,
      w: cardW,
      h: cardH,
      fill: { color: "FFFFFF" },
      shadow: makeLightShadow(),
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

  // Title with accent word highlighted
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

  // Body with stronger transparency for visual hierarchy
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
      transparency: 25,
    });
  }

  // Accent bar bottom center
  slide.addShape("rect", {
    x: (W - 1.8) / 2,
    y: H - 0.8,
    w: 1.8,
    h: 0.04,
    fill: { color: c.accent },
  });
}

/**
 * HOPE / ESPOIR — Fond jaune accent, badge, titre avec highlight + corps
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

  // Title with highlighted last significant word
  const titleParts = highlightLastSignificantWord(s.title, c.primary, c.primary);
  slide.addText(titleParts, {
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

  // Decorative angled rect top-left
  slide.addShape("rect", {
    x: -0.4,
    y: -0.3,
    w: 2.0,
    h: 2.0,
    fill: { color: c.primary, transparency: 92 },
    rotate: -10,
  });

  // Decorative angled rect bottom-right
  slide.addShape("rect", {
    x: W - 1.6,
    y: H - 1.6,
    w: 2.0,
    h: 2.0,
    fill: { color: c.accent, transparency: 88 },
    rotate: 12,
  });

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

  // Sparkle emoji centered above title
  slide.addText("✨", {
    x: cardX,
    y: cardY + 0.15,
    w: cardW,
    h: 0.5,
    fontSize: 22,
    align: "center",
    valign: "middle",
  });

  // CTA title inside card with highlight
  const titleParts = highlightLastSignificantWord(s.title, c.primary, c.secondary);
  slide.addText(titleParts, {
    x: cardX + 0.4,
    y: cardY + 0.6,
    w: cardW - 0.8,
    h: 1.1,
    fontSize: 22,
    fontFace: f.title,
    color: c.primary,
    align: "center",
    valign: "middle",
    wrap: true,
    lineSpacingMultiple: 1.2,
  });

  // Body inside card with slight transparency
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
      transparency: 15,
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

/**
 * Highlight a specific keyword in accent color + italic within a text.
 * Falls back to highlightLastSignificantWord if keyword not found.
 */
function highlightKeyword(
  text: string,
  keyword: string,
  accentColor: string,
  baseColor: string
): PptxGenJS.TextProps[] {
  if (!text) return [{ text: "", options: {} }];
  if (!keyword) return highlightLastSignificantWord(text, accentColor, baseColor);

  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const idx = lowerText.indexOf(lowerKeyword);

  if (idx === -1) {
    return highlightLastSignificantWord(text, accentColor, baseColor);
  }

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + keyword.length);
  const after = text.slice(idx + keyword.length);

  const parts: PptxGenJS.TextProps[] = [];
  if (before) parts.push({ text: before, options: { color: baseColor } });
  parts.push({ text: match, options: { color: accentColor, italic: true } });
  if (after) parts.push({ text: after, options: { color: baseColor } });

  return parts;
}

// ═══ SCHEMA SLIDE BUILDERS ═══

/**
 * Dispatcher: routes to the correct schema builder based on visual_schema.type
 */
function buildSchemaSlide(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  const schemaType = s.visual_schema?.type;
  switch (schemaType) {
    case "checklist":
      buildChecklistSchema(slide, s, c, f, W, H, PAD_X, CONTENT_W);
      break;
    case "before_after":
      buildBeforeAfterSchema(slide, s, c, f, W, H, PAD_X, CONTENT_W);
      break;
    case "comparison":
      buildComparisonSchema(slide, s, c, f, W, H, PAD_X, CONTENT_W);
      break;
    case "stats":
      buildStatsSchema(slide, s, c, f, W, H, PAD_X, CONTENT_W);
      break;
    case "timeline":
      buildTimelineSchema(slide, s, c, f, W, H, PAD_X, CONTENT_W);
      break;
    case "equation":
      buildEquationSchema(slide, s, c, f, W, H, PAD_X, CONTENT_W);
      break;
    case "matrix_2x2":
      buildMatrix2x2Schema(slide, s, c, f, W, H, PAD_X, CONTENT_W);
      break;
    case "pyramid":
      buildPyramidSchema(slide, s, c, f, W, H, PAD_X, CONTENT_W);
      break;
    case "flowchart":
      buildFlowchartSchema(slide, s, c, f, W, H, PAD_X, CONTENT_W);
      break;
    case "scale":
      buildScaleSchema(slide, s, c, f, W, H, PAD_X, CONTENT_W);
      break;
  }
}

/**
 * CHECKLIST — Cards with green/red sidebar + check/cross emojis
 */
function buildChecklistSchema(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  slide.background = { color: c.bg };

  // Badge pilule
  const [badgeText, badgeOpts] = makeBadge("CHECKLIST", PAD_X, 0.6, c.primary, f);
  slide.addText(badgeText, badgeOpts);

  // Title with highlighted keyword
  const schemaTitle = s.visual_schema?.title || s.title;
  const titleParts = highlightLastSignificantWord(schemaTitle, c.primary, c.secondary);
  slide.addText(titleParts, {
    x: PAD_X,
    y: 1.3,
    w: CONTENT_W,
    h: 1.4,
    fontSize: 22,
    fontFace: f.title,
    color: c.secondary,
    align: "left",
    valign: "middle",
    wrap: true,
    lineSpacingMultiple: 1.2,
  });

  // Items
  const items: any[] = s.visual_schema?.items || [];
  const ITEM_H = 1.15;
  const GAP = 0.25;
  const adjustedItemH = items.length > 5 ? 0.9 : ITEM_H;
  const adjustedGap = items.length > 5 ? 0.15 : GAP;
  const maxItems = Math.min(items.length, Math.floor((H - 3.5) / (adjustedItemH + adjustedGap)));
  const actualItems = items.slice(0, maxItems);
  let startY = 2.9;

  for (let idx = 0; idx < actualItems.length; idx++) {
    const item = actualItems[idx];
    const checked = !!item.checked;
    const barColor = checked ? "27AE60" : "E74C3C";
    const emoji = checked ? "✅" : "❌";
    const itemY = startY + idx * (adjustedItemH + adjustedGap);

    // Card background
    slide.addShape("roundRect", {
      x: PAD_X,
      y: itemY,
      w: CONTENT_W,
      h: adjustedItemH,
      fill: { color: "FFFFFF" },
      rectRadius: 0.1,
      shadow: makeLightShadow(),
    });

    // Left accent bar
    slide.addShape("rect", {
      x: PAD_X,
      y: itemY,
      w: 0.06,
      h: adjustedItemH,
      fill: { color: barColor },
    });

    // Emoji
    slide.addText(emoji, {
      x: PAD_X + 0.2,
      y: itemY,
      w: 0.5,
      h: adjustedItemH,
      fontSize: 22,
      align: "center",
      valign: "middle",
    });

    // Item text
    const itemText = item.text || item.label || "";
    slide.addText(itemText, {
      x: PAD_X + 0.75,
      y: itemY,
      w: CONTENT_W - 1.0,
      h: adjustedItemH,
      fontSize: items.length > 5 ? 13 : (itemText.length > 60 ? 13 : 15),
      fontFace: f.body,
      color: c.text,
      align: "left",
      valign: "middle",
      wrap: true,
      lineSpacingMultiple: 1.3,
    });
  }
}

/**
 * BEFORE / AFTER — Two columns with red/green sidebars
 */
function buildBeforeAfterSchema(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  slide.background = { color: "FFFFFF" };

  // Badge pilule accent centered
  const [badgeText, badgeOpts] = makeBadge("AVANT / APRÈS", 0, 0, safeBadgeColor(c.accent, c.primary), f);
  const badgeW = badgeOpts.w as number;
  slide.addText(badgeText, { ...badgeOpts, x: (W - badgeW) / 2, y: 0.6 });

  // Title
  const schemaTitle = s.visual_schema?.title || s.title;
  const titleParts = highlightLastSignificantWord(schemaTitle, "27AE60", c.secondary);
  slide.addText(titleParts, {
    x: PAD_X,
    y: 1.2,
    w: CONTENT_W,
    h: 1.2,
    fontSize: 22,
    fontFace: f.title,
    color: c.secondary,
    align: "center",
    valign: "middle",
    wrap: true,
    lineSpacingMultiple: 1.2,
  });

  // Read items from nested or flat structure
  const beforeItems: any[] = s.visual_schema?.before?.items || s.visual_schema?.before_items || (Array.isArray(s.visual_schema?.before) ? s.visual_schema.before : []);
  const afterItems: any[] = s.visual_schema?.after?.items || s.visual_schema?.after_items || (Array.isArray(s.visual_schema?.after) ? s.visual_schema.after : []);
  const beforeLabel = s.visual_schema?.before?.label || "AVANT";
  const afterLabel = s.visual_schema?.after?.label || "APRÈS";

  const colW = (CONTENT_W - 0.5) / 2;
  const maxItemCount = Math.max(beforeItems.length, afterItems.length, 1);
  const itemSpacing = 0.85;
  const colH = Math.min(6.0, 0.7 + maxItemCount * itemSpacing + 0.3);
  const colY = 2.6;
  const leftX = PAD_X;
  const rightX = PAD_X + colW + 0.5;

  // Left column card (AVANT)
  slide.addShape("roundRect", {
    x: leftX, y: colY, w: colW, h: colH,
    fill: { color: "FFFFFF" }, rectRadius: 0.1, shadow: makeLightShadow(),
  });
  slide.addShape("rect", {
    x: leftX, y: colY, w: 0.06, h: colH, fill: { color: "E74C3C" },
  });

  // Right column card (APRÈS)
  slide.addShape("roundRect", {
    x: rightX, y: colY, w: colW, h: colH,
    fill: { color: "FFFFFF" }, rectRadius: 0.1, shadow: makeLightShadow(),
  });
  slide.addShape("rect", {
    x: rightX, y: colY, w: 0.06, h: colH, fill: { color: "27AE60" },
  });

  // Column headers
  slide.addText(`❌ ${beforeLabel.toUpperCase()}`, {
    x: leftX + 0.2, y: colY + 0.15, w: colW - 0.4, h: 0.45,
    fontSize: 14, fontFace: f.body, color: "E74C3C", bold: true, align: "center", valign: "middle",
  });
  slide.addText(`✅ ${afterLabel.toUpperCase()}`, {
    x: rightX + 0.2, y: colY + 0.15, w: colW - 0.4, h: 0.45,
    fontSize: 14, fontFace: f.body, color: "27AE60", bold: true, align: "center", valign: "middle",
  });

  // Items (limit to 6)
  const renderColumnItems = (items: any[], x: number, startItemY: number, w: number) => {
    const displayItems = items.slice(0, 6);
    for (let idx = 0; idx < displayItems.length; idx++) {
      const itemText = typeof displayItems[idx] === "string" ? displayItems[idx] : displayItems[idx]?.text || "";
      const itemY = startItemY + idx * 0.85;

      // Separator
      if (idx > 0) {
        slide.addShape("rect", {
          x: x + 0.15, y: itemY - 0.05, w: w - 0.3, h: 0.01, fill: { color: "EEEEEE" },
        });
      }

      slide.addText(itemText, {
        x: x + 0.2, y: itemY, w: w - 0.4, h: 0.75,
        fontSize: itemText.length > 50 ? 13 : 14, fontFace: f.body, color: c.text,
        align: "left", valign: "middle", wrap: true, lineSpacingMultiple: 1.3,
      });
    }
  };

  renderColumnItems(beforeItems, leftX, colY + 0.7, colW);
  renderColumnItems(afterItems, rightX, colY + 0.7, colW);

  // Arrow between columns
  slide.addText("→", {
    x: leftX + colW, y: colY, w: 0.5, h: colH,
    fontSize: 28, fontFace: f.title, color: c.primary, align: "center", valign: "middle",
  });
}

/**
 * COMPARISON — Like before/after but with dynamic labels from schema
 */
function buildComparisonSchema(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  slide.background = { color: "FFFFFF" };

  const leftLabel = s.visual_schema?.left?.label || "Option A";
  const rightLabel = s.visual_schema?.right?.label || "Option B";

  // Determine colors from emojis in labels
  const getColorFromLabel = (label: string, fallback: string): string => {
    if (label.includes("❌")) return "E74C3C";
    if (label.includes("✅")) return "27AE60";
    return fallback;
  };
  const leftColor = getColorFromLabel(leftLabel, c.primary);
  const rightColor = getColorFromLabel(rightLabel, "3498db");

  // Badge centered
  const badgeLabel = s.visual_schema?.badge || "COMPARAISON";
  const [badgeText, badgeOpts] = makeBadge(badgeLabel, 0, 0, c.primary, f);
  const badgeW = badgeOpts.w as number;
  slide.addText(badgeText, { ...badgeOpts, x: (W - badgeW) / 2, y: 0.6 });

  // Title
  const schemaTitle = s.visual_schema?.title || s.title;
  const titleParts = highlightLastSignificantWord(schemaTitle, c.primary, c.secondary);
  slide.addText(titleParts, {
    x: PAD_X, y: 1.2, w: CONTENT_W, h: 1.2,
    fontSize: 22, fontFace: f.title, color: c.secondary,
    align: "center", valign: "middle", wrap: true, lineSpacingMultiple: 1.2,
  });

  // Items
  const leftItems: any[] = s.visual_schema?.left?.items || [];
  const rightItems: any[] = s.visual_schema?.right?.items || [];

  const colW = (CONTENT_W - 0.5) / 2;
  const maxItemCount = Math.max(leftItems.length, rightItems.length, 1);
  const itemSpacing = 0.85;
  const colH = Math.min(6.0, 0.7 + maxItemCount * itemSpacing + 0.3);
  const colY = 2.6;
  const leftX = PAD_X;
  const rightX = PAD_X + colW + 0.5;

  // Left column card
  slide.addShape("roundRect", {
    x: leftX, y: colY, w: colW, h: colH,
    fill: { color: "FFFFFF" }, rectRadius: 0.1, shadow: makeLightShadow(),
  });
  slide.addShape("rect", {
    x: leftX, y: colY, w: 0.06, h: colH, fill: { color: leftColor },
  });

  // Right column card
  slide.addShape("roundRect", {
    x: rightX, y: colY, w: colW, h: colH,
    fill: { color: "FFFFFF" }, rectRadius: 0.1, shadow: makeLightShadow(),
  });
  slide.addShape("rect", {
    x: rightX, y: colY, w: 0.06, h: colH, fill: { color: rightColor },
  });

  // Column headers
  slide.addText(leftLabel, {
    x: leftX + 0.2, y: colY + 0.15, w: colW - 0.4, h: 0.45,
    fontSize: 14, fontFace: f.body, color: leftColor, bold: true, align: "center", valign: "middle",
  });
  slide.addText(rightLabel, {
    x: rightX + 0.2, y: colY + 0.15, w: colW - 0.4, h: 0.45,
    fontSize: 14, fontFace: f.body, color: rightColor, bold: true, align: "center", valign: "middle",
  });

  const renderItems = (items: any[], x: number, startItemY: number, w: number) => {
    const displayItems = items.slice(0, 6);
    for (let idx = 0; idx < displayItems.length; idx++) {
      const itemText = typeof displayItems[idx] === "string" ? displayItems[idx] : displayItems[idx]?.text || "";
      const itemY = startItemY + idx * 0.85;
      if (idx > 0) {
        slide.addShape("rect", {
          x: x + 0.15, y: itemY - 0.05, w: w - 0.3, h: 0.01, fill: { color: "EEEEEE" },
        });
      }
      slide.addText(itemText, {
        x: x + 0.2, y: itemY, w: w - 0.4, h: 0.75,
        fontSize: itemText.length > 50 ? 13 : 14, fontFace: f.body, color: c.text,
        align: "left", valign: "middle", wrap: true, lineSpacingMultiple: 1.3,
      });
    }
  };

  renderItems(leftItems, leftX, colY + 0.7, colW);
  renderItems(rightItems, rightX, colY + 0.7, colW);

  // Arrow between columns
  slide.addText("→", {
    x: leftX + colW, y: colY, w: 0.5, h: colH,
    fontSize: 28, fontFace: f.title, color: c.primary, align: "center", valign: "middle",
  });
}

/**
 * STATS — Big numbers with labels, 1-3 columns
 */
function buildStatsSchema(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  slide.background = { color: "FFFFFF" };

  // Badge
  const [badgeText, badgeOpts] = makeBadge("CHIFFRES CLÉS", 0, 0, c.primary, f);
  const badgeW = badgeOpts.w as number;
  slide.addText(badgeText, { ...badgeOpts, x: (W - badgeW) / 2, y: 0.6 });

  // Title if present
  const schemaTitle = s.visual_schema?.title || s.title;
  if (schemaTitle) {
    const titleParts = highlightLastSignificantWord(schemaTitle, c.primary, c.secondary);
    slide.addText(titleParts, {
      x: PAD_X, y: 1.2, w: CONTENT_W, h: 1.2,
      fontSize: 22, fontFace: f.title, color: c.secondary,
      align: "center", valign: "middle", wrap: true, lineSpacingMultiple: 1.2,
    });
  }

  const stats: any[] = s.visual_schema?.items || s.visual_schema?.stats || [];
  const count = Math.min(stats.length, 3);
  if (count === 0) return;

  const statsY = 3.0;
  const statsH = 4.0;
  const colW = CONTENT_W / count;

  for (let idx = 0; idx < count; idx++) {
    const stat = stats[idx];
    const value = stat.value || stat.number || "0";
    const label = stat.label || stat.text || "";
    const colX = PAD_X + idx * colW;

    // Big number
    slide.addText(String(value), {
      x: colX, y: statsY, w: colW, h: 2.0,
      fontSize: 52, fontFace: f.title, color: c.primary, bold: true,
      align: "center", valign: "bottom",
    });

    // Label
    slide.addText(label, {
      x: colX + 0.15, y: statsY + 2.2, w: colW - 0.3, h: 1.5,
      fontSize: 16, fontFace: f.body, color: c.text,
      align: "center", valign: "top", wrap: true, lineSpacingMultiple: 1.4,
      transparency: 20,
    });

    // Vertical separator between stats
    if (idx > 0) {
      slide.addShape("rect", {
        x: colX - 0.01, y: statsY + 0.3, w: 0.02, h: 2.0,
        fill: { color: "EEEEEE" },
      });
    }
  }
}

// ═══ NEW SCHEMA BUILDERS ═══

/**
 * TIMELINE — Vertical line with numbered steps
 */
function buildTimelineSchema(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  slide.background = { color: "FFFFFF" };

  // Badge
  const [badgeText, badgeOpts] = makeBadge("TIMELINE", PAD_X, 0.6, c.primary, f);
  slide.addText(badgeText, badgeOpts);

  // Title
  const schemaTitle = s.visual_schema?.title || s.title;
  const titleParts = highlightLastSignificantWord(schemaTitle, c.primary, c.secondary);
  slide.addText(titleParts, {
    x: PAD_X, y: 1.2, w: CONTENT_W, h: 1.1,
    fontSize: 22, fontFace: f.title, color: c.secondary,
    align: "left", valign: "middle", wrap: true, lineSpacingMultiple: 1.2,
  });

  const steps: any[] = s.visual_schema?.steps || s.visual_schema?.items || [];
  const count = Math.min(steps.length, 6);
  if (count === 0) return;

  const startY = 2.5;
  const endY = H - 1.0;
  const stepSpacing = (endY - startY) / Math.max(count - 1, 1);
  const lineX = PAD_X + 0.8;

  // Vertical line
  slide.addShape("rect", {
    x: lineX - 0.02, y: startY + 0.15,
    w: 0.04, h: (count - 1) * stepSpacing,
    fill: { color: c.primary },
  });

  const fontSize = count > 4 ? 14 : 18;
  const descFontSize = count > 4 ? 12 : 14;

  for (let idx = 0; idx < count; idx++) {
    const step = steps[idx];
    const stepY = startY + idx * stepSpacing;
    const label = step.label || step.text || `Étape ${idx + 1}`;
    const desc = step.desc || step.description || "";

    // Check if label has emoji
    const emojiMatch = label.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u);
    const displayNum = emojiMatch ? emojiMatch[0] : String(idx + 1);

    // Square on the line
    slide.addShape("roundRect", {
      x: lineX - 0.15, y: stepY, w: 0.3, h: 0.3,
      fill: { color: c.primary }, rectRadius: 0.04,
    });

    // Number/emoji inside square
    slide.addText(displayNum, {
      x: lineX - 0.15, y: stepY, w: 0.3, h: 0.3,
      fontSize: 14, bold: true, color: "FFFFFF",
      align: "center", valign: "middle",
    });

    // Label
    slide.addText(label, {
      x: lineX + 0.35, y: stepY - 0.05, w: CONTENT_W - 1.4, h: 0.35,
      fontSize, fontFace: f.body, color: c.secondary, bold: true,
      align: "left", valign: "middle", wrap: true,
    });

    // Description
    if (desc) {
      slide.addText(desc, {
        x: lineX + 0.35, y: stepY + 0.3, w: CONTENT_W - 1.4, h: 0.5,
        fontSize: descFontSize, fontFace: f.body, color: c.text,
        align: "left", valign: "top", wrap: true, lineSpacingMultiple: 1.3,
      });
    }
  }
}

/**
 * EQUATION — Horizontal formula: part + part = result
 */
function buildEquationSchema(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  slide.background = { color: c.bg };

  // Badge
  const [badgeText, badgeOpts] = makeBadge("FORMULE", 0, 0, safeBadgeColor(c.accent, c.primary), f);
  const badgeW = badgeOpts.w as number;
  slide.addText(badgeText, { ...badgeOpts, x: (W - badgeW) / 2, y: 0.6 });

  // Title
  const schemaTitle = s.visual_schema?.title || s.title;
  if (schemaTitle) {
    const titleParts = highlightLastSignificantWord(schemaTitle, c.primary, c.secondary);
    slide.addText(titleParts, {
      x: PAD_X, y: 1.2, w: CONTENT_W, h: 1.0,
      fontSize: 22, fontFace: f.title, color: c.secondary,
      align: "center", valign: "middle", wrap: true, lineSpacingMultiple: 1.2,
    });
  }

  const parts: any[] = s.visual_schema?.parts || [];
  const result = s.visual_schema?.result || "";
  const operator = s.visual_schema?.operator || "+";
  const totalCards = parts.length + 1; // parts + result
  const operatorCount = parts.length; // operators between parts + "="
  
  const cardW = Math.min(1.8, (CONTENT_W - operatorCount * 0.5) / totalCards);
  const opW = 0.5;
  const totalW = totalCards * cardW + operatorCount * opW;
  const startX = (W - totalW) / 2;
  const cardH = 1.2;
  const centerY = H / 2 - cardH / 2;

  let curX = startX;
  for (let idx = 0; idx < parts.length; idx++) {
    const part = parts[idx];
    const label = typeof part === "string" ? part : part.label || part.text || "";

    // Part card
    slide.addShape("roundRect", {
      x: curX, y: centerY, w: cardW, h: cardH,
      fill: { color: "FFFFFF" }, rectRadius: 0.1, shadow: makeLightShadow(),
    });
    slide.addText(label, {
      x: curX, y: centerY, w: cardW, h: cardH,
      fontSize: label.length > 15 ? 16 : 22, fontFace: f.body, color: c.secondary,
      bold: true, align: "center", valign: "middle", wrap: true,
    });
    curX += cardW;

    // Operator
    const opSymbol = idx < parts.length - 1 ? operator : "=";
    slide.addText(opSymbol, {
      x: curX, y: centerY, w: opW, h: cardH,
      fontSize: 36, fontFace: f.title, color: c.primary,
      align: "center", valign: "middle",
    });
    curX += opW;
  }

  // Result card
  const resultLabel = typeof result === "string" ? result : result.label || result.text || "";
  slide.addShape("roundRect", {
    x: curX, y: centerY, w: cardW, h: cardH,
    fill: { color: c.primary }, rectRadius: 0.1,
  });
  slide.addText(resultLabel, {
    x: curX, y: centerY, w: cardW, h: cardH,
    fontSize: resultLabel.length > 15 ? 16 : 22, fontFace: f.body, color: "FFFFFF",
    bold: true, align: "center", valign: "middle", wrap: true,
  });
}

/**
 * MATRIX 2×2 — Four quadrants with emojis and labels
 */
function buildMatrix2x2Schema(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  slide.background = { color: "FFFFFF" };

  // Badge
  const [badgeText, badgeOpts] = makeBadge("MATRICE", 0, 0, c.primary, f);
  const badgeW = badgeOpts.w as number;
  slide.addText(badgeText, { ...badgeOpts, x: (W - badgeW) / 2, y: 0.5 });

  // Title
  const schemaTitle = s.visual_schema?.title || s.title;
  if (schemaTitle) {
    const titleParts = highlightLastSignificantWord(schemaTitle, c.primary, c.secondary);
    slide.addText(titleParts, {
      x: PAD_X, y: 1.0, w: CONTENT_W, h: 1.0,
      fontSize: 20, fontFace: f.title, color: c.secondary,
      align: "center", valign: "middle", wrap: true,
    });
  }

  const quadrants = s.visual_schema?.quadrants || [];
  const COLORS = ["3498db", "E67E22", "27AE60", "9B59B6"];
  const qW = 2.8;
  const qH = 2.8;
  const gap = 0.3;
  const gridW = qW * 2 + gap;
  const gridStartX = (W - gridW) / 2;
  const gridStartY = 2.5;

  const positions = [
    { x: gridStartX, y: gridStartY },
    { x: gridStartX + qW + gap, y: gridStartY },
    { x: gridStartX, y: gridStartY + qH + gap },
    { x: gridStartX + qW + gap, y: gridStartY + qH + gap },
  ];

  for (let idx = 0; idx < 4; idx++) {
    const q = quadrants[idx] || {};
    const pos = positions[idx];
    const qColor = COLORS[idx];

    // Quadrant card
    slide.addShape("roundRect", {
      x: pos.x, y: pos.y, w: qW, h: qH,
      fill: { color: qColor, transparency: 90 }, rectRadius: 0.1,
      shadow: makeLightShadow(),
    });

    // Emoji
    const emoji = q.emoji || "";
    if (emoji) {
      slide.addText(emoji, {
        x: pos.x, y: pos.y + 0.4, w: qW, h: 0.6,
        fontSize: 32, align: "center", valign: "middle",
      });
    }

    // Label
    const label = q.label || "";
    if (label) {
      slide.addText(label, {
        x: pos.x + 0.2, y: pos.y + (emoji ? 1.1 : 0.6), w: qW - 0.4, h: qH - (emoji ? 1.6 : 1.2),
        fontSize: 16, fontFace: f.body, color: c.text, bold: true,
        align: "center", valign: "top", wrap: true, lineSpacingMultiple: 1.3,
      });
    }
  }

  // Axis labels
  const xAxis = s.visual_schema?.x_axis || {};
  const yAxis = s.visual_schema?.y_axis || {};

  if (xAxis.left) {
    slide.addText(xAxis.left, {
      x: gridStartX, y: gridStartY + qH * 2 + gap + 0.2, w: qW, h: 0.35,
      fontSize: 11, fontFace: f.body, color: c.text, align: "center", valign: "middle", transparency: 30,
    });
  }
  if (xAxis.right) {
    slide.addText(xAxis.right, {
      x: gridStartX + qW + gap, y: gridStartY + qH * 2 + gap + 0.2, w: qW, h: 0.35,
      fontSize: 11, fontFace: f.body, color: c.text, align: "center", valign: "middle", transparency: 30,
    });
  }
  if (yAxis.top) {
    slide.addText(yAxis.top, {
      x: gridStartX - 1.0, y: gridStartY, w: 0.9, h: qH,
      fontSize: 11, fontFace: f.body, color: c.text, align: "center", valign: "middle",
      rotate: 270, transparency: 30,
    });
  }
  if (yAxis.bottom) {
    slide.addText(yAxis.bottom, {
      x: gridStartX - 1.0, y: gridStartY + qH + gap, w: 0.9, h: qH,
      fontSize: 11, fontFace: f.body, color: c.text, align: "center", valign: "middle",
      rotate: 270, transparency: 30,
    });
  }
}

/**
 * PYRAMID — Stacked levels from narrow top to wide base
 */
function buildPyramidSchema(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  slide.background = { color: c.bg };

  // Badge
  const [badgeText, badgeOpts] = makeBadge("HIÉRARCHIE", 0, 0, c.primary, f);
  const bbW = badgeOpts.w as number;
  slide.addText(badgeText, { ...badgeOpts, x: (W - bbW) / 2, y: 0.6 });

  // Title
  const schemaTitle = s.visual_schema?.title || s.title;
  if (schemaTitle) {
    const titleParts = highlightLastSignificantWord(schemaTitle, c.primary, c.secondary);
    slide.addText(titleParts, {
      x: PAD_X, y: 1.2, w: CONTENT_W, h: 1.0,
      fontSize: 22, fontFace: f.title, color: c.secondary,
      align: "center", valign: "middle", wrap: true,
    });
  }

  const levels: any[] = s.visual_schema?.levels || s.visual_schema?.items || [];
  const count = Math.min(levels.length, 6);
  if (count === 0) return;

  const startY = 2.5;
  const availableH = H - 4.0;
  const levelH = (availableH - (count - 1) * 0.15) / count;
  const gap = 0.15;
  const minW = CONTENT_W * 0.4;
  const maxW = CONTENT_W * 0.95;

  // Transparency steps for gradient effect
  const getTransparency = (idx: number): number => {
    if (count <= 1) return 0;
    return Math.round((idx / (count - 1)) * 70);
  };

  for (let idx = 0; idx < count; idx++) {
    const level = levels[idx];
    const label = level.label || level.text || "";
    const desc = level.desc || level.description || "";
    const levelW = minW + (maxW - minW) * (idx / Math.max(count - 1, 1));
    const levelX = (W - levelW) / 2;
    const levelY = startY + idx * (levelH + gap);
    const transparency = getTransparency(idx);
    const isDark = transparency < 40;

    // Level rectangle
    slide.addShape("roundRect", {
      x: levelX, y: levelY, w: levelW, h: levelH,
      fill: { color: c.primary, transparency },
      rectRadius: 0.08,
    });

    // Label
    const textColor = isDark ? "FFFFFF" : c.secondary;
    slide.addText(label, {
      x: levelX + 0.2, y: levelY + (desc ? 0.05 : 0), w: levelW - 0.4,
      h: desc ? levelH * 0.55 : levelH,
      fontSize: count > 4 ? 15 : 18, fontFace: f.body, color: textColor, bold: true,
      align: "center", valign: desc ? "bottom" : "middle", wrap: true,
    });

    // Description
    if (desc) {
      slide.addText(desc, {
        x: levelX + 0.2, y: levelY + levelH * 0.5, w: levelW - 0.4, h: levelH * 0.45,
        fontSize: count > 4 ? 10 : 12, fontFace: f.body, color: textColor,
        align: "center", valign: "top", wrap: true, transparency: isDark ? 20 : 0,
      });
    }
  }
}

/**
 * FLOWCHART — Decision tree with question and branches
 */
function buildFlowchartSchema(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  slide.background = { color: "FFFFFF" };

  // Badge
  const [badgeText, badgeOpts] = makeBadge("DÉCISION", PAD_X, 0.6, c.primary, f);
  slide.addText(badgeText, badgeOpts);

  // Title
  const schemaTitle = s.visual_schema?.title || s.title;
  if (schemaTitle) {
    const titleParts = highlightLastSignificantWord(schemaTitle, c.primary, c.secondary);
    slide.addText(titleParts, {
      x: PAD_X, y: 1.2, w: CONTENT_W, h: 0.8,
      fontSize: 20, fontFace: f.title, color: c.secondary,
      align: "center", valign: "middle", wrap: true,
    });
  }

  // Start question box
  const startText = s.visual_schema?.start || s.visual_schema?.question || "";
  const questionW = 4.0;
  const questionH = 0.8;
  const questionX = (W - questionW) / 2;
  const questionY = 2.2;

  slide.addShape("roundRect", {
    x: questionX, y: questionY, w: questionW, h: questionH,
    fill: { color: c.primary }, rectRadius: 0.15,
  });
  slide.addText(startText, {
    x: questionX, y: questionY, w: questionW, h: questionH,
    fontSize: 18, fontFace: f.body, color: "FFFFFF", bold: true,
    align: "center", valign: "middle", wrap: true,
  });

  // Vertical connector line
  slide.addShape("rect", {
    x: W / 2 - 0.02, y: questionY + questionH,
    w: 0.04, h: 0.8,
    fill: { color: c.primary },
  });

  const branches: any[] = s.visual_schema?.branches || [];
  const branchCount = Math.min(branches.length, 4);
  const BRANCH_COLORS = ["3498db", "27AE60", "E67E22", "9B59B6"];

  if (branchCount === 2) {
    // Side by side
    const branchW = (CONTENT_W - 0.5) / 2;
    const branchY = 4.0;
    const branchH = 3.5;
    const leftBX = PAD_X;
    const rightBX = PAD_X + branchW + 0.5;

    for (let idx = 0; idx < 2; idx++) {
      const branch = branches[idx];
      const bx = idx === 0 ? leftBX : rightBX;
      const bColor = BRANCH_COLORS[idx];
      const condition = branch.condition || branch.label || "";
      const result = branch.result || branch.text || "";

      // Branch card
      slide.addShape("roundRect", {
        x: bx, y: branchY, w: branchW, h: branchH,
        fill: { color: bColor, transparency: 90 }, rectRadius: 0.1,
        shadow: makeLightShadow(),
      });

      // Condition text
      slide.addText(condition, {
        x: bx + 0.2, y: branchY + 0.2, w: branchW - 0.4, h: 1.2,
        fontSize: 14, fontFace: f.body, color: c.text,
        align: "center", valign: "middle", wrap: true, lineSpacingMultiple: 1.3,
      });

      // Result badge
      if (result) {
        const [rBadgeText, rBadgeOpts] = makeBadge(result, 0, 0, bColor, f);
        const rBW = rBadgeOpts.w as number;
        slide.addText(rBadgeText, {
          ...rBadgeOpts,
          x: bx + (branchW - Math.min(rBW, branchW - 0.4)) / 2,
          y: branchY + branchH - 0.8,
          w: Math.min(rBW, branchW - 0.4),
        });
      }
    }

    // Horizontal connector
    slide.addShape("rect", {
      x: leftBX + branchW / 2, y: questionY + questionH + 0.8 - 0.02,
      w: rightBX + branchW / 2 - (leftBX + branchW / 2), h: 0.04,
      fill: { color: c.primary },
    });
  } else if (branchCount >= 3) {
    // Stacked vertically
    const branchY = 3.8;
    const branchSpacing = Math.min(1.4, (H - branchY - 0.5) / branchCount);

    for (let idx = 0; idx < branchCount; idx++) {
      const branch = branches[idx];
      const by = branchY + idx * branchSpacing;
      const bColor = BRANCH_COLORS[idx % BRANCH_COLORS.length];
      const condition = branch.condition || branch.label || "";
      const result = branch.result || branch.text || "";

      // Branch card
      slide.addShape("roundRect", {
        x: PAD_X, y: by, w: CONTENT_W * 0.6, h: branchSpacing - 0.15,
        fill: { color: bColor, transparency: 90 }, rectRadius: 0.1,
      });

      slide.addText(condition, {
        x: PAD_X + 0.2, y: by, w: CONTENT_W * 0.6 - 0.4, h: branchSpacing - 0.15,
        fontSize: branchCount > 4 ? 12 : 14, fontFace: f.body, color: c.text,
        align: "left", valign: "middle", wrap: true,
      });

      // Result badge to the right
      if (result) {
        const [rBadgeText, rBadgeOpts] = makeBadge(result, 0, 0, bColor, f);
        slide.addText(rBadgeText, {
          ...rBadgeOpts,
          x: PAD_X + CONTENT_W * 0.65,
          y: by + (branchSpacing - 0.15) / 2 - 0.19,
        });
      }

      // Connection line
      if (idx > 0) {
        const connH = branchSpacing * 0.15;
        slide.addShape("rect", {
          x: PAD_X + 0.4, y: by - connH,
          w: 0.04, h: connH,
          fill: { color: c.primary },
        });
      }
    }
  }
}

/**
 * SCALE — Horizontal spectrum bar with marker
 */
function buildScaleSchema(
  slide: any, s: SlideData, c: Colors, f: Fonts,
  W: number, H: number, PAD_X: number, CONTENT_W: number
) {
  slide.background = { color: "FFFFFF" };

  // Badge
  const [badgeText, badgeOpts] = makeBadge("SPECTRE", 0, 0, c.primary, f);
  const bbW = badgeOpts.w as number;
  slide.addText(badgeText, { ...badgeOpts, x: (W - bbW) / 2, y: 0.6 });

  // Title
  const schemaTitle = s.visual_schema?.title || s.title;
  if (schemaTitle) {
    const titleParts = highlightLastSignificantWord(schemaTitle, c.primary, c.secondary);
    slide.addText(titleParts, {
      x: PAD_X, y: 1.2, w: CONTENT_W, h: 1.2,
      fontSize: 22, fontFace: f.title, color: c.secondary,
      align: "center", valign: "middle", wrap: true, lineSpacingMultiple: 1.2,
    });
  }

  // Gradient bar (3 segments: red → orange → green)
  const barW = CONTENT_W - 1.0;
  const barH = 0.5;
  const barX = (W - barW) / 2;
  const barY = H / 2;
  const segW = barW / 3;
  const GRADIENT_COLORS = ["E74C3C", "F39C12", "27AE60"];

  // Left segment (rounded left corners)
  slide.addShape("roundRect", {
    x: barX, y: barY, w: segW + 0.05, h: barH,
    fill: { color: GRADIENT_COLORS[0] }, rectRadius: 0.25,
  });
  // Middle segment (cover left segment's right rounding)
  slide.addShape("rect", {
    x: barX + segW - 0.02, y: barY, w: segW + 0.04, h: barH,
    fill: { color: GRADIENT_COLORS[1] },
  });
  // Right segment (rounded right corners)
  slide.addShape("roundRect", {
    x: barX + segW * 2 - 0.05, y: barY, w: segW + 0.05, h: barH,
    fill: { color: GRADIENT_COLORS[2] }, rectRadius: 0.25,
  });

  // Left label
  const leftLabel = s.visual_schema?.left?.label || "";
  const leftEmoji = s.visual_schema?.left?.emoji || "";
  if (leftLabel || leftEmoji) {
    slide.addText(`${leftEmoji} ${leftLabel}`.trim(), {
      x: barX - 0.2, y: barY + barH + 0.2, w: barW * 0.4, h: 0.4,
      fontSize: 13, fontFace: f.body, color: c.text, align: "left", valign: "middle",
    });
  }

  // Right label
  const rightLabel = s.visual_schema?.right?.label || "";
  const rightEmoji = s.visual_schema?.right?.emoji || "";
  if (rightLabel || rightEmoji) {
    slide.addText(`${rightLabel} ${rightEmoji}`.trim(), {
      x: barX + barW * 0.6 + 0.2, y: barY + barH + 0.2, w: barW * 0.4, h: 0.4,
      fontSize: 13, fontFace: f.body, color: c.text, align: "right", valign: "middle",
    });
  }

  // Marker
  const marker = s.visual_schema?.marker;
  if (marker) {
    const position = Math.max(0, Math.min(100, marker.position || 50));
    const markerX = barX + (position / 100) * barW;
    const markerLabel = marker.label || "";

    // Marker triangle (small rect as pointer)
    slide.addShape("rect", {
      x: markerX - 0.08, y: barY - 0.2,
      w: 0.16, h: 0.2,
      fill: { color: c.primary },
    });

    // Marker dot on bar
    slide.addShape("roundRect", {
      x: markerX - 0.12, y: barY + 0.05,
      w: 0.24, h: 0.4,
      fill: { color: c.primary }, rectRadius: 0.12,
    });

    // Marker label above
    if (markerLabel) {
      slide.addText(markerLabel, {
        x: markerX - 1.2, y: barY - 0.9, w: 2.4, h: 0.6,
        fontSize: 14, fontFace: f.body, color: c.primary, bold: true,
        align: "center", valign: "bottom",
      });
    }
  }
}
