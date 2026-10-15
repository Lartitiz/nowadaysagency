// Retour du Studio vers l'écran de montage d'un reel : passage visé
// (`studio_passage`), clip choisi (`studio_clip`, ou clé de session
// `studio-video-for-reel:<espace>` posée par la bibliothèque du Studio),
// boîte de dialogue ouverte et clip à prévisualiser. Sorti de ReelMontage.tsx à
// l'identique (fiche 16 de docs/robustesse/gros-fichiers.md, lot 5). La clé de
// session est relue à chaque rendu tant que le clip n'est pas chargé : voulu.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { readStudioVideo, type StudioVideoJob } from "@/features/studio-video/api";
import type { MontageMode, Section } from "./types";

export function useReelStudioReturn({ spoken, workspaceId, montageMode }: { spoken: Section[]; workspaceId?: string; montageMode: MontageMode | null }) {
  const [studioTarget, setStudioTarget] = useState<{ index: number; create: boolean } | null>(null);
  const [pendingCutaway, setPendingCutaway] = useState<{ index: number; job: StudioVideoJob } | null>(null);
  const reelReturn = new URLSearchParams(window.location.search);
  const returnPassage = reelReturn.get("studio_passage");
  const highlightedPassage = returnPassage !== null && /^\d+$/.test(returnPassage) && Number(returnPassage) < spoken.length
    ? Number(returnPassage) : null;
  const returnedClipId = reelReturn.get("studio_clip");
  const pendingLibraryKey = workspaceId ? `studio-video-for-reel:${workspaceId}` : null;
  let pendingLibraryClip: string | null = null;
  try { pendingLibraryClip = pendingLibraryKey ? sessionStorage.getItem(pendingLibraryKey) : null; } catch { /* Le sélecteur du Studio reste disponible. */ }
  const returnClipLoaded = useRef(false);
  useEffect(() => {
    const clipId = returnedClipId && highlightedPassage !== null ? returnedClipId : pendingLibraryClip;
    const target = returnedClipId && highlightedPassage !== null ? highlightedPassage : spoken.length ? 0 : null;
    if (returnClipLoaded.current || !workspaceId || target === null || !clipId) return;
    returnClipLoaded.current = true;
    void readStudioVideo(workspaceId, clipId).then(({ job }) => {
      if (job.status === "ready" && job.video_url) setPendingCutaway({ index: target, job });
      else toast.error("Ce clip du Studio n’est pas encore disponible.");
    }).catch(() => toast.error("Impossible de retrouver ce clip du Studio.")).finally(() => {
      if (pendingLibraryKey && pendingLibraryClip === clipId) try { sessionStorage.removeItem(pendingLibraryKey); } catch { /* Sans effet sur le montage. */ }
    });
  }, [workspaceId, highlightedPassage, returnedClipId, pendingLibraryClip, pendingLibraryKey, spoken.length]);
  useEffect(() => {
    if (highlightedPassage === null || !montageMode) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`studio-reel-passage-${highlightedPassage}`)?.scrollIntoView?.({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [highlightedPassage, montageMode]);

  return { studioTarget, setStudioTarget, pendingCutaway, setPendingCutaway, highlightedPassage };
}
