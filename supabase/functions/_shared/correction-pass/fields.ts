// Déplacé à l'identique depuis _shared/correction-pass.ts (lot 2 du découpage,
// 14/10/2026, docs/robustesse/gros-fichiers.md fiche 9). correction-pass.ts le réexporte.
// Extraction et réinjection des textes, sans IA (newsletter, carrousel, stories).

const NEWSLETTER_FIELDS = ["subject", "preview_text", "content", "accroche", "cta_suggestion"] as const;

export function extractNewsletterTexts(newsletter: Record<string, unknown>): string {
  return NEWSLETTER_FIELDS.filter((key) => typeof newsletter[key] === "string" && String(newsletter[key]).trim())
    .map((key) => `[NEWSLETTER ${key}]\n${newsletter[key]}`).join("\n\n");
}

/** Reject a missing/duplicated/reordered marker rather than shift text into another field. */
export function reinjectNewsletterTexts<T extends Record<string, unknown>>(newsletter: T, corrected: string): T {
  // A model may wrap the annotated block despite the plain-text contract.
  corrected = corrected.trim().replace(/^```[^\n]*\n/, "").replace(/\n```\s*$/, "");
  const expected = NEWSLETTER_FIELDS.filter((key) => typeof newsletter[key] === "string" && String(newsletter[key]).trim());
  const matches = [...corrected.matchAll(/\[NEWSLETTER (subject|preview_text|content|accroche|cta_suggestion)\]\s*([\s\S]*?)(?=\[NEWSLETTER |$)/g)];
  if (matches.length !== expected.length || matches.some((match, i) => match[1] !== expected[i] || !match[2].trim())) return newsletter;
  const result: Record<string, unknown> = { ...newsletter };
  for (const match of matches) result[match[1]] = keepUnlessRealEdit(String(newsletter[match[1]]), match[2].trim());
  return result as T;
}

/**
 * Extrait les champs textuels d'un JSON carrousel en bloc annoté.
 */
export function extractCarouselTexts(parsed: any): string {
  const lines: string[] = [];

  const slides = parsed.slides || parsed.carousel?.slides || [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const num = i + 1;

    // Hook (slide 1) or title
    const title = slide.title || slide.hook || slide.accroche || "";
    if (title) {
      lines.push(`[SLIDE ${num} - ${i === 0 ? "HOOK" : "TITLE"}] ${title}`);
    }

    // Body
    const body = slide.body || slide.text || slide.content || "";
    if (body) {
      lines.push(`[SLIDE ${num} - BODY] ${body}`);
    }

    // Punchline
    const punchline = slide.punchline || "";
    if (punchline) {
      lines.push(`[SLIDE ${num} - PUNCHLINE] ${punchline}`);
    }

    // Overlay text (slides photo_full du carrousel mixte)
    const overlay = slide.overlay_text || "";
    if (overlay) {
      lines.push(`[SLIDE ${num} - OVERLAY] ${overlay}`);
    }
  }

  // Caption (peut être un objet { hook, body, cta, hashtags } ou une string legacy)
  const caption = parsed.caption ?? parsed.instagram_caption ?? "";
  if (caption && typeof caption === "object") {
    if (caption.hook) lines.push(`[CAPTION - HOOK] ${caption.hook}`);
    if (caption.body) lines.push(`[CAPTION - BODY] ${caption.body}`);
    if (caption.cta) lines.push(`[CAPTION - CTA] ${caption.cta}`);
    // hashtags volontairement exclus : pas de tics IA à corriger
  } else if (typeof caption === "string" && caption) {
    lines.push(`[CAPTION] ${caption}`);
  }


  return lines.join("\n");
}

/**
 * Garde de fidélité DÉTERMINISTE : si la « correction » ne diffère de l'original
 * que par des espaces en moins/en plus (mots collés type « je l'aitrouvé
 * commeça » — typo de recopie du modèle qui devait rendre le texte verbatim),
 * on garde l'original. Une vraie correction change des mots, pas juste des
 * espaces. Sans cette garde, le verbatim-guard aval IMPOSE le texte corrompu.
 */
export function keepUnlessRealEdit(original: unknown, corrected: string): string {
  const orig = typeof original === "string" ? original : "";
  if (!orig) return corrected;
  const strip = (s: string) => s.replace(/\s+/g, "");
  return strip(orig) === strip(corrected) ? orig : corrected;
}

/**
 * Réinjecte les textes corrigés dans la structure JSON originale.
 */
export function reinjectCarouselTexts(parsed: any, correctedBlock: string): any {
  const result = JSON.parse(JSON.stringify(parsed)); // deep clone
  const slides = result.slides || result.carousel?.slides || [];

  // Parse annotated block into a map
  const corrections = new Map<string, string>();
  const regex = /\[([^\]]+)\]\s*([\s\S]*?)(?=\n\[|$)/g;
  let match;
  while ((match = regex.exec(correctedBlock)) !== null) {
    corrections.set(match[1].trim(), match[2].trim());
  }

  for (let i = 0; i < slides.length; i++) {
    const num = i + 1;

    // Hook/title
    const titleKey = i === 0 ? `SLIDE ${num} - HOOK` : `SLIDE ${num} - TITLE`;
    if (corrections.has(titleKey)) {
      const val = keepUnlessRealEdit(
        slides[i].title ?? slides[i].hook ?? slides[i].accroche,
        corrections.get(titleKey)!,
      );
      if (slides[i].title !== undefined) slides[i].title = val;
      else if (slides[i].hook !== undefined) slides[i].hook = val;
      else if (slides[i].accroche !== undefined) slides[i].accroche = val;
      else slides[i].title = val;
    }

    // Body
    const bodyKey = `SLIDE ${num} - BODY`;
    if (corrections.has(bodyKey)) {
      const val = keepUnlessRealEdit(
        slides[i].body ?? slides[i].text ?? slides[i].content,
        corrections.get(bodyKey)!,
      );
      if (slides[i].body !== undefined) slides[i].body = val;
      else if (slides[i].text !== undefined) slides[i].text = val;
      else if (slides[i].content !== undefined) slides[i].content = val;
      else slides[i].body = val;
    }

    // Punchline
    const punchKey = `SLIDE ${num} - PUNCHLINE`;
    if (corrections.has(punchKey)) {
      slides[i].punchline = keepUnlessRealEdit(slides[i].punchline, corrections.get(punchKey)!);
    }

    // Overlay text (mixte / photo_full)
    const overlayKey = `SLIDE ${num} - OVERLAY`;
    if (corrections.has(overlayKey)) {
      slides[i].overlay_text = keepUnlessRealEdit(slides[i].overlay_text, corrections.get(overlayKey)!);
    }
  }

  // Caption : préserve la structure originale (objet vs string)
  const captionTarget =
    result.caption !== undefined ? "caption" :
    result.instagram_caption !== undefined ? "instagram_caption" :
    null;

  if (captionTarget) {
    const original = result[captionTarget];
    if (original && typeof original === "object") {
      // Format objet : on réinjecte champ par champ, hashtags inchangés
      if (corrections.has("CAPTION - HOOK")) original.hook = keepUnlessRealEdit(original.hook, corrections.get("CAPTION - HOOK")!);
      if (corrections.has("CAPTION - BODY")) original.body = keepUnlessRealEdit(original.body, corrections.get("CAPTION - BODY")!);
      if (corrections.has("CAPTION - CTA")) original.cta = keepUnlessRealEdit(original.cta, corrections.get("CAPTION - CTA")!);
    } else if (corrections.has("CAPTION")) {
      // Format string legacy
      result[captionTarget] = keepUnlessRealEdit(result[captionTarget], corrections.get("CAPTION")!);
    }
  }


  return result;
}

/**
 * Textes d'une séquence de stories, annotés [STORY N - CHAMP] : ce que la
 * rédaction a écrit et que l'abonnée lit, le texte (TEXT) et le petit titre
 * (TITLE). Depuis le 04/10/2026 (séparation écriture / design), les autres
 * pastilles de l'image (items de liste, citation) sont des EXTRAITS du texte
 * posés par la mise en forme APRÈS cette passe (_shared/story-formatting.ts) :
 * ni envoyées ni réécrites ici.
 */
export function extractStoriesTexts(stories: any[]): string {
  const lines: string[] = [];
  if (!Array.isArray(stories)) return "";
  for (let i = 0; i < stories.length; i++) {
    const st = stories[i];
    const num = i + 1;
    if (typeof st?.text === "string" && st.text.trim()) lines.push(`[STORY ${num} - TEXT] ${st.text.trim()}`);
    const title = st?.visual && typeof st.visual === "object" ? st.visual.title_pill : null;
    if (typeof title === "string" && title.trim()) lines.push(`[STORY ${num} - TITLE] ${title.trim()}`);
  }
  return lines.join("\n");
}

/**
 * Même matière que extractStoriesTexts mais SANS marqueurs : c'est ce texte-là
 * qu'on MESURE (les « [STORY 1 - TEXT] » contiennent des chiffres que le
 * détecteur de chiffres inventés compterait à tort).
 */
export function storiesAuditableText(stories: any[]): string {
  return extractStoriesTexts(stories).replace(/^\[STORY \d+ - [A-Z]+(?: \d+)?\] /gm, "");
}

/** Borne du petit titre (même que le brief stories) : une correction qui la casse est ignorée. */
const STORY_TITLE_MAX_WORDS = 8;

/**
 * Réinjecte un bloc annoté corrigé dans la liste de stories. Ne touche QUE le
 * texte et le petit titre, avec la garde de fidélité keepUnlessRealEdit ; une
 * ligne absente, vide ou hors borne garde l'original. Les pastilles dérivées
 * (body_pill, list_pills, quote) ne sont jamais réécrites : la mise en forme
 * les pose après, à partir du texte. Renvoie une COPIE profonde (l'original
 * n'est jamais muté), plus le nombre de champs réellement changés.
 */
export function reinjectStoriesTexts(stories: any[], correctedBlock: string): { stories: any[]; changed: number } {
  const result: any[] = JSON.parse(JSON.stringify(stories));
  const corrections = new Map<string, string>();
  const regex = /\[([^\]]+)\]\s*([\s\S]*?)(?=\n\[|$)/g;
  let match;
  while ((match = regex.exec(correctedBlock)) !== null) {
    corrections.set(match[1].trim(), match[2].trim());
  }
  let changed = 0;
  const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
  const apply = (holder: any, field: string, key: string, ok: (t: string) => boolean) => {
    if (!holder || !corrections.has(key)) return;
    const candidate = corrections.get(key)!;
    if (!candidate || !ok(candidate)) return;
    const val = keepUnlessRealEdit(holder[field], candidate);
    if (val !== holder[field]) {
      holder[field] = val;
      changed++;
    }
  };
  for (let i = 0; i < result.length; i++) {
    const st = result[i];
    const num = i + 1;
    apply(st, "text", `STORY ${num} - TEXT`, () => true);
    const v = st?.visual;
    // Seulement un titre qui existe déjà : la passe n'en invente pas.
    if (v && typeof v === "object" && typeof v.title_pill === "string" && v.title_pill.trim()) {
      apply(v, "title_pill", `STORY ${num} - TITLE`, (t) => wordCount(t) <= STORY_TITLE_MAX_WORDS);
    }
  }
  return { stories: result, changed };
}
