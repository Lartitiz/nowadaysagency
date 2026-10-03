import { clipSection } from "../_shared/higgsfield-image-api.ts";

const MODE_TEXT: Record<string, string> = {
  porte: "The product must be WORN by a person.",
  pose:
    "The product is placed in a real-life scene without a person — resting on a table, a chair, a linen cloth, as if casually left there.",
  auto:
    "If the product is wearable (clothing, jewelry, accessory, bag), show it worn by a person; otherwise stage it naturally in a real-life scene.",
};

const FRAMING_TEXT: Record<string, string> = {
  sans_visage:
    "Close crop on the product: the face must stay OUT of frame (neck, ear, hands, shoulders or bust only).",
  portrait:
    "Include the person's face — natural relaxed expression, looking away from the camera, never posing at the lens.",
  auto:
    "Choose the most flattering crop for this product; for small jewelry prefer close-ups (ear, neck, hand) with the face partially out of frame.",
};

export interface BrandBlockInput {
  activite?: string | null;
  photo_style?: string | null;
  mood_keywords?: unknown;
  visual_donts?: string | null;
  moodboard_description?: string | null;
}

export function buildPrompt(opts: {
  mode: string;
  framing: string;
  ambiance: string | null;
  adjustment: string | null;
  productDescription: string | null;
  hasPersonReference: boolean;
  brand: BrandBlockInput;
  /** Set for Higgsfield (MARKETING_PROMPT_MAX); OpenAI keeps the full prompt. */
  maxLength?: number;
}): string {
  const lines: string[] = [];

  lines.push(
    "Candid photo taken on an iPhone, amateur photography, unposed, captured mid-moment."
  );

  lines.push(
    "THE PRODUCT: the attached photo shows the exact product to feature. Reproduce it with perfect fidelity — shape, proportions, colors, materials, textures, patterns, clasps, engravings and every small component. Do not redesign, simplify or embellish it." +
      (opts.productDescription ? ` Product context: ${opts.productDescription}` : "")
  );

  lines.push(MODE_TEXT[opts.mode] ?? MODE_TEXT.auto);
  lines.push("FRAMING: " + (FRAMING_TEXT[opts.framing] ?? FRAMING_TEXT.auto));

  // 🔑 Point faible n°1 des bijoux « portés » : le modèle génératif n'a aucune
  // notion de jointure physique (une boucle qui passe DANS le lobe, une bague
  // qui encercle un doigt…) → il pose l'objet à côté, le fait flotter ou le
  // fond dans la peau. Consigne d'accroche anatomique explicite pour relever le
  // taux de bons tirages. Générique : sans effet si le produit n'a pas
  // d'accroche (vêtement, sac).
  lines.push(
    "ATTACHMENT (critical when the product is worn): if the product physically attaches to the body, render that connection anatomically correct and true to real life — a pierced earring passes THROUGH the earlobe and hangs straight down under gravity; a ring encircles a finger; glasses rest on the nose bridge and hook over the ears; a watch or bracelet wraps fully around the wrist; a necklace drapes around the neck following its curve. The piece must join at the exact correct point, at realistic scale, obeying gravity — never floating beside the body part, never fused flat onto the skin, never oversized or undersized."
  );

  if (opts.hasPersonReference) {
    lines.push(
      "PERSON: the SECOND attached image shows the person to feature — it is THE SAME person in this photo (same face, same hair, same skin tone, same style). Natural, unposed, real-looking."
    );
  } else {
    lines.push(
      "PERSON (when shown): a real-looking person, NOT a professional model — natural visible skin texture, minimal makeup, subtle facial asymmetries, a few loose hair strands. Representation matters: vary ethnicity and age (25-55) across variations."
    );
  }

  lines.push(
    "SCENE: " +
      (opts.ambiance?.trim()
        ? opts.ambiance.trim()
        : "an ordinary, lived-in place consistent with the brand universe below (café terrace, workshop, apartment, street…)") +
      " — with realistic everyday details; the background must stay fully readable."
  );

  lines.push(
    "CAPTURE: deep depth of field, EVERYTHING in sharp focus from foreground to background, as if shot at f/11 on a phone (small sensor look). Every element of the background must stay crisp, detailed and readable — walls, furniture, objects, textures. Natural daylight, true-to-life colors, fine visible grain, slightly off-center framing. At most 1-2 honest imperfections (slight motion blur OR slightly tilted horizon)."
  );

  // 🔑 En édition fidélité haute, le modèle hérite du STYLE OPTIQUE de la photo
  // source : si elle a du bokeh, il revient malgré la consigne (vu le 09/07 sur
  // un bol en grès). L'override doit être explicite.
  lines.push(
    "IMPORTANT: if the source photo has any background blur or shallow depth of field, do NOT reproduce it — re-render the whole scene with a fully sharp background. Only the product itself must be preserved from the source, never its optical style."
  );

  lines.push(
    "STRICTLY AVOID: background blur, bokeh, shallow depth of field, cinematic look, studio lighting, golden-hour glow, magazine retouching, plastic smooth skin, any text, logo or watermark ADDED to the scene."
  );

  // 🔑 « logos » tout court dans la liste ci-dessus (jusqu'au 28/09) pouvait se
  // lire « aucun logo nulle part » → le modèle effaçait celui DU PRODUIT, alors
  // que c'est justement ce qui doit rester identique (marque de la cliente).
  lines.push(
    "KEEP ON THE PRODUCT: its own logo, brand name, printed text, labels and engravings must stay exactly as on the source photo — same spelling, placement, size and color. Never remove, blur, translate or invent them."
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
  // brand universe first, then the product context, never the request.
  if (opts.maxLength && brandBlock) prompt = clipSection(prompt, brandBlock, opts.maxLength);
  if (opts.maxLength && opts.productDescription) prompt = clipSection(prompt, ` Product context: ${opts.productDescription}`, opts.maxLength);
  return prompt;
}
