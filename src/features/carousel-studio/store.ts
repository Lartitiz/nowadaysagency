import { supabase } from "@/integrations/supabase/client";
import type { DraftStore } from "@/lib/carousel-autosave";
export function carouselStudioStore(userId: string, workspaceId: string, isOwnSpace = false): DraftStore {
  const scope = (q: any) => workspaceId === userId
    ? q.eq("user_id", userId).is("workspace_id", null)
    : isOwnSpace ? q.or(`workspace_id.eq.${workspaceId},and(workspace_id.is.null,user_id.eq.${userId})`) : q.eq("workspace_id", workspaceId);
  return {
    async read(id) {
      const { data, error } = await scope(supabase.from("saved_ideas").select("id,updated_at,content_data").eq("id", id)).abortSignal(AbortSignal.timeout(20000)).maybeSingle();
      if (error) throw error;
      return data;
    },
    async update(id, timestamp, raw) {
      let q = scope(supabase.from("saved_ideas").update({ content_data: raw }).eq("id", id));
      q = timestamp === null ? q.is("updated_at", null) : q.eq("updated_at", timestamp);
      const { data, error } = await q.select("id,updated_at,content_data").abortSignal(AbortSignal.timeout(20000)).maybeSingle();
      if (error) throw error;
      return data;
    },
    async insert() { throw new Error("Le carrousel doit être enregistré avant d’ouvrir le Studio."); },
  };
}
