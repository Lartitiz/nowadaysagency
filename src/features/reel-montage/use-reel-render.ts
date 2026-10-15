// Rendu de l'écran de montage d'un reel : « Assembler mon reel » (gardes, plan,
// rendu, archivage chez nous), « Ranger cette vidéo » sans relancer le rendu,
// téléchargement, et invalidation du MP4 quand une entrée change (jamais au
// premier rendu). Sorti de ReelMontage.tsx à l'identique (fiche 16 de
// docs/robustesse/gros-fichiers.md, lot 6). `activeRender` est créé ici et rendu
// au composant : la recherche Pexels lit la même ref. Les deux façons d'appeler
// la page (`mp4Callback` dans l'effet, `onMp4Ready` en direct) restent telles quelles.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { readableError } from "@/lib/error-messages";
import { submitReelRender, pollReelRender, archiveReelMp4, type CharterForSubtitles } from "@/lib/reel-render";
import { assembleRefusal, chosenClips, voiceGuards } from "./assemble-guards";
import { buildMontagePlan } from "./build-montage-plan";
import type { MontageMode, Phase, Section, SelectedClip, StudioCutaway } from "./types";

interface ReelRenderArgs {
  renderKey: string;
  onPhaseChange?: (phase: Phase) => void;
  onMp4Ready?: (url: string | null) => void;
  needsReview: boolean;
  montageMode: MontageMode | null;
  voiceMode: "recorded" | "silent";
  spoken: Section[];
  clips: (SelectedClip | null)[];
  cutaways: (StudioCutaway | null)[];
  voiceUrls: (string | null)[];
  voiceDurations: (number | null)[];
  charter: CharterForSubtitles | null | undefined;
  workspaceId?: string;
}

export function useReelRender({ renderKey, onPhaseChange, onMp4Ready, needsReview, montageMode, voiceMode, spoken, clips, cutaways, voiceUrls, voiceDurations, charter, workspaceId }: ReelRenderArgs) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [tick, setTick] = useState(0);
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  // La vidéo est-elle bien rangée CHEZ NOUS (donc rattachable au contenu) ?
  const [archived, setArchived] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [archiving, setArchiving] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const completedRender = useRef<{ generation: number; url: string } | null>(null);
  const archiveBusy = useRef(false);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [onPhaseChange, phase]);

  const activeRender = useRef({ key: renderKey, generation: 0, mounted: true });
  if (activeRender.current.key !== renderKey) {
    activeRender.current = { key: renderKey, generation: activeRender.current.generation + 1, mounted: true };
  }
  const renderBusy = useRef(false);
  const mp4Callback = useRef(onMp4Ready);
  mp4Callback.current = onMp4Ready;
  useEffect(() => {
    activeRender.current.mounted = true;
    return () => { activeRender.current.mounted = false; activeRender.current.generation++; };
  }, []);
  // Au tout premier rendu, ne RIEN invalider : à la reprise d'un reel déjà
  // monté, ouvrir l'onglet « Montage » monte ce composant et effaçait le MP4
  // durable restauré. On n'invalide que sur un VRAI changement d'entrées.
  const seenRenderKey = useRef<string | null>(null);
  useEffect(() => {
    if (seenRenderKey.current === null) { seenRenderKey.current = renderKey; return; }
    if (seenRenderKey.current === renderKey) return;
    seenRenderKey.current = renderKey;
    setArchived(false);
    setPhase("idle");
    mp4Callback.current?.(null);
  }, [renderKey]);

  async function handleAssemble() {
    if (renderBusy.current || archiveBusy.current) return;
    const refusal = assembleRefusal({ needsReview, montageMode, clips });
    if (refusal) { toast.error(refusal); return; }
    const generation = activeRender.current.generation;
    const isCurrent = () => activeRender.current.mounted && activeRender.current.generation === generation;
    const chosen = chosenClips(clips);
    const guards = voiceGuards({ montageMode, voiceMode, chosen, voiceUrls });
    if (guards.confirm && !window.confirm(guards.confirm)) return;
    if (guards.refuse) { toast.error(guards.refuse); return; }
    renderBusy.current = true;
    setArchived(false);
    setPhase("rendering");
    setTick(0);
    // Retain the last download until a new render succeeds, including on failure.
    onMp4Ready?.(null);
    setErrorMsg("");
    try {
      const plan = await buildMontagePlan({ spoken, clips, chosen, cutaways, montageMode, voiceMode, voiceUrls, voiceDurations, charter, workspaceId });
      const project = await submitReelRender(plan);
      const url = await pollReelRender(project, { onTick: (n) => { if (isCurrent()) setTick(n); } });
      if (!isCurrent()) return;
      // Le rendu vit chez JSON2Video et y expire : on le recopie chez nous
      // AVANT d'annoncer que la vidéo est prête. Si l'archivage échoue, la
      // vidéo reste regardable et téléchargeable (on garde l'URL du rendu),
      // mais elle n'est pas rattachable — et on le dit.
      setMp4Url(url);
      completedRender.current = { generation, url };
      setDownloadFailed(false);
      try {
        const durable = await archiveReelMp4(url);
        if (!isCurrent()) return;
        setMp4Url(durable);
        setArchived(true);
        onMp4Ready?.(durable);
      } catch (e) {
        if (!isCurrent()) return;
        console.error("[ReelMontage] archivage du MP4 échoué:", e);
        setArchived(false);
        onMp4Ready?.(null);
      }
      setPhase("done");
      toast.success("Ton reel est monté !");
    } catch (e) {
      if (!isCurrent()) return;
      setErrorMsg(readableError(e, "Le montage a échoué."));
      setPhase("error");
    } finally {
      renderBusy.current = false;
    }
  }

  async function handleArchiveRetry() {
    const completed = completedRender.current;
    if (!completed || archived || phase !== "done" || archiveBusy.current || renderBusy.current ||
      completed.generation !== activeRender.current.generation) return;
    const isCurrent = () => activeRender.current.mounted &&
      completed.generation === activeRender.current.generation;
    archiveBusy.current = true;
    setArchiving(true);
    try {
      const durable = await archiveReelMp4(completed.url);
      if (!isCurrent()) return;
      setMp4Url(durable);
      setArchived(true);
      setDownloadFailed(false);
      onMp4Ready?.(durable);
      toast.success("Ta vidéo est rangée dans ta bibliothèque.");
    } catch (error) {
      if (isCurrent()) toast.error(readableError(error, "La vidéo n’a pas pu être rangée. Réessaie."));
    } finally {
      archiveBusy.current = false;
      if (activeRender.current.mounted) setArchiving(false);
    }
  }

  async function handleDownload() {
    if (!mp4Url || downloading) return;
    setDownloading(true);
    setDownloadFailed(false);
    try {
      const response = await fetch(mp4Url);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "mon-reel.mp4";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (activeRender.current.mounted) {
        setDownloadFailed(true);
        toast.error("Le navigateur bloque le téléchargement direct. Ouvre le MP4 dans un nouvel onglet pour l’enregistrer ; ton montage reste ici.");
      }
    } finally {
      if (activeRender.current.mounted) setDownloading(false);
    }
  }

  // « Ranger cette vidéo » n'est proposé que pour le rendu des entrées actuelles.
  const archiveRetryAvailable = completedRender.current?.generation === activeRender.current.generation;

  return {
    phase, tick, mp4Url, archived, errorMsg, archiving, downloadFailed, downloading, archiveRetryAvailable,
    activeRender, handleAssemble, handleArchiveRetry, handleDownload,
  };
}
