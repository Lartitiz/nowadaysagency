/**
 * use-photo-wishlist — « Photos à prendre » du workspace.
 *
 * Alimentée par la séance photo guidée (source=seance), les ajouts manuels
 * (source=manual) et, au lot C, les photo_directive non satisfaites des
 * stories (source=directive, avec requested_count incrémenté).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";

export interface PhotoWishlistRow {
  id: string;
  workspace_id: string;
  user_id: string;
  label: string;
  source: "manual" | "seance" | "directive";
  requested_count: number;
  status: "open" | "done";
  satisfied_photo_id: string | null;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = ["photo-wishlist"];

export function usePhotoWishlist() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();

  return useQuery<PhotoWishlistRow[]>({
    queryKey: [...QUERY_KEY, workspaceId],
    enabled: !!user?.id && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("photo_wishlist")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("requested_count", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) {
        // Dégradation douce si la migration n'est pas encore passée en prod :
        // la page photos reste utilisable, le panneau s'affiche vide.
        console.warn("[photo-wishlist] select error:", error.message);
        return [];
      }
      return (data ?? []) as PhotoWishlistRow[];
    },
  });
}

export function usePhotoWishlistMutations() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, workspaceId] });

  async function addMany(labels: string[], source: PhotoWishlistRow["source"]): Promise<void> {
    if (!user?.id || !workspaceId) throw new Error("Espace de travail introuvable");
    const rows = labels
      .map((l) => l.trim())
      .filter(Boolean)
      .map((label) => ({ workspace_id: workspaceId, user_id: user.id, label, source }));
    if (!rows.length) return;
    const { error } = await supabase.from("photo_wishlist").insert(rows);
    if (error) throw new Error(error.message);
    await invalidate();
  }

  async function setDone(item: PhotoWishlistRow, done: boolean): Promise<void> {
    const { error } = await supabase
      .from("photo_wishlist")
      .update({ status: done ? "done" : "open" })
      .eq("id", item.id);
    if (error) throw new Error(error.message);
    await invalidate();
  }

  async function remove(id: string): Promise<void> {
    const { error } = await supabase.from("photo_wishlist").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await invalidate();
  }

  return { addMany, setDone, remove };
}
