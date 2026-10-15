import { readableError } from "@/lib/error-messages";
// build 2026-07-23c
/**
 * ReelMontage — écran de montage d'un reel (Phase 1, beta).
 *
 * À partir des sections du script, propose UN clip libre de droit par section
 * (recherche Pexels via `searchStockVideos`), laisse relancer la recherche par
 * section, puis assemble le tout en MP4 via le moteur `reel-render`.
 *
 * Sources d'un clip : les VIDÉOS DE LA CRÉATRICE (dépôt ou bibliothèque
 * `reel-videos`, avec fenêtre de lecture réglable — la coupe est faite par le
 * moteur via `seek`, on ne découpe rien côté client) et la banque libre en
 * secours. La voix est celle de la créatrice, enregistrée au téléprompteur
 * (ReelVoiceRecorder), ou le reel reste volontairement sans voix.
 */

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Film, Download } from "lucide-react";
import { toast } from "sonner";
import {
  submitReelRender,
  pollReelRender,
  archiveReelMp4,
} from "@/lib/reel-render";
import { useBrandCharter } from "@/hooks/use-branding";
import type { VoiceClip } from "@/lib/reel-voice";
import { MontageModeFork, MontageModeSummary } from "@/features/reel-montage/MontageModeChoice";
import { MontageVoiceChoice } from "@/features/reel-montage/MontageVoiceChoice";
import { StudioClipDialog } from "@/features/reel-montage/StudioClipDialog";
import { montageRenderKey, savedMontageProject } from "@/features/reel-montage/montage-project";
import { assembleRefusal, chosenClips, voiceGuards } from "@/features/reel-montage/assemble-guards";
import { buildMontagePlan } from "@/features/reel-montage/build-montage-plan";
import { useReelStockSearch } from "@/features/reel-montage/use-reel-stock-search";
import { useReelMyVideos } from "@/features/reel-montage/use-reel-my-videos";
import { useReelStudioReturn } from "@/features/reel-montage/use-reel-studio-return";
import { MontagePassageCard } from "@/features/reel-montage/MontagePassageCard";
import { type MontageMode, type Phase, type ReelMontageProject, type Section, type SelectedClip, type StudioCutaway } from "@/features/reel-montage/types";

// Réexportation : ReelResult.tsx et les tests importent ce type depuis ce fichier (fiche 16, lot 1).
export type { ReelMontageProject } from "@/features/reel-montage/types";

interface Props {
  sections: Section[];
  subject?: string;
  workspaceId?: string;
  initialProject?: ReelMontageProject | null;
  onProjectChange?: (project: ReelMontageProject) => void;
  /**
   * Remonte l'avancée du rendu au parent (le parcours ReelResult), qui s'en
   * sert pour savoir si un MP4 existe. Aucune logique de montage n'en dépend.
   */
  onPhaseChange?: (phase: Phase) => void;
  /**
   * Remonte l'URL DURABLE du MP4 (celle de notre bucket, pas celle du moteur
   * de rendu qui expire), pour que le contenu puisse la joindre et la publier.
   * `null` = plus de vidéo rattachable (nouveau rendu lancé, ou échec).
   */
  onMp4Ready?: (url: string | null) => void;
}

export default function ReelMontage({ sections, subject, workspaceId, initialProject, onProjectChange, onPhaseChange, onMp4Ready }: Props) {
  const spoken = sections.filter((s) => typeof s.texte_parle === "string" && s.texte_parle.trim());
  const sectionTexts = spoken.map(s => s.texte_parle || "");
  const { data: charter } = useBrandCharter();

  const [montageMode, setMontageMode] = useState<MontageMode | null>(initialProject?.montageMode || null);

  const [clips, setClips] = useState<(SelectedClip | null)[]>(() => initialProject?.clips?.length === spoken.length ? initialProject.clips : spoken.map(() => null));
  const [cutaways, setCutaways] = useState<(StudioCutaway | null)[]>(() => initialProject?.cutaways?.length === spoken.length ? initialProject.cutaways : spoken.map(() => null));
  const { studioTarget, setStudioTarget, pendingCutaway, setPendingCutaway, highlightedPassage } = useReelStudioReturn({ spoken, workspaceId, montageMode });
  const [associationTexts, setAssociationTexts] = useState(() => initialProject?.sectionTexts || sectionTexts);
  const [needsReview, setNeedsReview] = useState(() => !!initialProject && JSON.stringify(initialProject.sectionTexts) !== JSON.stringify(sectionTexts));
  const sectionFingerprint = JSON.stringify(sectionTexts);
  const previousSectionFingerprint = useRef(sectionFingerprint);
  useEffect(() => {
    if (previousSectionFingerprint.current !== sectionFingerprint) {
      previousSectionFingerprint.current = sectionFingerprint;
      setNeedsReview(true);
    }
  }, [sectionFingerprint]);

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

  // Voix : « recorded » = voix off de la créatrice ; « silent » = montage
  // muet avec texte à l'écran. La voix synthétique n'est pas proposée.
  const [voiceMode, setVoiceMode] = useState<"recorded" | "silent">(initialProject?.voiceMode || "recorded");
  // Prises de voix : URL publique ET durée réelle. La durée cale la scène.
  const [voiceClips, setVoiceClips] = useState<(VoiceClip | null)[]>(() => initialProject?.voiceClips?.length === spoken.length ? initialProject.voiceClips : spoken.map(() => null));
  const voiceUrls = voiceClips.map((c) => c?.url ?? null);
  const voiceDurations = voiceClips.map((c) => c?.duration ?? null);

  // Changing any render input invalidates publication, while preserving takes,
  // chosen clips and the old downloadable MP4. Late rendering responses are ignored.
  const renderKey = montageRenderKey({ sections, clips, cutaways, voiceClips, voiceMode, montageMode, charter });
  const projectCallback = useRef(onProjectChange);
  projectCallback.current = onProjectChange;
  const lastPersistedProject = useRef<string | null>(null);
  useEffect(() => {
    const project = savedMontageProject({ associationTexts, montageMode, voiceMode, clips, voiceClips, cutaways });
    const key = JSON.stringify(project);
    if (lastPersistedProject.current === null) { lastPersistedProject.current = key; return; }
    if (lastPersistedProject.current === key) return;
    lastPersistedProject.current = key;
    projectCallback.current?.(project);
  }, [montageMode, voiceMode, clips, voiceClips, cutaways, associationTexts]);
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

  const { keywords, setKeywords, results, loading, runSearch } = useReelStockSearch({ spoken, subject, montageMode, setClips, activeRender });
  const { myVideos, uploadingSection, fileInputRef, openFilePicker, handleFileChosen, pickFromLibrary } = useReelMyVideos({ setClips });

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

  const ready = clips.filter(Boolean).length;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-primary uppercase tracking-wide">
          <Film className="inline h-3.5 w-3.5 mr-1" /> Monter la vidéo
        </span>
        <Badge variant="secondary" className="text-2xs">beta</Badge>
      </div>

      {!montageMode ? (
        <MontageModeFork setMontageMode={setMontageMode} />
      ) : (
        <>
          <MontageModeSummary montageMode={montageMode} voiceMode={voiceMode} setMontageMode={setMontageMode} />

          {montageMode === "cache" && (
            <MontageVoiceChoice voiceMode={voiceMode} setVoiceMode={setVoiceMode} spoken={spoken} voiceClips={voiceClips} setVoiceClips={setVoiceClips} />
          )}

          {montageMode === "filme" && (
            <p className="text-2xs text-muted-foreground">
              Filme en 1080p (pas 4K) : une prise de 40 s en 4K peut dépasser les 150 Mo autorisés par
              vidéo. La durée de chaque scène sera celle de ta prise, pas celle du script.
            </p>
          )}

          <div className="space-y-2">
            {spoken.map((s, i) => (
              <MontagePassageCard key={i} s={s} i={i} montageMode={montageMode} clips={clips} setClips={setClips} cutaways={cutaways} setCutaways={setCutaways} voiceClips={voiceClips} keywords={keywords} setKeywords={setKeywords} results={results} loading={loading} runSearch={runSearch} uploadingSection={uploadingSection} openFilePicker={openFilePicker} myVideos={myVideos} pickFromLibrary={pickFromLibrary} workspaceId={workspaceId} pendingCutaway={pendingCutaway} setPendingCutaway={setPendingCutaway} setStudioTarget={setStudioTarget} highlightedPassage={highlightedPassage} />
            ))}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => handleFileChosen(e.target.files)}
          />

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-2xs text-muted-foreground">
              {ready} clip{ready > 1 ? "s" : ""} sur {spoken.length} prêt{ready > 1 ? "s" : ""}
            </span>
            <Button size="sm" onClick={handleAssemble} disabled={phase === "rendering" || archiving || ready === 0 || needsReview}>
              {phase === "rendering" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Montage en cours…
                </>
              ) : (
                <>
                  <Film className="h-4 w-4 mr-1.5" />
                  Assembler mon reel
                </>
              )}
            </Button>
          </div>
          {needsReview && <div role="alert" className="rounded-md border border-warning p-3 text-xs space-y-2">
            <p>Le texte du Reel a changé depuis ce montage. Vérifie les clips, voix et plans pour chaque passage avant d’assembler.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => { setAssociationTexts(sectionTexts); setNeedsReview(false); }}>J’ai vérifié les passages</Button>
          </div>}
          {montageMode === "filme" && clips.some(clip => clip?.source === "studio") && <p role="alert" className="text-xs text-destructive">
            Un clip du Studio est muet. Remplace-le par ta prise face caméra, puis ajoute-le comme plan visuel.
          </p>}

          {phase === "rendering" && (
            <p className="text-2xs text-muted-foreground text-center">
              Assemblage des clips, incrustation des sous-titres{montageMode === "cache" ? " et de la voix" : ""}…
              (≈ {Math.max(1, tick * 6)} s)
            </p>
          )}

          {phase === "error" && <p className="text-xs text-destructive">{errorMsg}</p>}

          {mp4Url && phase !== "rendering" && (
            <div className="space-y-2">
              <video src={mp4Url} controls playsInline className="w-full max-h-[420px] rounded-lg bg-black" />
              <div className="flex items-center gap-2 flex-wrap">
                <a href={mp4Url} download target="_blank" rel="noopener noreferrer" className="inline-flex" onClick={(event) => { event.preventDefault(); void handleDownload(); }}>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-1.5" />
                    {downloading ? "Téléchargement…" : "Télécharger le MP4"}
                  </Button>
                </a>
                {downloadFailed && <a href={mp4Url} target="_blank" rel="noopener noreferrer" className="text-xs underline">Ouvrir le MP4 dans un nouvel onglet</a>}
                {phase === "done" && !archived && completedRender.current?.generation === activeRender.current.generation && (
                  <Button variant="outline" size="sm" disabled={archiving} onClick={handleArchiveRetry}>
                    {archiving ? "Enregistrement…" : "Ranger cette vidéo"}
                  </Button>
                )}
                {phase !== "done" ? (
                  <span className="text-2xs text-warning">Ce MP4 correspond au montage précédent. Assemble de nouveau pour publier les modifications.</span>
                ) : archived ? (
                  <span className="text-2xs text-muted-foreground">
                    Rangée dans ta bibliothèque — elle part avec ton contenu à la publication.
                  </span>
                ) : (
                  <span className="text-2xs text-warning">
                    Pas rangée dans ta bibliothèque : télécharge-la, elle ne pourra pas être publiée d'ici.
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
      <StudioClipDialog studioTarget={studioTarget} setStudioTarget={setStudioTarget} spoken={spoken} workspaceId={workspaceId}
        subject={subject} sectionTexts={sectionTexts} setPendingCutaway={setPendingCutaway} />
    </div>
  );
}
