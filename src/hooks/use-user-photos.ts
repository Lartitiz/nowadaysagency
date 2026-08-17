/**
 * useUserPhotos — list user_photos rows for the active workspace, with
 * Postgres Realtime keeping the list fresh (status transitions, inserts, deletes).
 */

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { redescribePhoto } from "@/lib/photo-redescribe";
import type { UserPhotoRow } from "@/lib/photo-storage";
import { uploadPhotoOriginal, USER_PHOTOS_BUCKET } from "@/lib/photo-storage";
import { derivedPhotoDescription, derivedPhotoName } from "@/lib/photo-naming";
import { convertHeicIfNeeded } from "@/lib/heic";

export type { UserPhotoRow } from "@/lib/photo-storage";

const QUERY_KEY = ["user-photos"];

const DESCRIBE_AUTO_RETRY_DELAY_MS = 4000;

/**
 * Lance photo-describe (mode describe) en arrière-plan pour une photo qui
 * vient d'être uploadée, avec UN réessai après un court délai si le premier
 * essai échoue (réseau/5xx transitoire). Toujours fire-and-forget : un échec
 * après le réessai laisse juste la photo sans description, régénérable à la
 * main depuis sa fiche (PhotoDetailDialog) ou via le rattrapage de PhotosPage.
 */
function describePhotoOnUpload(photoId: string, workspaceId: string, isRetry = false): void {
  invokeWithTimeout(
    "photo-describe",
    { body: { mode: "describe", photo_id: photoId, workspace_id: workspaceId } },
    60_000,
  )
    .then(({ error }) => {
      if (!error) return;
      if (!isRetry) {
        setTimeout(
          () => describePhotoOnUpload(photoId, workspaceId, true),
          DESCRIBE_AUTO_RETRY_DELAY_MS,
        );
        return;
      }
      console.warn("[photo-describe]", error.message);
    })
    .catch((e) => {
      if (!isRetry) {
        setTimeout(
          () => describePhotoOnUpload(photoId, workspaceId, true),
          DESCRIBE_AUTO_RETRY_DELAY_MS,
        );
        return;
      }
      console.warn("[photo-describe]", e);
    });
}

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
    // Filet quand le Realtime ne pousse rien (vécu 21/07 : retouche « Changer un
    // fond » terminée côté serveur, grille jamais rafraîchie avant un F5) : tant
    // qu'une photo est en cours de traitement, on re-lit la liste toutes les 4 s.
    refetchInterval: (q) => {
      const rows = q.state.data as UserPhotoRow[] | undefined;
      return rows?.some((p) => p.status === "pending" || p.status === "processing") ? 4000 : false;
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

/**
 * Rafraîchit la grille /photos à la demande. À appeler après TOUTE écriture
 * dans user_photos faite hors des mutations de ce fichier (dialogues Packshot /
 * Mise en scène qui passent par `uploadPhotoOriginal` en direct) : sans ça, la
 * nouvelle photo n'apparaît que si le Realtime pousse — flaky connu — ou après
 * un aller-retour sur la page. Même filet que le fix « Nouveau fond » (#618).
 */
export function useRefreshUserPhotos(): () => void {
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, workspaceId] });
  }, [queryClient, workspaceId]);
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
  const queryClient = useQueryClient();
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

      // La ligne (status=pending) vient d'être insérée : rafraîchir la grille
      // tout de suite pour afficher la carte « en cours » sans dépendre du
      // Realtime — le polling de useUserPhotos prend ensuite le relais jusqu'à
      // ready/failed.
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, workspaceId] });

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
      // L'edge a fini (ready/failed) : re-lire la liste sans attendre le prochain tick.
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, workspaceId] });
      return { photoId };
    } finally {
      setIsPending(false);
    }
  }

  return { mutate, isPending };
}

/** Carte optimiste : fichier en cours d'envoi, affiché dans la grille avant l'insert en base. */
export interface PendingLibraryUpload {
  localId: string;
  /** Object URL de l'aperçu local (null si non générable) — révoqué au retrait. */
  previewUrl: string | null;
  name: string;
  /** Ligne user_photos créée : la carte optimiste s'efface quand cette ligne arrive dans la grille. */
  photoId?: string;
}

/**
 * Upload multiple simple vers la bibliothèque (sans retouche) : chaque photo
 * passe à status=ready dès l'upload, puis photo-describe (vision) remplit
 * description + tags en arrière-plan — le Realtime rafraîchit la grille.
 *
 * `pendingUploads` expose une carte optimiste par fichier dès la sélection :
 * sans elle, la grille reste vide pendant l'envoi et l'utilisatrice croit
 * l'envoi perdu → elle réessaie et crée des doublons.
 */
export function useUploadLibraryPhotos() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingLibraryUpload[]>([]);

  async function mutate(
    files: File[],
  ): Promise<{ uploaded: number; failed: number; photoIds: string[] }> {
    if (!user?.id || !workspaceId) {
      throw new Error("Espace de travail introuvable");
    }
    // Même garde-fou que useCreatePhotoRetouch (fallback user.id ≠ workspace valide)
    if (workspaceId === user.id) {
      throw new Error("Espace de travail en cours de chargement, réessaie dans 1 seconde.");
    }

    let uploaded = 0;
    let failed = 0;
    // Lignes créées, dans l'ordre : permet à l'appelant de rebondir dessus
    // (le picker de /creer pré-sélectionne les photos qu'il vient d'importer).
    const photoIds: string[] = [];
    setProgress({ done: 0, total: files.length });
    const batch: PendingLibraryUpload[] = files.map((f) => ({
      localId: crypto.randomUUID(),
      // Un HEIC d'iPhone peut ne pas s'afficher : la carte retombe sur son fond neutre (onError).
      previewUrl: URL.createObjectURL(f),
      name: f.name,
    }));
    setPendingUploads((prev) => [...prev, ...batch]);
    const dropPending = (localId: string) => {
      setPendingUploads((prev) => {
        const entry = prev.find((p) => p.localId === localId);
        if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
        return prev.filter((p) => p.localId !== localId);
      });
    };
    try {
      for (let i = 0; i < files.length; i++) {
        const rawFile = files[i];
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
          photoIds.push(photoId);
          setPendingUploads((prev) =>
            prev.map((p) => (p.localId === batch[i].localId ? { ...p, photoId } : p)),
          );
          // Fait apparaître la vraie carte sans attendre le Realtime.
          queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, workspaceId] });
          // Description IA en arrière-plan (1 réessai auto en cas d'échec) : un
          // échec laisse juste la photo sans description (régénérable depuis le
          // détail), jamais bloquant.
          describePhotoOnUpload(photoId, workspaceId);
        } catch (e) {
          failed++;
          dropPending(batch[i].localId);
          console.error("[useUploadLibraryPhotos] upload failed:", e);
        }
        setProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
    } finally {
      setProgress(null);
      // Les vraies lignes doivent être dans le cache AVANT de retirer les
      // cartes optimistes, sinon les photos « disparaissent » un instant.
      await queryClient
        .invalidateQueries({ queryKey: [...QUERY_KEY, workspaceId] })
        .catch(() => {});
      setPendingUploads((prev) => {
        const batchIds = new Set(batch.map((b) => b.localId));
        for (const p of prev) {
          if (batchIds.has(p.localId) && p.previewUrl) URL.revokeObjectURL(p.previewUrl);
        }
        return prev.filter((p) => !batchIds.has(p.localId));
      });
    }
    return { uploaded, failed, photoIds };
  }

  return { mutate, progress, pendingUploads };
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
      const { error: resetError } = await supabase
        .from("user_photos")
        .update({ status: "pending", error_message: null })
        .eq("id", photo.id);
      if (resetError) throw new Error(resetError.message);

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

/**
 * Retouche IA d'une photo DÉJÀ en bibliothèque, sur place (nouveau décor au
 * prompt). Pas d'upload.
 *
 * Subtilité storage : l'edge écrit TOUJOURS son résultat sur `${uid}/${id}.jpg`
 * en upsert. Or une photo de bibliothèque n'a qu'un fichier, à ce même chemin
 * (storage_path === original_storage_path) → l'edge écraserait l'unique
 * original. On en fait donc d'abord une COPIE serveur vers `_original.jpg` et on
 * y pointe `original_storage_path` : l'edge lit alors la copie pristine comme
 * source, écrit la retouche sur storage_path, et la bascule Avant/Après
 * apparaît (originale préservée). L'edge refusant un statut `ready`, on repasse
 * aussi la ligne en `pending` (comme le retry) et on mémorise le nouveau prompt.
 */
export function useRetouchExistingPhoto() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  async function mutate(input: { photo: UserPhotoRow; backgroundPrompt: string }): Promise<void> {
    if (!user?.id || !workspaceId) throw new Error("Espace de travail introuvable");
    // Même garde-fou que useCreatePhotoRetouch (fallback user.id ≠ workspace valide)
    if (workspaceId === user.id) {
      throw new Error("Espace de travail en cours de chargement, réessaie dans 1 seconde.");
    }
    const prompt = input.backgroundPrompt.trim();
    if (prompt.length < 3) {
      throw new Error("Décris le décor souhaité avant de lancer la retouche.");
    }
    setIsPending(true);
    try {
      const photo = input.photo;
      const prevOriginalPath = photo.original_storage_path;

      // Un seul fichier (biblio/packshot) → on snapshot l'original vers un
      // chemin distinct avant que l'edge n'écrase storage_path. Déjà distinct
      // (photo déjà retouchée) → rien à faire, on re-retouche depuis l'original.
      let originalPath = prevOriginalPath;
      let snapshotPath: string | null = null;
      if (originalPath === photo.storage_path) {
        const dest = /\.jpg$/i.test(photo.storage_path)
          ? photo.storage_path.replace(/\.jpg$/i, "_original.jpg")
          : `${photo.storage_path}_original.jpg`;
        const { error: copyErr } = await supabase.storage
          .from(USER_PHOTOS_BUCKET)
          .copy(photo.storage_path, dest);
        // Un snapshot déjà présent (retouche relancée) n'est pas une erreur.
        if (copyErr && !/exist|dupl/i.test(copyErr.message)) {
          throw new Error(copyErr.message);
        }
        originalPath = dest;
        snapshotPath = dest;
      }

      // Repasse en pending + mémorise le nouveau prompt (l'edge rejette `ready`).
      // background_preset_key remis à null : on bascule sur un décor libre.
      const { error: updErr } = await supabase
        .from("user_photos")
        .update({
          status: "pending",
          error_message: null,
          background_prompt: prompt,
          background_preset_key: null,
          original_storage_path: originalPath,
        })
        .eq("id", photo.id);
      if (updErr) throw new Error(updErr.message);

      // La carte vient de repasser en pending : rafraîchir la grille tout de
      // suite pour afficher « Retouche en cours » sans dépendre du Realtime —
      // sinon le polling de useUserPhotos (déclenché par la présence d'une
      // ligne pending) ne démarre jamais et l'ancien fond reste affiché
      // jusqu'à un retour sur la page.
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, workspaceId] });

      try {
        const { error } = await invokeWithTimeout(
          "photo-background-replace",
          {
            body: {
              photo_id: photo.id,
              workspace_id: workspaceId,
              background_prompt: prompt,
            },
          },
          90_000,
        );
        if (error) throw new Error(error.message);
      } catch (invokeErr) {
        // L'edge a pu refuser EN AMONT (quota/débit) sans toucher la ligne, qui
        // resterait alors bloquée en « Retouche en cours ». Si elle est encore
        // `pending` (l'edge n'a pas démarré), on la restaure à son état d'avant.
        // Si l'edge a démarré (processing/failed), il gère lui-même le statut.
        const { data: cur } = await supabase
          .from("user_photos")
          .select("status")
          .eq("id", photo.id)
          .maybeSingle();
        if (cur?.status === "pending") {
          const { error: rollbackError } = await supabase
            .from("user_photos")
            .update({ status: "ready", original_storage_path: prevOriginalPath })
            .eq("id", photo.id);
          if (rollbackError) console.error("Failed to rollback photo status:", rollbackError);
          if (snapshotPath) {
            await supabase.storage.from(USER_PHOTOS_BUCKET).remove([snapshotPath]);
          }
        }
        queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, workspaceId] });
        throw invokeErr;
      }

      // L'edge a terminé (ready) : montrer le nouveau fond sans attendre le
      // prochain tick de polling.
      // Le fond a changé SUR PLACE : la description et les tags décrivaient
      // l'ancien décor et rien ne les remettait à jour (audit tags 14/08).
      redescribePhoto(photo.id, workspaceId);
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, workspaceId] });
    } finally {
      setIsPending(false);
    }
  }

  return { mutate, isPending };
}

export interface GeneratePhotoVariantInput {
  sourcePhoto: UserPhotoRow;
  backgroundPrompt: string;
  /** Métadonnées de la NOUVELLE photo (nom, type, tags, description). */
  name: string;
  kind: string;
  tags: string[];
  description: string;
}

/**
 * Génère une NOUVELLE photo de bibliothèque depuis une photo existante, fond
 * remplacé par Photoroom (sujet détouré au pixel, jamais re-généré). Socle
 * commun de « Portrait pro » et des déclinaisons saisonnières.
 *
 * Contrairement à useRetouchExistingPhoto (sur place), on crée une ligne à
 * part : l'originale reste intacte et la personne peut générer plusieurs
 * versions de la même photo. Flux : copie serveur du fichier source vers
 * `${uid}/${newId}_original.jpg` → insert row pending → edge
 * photo-background-replace (écrit `${uid}/${newId}.jpg`, passe la ligne ready).
 * Les ajustements ultérieurs re-passent par useRetouchExistingPhoto sur la
 * ligne générée (chemins déjà distincts → pas de snapshot).
 */
export function useGeneratePhotoVariant() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  async function mutate(input: GeneratePhotoVariantInput): Promise<{ photoId: string }> {
    if (!user?.id || !workspaceId) throw new Error("Espace de travail introuvable");
    if (workspaceId === user.id) {
      throw new Error("Espace de travail en cours de chargement, réessaie dans 1 seconde.");
    }
    const prompt = input.backgroundPrompt.trim();
    if (prompt.length < 3) {
      throw new Error("Choisis une ambiance ou décris ton fond avant de générer.");
    }
    setIsPending(true);
    try {
      const source = input.sourcePhoto;
      // Fichier pristine : l'original si la photo source a déjà été retouchée.
      const srcPath = source.original_storage_path || source.storage_path;

      // 1. Ligne d'abord (id serveur), chemins en placeholder — même pattern
      //    que uploadPhotoOriginal.
      const insertRes = await supabase
        .from("user_photos")
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          storage_path: "",
          original_storage_path: "",
          status: "pending",
          name: input.name.slice(0, 120),
          kind: input.kind,
          source_type: "generated",
          background_prompt: prompt,
          description: input.description.slice(0, 300),
          tags: input.tags.slice(0, 6),
        })
        .select("id")
        .single();
      if (insertRes.error || !insertRes.data) {
        const raw = insertRes.error?.message || "";
        if (raw.toLowerCase().includes("row-level security")) {
          throw new Error("Espace de travail invalide. Recharge la page et réessaie.");
        }
        throw new Error(raw || "Impossible de créer la photo");
      }
      const newId = insertRes.data.id as string;
      const originalPath = `${user.id}/${newId}_original.jpg`;
      const resultPath = `${user.id}/${newId}.jpg`;

      // Nouvelle ligne pending : afficher la carte « en cours » tout de suite
      // (même filet anti-Realtime que useCreatePhotoRetouch) — le polling de
      // useUserPhotos prend ensuite le relais jusqu'à ready/failed.
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, workspaceId] });

      const cleanup = async () => {
        // eslint-disable-next-line nowadays/require-supabase-error-check -- nettoyage best-effort après échec déjà géré (throw juste après) ; un échec du nettoyage ne doit pas masquer l'erreur d'origine
        await supabase.from("user_photos").delete().eq("id", newId);
        await supabase.storage.from(USER_PHOTOS_BUCKET).remove([originalPath]).catch(() => {});
      };

      // 2. Copie serveur du fichier source (pas de re-upload client).
      const { error: copyErr } = await supabase.storage
        .from(USER_PHOTOS_BUCKET)
        .copy(srcPath, originalPath);
      if (copyErr && !/exist|dupl/i.test(copyErr.message)) {
        // eslint-disable-next-line nowadays/require-supabase-error-check -- nettoyage best-effort avant le throw suivant, même raison que cleanup() ci-dessus
        await supabase.from("user_photos").delete().eq("id", newId);
        throw new Error(copyErr.message);
      }

      // 3. Chemins réels sur la ligne.
      const { error: pathErr } = await supabase
        .from("user_photos")
        .update({ original_storage_path: originalPath, storage_path: resultPath })
        .eq("id", newId);
      if (pathErr) {
        await cleanup();
        throw new Error(pathErr.message);
      }

      // 4. Edge (écrit le résultat, ligne → ready ; échec → failed sans débit).
      try {
        const { error } = await invokeWithTimeout(
          "photo-background-replace",
          {
            body: {
              photo_id: newId,
              workspace_id: workspaceId,
              background_prompt: prompt,
            },
          },
          90_000,
        );
        if (error) throw new Error(error.message);
      } catch (invokeErr) {
        // Refus EN AMONT (quota/débit : ligne encore pending) → on retire
        // l'essai de la bibliothèque. Si l'edge a démarré, elle gère le statut.
        const { data: cur } = await supabase
          .from("user_photos")
          .select("status")
          .eq("id", newId)
          .maybeSingle();
        if (!cur || cur.status === "pending") await cleanup();
        queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, workspaceId] });
        throw invokeErr;
      }

      // Les pixels viennent de changer : on re-décrit (audit tags 14/08).
      redescribePhoto(newId, workspaceId);
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, workspaceId] });
      return { photoId: newId };
    } finally {
      setIsPending(false);
    }
  }

  return { mutate, isPending };
}

/** « Portrait pro » : variante portrait (métadonnées dédiées) du socle ci-dessus. */
export function useGeneratePortraitPro() {
  const { mutate: generateVariant, isPending } = useGeneratePhotoVariant();

  async function mutate(input: {
    sourcePhoto: UserPhotoRow;
    backgroundPrompt: string;
    ambianceTitle?: string;
  }): Promise<{ photoId: string }> {
    const source = input.sourcePhoto;
    return generateVariant({
      sourcePhoto: source,
      backgroundPrompt: input.backgroundPrompt,
      name: derivedPhotoName(source.name, "portrait pro", "Portrait"),
      kind: "portrait",
      // Pas d'héritage : seul le FOND change, mais ce sont justement les tags
      // de fond qui deviennent faux (audit 14/08).
      tags: ["portrait-pro"],
      description: derivedPhotoDescription(
        "Portrait pro",
        source.description,
        "Portrait professionnel généré (fond remplacé)",
      ),
    });
  }

  return { mutate, isPending };
}
