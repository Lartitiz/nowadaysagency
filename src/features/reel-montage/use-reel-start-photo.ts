// Photo de départ d'un reel créé à partir d'une photo : proposée d'office sur
// le premier passage en mode « Je ne me montre pas » (une seule fois, et jamais
// à la reprise d'un montage déjà commencé), et au choix sur n'importe quel
// passage. Envoyée une seule fois au stockage, puis réutilisée.
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { readableError } from "@/lib/error-messages";
import { uploadReelStartPhoto } from "@/lib/reel-user-videos";
import { fromStartPhoto, set, type MontageMode, type SelectedClip } from "./types";

interface StartPhotoArgs {
  startPhoto?: string | null;
  montageMode: MontageMode | null;
  /** Montage déjà commencé (projet sauvegardé avec un mode) : on ne réimpose rien. */
  resumed: boolean;
  setClips: Dispatch<SetStateAction<(SelectedClip | null)[]>>;
}

export function useReelStartPhoto({ startPhoto, montageMode, resumed, setClips }: StartPhotoArgs) {
  const [placing, setPlacing] = useState<number | null>(null);
  const uploaded = useRef<Promise<string> | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  async function place(i: number, auto: boolean) {
    if (!startPhoto) return;
    setPlacing(i);
    try {
      uploaded.current ??= uploadReelStartPhoto(startPhoto);
      const clip = fromStartPhoto(await uploaded.current);
      if (!mounted.current) return;
      // D'office : seulement sur un passage vide ou rempli par la banque libre.
      setClips(C => auto && C[i] && C[i]!.source !== "stock" ? C : set(C, i, clip));
    } catch (e) {
      uploaded.current = null;
      if (mounted.current && !auto) toast.error(readableError(e, "Ta photo n'a pas pu être ajoutée."));
    } finally {
      if (mounted.current) setPlacing(null);
    }
  }

  const proposed = useRef(resumed);
  useEffect(() => {
    if (!startPhoto || montageMode !== "cache" || proposed.current) return;
    proposed.current = true;
    void place(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPhoto, montageMode]);

  return {
    canUseStartPhoto: !!startPhoto && montageMode === "cache",
    placingStartPhoto: placing,
    placeStartPhoto: (i: number) => void place(i, false),
  };
}
