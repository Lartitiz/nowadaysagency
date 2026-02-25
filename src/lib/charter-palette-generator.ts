/**
 * Generates 4 personalized 5-color palettes based on user preferences.
 * Pure client-side logic — no AI call needed.
 */

export type Emotion = "confidence" | "warmth" | "energy" | "calm" | "creativity" | "engagement";
export type Universe = "warm" | "cool" | "pop" | "minimal" | "nature";
export type StyleAxis = { softBold: number; classicModern: number }; // 0-100 each

export interface PaletteColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface GeneratedPalette {
  name: string;
  colors: PaletteColors;
}

// ── Base hue ranges per emotion ──
const EMOTION_HUES: Record<Emotion, number[]> = {
  confidence: [220, 230, 215],    // deep blue
  warmth: [25, 35, 15],           // amber/gold
  energy: [350, 10, 340],         // magenta/red
  calm: [170, 180, 160],          // teal/mint
  creativity: [280, 290, 270],    // purple/violet
  engagement: [0, 355, 5],        // red/coral
};

// ── Universe modifiers ──
const UNIVERSE_CONFIG: Record<Universe, { satMod: number; lightBg: number; tempShift: number; bgTint: number }> = {
  warm:    { satMod: 0.85, lightBg: 97, tempShift: 15, bgTint: 30 },
  cool:    { satMod: 0.80, lightBg: 97, tempShift: -15, bgTint: 210 },
  pop:     { satMod: 1.15, lightBg: 100, tempShift: 0, bgTint: 0 },
  minimal: { satMod: 0.45, lightBg: 100, tempShift: 0, bgTint: 0 },
  nature:  { satMod: 0.70, lightBg: 96, tempShift: -5, bgTint: 120 },
};

function hsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s));
  l = Math.max(0, Math.min(100, l));
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function pickHue(emotions: Emotion[]): number {
  if (emotions.length === 0) return 280;
  const hues = emotions.flatMap(e => EMOTION_HUES[e]);
  return hues[Math.floor(Math.random() * hues.length)];
}

function blendHues(emotions: Emotion[]): number[] {
  // Return 4 distinct base hues for 4 palettes
  const allHues = emotions.flatMap(e => EMOTION_HUES[e]);
  const results: number[] = [];
  for (let i = 0; i < 4; i++) {
    const base = allHues[i % allHues.length];
    results.push(base + (i * 12 - 18)); // spread them a bit
  }
  return results;
}

const PALETTE_NAMES: Record<Universe, string[]> = {
  warm: ["Terracotta Soleil", "Miel Doré", "Ambre Chaleureux", "Cuivre Automnal"],
  cool: ["Bleu Arctique", "Brume Sauge", "Glacier Doux", "Nuit Polaire"],
  pop: ["Électrique", "Pop Bonbon", "Néon Doux", "Vif & Joyeux"],
  minimal: ["Épuré", "Silence Blanc", "Graphique", "Monochrome Zen"],
  nature: ["Forêt Profonde", "Prairie Tendre", "Mousse & Lin", "Organique"],
};

export function generatePersonalizedPalettes(
  emotions: Emotion[],
  universe: Universe,
  style: StyleAxis
): GeneratedPalette[] {
  const config = UNIVERSE_CONFIG[universe];
  const baseHues = blendHues(emotions.length > 0 ? emotions : ["creativity"]);
  const names = PALETTE_NAMES[universe];

  // Style modifiers
  const boldFactor = style.softBold / 100; // 0 = soft, 1 = bold
  const modernFactor = style.classicModern / 100; // 0 = classic, 1 = modern

  const baseSat = (55 + boldFactor * 30) * config.satMod;
  const primaryLight = 42 - boldFactor * 12; // bold = darker primary
  const accentSat = 60 + boldFactor * 25;

  return baseHues.map((hue, i) => {
    const h = hue + config.tempShift;
    const secondaryHue = h + 30 + i * 10;
    const accentHue = h + 150 + modernFactor * 30; // complementary-ish

    const primary = hslToHex(h, baseSat, primaryLight);
    const secondary = hslToHex(secondaryHue, baseSat * 0.4, 88 - boldFactor * 8);
    const accent = hslToHex(accentHue, accentSat, 50 + (1 - boldFactor) * 10);

    // Background
    let bgL = config.lightBg;
    let bgS = 5;
    let bgH = config.bgTint || h;
    if (universe === "minimal") {
      bgH = 0; bgS = 0; bgL = 100;
    }
    // Dark mode variant for bold+modern
    if (boldFactor > 0.7 && modernFactor > 0.7 && i === 2) {
      bgH = h; bgS = 15; bgL = 10;
    }
    const background = hslToHex(bgH, bgS, bgL);

    // Text
    const textL = bgL < 30 ? 95 : 12 + (1 - boldFactor) * 8;
    const textS = bgL < 30 ? 5 : 15;
    const text = hslToHex(h, textS, textL);

    return {
      name: names[i],
      colors: { primary, secondary, accent, background, text },
    };
  });
}
