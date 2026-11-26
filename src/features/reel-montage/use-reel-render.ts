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
import { hasInstantPreview, lookOf, maxDurationsFor, sanitizeTweaks, tweakedPlan, type ReelTweaks } from "./reel-preview";
import type { RenderPlan } from "@/lib/reel-plan";
import type { MontageMode, Phase, Section, SelectedClip, StudioCutaway } from "./types";

interface ReelRenderArgs {
  /** MP4 durable déjà monté pour ce script (rechargement, reprise). */
  initialMp4Url?: string | null;
  /** La charte est-elle arrivée ? Tant que non, la clé de rendu n'est pas définitive. */
  inputsReady?: boolean;
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
  /** Retouches de l'aperçu (reel sans voix) : appliquées au MP4 fabriqué. */
  tweaks?: ReelTweaks;
  /** Clé des entrées SANS les retouches : quand elle change, l'aperçu est à refaire. */
  previewKey?: string;
}

export function useReelRender({ initialMp4Url = null, renderKey, onPhaseChange, onMp4Ready, needsReview, montageMode, voiceMode, spoken, clips, cutaways, voiceUrls, voiceDurations, charter, workspaceId, inputsReady = true, tweaks, previewKey = renderKey }: ReelRenderArgs) {
  // Vidéo déjà montée et rangée chez nous (rechargement de Créer, reprise du
  // calendrier) : on la remontre au lieu de repartir de zéro (QA du 12/11/2026).
  const [phase, setPhase] = useState<Phase>(initialMp4Url ? "done" : "idle");
  const [tick, setTick] = useState(0);
  const [mp4Url, setMp4Url] = useState<string | null>(initialMp4Url);
  // La vidéo est-elle bien rangée CHEZ NOUS (donc rattachable au contenu) ?
  const [archived, setArchived] = useState(!!initialMp4Url);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [archiving, setArchiving] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const completedRender = useRef<{ generation: number; url: string } | null>(null);
  // Aperçu immédiat (reel sans voix) : le plan de départ, sans retouche.
  const [previewPlan, setPreviewPlan] = useState<RenderPlan | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const instantPreview = hasInstantPreview(montageMode, voiceMode);
  const archiveBusy = useRef(false);
  // Aperçu en préparation (liens du Studio, plan) : visible à l'écran, sinon le
  // clic sur « Assembler mon reel » ne montrait rien (essai filmé du 26/11/2026).
  const [preparingPreview, setPreparingPreview] = useState(false);
  // Demande d'amener l'aperçu déjà ouvert à l'écran (nouveau clic sur le bouton du bas).
  const [previewFocus, setPreviewFocus] = useState(0);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [onPhaseChange, phase]);

  const activeRender = useRef({ key: renderKey, generation: 0, mounted: true });
  if (activeRender.current.key !== renderKey) {
    activeRender.current = { key: renderKey, generation: activeRender.current.generation + 1, mounted: true };
  }
  const renderBusy = useRef(false);
  // Même vidéo arrivée après l'ouverture de l'onglet : seulement si rien n'est affiché.
  const phaseNow = useRef(phase);
  phaseNow.current = phase;
  useEffect(() => {
    if (!initialMp4Url || renderBusy.current || phaseNow.current !== "idle") return;
    setMp4Url(url => url ?? initialMp4Url);
    setArchived(true);
    setPhase("done");
  }, [initialMp4Url]);
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
  // Idem tant que la charte charge : après un rechargement de page, son arrivée
  // changeait la clé (réglages des sous-titres) et détachait la vidéo rangée.
  useEffect(() => {
    if (!inputsReady) return;
    if (seenRenderKey.current === null) { seenRenderKey.current = renderKey; return; }
    if (seenRenderKey.current === renderKey) return;
    seenRenderKey.current = renderKey;
    setArchived(false);
    setPhase("idle");
    mp4Callback.current?.(null);
  }, [renderKey, inputsReady]);
  // Clips, texte ou mode changés : l'aperçu montrait l'ancien montage, on le referme.
  const seenPreviewKey = useRef(previewKey);
  useEffect(() => {
    if (seenPreviewKey.current === previewKey) return;
    seenPreviewKey.current = previewKey;
    setPreviewPlan(null);
    setPreviewOpen(false);
  }, [previewKey]);

  /** Gardes communes ; renvoie false si l'assemblage est refusé. */
  function passGuards(): boolean {
    const refusal = assembleRefusal({ needsReview, montageMode, clips });
    if (refusal) { toast.error(refusal); return false; }
    const guards = voiceGuards({ montageMode, voiceMode, chosen: chosenClips(clips), voiceUrls });
    if (guards.confirm && !window.confirm(guards.confirm)) return false;
    if (guards.refuse) { toast.error(guards.refuse); return false; }
    return true;
  }

  /** « Assembler mon reel » : aperçu immédiat (sans voix) ou rendu MP4 (autres modes). */
  async function handleAssemble() {
    if (!instantPreview) return renderMp4();
    // Aperçu déjà ouvert pour ces entrées : on le remontre, on ne le refait pas.
    // Le refaire rechargeait le lecteur et tous les clips (« ça ralentit quand je reclique »).
    if (previewOpen && previewPlan) { setPreviewFocus(n => n + 1); return; }
    if (renderBusy.current || archiveBusy.current) return;
    if (!passGuards()) return;
    const generation = activeRender.current.generation;
    renderBusy.current = true;
    setPreparingPreview(true);
    try {
      const chosen = chosenClips(clips);
      const plan = await buildMontagePlan({ spoken, clips, chosen, cutaways, montageMode, voiceMode, voiceUrls, voiceDurations, charter, workspaceId });
      if (!activeRender.current.mounted || activeRender.current.generation !== generation) return;
      setPreviewPlan(plan);
      setPreviewOpen(true);
      setErrorMsg("");
      if (phase === "error") setPhase("idle");
    } catch (e) {
      toast.error(readableError(e, "L’aperçu n’a pas pu se préparer."));
    } finally {
      renderBusy.current = false;
      if (activeRender.current.mounted) setPreparingPreview(false);
    }
  }

  /** Fabrique le MP4 (relais Google Cloud ou JSON2Video), le range chez nous, et le télécharge si demandé. */
  async function renderMp4(opts: { download?: boolean } = {}) {
    if (renderBusy.current || archiveBusy.current) return;
    if (!instantPreview && !passGuards()) return;
    if (instantPreview && !previewPlan) return;
    const generation = activeRender.current.generation;
    const isCurrent = () => activeRender.current.mounted && activeRender.current.generation === generation;
    const chosen = chosenClips(clips);
    renderBusy.current = true;
    setArchived(false);
    setPhase("rendering");
    setTick(0);
    // Retain the last download until a new render succeeds, including on failure.
    onMp4Ready?.(null);
    setErrorMsg("");
    try {
      let project: string;
      if (instantPreview && previewPlan) {
        // Les liens du Studio expirent : on resigne, puis on applique les retouches de l'aperçu.
        const fresh = await buildMontagePlan({ spoken, clips, chosen, cutaways, montageMode, voiceMode, voiceUrls, voiceDurations, charter, workspaceId });
        const n = fresh.sections.length;
        const t = sanitizeTweaks(tweaks, n);
        project = await submitReelRender(tweakedPlan(fresh, t, maxDurationsFor(clips)), lookOf(t));
      } else {
        const plan = await buildMontagePlan({ spoken, clips, chosen, cutaways, montageMode, voiceMode, voiceUrls, voiceDurations, charter, workspaceId });
        project = await submitReelRender(plan);
      }
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
        setPreviewOpen(false);
        if (opts.download) void downloadFile(durable);
      } catch (e) {
        if (!isCurrent()) return;
        console.error("[ReelMontage] archivage du MP4 échoué:", e);
        setArchived(false);
        onMp4Ready?.(null);
        setPreviewOpen(false);
        if (opts.download) void downloadFile(url);
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
    await downloadFile(mp4Url);
  }

  async function downloadFile(fileUrl: string) {
    setDownloading(true);
    setDownloadFailed(false);
    try {
      const response = await fetch(fileUrl);
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
    instantPreview, previewPlan: previewOpen ? previewPlan : null, hasPreview: !!previewPlan,
    reopenPreview: () => { if (previewPlan) setPreviewOpen(true); },
    renderMp4, preparingPreview, previewFocus,
  };
}
