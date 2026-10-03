import { clipSection } from "../_shared/higgsfield-image-api.ts";

export interface BrandBlockInput {
  activite?: string | null;
  photo_style?: string | null;
  mood_keywords?: unknown;
  visual_donts?: string | null;
  moodboard_description?: string | null;
}

export function buildPrompt(opts: {
  directive: string;
  adjustment: string | null;
  brand: BrandBlockInput;
  /** Set for Higgsfield (MARKETING_PROMPT_MAX); OpenAI keeps the full prompt. */
  maxLength?: number;
}): string {
  const lines: string[] = [];

  lines.push(
    "Candid photo taken on an iPhone, amateur photography, unposed, captured mid-moment."
  );

  lines.push(
    "SCENE (description in French — follow it faithfully): " +
      opts.directive.trim() +
      " — with realistic everyday details; the background must stay fully readable."
  );

  lines.push(
    "PERSON (when the scene includes one): a real-looking person, NOT a professional model — natural visible skin texture, minimal makeup, subtle facial asymmetries, a few loose hair strands. Representation matters: vary ethnicity and age (25-55)."
  );

  lines.push(
    "CAPTURE: deep depth of field, EVERYTHING in sharp focus from foreground to background, as if shot at f/11 on a phone (small sensor look). Every element of the background must stay crisp, detailed and readable — walls, furniture, objects, textures. Natural daylight, true-to-life colors, fine visible grain, slightly off-center framing. At most 1-2 honest imperfections (slight motion blur OR slightly tilted horizon)."
  );

  lines.push(
    "STRICTLY FORBIDDEN: any real identifiable person, celebrity or public figure; any third-party brand name, logo or recognizable product. Also avoid: background blur, bokeh, shallow depth of field, cinematic look, studio lighting, golden-hour glow, magazine retouching, plastic smooth skin, added text, watermarks."
  );

  const b = opts.brand;
  const brandLines: string[] = [];
  if (b.activite) brandLines.push(`- Activité : ${b.activite}`);
  const moods = Array.isArray(b.mood_keywords) ? b.mood_keywords.filter(Boolean) : [];
  if (moods.length) brandLines.push(`- Style visuel : ${moods.join(", ")}`);
  if (b.photo_style) brandLines.push(`- Style photo : ${b.photo_style}`);
  if (b.visual_donts) brandLines.push(`- Interdits visuels : ${b.visual_donts}`);
  if (b.moodboard_description) brandLines.push(`- Ambiance moodboard : ${b.moodboard_description}`);
  if (brandLines.length) {
    lines.push("BRAND UNIVERSE (guide mood, palette and places):\n" + brandLines.join("\n"));
  }

  if (opts.adjustment?.trim()) {
    lines.push("ADJUSTMENT REQUESTED (apply on top of everything above): " + opts.adjustment.trim());
  }

  const brandBlock = lines.find((l) => l.startsWith("BRAND UNIVERSE"));
  let prompt = lines.join("\n\n");
  // Higgsfield refuses prompts above 5000 characters: shorten the optional
  // brand universe first, never the request.
  if (opts.maxLength && brandBlock) prompt = clipSection(prompt, brandBlock, opts.maxLength);
  return prompt;
}
