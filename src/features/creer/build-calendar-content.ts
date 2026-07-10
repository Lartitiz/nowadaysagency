// Logique pure extraite de CreerUnifie.tsx (monolithe) : construit le brouillon
// de contenu calendrier à partir du résultat de génération (`result.raw`) et du
// format choisi. Aucune dépendance à l'état React -> testable, behavior-preserving.

export interface CalendarContent {
  contentDraft: string;
  accroche: string;
  storyDetail: any;
}

/**
 * Cap déterministe des hashtags (règle : 3 max Instagram, ciblés) — le modèle
 * en sort 5+ malgré la consigne. Dédoublonne (insensible casse/#) et garde
 * les premiers, formes d'origine préservées.
 */
export function capHashtags(list: unknown, max = 3): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of list) {
    if (typeof h !== "string" || !h.trim()) continue;
    const key = h.trim().replace(/^#+/, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(h.trim());
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Retire la ligne de coaching que l'IA ajoutait en fin de contenu quand aucun
 * élément perso n'était fourni (« 💡 Ajoute une anecdote perso… »). Elle vit
 * désormais dans `personal_tip`, mais on garde ce filet : un contenu publié ne
 * doit JAMAIS embarquer un conseil destiné à l'utilisatrice.
 */
export function stripCoachingHint(text: string): string {
  if (!text) return text;
  return text
    .replace(/\n*\s*(?:💡\s*)?Ajoute une anecdote perso pour que ça sonne vraiment toi\.?\s*(?:L'IA structure, toi tu incarnes\.?)?\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildCalendarContent(selectedFormat: string | null, raw: any): CalendarContent {
  const r = raw;
  if (!r) return { contentDraft: "", accroche: "", storyDetail: null as any };
  let contentDraft = "";
  let accroche = "";

  if (selectedFormat === "carousel" && r?.carousel_type === "photo") {
    accroche = r.caption?.hook || "";
    contentDraft = (r.slides || []).map((s: any) => s.overlay_text ? `SLIDE ${s.slide_number}: ${s.overlay_text}` : `SLIDE ${s.slide_number}: (photo seule)`).join("\n") + "\n\n" + [r.caption?.hook, r.caption?.body, r.caption?.cta].filter(Boolean).join("\n");
    const storyDetail: any = { type: "carousel_photo", slides: r.slides, caption: r.caption, quality_check: r.quality_check };
    if (r.edited_text?.trim()) contentDraft = r.edited_text;
    return { contentDraft, accroche, storyDetail };
  }

  if (selectedFormat === "carousel" && r?.carousel_type === "mix") {
    accroche = r.caption?.hook || "";
    contentDraft = (r.slides || []).map((s: any) => {
      const type = s.slide_type || "text_only";
      if (type === "photo_full") return `SLIDE ${s.slide_number} [📸]: ${s.overlay_text || "(photo seule)"}`;
      if (type === "photo_integrated") return `SLIDE ${s.slide_number} [📷+📝]: ${s.title || ""} — ${s.body || ""}`;
      return `SLIDE ${s.slide_number} [📝]: ${s.title || ""} — ${s.body || ""}`;
    }).join("\n") + "\n\n" + [r.caption?.hook, r.caption?.body, r.caption?.cta].filter(Boolean).join("\n");
    const storyDetail: any = { type: "carousel_mix", slides: r.slides, caption: r.caption, quality_check: r.quality_check };
    if (r.edited_text?.trim()) contentDraft = r.edited_text;
    return { contentDraft, accroche, storyDetail };
  }

  if (selectedFormat === "carousel" && r?.slides) {
    accroche = r.caption?.hook || r.slides?.[0]?.title || "";
    const slidesText = r.slides?.map((s: any) => `${s.title}\n${s.body || ""}`).join("\n\n");
    const captionText = r.caption ? [r.caption.hook, r.caption.body, r.caption.cta].filter(Boolean).join("\n") : "";
    contentDraft = captionText ? `${captionText}\n\n───── SLIDES ─────\n\n${slidesText}` : slidesText;
  } else if (selectedFormat === "linkedin" && (r?.hook || r?.full_text)) {
    accroche = (r.hook || r.full_text?.split(/[.\n]/)[0] || "").trim().slice(0, 200);
    contentDraft = r.full_text || [r.hook, r.body, r.cta].filter(Boolean).join("\n\n");
  } else if (selectedFormat === "reel" && (r?.sections || r?.script)) {
    const reelSections = r.sections || r.script || [];
    accroche = reelSections[0]?.texte_parle || r.accroche || "";
    contentDraft = reelSections.map((s: any) => `[${s.timing || ""}] ${(s.label || s.section || "").toUpperCase()}\n${s.texte_parle || ""}${s.texte_overlay ? `\n📝 ${s.texte_overlay}` : ""}${s.format_visuel ? `\n📹 ${s.format_visuel}` : ""}`).join("\n\n");
  } else if (selectedFormat === "story" && r?.stories) {
    accroche = r.stories?.[0]?.text || "";
    contentDraft = r.stories?.map((s: any) => `STORY ${s.number || ""} (${s.timing || ""})\n${s.format_label || s.format || ""}\n${s.text || ""}${s.sticker ? `\n🎯 ${s.sticker.label || s.sticker.type || ""}` : ""}`).join("\n\n───\n\n");
  } else if (selectedFormat === "pinterest_visual" && (r?.title || r?.description)) {
    accroche = r.title || "";
    contentDraft = `📌 ${r.title || ""}\n\n${r.description || ""}`;
  } else if (selectedFormat === "pinterest_photo" && (r?.title || r?.photo_brief)) {
    accroche = r.title || "";
    const briefLines = r.photo_brief ? [
      "📷 BRIEF PHOTO :",
      `• Sujet : ${r.photo_brief.what || ""}`,
      `• Cadrage : ${r.photo_brief.framing || ""}`,
      `• Lumière : ${r.photo_brief.lighting || ""}`,
      `• Accessoires : ${(r.photo_brief.props || []).join(", ")}`,
      `• Couleurs : ${r.photo_brief.colors || ""}`,
      `• Ambiance : ${r.photo_brief.mood || ""}`,
    ].join("\n") : "";
    contentDraft = `📌 ${r.title || ""}\n\n${r.description || ""}\n\n${briefLines}`;
  } else if (selectedFormat === "newsletter" && (r?.content || r?.body)) {
    const nlBody = r.body || r.content || "";
    accroche = (r.subject || r.accroche || nlBody.split("\n")[0] || "").slice(0, 200);
    contentDraft = r.subject
      ? `Objet : ${r.subject}\n${r.preview_text ? `Preview : ${r.preview_text}\n` : ""}\n${nlBody}`
      : nlBody;
  } else {
    contentDraft = r.content || r.post || r.text || "";
    accroche = contentDraft.split("\n")[0] || "";
  }

  let storyDetail: any = null;
  if (selectedFormat === "carousel" && r?.slides) {
    storyDetail = {
      type: "carousel",
      carousel_type: r.carousel_type || "tips",
      slides: r.slides,
      caption: r.caption,
      quality_check: r.quality_check,
    };
  } else if (selectedFormat === "reel" && (r?.sections || r?.script)) {
    storyDetail = {
      type: "reel",
      format_type: r.format_type,
      format_label: r.format_label,
      duree_cible: r.duree_cible,
      script: r.sections || r.script,
      caption: r.caption,
      hashtags: capHashtags(r.hashtags),
      cover_text: r.cover_text,
      alt_text: r.alt_text,
      amplification_stories: r.amplification_stories,
    };
  } else if (selectedFormat === "story" && (r?.stories || r?.sequences)) {
    storyDetail = {
      type: "stories",
      stories: r.stories || r.sequences,
      structure_type: r.structure_type,
      structure_label: r.structure_label,
      narrative_angle: r.narrative_angle || null,
      stickers_used: r.stickers_used,
      garde_fou_alerte: r.garde_fou_alerte,
      personal_tip: r.personal_tip,
    };
  }

  // Si l'utilisatrice a édité le texte (étape "edit"), il prime sur la version IA.
  if (r.edited_text?.trim()) contentDraft = r.edited_text;

  return { contentDraft: stripCoachingHint(contentDraft), accroche, storyDetail };
}
