import { supabase } from "@/integrations/supabase/client";

export type SessionScope = { column: string; value: string; section: string; personaId?: string; offerId?: string };
export function scopeCoachingSession(query: any, scope: SessionScope) {
  let result = query.eq(scope.column, scope.value).eq("section", scope.section).is("archived_at", null);
  result = scope.personaId ? result.eq("persona_id", scope.personaId) : result.is("persona_id", null);
  return scope.offerId ? result.eq("offer_id", scope.offerId) : result.is("offer_id", null);
}
export async function loadCoachingSession(scope: SessionScope) {
  const { data, error } = await scopeCoachingSession(supabase.from("branding_coaching_sessions").select("*"), scope).maybeSingle();
  if (error) throw error;
  return data;
}
export async function persistCoachingSession(id: string, existing: boolean, scope: SessionScope, payload: Record<string, unknown>) {
  const row = { ...payload, persona_id: scope.personaId || null, offer_id: scope.offerId || null };
  const { user_id, workspace_id, section, ...changes } = row as Record<string, unknown>;
  const { error } = existing
    ? await scopeCoachingSession(supabase.from("branding_coaching_sessions").update(changes), scope).eq("id", id).select("id").single()
    : await supabase.from("branding_coaching_sessions").insert({ ...row, id } as any).select("id").single();
  if (error) throw error;
}

export async function archiveCoachingSession(id: string, scope: SessionScope) {
  const { error } = await scopeCoachingSession(supabase.from("branding_coaching_sessions")
    .update({ archived_at: new Date().toISOString() }), scope).eq("id", id).select("id").single();
  if (error) throw error;
}
