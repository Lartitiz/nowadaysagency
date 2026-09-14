export type CalendarShareScope = {
  user_id: string; workspace_id?: string | null; legacy_owner_scope?: boolean;
  canal_filter?: string | null;
};
// Null workspace is personal for new links; the migration marks historical owner-wide links.
export function scopeCalendarPosts<T>(query: T, share: CalendarShareScope): T {
  let q = query as T & { eq(k: string, v: string): typeof q; is(k: string, v: null): typeof q };
  q = q.eq("user_id", share.user_id);
  if (share.workspace_id) q = q.eq("workspace_id", share.workspace_id);
  else if (!share.legacy_owner_scope) q = q.is("workspace_id", null);
  if (share.canal_filter && share.canal_filter !== "all") q = q.eq("canal", share.canal_filter);
  return q;
}
// Provenance can contain source text, private attachments and versions for other channels.
function publicDraftValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicDraftValue);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const privateKeys = object.type === "crosspost" ? ["_crosspost", "source_text", "source_files", "previous_revisions", "source_type", "input_mode", "result", "versions"] : ["_crosspost"];
    return Object.fromEntries(Object.entries(object).filter(([key]) => !privateKeys.includes(key)).map(([key, child]) => [key, publicDraftValue(child)]));
  }
  return value;
}
function publicDraft(draft: unknown): unknown {
  if (typeof draft !== "string") return publicDraftValue(draft);
  try { return JSON.stringify(publicDraftValue(JSON.parse(draft))); } catch { return draft; }
}
export function projectCalendarPost(post: Record<string, unknown>, share: { show_content_draft?: boolean; show_columns?: string[] }) {
  // Structural calendar fields stay public regardless of table presentation.
  const { id, date, theme, canal, format, status, updated_at } = post;
  const columns = share.show_columns ?? ["theme", "status", "date", "wording", "canal", "format", "phase"];
  return { id, date, theme, canal, format, status, updated_at,
    phase: post.category || post.audience_phase || null,
    ...(columns.includes("description") ? { objectif: post.objectif } : {}),
    ...(columns.includes("notes") ? { notes: post.notes } : {}),
    ...(share.show_content_draft === true ? {
      content_draft: publicDraft(post.content_draft), accroche: post.accroche,
      wording: publicDraft(post.content_draft) || null, media_urls: post.media_urls,
    } : { wording: null }),
  };
}
