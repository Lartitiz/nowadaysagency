import PptxGenJS from "pptxgenjs";
import { fitFontToBox } from "./pptx-font-mapping";

// ═══ TYPES ═══

interface PinElement {
  number?: number;
  label: string;
  description?: string;
  emoji?: string;
  side?: "before" | "after";
}

interface PinData {
  pin_type: string;
  main_title: string;
  badge_label?: string;
  elements: PinElement[];
  cta_text?: string;
  watermark?: string;
}

interface CharterColors {
  color_primary?: string | null;
  color_secondary?: string | null;
  color_accent?: string | null;
  color_background?: string | null;
  color_text?: string | null;
  font_title?: string | null;
  font_body?: string | null;
}


/**
 * addText avec taille AJUSTÉE À LA BOÎTE (audit 10/07, CR-4) : les layouts de
 * cet exporter sont codés en dur (y/h fixes) et PowerPoint n'applique pas
 * normAutofit à l'ouverture → un texte long débordait sur l'élément suivant
 * (étapes timeline superposées, before_after illisible — mesuré). On réduit la
 * police en amont pour tenir dans la boîte ; les textes qui tiennent déjà ne
 * changent pas d'un pt.
 */
function addFittedText(slide: any, textOrParts: any, opts: any) {
  try {
    if (opts && typeof opts.w === "number" && typeof opts.h === "number") {
      const parts = Array.isArray(textOrParts) ? (textOrParts as any[]) : null;
      const t = parts ? parts.map((p: any) => p?.text || "").join("") : String(textOrParts ?? "");
      // La taille de référence vit soit dans le frame, soit dans les PARTS
      // (makeBadge/highlightLastSignificantWord posent fontSize par part).
      const baseSize =
        typeof opts.fontSize === "number"
          ? opts.fontSize
          : parts
            ? Math.max(0, ...parts.map((p: any) => p?.options?.fontSize || 0))
            : 0;
      if (baseSize > 0) {
        const face = String(opts.fontFace || (parts && parts[0]?.options?.fontFace) || "");
        const fitted = fitFontToBox(t, opts.w, opts.h, baseSize, {
          mono: /mono|courier/i.test(face),
          lineSpacingMultiple: opts.lineSpacingMultiple,
        });
        if (fitted < baseSize) {
          const ratio = fitted / baseSize;
          if (typeof opts.fontSize === "number") opts = { ...opts, fontSize: fitted };
          if (parts) {
            textOrParts = parts.map((p: any) =>
              p?.options?.fontSize
                ? { ...p, options: { ...p.options, fontSize: Math.round(p.options.fontSize * ratio * 10) / 10 } }
                : p,
            );
          }
        }
      }
    }
  } catch {
    /* en cas de pépin d'estimation : comportement historique */
  }
  slide.addText(textOrParts, opts);
}

// ═══ HELPERS ═══

function hex(color: string): string {
  return color.replace("#", "").padEnd(6, "0").slice(0, 6);
}

const makeShadow = () => ({
  type: "outer" as const,
  blur: 8,
  offset: 3,
  angle: 135,
  color: "000000",
  opacity: 0.08,
});

const makeLightShadow = () => ({
  type: "outer" as const,
  blur: 4,
  offset: 2,
  angle: 135,
  color: "000000",
  opacity: 0.04,
});

function makeBadge(
  slide: any,
  text: string,
  x: number,
  y: number,
  fillColor: string,
  fontBody: string,
) {
  const w = Math.max(1.8, text.length * 0.14 + 0.6);
  addFittedText(slide, 
    [{ text: text.toUpperCase(), options: { fontSize: 11, bold: true, color: "FFFFFF", fontFace: fontBody } }],
    {
      x,
      y,
      w,
      h: 0.38,
      align: "center",
      valign: "middle",
      fill: { color: fillColor },
      shape: "roundRect" as any,
      rectRadius: 0.19,
      charSpacing: 2,
    },
  );
}

// ═══ DIMENSIONS ═══
const W = 6.94;
const H = 10.42;
const PAD_X = 0.45;
const PAD_Y = 0.45;
const CONTENT_W = W - PAD_X * 2;

// ═══ BUILDERS ═══

function buildInfographieOrTuto(
  slide: any,
  pinData: PinData,
  c: { primary: string; secondary: string; accent: string; bg: string; text: string },
  f: { title: string; body: string },
) {
  // Background
  slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: c.bg } });

  // Badge
  const badgeText = pinData.badge_label || (pinData.pin_type === "mini_tuto" ? "TUTO" : "INFOGRAPHIE");
  const badgeW = Math.max(1.8, badgeText.length * 0.14 + 0.6);
  makeBadge(slide, badgeText, (W - badgeW) / 2, PAD_Y, c.primary, f.body);

  // Title
  addFittedText(slide, 
    [{ text: pinData.main_title, options: { fontSize: 22, color: c.secondary, fontFace: f.title } }],
    { x: PAD_X, y: PAD_Y + 0.6, w: CONTENT_W, h: 0.8, align: "center", valign: "middle" },
  );

  const elements = pinData.elements || [];
  const startY = 1.9;
  const availableH = H - startY - 1.2;
  const perElement = Math.min(1.4, availableH / Math.max(elements.length, 1));
  const fontSize = elements.length > 5 ? 9 : 11;
  const labelSize = elements.length > 5 ? 12 : 14;

  elements.forEach((el, i) => {
    const y = startY + i * perElement;

    // Number circle
    slide.addShape("ellipse", {
      x: PAD_X,
      y: y + 0.05,
      w: 0.5,
      h: 0.5,
      fill: { color: c.primary },
    });
    addFittedText(slide, 
      [{ text: String(el.number ?? i + 1), options: { fontSize: 16, bold: true, color: "FFFFFF", fontFace: f.body } }],
      { x: PAD_X, y: y + 0.05, w: 0.5, h: 0.5, align: "center", valign: "middle" },
    );

    // Label
    const labelX = PAD_X + 0.65;
    const labelW = CONTENT_W - 0.65;
    addFittedText(slide, 
      [{ text: `${el.emoji ? el.emoji + " " : ""}${el.label}`, options: { fontSize: labelSize, bold: true, color: c.text, fontFace: f.title } }],
      { x: labelX, y, w: labelW, h: 0.35, valign: "bottom" },
    );

    // Description
    if (el.description) {
      addFittedText(slide, 
        [{ text: el.description, options: { fontSize, color: c.text, fontFace: f.body } }],
        { x: labelX, y: y + 0.35, w: labelW, h: 0.4, valign: "top" },
      );
    }

    // Arrow between elements (except last)
    if (i < elements.length - 1) {
      addFittedText(slide, 
        [{ text: "→", options: { fontSize: 18, color: c.primary, fontFace: f.body } }],
        { x: PAD_X + 0.1, y: y + perElement - 0.3, w: 0.3, h: 0.3, align: "center" },
      );
    }
  });

  // CTA
  if (pinData.cta_text) {
    addFittedText(slide, 
      [{ text: pinData.cta_text, options: { fontSize: 10, italic: true, color: c.text, fontFace: f.body } }],
      { x: PAD_X, y: H - 1.0, w: CONTENT_W, h: 0.35, align: "center" },
    );
  }

  // Watermark
  if (pinData.watermark) {
    addFittedText(slide, 
      [{ text: pinData.watermark, options: { fontSize: 8, color: "999999", fontFace: f.body } }],
      { x: PAD_X, y: H - 0.55, w: CONTENT_W, h: 0.3, align: "center" },
    );
  }
}

function buildChecklist(
  slide: any,
  pinData: PinData,
  c: { primary: string; secondary: string; accent: string; bg: string; text: string },
  f: { title: string; body: string },
) {
  slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: c.bg } });

  const badgeText = pinData.badge_label || "CHECKLIST";
  const badgeW = Math.max(1.8, badgeText.length * 0.14 + 0.6);
  makeBadge(slide, badgeText, (W - badgeW) / 2, PAD_Y, c.primary, f.body);

  addFittedText(slide, 
    [{ text: pinData.main_title, options: { fontSize: 22, color: c.secondary, fontFace: f.title } }],
    { x: PAD_X, y: PAD_Y + 0.6, w: CONTENT_W, h: 0.8, align: "center", valign: "middle" },
  );

  const elements = pinData.elements || [];
  const startY = 2.0;
  const availableH = H - startY - 1.2;
  const perItem = Math.min(0.9, availableH / Math.max(elements.length, 1));

  elements.forEach((el, i) => {
    const y = startY + i * perItem;
    const isAlt = i % 2 === 1;

    // Card background
    slide.addShape("roundRect" as any, {
      x: PAD_X,
      y,
      w: CONTENT_W,
      h: perItem - 0.08,
      fill: { color: isAlt ? c.bg : "FFFFFF" },
      rectRadius: 0.08,
      shadow: makeLightShadow(),
    });

    // Green accent bar
    slide.addShape("rect", {
      x: PAD_X,
      y,
      w: 0.06,
      h: perItem - 0.08,
      fill: { color: "27AE60" },
    });

    // Checkbox
    slide.addShape("roundRect" as any, {
      x: PAD_X + 0.2,
      y: y + (perItem - 0.08) / 2 - 0.15,
      w: 0.3,
      h: 0.3,
      fill: { color: c.primary },
      rectRadius: 0.06,
    });
    addFittedText(slide, 
      [{ text: "✓", options: { fontSize: 14, bold: true, color: "FFFFFF", fontFace: f.body } }],
      { x: PAD_X + 0.2, y: y + (perItem - 0.08) / 2 - 0.15, w: 0.3, h: 0.3, align: "center", valign: "middle" },
    );

    // Label text
    addFittedText(slide, 
      [{ text: el.label, options: { fontSize: 11, color: c.text, fontFace: f.body } }],
      { x: PAD_X + 0.65, y, w: CONTENT_W - 0.85, h: perItem - 0.08, valign: "middle" },
    );
  });

  if (pinData.cta_text) {
    addFittedText(slide, 
      [{ text: pinData.cta_text, options: { fontSize: 10, italic: true, color: c.text, fontFace: f.body } }],
      { x: PAD_X, y: H - 0.8, w: CONTENT_W, h: 0.35, align: "center" },
    );
  }

  if (pinData.watermark) {
    addFittedText(slide, 
      [{ text: pinData.watermark, options: { fontSize: 8, color: "999999", fontFace: f.body } }],
      { x: PAD_X, y: H - 0.45, w: CONTENT_W, h: 0.25, align: "center" },
    );
  }
}

function buildAvantApres(
  slide: any,
  pinData: PinData,
  c: { primary: string; secondary: string; accent: string; bg: string; text: string },
  f: { title: string; body: string },
) {
  slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "FFFFFF" } });

  const badgeText = pinData.badge_label || "AVANT / APRÈS";
  const badgeW = Math.max(1.8, badgeText.length * 0.14 + 0.6);
  makeBadge(slide, badgeText, (W - badgeW) / 2, PAD_Y, c.primary, f.body);

  addFittedText(slide, 
    [{ text: pinData.main_title, options: { fontSize: 20, color: c.secondary, fontFace: f.title } }],
    { x: PAD_X, y: PAD_Y + 0.6, w: CONTENT_W, h: 0.7, align: "center", valign: "middle" },
  );

  const beforeItems = (pinData.elements || []).filter((e) => e.side === "before");
  const afterItems = (pinData.elements || []).filter((e) => e.side === "after");

  const sectionStartY = 1.8;
  const sectionH = (H - sectionStartY - 0.8) / 2 - 0.3;

  // AVANT section
  slide.addShape("roundRect" as any, {
    x: PAD_X,
    y: sectionStartY,
    w: CONTENT_W,
    h: sectionH,
    fill: { color: "F0F0F0" },
    rectRadius: 0.12,
  });
  // Red accent bar
  slide.addShape("rect", {
    x: PAD_X,
    y: sectionStartY,
    w: 0.06,
    h: sectionH,
    fill: { color: "E74C3C" },
  });

  const perBefore = Math.min(0.6, (sectionH - 0.2) / Math.max(beforeItems.length, 1));
  beforeItems.forEach((el, i) => {
    const y = sectionStartY + 0.1 + i * perBefore;
    addFittedText(slide, 
      [{ text: `${el.emoji || "❌"} ${el.label}`, options: { fontSize: 11, color: "666666", fontFace: f.body } }],
      { x: PAD_X + 0.25, y, w: CONTENT_W - 0.5, h: perBefore - 0.04, valign: "middle" },
    );
  });

  // Arrow between sections
  const arrowY = sectionStartY + sectionH + 0.05;
  addFittedText(slide, 
    [{ text: "▼", options: { fontSize: 24, color: c.primary, fontFace: f.body } }],
    { x: W / 2 - 0.3, y: arrowY, w: 0.6, h: 0.5, align: "center", valign: "middle" },
  );

  // APRÈS section
  const afterY = arrowY + 0.55;
  slide.addShape("roundRect" as any, {
    x: PAD_X,
    y: afterY,
    w: CONTENT_W,
    h: sectionH,
    fill: { color: c.bg },
    rectRadius: 0.12,
  });
  // Green accent bar
  slide.addShape("rect", {
    x: PAD_X,
    y: afterY,
    w: 0.06,
    h: sectionH,
    fill: { color: "27AE60" },
  });

  const perAfter = Math.min(0.6, (sectionH - 0.2) / Math.max(afterItems.length, 1));
  afterItems.forEach((el, i) => {
    const y = afterY + 0.1 + i * perAfter;
    addFittedText(slide, 
      [{ text: `${el.emoji || "✅"} ${el.label}`, options: { fontSize: 11, color: c.text, fontFace: f.body } }],
      { x: PAD_X + 0.25, y, w: CONTENT_W - 0.5, h: perAfter - 0.04, valign: "middle" },
    );
  });

  if (pinData.watermark) {
    addFittedText(slide, 
      [{ text: pinData.watermark, options: { fontSize: 8, color: "999999", fontFace: f.body } }],
      { x: PAD_X, y: H - 0.45, w: CONTENT_W, h: 0.25, align: "center" },
    );
  }
}

function buildSchemaVisuel(
  slide: any,
  pinData: PinData,
  c: { primary: string; secondary: string; accent: string; bg: string; text: string },
  f: { title: string; body: string },
) {
  slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: c.bg } });

  const badgeText = pinData.badge_label || "SCHÉMA";
  const badgeW = Math.max(1.8, badgeText.length * 0.14 + 0.6);
  makeBadge(slide, badgeText, (W - badgeW) / 2, PAD_Y, c.primary, f.body);

  addFittedText(slide, 
    [{ text: pinData.main_title, options: { fontSize: 20, color: c.secondary, fontFace: f.title } }],
    { x: PAD_X, y: PAD_Y + 0.6, w: CONTENT_W, h: 0.7, align: "center", valign: "middle" },
  );

  const elements = pinData.elements || [];
  const center = elements.find((e) => e.number === 0);
  const peripherals = elements.filter((e) => e.number !== 0);

  // Central element
  const centerY = 2.2;
  const centerCardW = CONTENT_W * 0.7;
  const centerX = (W - centerCardW) / 2;

  if (center) {
    slide.addShape("roundRect" as any, {
      x: centerX,
      y: centerY,
      w: centerCardW,
      h: 1.2,
      fill: { color: "FFFFFF" },
      rectRadius: 0.12,
      shadow: makeShadow(),
    });
    addFittedText(slide, 
      [{ text: `${center.emoji ? center.emoji + " " : ""}${center.label}`, options: { fontSize: 16, bold: true, color: c.text, fontFace: f.title } }],
      { x: centerX + 0.2, y: centerY + 0.15, w: centerCardW - 0.4, h: 0.5, align: "center", valign: "middle" },
    );
    if (center.description) {
      addFittedText(slide, 
        [{ text: center.description, options: { fontSize: 10, color: c.text, fontFace: f.body } }],
        { x: centerX + 0.2, y: centerY + 0.6, w: centerCardW - 0.4, h: 0.45, align: "center", valign: "top" },
      );
    }
  }

  // Peripheral elements in 2-column grid
  const gridStartY = centerY + 1.6;
  const colW = (CONTENT_W - 0.3) / 2;
  const perItem = Math.min(1.2, (H - gridStartY - 0.8) / Math.ceil(Math.max(peripherals.length, 1) / 2));

  peripherals.forEach((el, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = PAD_X + col * (colW + 0.3);
    const y = gridStartY + row * perItem;

    // Line from center
    const lineStartX = W / 2;
    const lineStartY = centerY + 1.2;
    const lineEndX = x + colW / 2;
    const lineEndY = y;
    slide.addShape("line", {
      x: Math.min(lineStartX, lineEndX),
      y: Math.min(lineStartY, lineEndY),
      w: Math.abs(lineEndX - lineStartX) || 0.01,
      h: Math.abs(lineEndY - lineStartY) || 0.01,
      line: { color: c.primary, width: 1.5, dashType: "dash" },
    });

    // Card
    slide.addShape("roundRect" as any, {
      x,
      y,
      w: colW,
      h: perItem - 0.12,
      fill: { color: "FFFFFF" },
      rectRadius: 0.08,
      shadow: makeLightShadow(),
    });

    addFittedText(slide, 
      [{ text: `${el.emoji ? el.emoji + " " : ""}${el.label}`, options: { fontSize: 11, bold: true, color: c.text, fontFace: f.body } }],
      { x: x + 0.1, y: y + 0.08, w: colW - 0.2, h: 0.35, valign: "middle" },
    );

    if (el.description) {
      addFittedText(slide, 
        [{ text: el.description, options: { fontSize: 9, color: c.text, fontFace: f.body } }],
        { x: x + 0.1, y: y + 0.4, w: colW - 0.2, h: perItem - 0.6, valign: "top" },
      );
    }
  });

  if (pinData.watermark) {
    addFittedText(slide, 
      [{ text: pinData.watermark, options: { fontSize: 8, color: "999999", fontFace: f.body } }],
      { x: PAD_X, y: H - 0.45, w: CONTENT_W, h: 0.25, align: "center" },
    );
  }
}

// ═══ MAIN EXPORT ═══

export async function exportPinterestEditablePptx(
  pinData: PinData,
  title: string,
  description: string,
  fileName = "epingle-pinterest",
  charter?: CharterColors | null,
) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "PINTEREST", width: W, height: H });
  pptx.layout = "PINTEREST";
  pptx.author = "L'Assistant Com'";

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

  const slide = pptx.addSlide();

  const pinType = (pinData.pin_type || "").toLowerCase();

  if (pinType === "checklist") {
    buildChecklist(slide, pinData, c, f);
  } else if (pinType === "avant_apres") {
    buildAvantApres(slide, pinData, c, f);
  } else if (pinType === "schema_visuel") {
    buildSchemaVisuel(slide, pinData, c, f);
  } else {
    // infographie, mini_tuto, or fallback
    buildInfographieOrTuto(slide, pinData, c, f);
  }

  // Notes with SEO data
  slide.addNotes(`📌 Titre Pinterest : ${title}\n\n📝 Description :\n${description}`);

  await pptx.writeFile({ fileName: fileName + ".pptx" });
}
