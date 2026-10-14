// Mise à plat d'un résultat pour l'étape « Modifier » (formats hors carrousel
// et stories, qui passent par edited-text.ts). Sorti à l'identique de
// CreerUnifie.tsx › handleEdit (lot C, docs/robustesse/gros-fichiers.md, fiche 1).
export function flattenResultForEdit(selectedFormat: string | null, r: any, existingCalendarContent: string | null | undefined): string {
  let text = "";

  if (!r) {
    // Pas de résultat IA — utiliser le contenu existant du calendrier ou le brouillon
    text = existingCalendarContent || "";
  } else if (selectedFormat === "reel" && Array.isArray(r?.sections)) {
    text = (r.sections as any[])
      .map((s: any) => {
        const header = `--- ${s.label || s.section_label || `Section ${s.section_number || ""}`} (${s.timing || ""}) ---`;
        const parts = [s.texte_parle, s.texte_overlay, s.action].filter(Boolean);
        return `${header}\n${parts.join("\n")}`;
      })
      .join("\n\n");

  } else if (selectedFormat === "linkedin" && (r?.hook || r?.full_text)) {
    if (r.full_text) {
      text = r.full_text;
    } else {
      text = [r.hook, r.body, r.cta].filter(Boolean).join("\n\n");
    }
    if (Array.isArray(r.hashtags) && r.hashtags.length > 0) {
      text += `\n\n${(r.hashtags as string[]).join(" ")}`;
    }

  } else if (selectedFormat === "pinterest_visual" && (r?.title || r?.description)) {
    text = `📌 TITRE :\n${r.title || ""}\n\n📝 DESCRIPTION :\n${r.description || ""}`;

  } else if (selectedFormat === "pinterest_photo" && (r?.title || r?.photo_brief)) {
    text = `📌 TITRE :\n${r.title || ""}\n\n📝 DESCRIPTION :\n${r.description || ""}\n\n📷 BRIEF PHOTO :\n• Sujet : ${r?.photo_brief?.what || ""}\n• Cadrage : ${r?.photo_brief?.framing || ""}\n• Lumière : ${r?.photo_brief?.lighting || ""}\n• Accessoires : ${(r?.photo_brief?.props || []).join(", ")}\n• Couleurs : ${r?.photo_brief?.colors || ""}\n• Ambiance : ${r?.photo_brief?.mood || ""}`;

  } else if (selectedFormat === "newsletter") {
    text = r.body ?? r.content ?? r.text ?? "";
  } else if (r?.content) {
    text = r.content;
  } else if (r?.post) {
    text = r.post;
  } else if (r?.text) {
    text = r.text;
  } else if (r?.hook && r?.body) {
    text = [r.hook, r.body, r.cta].filter(Boolean).join("\n\n");
  } else if (typeof r === "string") {
    text = r;
  } else {
    text = JSON.stringify(r, null, 2);
  }

  // Fallback: si texte vide ou juste "null", utiliser le contenu existant
  if ((!text || text === "null" || !text.trim()) && existingCalendarContent) {
    text = existingCalendarContent;
  }

  return text;
}
