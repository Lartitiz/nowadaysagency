// « Mes vidéos » de l'écran de montage d'un reel : bibliothèque perso (dépôts
// précédents), dépôt d'une nouvelle vidéo sur une phrase, reprise d'une vidéo
// déposée. Sorti de ReelMontage.tsx à l'identique (fiche 16 de
// docs/robustesse/gros-fichiers.md, lot 4). `listReelVideos` n'est appelé qu'au
// montage du composant (reel-result.test.tsx le vérifie).
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { readableError } from "@/lib/error-messages";
import { uploadReelVideo, listReelVideos, loadVideoDuration, type UserReelVideo } from "@/lib/reel-user-videos";
import { fromMine, set, type SelectedClip } from "./types";

export function useReelMyVideos({ setClips }: { setClips: Dispatch<SetStateAction<(SelectedClip | null)[]>> }) {
  // Mes vidéos : bibliothèque perso (dépôts précédents) + upload en cours.
  const [myVideos, setMyVideos] = useState<UserReelVideo[]>([]);
  const [uploadingSection, setUploadingSection] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef(0);

  // Bibliothèque perso, chargée une fois (best-effort).
  useEffect(() => {
    listReelVideos().then(setMyVideos).catch(() => {});
  }, []);

  function openFilePicker(i: number) {
    uploadTargetRef.current = i;
    fileInputRef.current?.click();
  }

  async function handleFileChosen(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const i = uploadTargetRef.current;
    setUploadingSection(i);
    try {
      const video = await uploadReelVideo(file);
      const duration = await loadVideoDuration(video.url);
      setMyVideos((v) => [video, ...v]);
      setClips((C) => set(C, i, fromMine(video, duration)));
      toast.success("Ta vidéo est prête pour cette section.");
    } catch (e) {
      toast.error(readableError(e, "L'envoi de la vidéo a échoué."));
    } finally {
      setUploadingSection(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function pickFromLibrary(i: number, url: string) {
    const video = myVideos.find((v) => v.url === url);
    if (!video) return;
    const duration = await loadVideoDuration(video.url);
    setClips((C) => set(C, i, fromMine(video, duration)));
  }

  return { myVideos, uploadingSection, fileInputRef, openFilePicker, handleFileChosen, pickFromLibrary };
}
