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
import { Film } from "lucide-react";
import { useBrandCharter } from "@/hooks/use-branding";
import type { VoiceClip } from "@/lib/reel-voice";
import { MontageModeFork, MontageModeSummary } from "@/features/reel-montage/MontageModeChoice";
import { MontageVoiceChoice } from "@/features/reel-montage/MontageVoiceChoice";
import { StudioClipDialog } from "@/features/reel-montage/StudioClipDialog";
import { montageRenderKey, savedMontageProject } from "@/features/reel-montage/montage-project";
import { useReelStockSearch } from "@/features/reel-montage/use-reel-stock-search";
import { useReelMyVideos } from "@/features/reel-montage/use-reel-my-videos";
import { useReelStudioReturn } from "@/features/reel-montage/use-reel-studio-return";
import { MontagePassageCard } from "@/features/reel-montage/MontagePassageCard";
import { useReelRender } from "@/features/reel-montage/use-reel-render";
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
  const { phase, tick, mp4Url, archived, errorMsg, archiving, downloadFailed, downloading, archiveRetryAvailable,
    activeRender, handleAssemble, handleArchiveRetry, handleDownload } = useReelRender({
    renderKey, onPhaseChange, onMp4Ready, needsReview, montageMode, voiceMode, spoken, clips, cutaways, voiceUrls, voiceDurations, charter, workspaceId,
  });

  const { keywords, setKeywords, results, loading, runSearch } = useReelStockSearch({ spoken, subject, montageMode, setClips, activeRender });
  const { myVideos, uploadingSection, fileInputRef, openFilePicker, handleFileChosen, pickFromLibrary } = useReelMyVideos({ setClips });


  const ready = clips.filter(Boolean).length;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-primary uppercase tracking-wide">
          <Film className="inline h-3.5 w-3.5 mr-1" /> Monter la vidéo
        </span>
        <Badge variant="secondary" className="text-2xs">bêta</Badge>
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

          <MontageResult spoken={spoken} ready={ready} phase={phase} archiving={archiving} needsReview={needsReview} handleAssemble={handleAssemble} setAssociationTexts={setAssociationTexts} sectionTexts={sectionTexts} setNeedsReview={setNeedsReview} montageMode={montageMode} clips={clips} tick={tick} errorMsg={errorMsg} mp4Url={mp4Url} downloading={downloading} handleDownload={handleDownload} downloadFailed={downloadFailed} archived={archived} archiveRetryAvailable={archiveRetryAvailable} handleArchiveRetry={handleArchiveRetry} />
        </>
      )}
      <StudioClipDialog studioTarget={studioTarget} setStudioTarget={setStudioTarget} spoken={spoken} workspaceId={workspaceId}
        subject={subject} sectionTexts={sectionTexts} setPendingCutaway={setPendingCutaway} />
    </div>
  );
}
