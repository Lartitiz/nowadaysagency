/** Historical calendar Reels store the script as content_draft. Only replace
 * that exact generated script (or an empty draft); preserve explicit edits. */
export function reelCalendarCaption(draft: string, detail: any): string {
  if (detail?.type !== "reel") return draft;
  const sections = detail.sections || (Array.isArray(detail.script) ? detail.script : detail.script?.sections) || [];
  const script = sections.map((s: any) => `[${s.timing || ""}] ${(s.label || s.section || "").toUpperCase()}\n${s.texte_parle || ""}${s.texte_overlay ? `\n📝 ${s.texte_overlay}` : ""}${s.format_visuel ? `\n📹 ${s.format_visuel}` : ""}`).join("\n\n");
  if (draft.trim() && draft.trim() !== script.trim()) return draft;
  const cap = detail.caption;
  return [typeof cap === "string" ? cap : cap?.text || cap?.full || [cap?.hook,cap?.body].filter(Boolean).join("\n\n"),
    typeof cap === "object" ? cap?.cta : null,
    Array.isArray(detail.hashtags) ? detail.hashtags.join(" ") : null].filter(Boolean).join("\n\n");
}
