// Chaque image prête du Studio va toute seule dans « Mes photos » (choix de
// Laetitia du 18/10/2026, règle « une image payée ne se perd jamais »). Le
// rangement passe par l'action serveur `save` (visual-studio/actions/save.ts),
// sans doublon : elle renvoie la photo déjà rangée si la version en a une
// (`library_photo_id`). Une photo retirée ensuite de la bibliothèque garde son
// `library_photo_id` : elle n'est donc jamais remise d'office.
import { useCallback, useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { studioRequest, type StudioState, type StudioVersion } from "@/features/visual-studio/api";

export function useStudioLibrarySync({
  current,
  sessionId,
  workspaceId,
  writable,
  cache,
  queryKey,
}: {
  current: StudioState | undefined;
  sessionId: string | null;
  workspaceId: string;
  writable: boolean;
  cache: QueryClient;
  queryKey: unknown[];
}) {
  const tried = useRef(new Set<string>());
  const inflight = useRef(new Map<string, Promise<string>>());
  const keyRef = useRef(queryKey);
  keyRef.current = queryKey;

  const saveVersion = useCallback(async (version: Pick<StudioVersion, "id" | "library_photo_id">) => {
    if (version.library_photo_id) return version.library_photo_id;
    let pending = inflight.current.get(version.id);
    if (!pending) {
      pending = studioRequest<{ photo_id: string }>({
        action: "save",
        workspace_id: workspaceId,
        session_id: sessionId,
        version_id: version.id,
      }).then((receipt) => receipt.photo_id);
      inflight.current.set(version.id, pending);
      pending.catch(() => inflight.current.delete(version.id));
    }
    const photoId = await pending;
    cache.setQueryData<StudioState>(keyRef.current, (old) => old && {
      ...old,
      versions: old.versions.map((v) => v.id === version.id ? { ...v, library_photo_id: photoId } : v),
    });
    return photoId;
  }, [cache, sessionId, workspaceId]);

  useEffect(() => {
    if (!current || !writable || !sessionId || current.session.id !== sessionId) return;
    const pending = current.versions.filter((v) =>
      v.status === "ready" && !v.library_photo_id && !tried.current.has(v.id)
    );
    if (!pending.length) return;
    pending.forEach((v) => tried.current.add(v.id));
    void (async () => {
      let saved = 0, failed = 0;
      for (const v of pending) {
        try {
          await saveVersion(v);
          saved += 1;
        } catch {
          failed += 1;
        }
      }
      if (saved) {
        void cache.invalidateQueries({ queryKey: ["user-photos", workspaceId] });
        toast.success(saved > 1 ? `${saved} images rangées dans Mes photos.` : "Image rangée dans Mes photos.");
      }
      if (failed) {
        toast.error(failed > 1
          ? `${failed} images n’ont pas pu être rangées dans Mes photos. Elles restent ici et seront rangées à ta prochaine visite.`
          : "L’image n’a pas pu être rangée dans Mes photos. Elle reste ici et sera rangée à ta prochaine visite.");
      }
    })();
  }, [current, writable, sessionId, workspaceId, cache, saveVersion]);

  return { saveVersion };
}
