/**
 * useUserPhotos — list user_photos rows for the active workspace, with
 * Postgres Realtime keeping the list fresh (status transitions, inserts, deletes).
 */

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import type { UserPhotoRow } from "@/lib/photo-storage";
import { uploadPhotoOriginal } from "@/lib/photo-storage";
import { convertHeicIfNeeded } from "@/lib/heic";

export type { UserPhotoRow } from "@/lib/photo-storage";

const QUERY_KEY = ["user-photos"];

export function useUserPhotos() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();

  const query = useQuery<UserPhotoRow[]>({
    queryKey: [...QUERY_KEY, workspaceId],
    enabled: !!user?.id && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_photos")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as UserPhotoRow[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel(`user_photos:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_photos",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, workspaceId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, queryClient]);

  return query;
}

/* ─────────────────────────  Mutations  ───────────────────────── */

export interface CreatePhotoRetouchInput {
  file: File;
  backgroundPrompt?: string;
  backgroundPresetKey?: string;
  name?: string;
}

/**
 * Two-step orchestration:
 *   1. Upload original + insert row (status=pending)
 *   2. Invoke photo-background-replace (status will move to processing → ready/failed)
 *
 * The Edge Function updates the row, Realtime refreshes the UI.
 */
export function useCreatePhotoRetouch() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const [isPending, setIsPending] = useState(false);

  async function mutate(input: CreatePhotoRetouchInput): Promise<{ photoId: string }> {
    if (!user?.id || !workspaceId) {
      throw new Error("Espace de travail introuvable");
    }
    // Garde-fou : useWorkspaceId fallback sur user.id si le contexte n'est pas prêt.
    // Un user.id n'est pas un workspace_id valide → la RLS rejetterait l'INSERT.
    if (workspaceId === user.id) {
      throw new Error("Espace de travail en cours de chargement, réessaie dans 1 seconde.");
    }
    if (!input.backgroundPrompt && !input.backgroundPresetKey) {
      throw new Error("Décris le décor souhaité avant de lancer la retouche.");
    }
    setIsPending(true);
    try {
      const { photoId } = await uploadPhotoOriginal({
        file: input.file,
        userId: user.id,
        workspaceId,
        name: input.name,
        backgroundPrompt: input.backgroundPrompt,
        backgroundPresetKey: input.backgroundPresetKey,
      });

      const { error } = await invokeWithTimeout(
        "photo-background-replace",
        {
          body: {
            photo_id: photoId,
            workspace_id: workspaceId,
            background_prompt: input.backgroundPrompt,
            background_preset_key: input.backgroundPresetKey,
          },
        },
        90_000,
      );

      if (error) {
        throw new Error(error.message);
      }
      return { photoId };
    } finally {
      setIsPending(false);
    }
  }

  return { mutate, isPending };
}

/**
 * Upload multiple simple vers la bibliothèque (sans retouche) : chaque photo
 * passe à status=ready dès l'upload, puis photo-describe (vision) remplit
 * description + tags en arrière-plan — le Realtime rafraîchit la grille.
 */
export function useUploadLibraryPhotos() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function mutate(files: File[]): Promise<{ uploaded: number; failed: number }> {
    if (!user?.id || !workspaceId) {
      throw new Error("Espace de travail introuvable");
    }
    // Même garde-fou que useCreatePhotoRetouch (fallback user.id ≠ workspace valide)
    if (workspaceId === user.id) {
      throw new Error("Espace de travail en cours de chargement, réessaie dans 1 seconde.");
    }

    let uploaded = 0;
    let failed = 0;
    setProgress({ done: 0, total: files.length });
    try {
      for (const rawFile of files) {
        try {
          // Photos d'iPhone : HEIC → JPEG (même conversion que le flux création)
          const file = await convertHeicIfNeeded(rawFile);
          const { photoId } = await uploadPhotoOriginal({
            file,
            userId: user.id,
            workspaceId,
            purpose: "library",
          });
          uploaded++;
          // Description IA en arrière-plan : un échec laisse juste la photo
          // sans description (régénérable depuis le détail), jamais bloquant.
          invokeWithTimeout(
            "photo-describe",
            { body: { mode: "describe", photo_id: photoId, workspace_id: workspaceId } },
            60_000,
          )
            .then(({ error }) => {
              if (error) console.warn("[photo-describe]", error.message);
            })
            .catch((e) => console.warn("[photo-describe]", e));
        } catch (e) {
          failed++;
          console.error("[useUploadLibraryPhotos] upload failed:", e);
        }
        setProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
    } finally {
      setProgress(null);
    }
    return { uploaded, failed };
  }

  return { mutate, progress };
}

/**
 * Re-trigger the edge function for an existing photo (re-uses stored prompt).
 */
export function useRetryPhotoRetouch() {
  const workspaceId = useWorkspaceId();
  const [isRetrying, setIsRetrying] = useState<string | null>(null);

  async function retry(photo: UserPhotoRow): Promise<void> {
    if (!workspaceId) throw new Error("Espace de travail introuvable");
    // Même garde-fou que dans useCreatePhotoRetouch
    if (photo.user_id && workspaceId === photo.user_id) {
      throw new Error("Espace de travail en cours de chargement, réessaie dans 1 seconde.");
    }
    if (!photo.background_prompt && !photo.background_preset_key) {
      throw new Error("Aucun prompt mémorisé pour cette photo. Recommence depuis l'upload.");
    }
    setIsRetrying(photo.id);
    try {
      // Reset status so the UI reflects the new attempt
      await supabase
        .from("user_photos")
        .update({ status: "pending", error_message: null })
        .eq("id", photo.id);

      const { error } = await invokeWithTimeout(
        "photo-background-replace",
        {
          body: {
            photo_id: photo.id,
            workspace_id: workspaceId,
            background_prompt: photo.background_prompt ?? undefined,
            background_preset_key: photo.background_preset_key ?? undefined,
          },
        },
        90_000,
      );
      if (error) throw new Error(error.message);
    } finally {
      setIsRetrying(null);
    }
  }

  return { retry, isRetrying };
}
