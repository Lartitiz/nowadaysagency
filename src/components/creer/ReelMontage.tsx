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

import { useEffect, useMemo, useRef, useState } from "react";
import { Film } from "lucide-react";
import { useBrandCharter } from "@/hooks/use-branding";
import type { VoiceClip } from "@/lib/reel-voice";
import { MontageModeFork, MontageModeSummary } from "@/features/reel-montage/MontageModeChoice";
import { storedReelFaceCam } from "@/lib/reel-film-preference";
import { MontageVoiceChoice } from "@/features/reel-montage/MontageVoiceChoice";
import { StudioClipDialog } from "@/features/reel-montage/StudioClipDialog";
import { montageRenderKey, savedMontageProject, withTweaksKey } from "@/features/reel-montage/montage-project";
import { ReelPreview } from "@/features/reel-montage/ReelPreview";
import { ReelStage } from "@/features/reel-montage/ReelStage";
import ReelVoiceRecorder from "@/components/creer/ReelVoiceRecorder";
import { DEFAULT_TWEAKS, hasInstantPreview, maxDurationsFor, previewComposition, sanitizeTweaks, spokenPlaybackComposition, tweakedPlan, type ReelTweaks } from "@/features/reel-montage/reel-preview";
import { provisionalCaptions, reelTimeline, withPhrasesToRecord } from "@/features/reel-montage/reel-timeline";
import { useReelStockSearch } from "@/features/reel-montage/use-reel-stock-search";
import { useReelMyVideos } from "@/features/reel-montage/use-reel-my-videos";
import { useReelStudioReturn } from "@/features/reel-montage/use-reel-studio-return";
import { MontagePassageCard } from "@/features/reel-montage/MontagePassageCard";
import { useReelRender } from "@/features/reel-montage/use-reel-render";
import { lastVoiceMode, rememberVoiceMode } from "@/features/reel-montage/voice-preference";
import { useReelStartPhoto } from "@/features/reel-montage/use-reel-start-photo";
import { MontageResult } from "@/features/reel-montage/MontageResult";
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
  /** Vidéo déjà montée et rangée pour ce script : remontrée telle quelle. */
  initialMp4Url?: string | null;
  /** Photo de départ du reel (data URL ou URL), proposée sur le premier passage. */
  startPhoto?: string | null;
}

/** Choix déjà fait sur l'écran des accroches : on ne repose pas la question au montage (« Changer » reste là). */
function montageModeFromPreference(): MontageMode | null {
  const stored = storedReelFaceCam();
  return stored === "oui" ? "filme" : stored === "non" ? "cache" : null;
}

export default function ReelMontage({ sections, subject, workspaceId, initialProject, onProjectChange, onPhaseChange, onMp4Ready, startPhoto, initialMp4Url }: Props) {
  const spoken = sections.filter((s) => typeof s.texte_parle === "string" && s.texte_parle.trim());
  const sectionTexts = spoken.map(s => s.texte_parle || "");
  const { data: charter, isLoading: charterLoading } = useBrandCharter();

  const [montageMode, setMontageMode] = useState<MontageMode | null>(initialProject?.montageMode || montageModeFromPreference());

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

  // Voix : « recorded » = voix off de la créatrice ; « silent » = montage
  // muet avec texte à l'écran. La voix synthétique n'est pas proposée.
  // Nouveau reel : part du dernier choix fait dans ce navigateur (voice-preference.ts).
  const [voiceMode, setVoiceModeState] = useState<"recorded" | "silent">(() => initialProject?.voiceMode || lastVoiceMode());
  const setVoiceMode = (mode: "recorded" | "silent") => { rememberVoiceMode(mode); setVoiceModeState(mode); };
  // Prises de voix : URL publique ET durée réelle. La durée cale la scène.
  const [voiceClips, setVoiceClips] = useState<(VoiceClip | null)[]>(() => initialProject?.voiceClips?.length === spoken.length ? initialProject.voiceClips : spoken.map(() => null));
  const voiceUrls = voiceClips.map((c) => c?.url ?? null);
  const voiceDurations = voiceClips.map((c) => c?.duration ?? null);

  // Changing any render input invalidates publication, while preserving takes,
  // chosen clips and the old downloadable MP4. Late rendering responses are ignored.
  // Retouches de l'aperçu du reel sans voix (bornées ; remises à la longueur du plan à l'usage).
  const [tweaks, setTweaks] = useState<ReelTweaks>(() => initialProject?.tweaks ? sanitizeTweaks(initialProject.tweaks, initialProject.clips.filter(Boolean).length) : DEFAULT_TWEAKS);
  const previewKey = montageRenderKey({ sections, clips, cutaways, voiceClips, voiceMode, montageMode, charter });
  const renderKey = withTweaksKey(previewKey, tweaks, hasInstantPreview(montageMode, voiceMode));
  const projectCallback = useRef(onProjectChange);
  projectCallback.current = onProjectChange;
  const lastPersistedProject = useRef<string | null>(null);
  useEffect(() => {
    const project = savedMontageProject({ associationTexts, montageMode, voiceMode, clips, voiceClips, cutaways, tweaks });
    const key = JSON.stringify(project);
    if (lastPersistedProject.current === null) { lastPersistedProject.current = key; return; }
    if (lastPersistedProject.current === key) return;
    lastPersistedProject.current = key;
    projectCallback.current?.(project);
  }, [montageMode, voiceMode, clips, voiceClips, cutaways, associationTexts, tweaks]);
  const { phase, tick, mp4Url, archived, errorMsg, archiving, downloadFailed, downloading, archiveRetryAvailable,
    activeRender, handleAssemble, handleArchiveRetry, handleDownload, previewPlan, hasPreview, reopenPreview, renderMp4, instantPreview, preparingPreview, previewFocus, openPlayback } = useReelRender({
    initialMp4Url, renderKey, previewKey, tweaks, onPhaseChange, onMp4Ready, needsReview, montageMode, voiceMode, spoken, clips, cutaways, voiceUrls, voiceDurations, charter, workspaceId, inputsReady: !charterLoading,
  });
  const maxDurations = maxDurationsFor(clips);
  // La page du reel entier, jouée par la scène. Sans voix : avec les retouches. Avec une voix
  // (« Ma voix », « Je me filme ») : les prises posées, sous-titres provisoires (reel-timeline.ts).
  const preview = useMemo(() => {
    if (!previewPlan) return null;
    if (instantPreview) return previewComposition(previewPlan, tweaks, maxDurations, window.location.origin);
    // Passage pas encore enregistré : sa phrase s'affiche quand même (piste muette, lecture seulement).
    const played = withPhrasesToRecord(previewPlan);
    return spokenPlaybackComposition(played, provisionalCaptions(played, clips, spoken, voiceDurations), window.location.origin);
  },
    // maxDurations découle de clips ; spoken et voiceDurations changent la clé de l'aperçu, donc previewPlan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewPlan, tweaks, clips, instantPreview]);
  const timeline = reelTimeline({ spoken, clips, montageMode, voiceMode, voiceUrls, voiceDurations, tweaks });
  // Passages tels que retouchés (durées), dans l'ordre du script : ce que lit l'IA de « Dis ce que tu veux changer ».
  const previewPassages = previewPlan && instantPreview
    ? tweakedPlan(previewPlan, { ...sanitizeTweaks(tweaks, previewPlan.sections.length), order: null }, maxDurations).sections
      .map((s) => ({ duration: s.duration, text: s.overlay_text || "" }))
    : [];

  const { keywords, setKeywords, results, loading, runSearch } = useReelStockSearch({ spoken, subject, montageMode, setClips, activeRender });
  const { myVideos, uploadingSection, fileInputRef, openFilePicker, handleFileChosen, pickFromLibrary } = useReelMyVideos({ setClips });
  const startPhotoTools = useReelStartPhoto({ startPhoto, montageMode, resumed: !!initialProject?.montageMode, setClips });


  const ready = clips.filter(Boolean).length;

  // Un passage par page (« Passage 2 sur 4 ») : l'écran reste court et
  // « Télécharger ma vidéo » reste en vue. Le retour du Studio rouvre le bon passage.
  const [current, setCurrent] = useState(() => highlightedPassage ?? 0);
  const page = Math.min(current, Math.max(0, spoken.length - 1));
  useEffect(() => { if (highlightedPassage !== null) setCurrent(highlightedPassage); }, [highlightedPassage]);
  useEffect(() => { if (pendingCutaway) setCurrent(pendingCutaway.index); }, [pendingCutaway]);
  const goTo = (index: number) => {
    setCurrent(index);
    if (index !== current) requestAnimationFrame(() => document.getElementById(`studio-reel-passage-${index}`)?.scrollIntoView?.({ block: "nearest" }));
  };

  // Passage dont la voix s'enregistre : la scène joue son image (Loom du 27/11/2026).
  const [recordingPassage, setRecordingPassage] = useState<number | null>(null);
  const voiceSlot = montageMode === "cache" && voiceMode === "recorded" ? (
    <ReelVoiceRecorder texts={spoken.map((s) => s.texte_parle as string)} initialClips={voiceClips} onVoicesChange={setVoiceClips}
      index={page} onIndexChange={goTo} onRecordingChange={setRecordingPassage} />
  ) : undefined;

  return (
    <div data-testid="reel-atelier" className="space-y-3">
      {!montageMode ? (
        <div className="mx-auto max-w-2xl rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
          <span className="text-xs font-bold text-primary uppercase tracking-wide">
            <Film className="inline h-3.5 w-3.5 mr-1" /> Monter la vidéo
          </span>
          <MontageModeFork setMontageMode={setMontageMode} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-6">
          <ReelStage spoken={spoken} clips={clips} page={page} goTo={goTo} focus={previewFocus} searching={loading}
            timeline={timeline} reelHtml={preview?.html ?? null} onPlayAll={() => void openPlayback()} preparing={preparingPreview}
            onFollow={setCurrent} recording={voiceSlot ? recordingPassage : null}
            mp4Url={phase !== "rendering" ? mp4Url : null} />

          <div className="min-w-0 space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4">
            <MontageModeSummary montageMode={montageMode} voiceMode={voiceMode} setMontageMode={setMontageMode} />

            {montageMode === "cache" && <MontageVoiceChoice voiceMode={voiceMode} setVoiceMode={setVoiceMode} />}

            {montageMode === "filme" && (
              <p className="text-2xs text-muted-foreground">
                Filme en 1080p (pas 4K) : une prise de 40 s en 4K peut dépasser les 150 Mo autorisés par
                vidéo. La durée de chaque scène sera celle de ta prise, pas celle du script.
              </p>
            )}

            {spoken[page] && (
              <MontagePassageCard key="passage" s={spoken[page]} i={page} total={spoken.length} montageMode={montageMode} clips={clips} setClips={setClips} cutaways={cutaways} setCutaways={setCutaways} voiceClips={voiceClips} keywords={keywords} setKeywords={setKeywords} results={results} loading={loading} runSearch={runSearch} uploadingSection={uploadingSection} openFilePicker={openFilePicker} myVideos={myVideos} pickFromLibrary={pickFromLibrary} workspaceId={workspaceId} pendingCutaway={pendingCutaway} setPendingCutaway={setPendingCutaway} setStudioTarget={setStudioTarget} highlightedPassage={highlightedPassage} voiceSlot={voiceSlot}
                onPrevious={page > 0 ? () => goTo(page - 1) : undefined} onNext={page < spoken.length - 1 ? () => goTo(page + 1) : undefined} {...startPhotoTools} />
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleFileChosen(e.target.files)}
            />

            {preview && instantPreview && (
              <ReelPreview duration={preview.duration} tweaks={tweaks} setTweaks={setTweaks} passages={previewPassages}
                workspaceId={workspaceId} busy={phase === "rendering"} onSave={() => void renderMp4()} />
            )}
            <MontageResult previewOpen={!!preview && instantPreview} canReopenPreview={instantPreview && hasPreview && !preview} reopenPreview={reopenPreview} spoken={spoken} ready={ready} phase={phase} archiving={archiving} needsReview={needsReview} handleAssemble={handleAssemble} setAssociationTexts={setAssociationTexts} sectionTexts={sectionTexts} setNeedsReview={setNeedsReview} montageMode={montageMode} voiceMode={voiceMode} clips={clips} tick={tick} errorMsg={errorMsg} mp4Url={mp4Url} downloading={downloading} handleDownload={handleDownload} downloadFailed={downloadFailed} archived={archived} archiveRetryAvailable={archiveRetryAvailable} handleArchiveRetry={handleArchiveRetry} />
          </div>
        </div>
      )}
      <StudioClipDialog studioTarget={studioTarget} setStudioTarget={setStudioTarget} spoken={spoken} workspaceId={workspaceId}
        subject={subject} sectionTexts={sectionTexts} setPendingCutaway={setPendingCutaway} />
    </div>
  );
}
