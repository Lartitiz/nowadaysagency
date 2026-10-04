/**
 * Sections d'un reel, quelle que soit la forme stockée (`sections`, `script`
 * tableau, ou `script.sections`). Seul un TABLEAU compte : un `sections` resté
 * en chaîne (gabarit du prompt) ne doit ni planter ni masquer `script`.
 */
export function reelSectionsOf(detail: any): any[] {
  if (Array.isArray(detail?.sections)) return detail.sections;
  if (Array.isArray(detail?.script)) return detail.script;
  if (Array.isArray(detail?.script?.sections)) return detail.script.sections;
  return [];
}

/**
 * Texte du script d'un reel tel qu'il est copié dans le calendrier
 * (`content_draft`). UNE seule implémentation, partagée par le front
 * (src/features/creer/build-calendar-content.ts) et par la règle de légende
 * ci-dessous : si les deux formats divergeaient, le script copié ne serait
 * plus reconnu et partirait en légende à la publication.
 */
export function reelScriptDraft(sections: any[]): string {
  return sections.map((s: any) => `[${s.timing || ""}] ${(s.label || s.section || "").toUpperCase()}\n${s.texte_parle || ""}${s.texte_overlay ? `\n📝 ${s.texte_overlay}` : ""}${s.format_visuel ? `\n📹 ${s.format_visuel}` : ""}`).join("\n\n");
}

/** Historical calendar Reels store the script as content_draft. Only replace
 * that exact generated script (or an empty draft); preserve explicit edits. */
export function reelCalendarCaption(draft: string, detail: any): string {
  if (detail?.type !== "reel") return draft;
  const sections = reelSectionsOf(detail);
  // Ancien reel au script stocké en simple chaîne : c'est lui que le
  // calendrier a copié tel quel (build-calendar-content) — il n'est pas
  // davantage une légende.
  const script = sections.length ? reelScriptDraft(sections) : typeof detail.script === "string" ? detail.script : "";
  if (draft.trim() && draft.trim() !== script.trim()) return draft;
  const cap = detail.caption;
  return [typeof cap === "string" ? cap : cap?.text || cap?.full || [cap?.hook,cap?.body].filter(Boolean).join("\n\n"),
    typeof cap === "object" ? cap?.cta : null,
    Array.isArray(detail.hashtags) ? detail.hashtags.join(" ") : null].filter(Boolean).join("\n\n");
}
