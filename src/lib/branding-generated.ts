import { supabase } from "@/integrations/supabase/client";

/** Only NULL-workspace rows may be used as the owner's legacy fallback.
 * Never borrow another workspace's data, or a manager's personal legacy data. */
export async function loadGeneratedBranding(
  table: "voice_guides" | "branding_mirror_results",
  userId: string,
  workspaceId: string | null,
  isOwnSpace: boolean,
) {
  const latest = () => supabase.from(table).select("*")
    .order(table === "voice_guides" ? "updated_at" : "created_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false }).limit(1);
  if (workspaceId) {
    const { data, error } = await latest().eq("workspace_id", workspaceId).maybeSingle();
    if (error) throw error;
    if (data || !isOwnSpace) return data;
  }
  const { data, error } = await latest().eq("user_id", userId).is("workspace_id", null).maybeSingle();
  if (error) throw error;
  return data;
}
