import { supabase } from "@/integrations/supabase/client";

/** A personal read never includes workspace rows authored by the same person. */
export function auditScopedQuery(table: string, fields: string, column: string, value: string) {
  let query = (supabase.from(table as any) as any).select(fields).eq(column, value);
  if (column === "user_id") query = query.is("workspace_id", null);
  return query;
}

export async function readAuditProfile(ownerUserId: string, fields: string) {
  if (!ownerUserId) throw new Error("Propriétaire indisponible");
  const { data, error } = await (supabase.from("profiles") as any).select(fields).eq("user_id", ownerUserId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Select a receipt: a zero-row RLS-filtered update must not announce success. */
export async function saveAuditProfile(ownerUserId: string, fields: Record<string, unknown>) {
  if (!ownerUserId) throw new Error("Propriétaire indisponible");
  const { data, error } = await supabase.from("profiles").update(fields).eq("user_id", ownerUserId).select("user_id").single();
  if (error) throw error;
  if (data?.user_id !== ownerUserId) throw new Error("Sauvegarde du profil non confirmée");
}

/** Keep the former audit visible if insertion fails; never demote newer records. */
export async function persistWebsiteAudit(payload: Record<string, unknown>, column: string, value: string, active: () => boolean) {
  const { data, error } = await (supabase.from("website_audit") as any).insert(payload).select("id, created_at").single();
  if (error || !data?.id) throw error || new Error("Enregistrement non confirmé");
  if (!active()) return { receipt: data, markerError: null };
  if (!data.created_at || !Number.isFinite(Date.parse(data.created_at))) return { receipt: data, markerError: new Error("Date du reçu indisponible") };
  let previous = (supabase.from("website_audit") as any).update({ is_latest: false }).eq(column, value).eq("is_latest", true).lt("created_at", data.created_at);
  if (column === "user_id") previous = previous.is("workspace_id", null);
  const { error: markerError } = await previous;
  return { receipt: data, markerError };
}
