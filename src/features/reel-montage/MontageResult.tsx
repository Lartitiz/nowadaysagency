// Pied de l'écran de montage d'un reel : « Assembler mon reel », alertes (texte
// à revérifier, clip Studio muet), progression, erreur, lecteur, téléchargement,
// « Ranger cette vidéo » et statut. Sorti de ReelMontage.tsx à l'identique
// (fiche 16 de docs/robustesse/gros-fichiers.md, lot 6) ; seul le test « rendu
// des entrées actuelles » arrive calculé (`archiveRetryAvailable`).
import { Button } from "@/components/ui/button";
import { Loader2, Film, Download, Eye } from "lucide-react";
import { formatElapsed, useElapsedSeconds, waitNote } from "./use-elapsed";
import type { MontageMode, Phase, Section, SelectedClip } from "./types";

interface MontageResultProps {
  /** Aperçu immédiat ouvert (reel sans voix) : il porte lui-même l'avancement et les boutons. */
  previewOpen?: boolean;
  /** Aperçu en préparation après le clic : le bouton le dit tout de suite. */
  preparingPreview?: boolean;
  canReopenPreview?: boolean;
  reopenPreview?: () => void;
  spoken: Section[];
  ready: number;
  phase: Phase;
  archiving: boolean;
  needsReview: boolean;
  handleAssemble: () => void;
  setAssociationTexts: (texts: string[]) => void;
  sectionTexts: string[];
  setNeedsReview: (value: boolean) => void;
  montageMode: MontageMode;
  voiceMode: "recorded" | "silent";
  clips: (SelectedClip | null)[];
  tick: number;
  errorMsg: string;
  mp4Url: string | null;
  downloading: boolean;
  handleDownload: () => Promise<void>;
  downloadFailed: boolean;
  archived: boolean;
  archiveRetryAvailable: boolean;
  handleArchiveRetry: () => void;
}

/** Ce que fait le moteur pendant l'assemblage, selon le mode : sans voix, pas de
 * sous-titres (ils se calent sur une piste audio) mais le texte à l'écran. */
function renderingMessage(montageMode: MontageMode, voiceMode: "recorded" | "silent"): string {
  if (montageMode === "filme") return "Assemblage des clips, incrustation des sous-titres…";
  if (voiceMode === "silent") return "Assemblage des clips et incrustation du texte à l'écran…";
  return "Assemblage des clips, incrustation des sous-titres et de la voix…";
}

/** Le bouton du bas : un seul état à la fois, jamais deux roues qui tournent ensemble. */
function assembleLabel(phase: Phase, previewOpen: boolean, preparingPreview: boolean) {
  if (preparingPreview) return <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Préparation de l’aperçu…</>;
  // Aperçu ouvert : la fabrication et son attente s'affichent DANS l'aperçu.
  if (previewOpen) return <><Eye className="h-4 w-4 mr-1.5" />Voir l’aperçu</>;
  if (phase === "rendering") return <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Montage en cours…</>;
  return <><Film className="h-4 w-4 mr-1.5" />Assembler mon reel</>;
}

export function MontageResult({ previewOpen = false, preparingPreview = false, canReopenPreview = false, reopenPreview, spoken, ready, phase, archiving, needsReview, handleAssemble, setAssociationTexts, sectionTexts, setNeedsReview, montageMode, voiceMode, clips, errorMsg, mp4Url, downloading, handleDownload, downloadFailed, archived, archiveRetryAvailable, handleArchiveRetry }: MontageResultProps) {
  return (
    <>
  {/* Toujours en vue : collée en bas de l'écran, au-dessus du menu du téléphone
      et de la barre d'actions du résultat (hauteur publiée par ResultActions). */}
  <div data-testid="montage-assemble-bar" className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom)+var(--result-actions-h,0px))] md:bottom-[var(--result-actions-h,0px)] z-20 -mx-3 sm:-mx-4 flex items-center justify-between gap-2 border-t border-border bg-card/95 px-3 sm:px-4 py-3 backdrop-blur">
    {/* Fabrication lancée depuis l'aperçu : son attente est plus bas dans le panneau, hors de
        vue. On la répète ici, dans la barre toujours visible (essai réel du 26/11/2026). */}
    {phase === "rendering" && previewOpen ? <BarProgress /> : phase === "done" && mp4Url && !previewOpen ? (
      // Vidéo prête : son téléchargement est plus bas dans le panneau, on le met aussi ici.
      <Button type="button" variant="outline" size="sm" onClick={() => void handleDownload()} disabled={downloading} data-testid="montage-bar-download">
        <Download className="h-4 w-4 mr-1.5" />{downloading ? "Téléchargement…" : <>Télécharger<span className="hidden sm:inline">&nbsp;ma vidéo</span></>}
      </Button>
    ) : (
    <span className="text-2xs text-muted-foreground">
      {ready} clip{ready > 1 ? "s" : ""} sur {spoken.length} prêt{ready > 1 ? "s" : ""}
    </span>
    )}
    <Button size="sm" onClick={handleAssemble} aria-busy={preparingPreview || undefined}
      disabled={preparingPreview || (!previewOpen && (phase === "rendering" || archiving || ready === 0 || needsReview))}>
      {assembleLabel(phase, previewOpen, preparingPreview)}
    </Button>
  </div>
  {needsReview && <div role="alert" className="rounded-md border border-warning p-3 text-xs space-y-2">
    <p>Le texte du Reel a changé depuis ce montage. Vérifie les clips, voix et plans pour chaque passage avant d’assembler.</p>
    <Button type="button" variant="outline" size="sm" onClick={() => { setAssociationTexts(sectionTexts); setNeedsReview(false); }}>J’ai vérifié les passages</Button>
  </div>}
  {montageMode === "filme" && clips.some(clip => clip?.source === "studio") && <p role="alert" className="text-xs text-destructive">
    Un clip du Studio est muet. Remplace-le par ta vidéo filmée face à la caméra, puis ajoute-le comme image en plus.
  </p>}

  {phase === "rendering" && !previewOpen && <RenderingProgress message={renderingMessage(montageMode, voiceMode)} />}

  {phase === "error" && <p className="text-xs text-destructive">{errorMsg}</p>}

  {canReopenPreview && phase !== "rendering" && (
    <Button type="button" variant="outline" size="sm" onClick={reopenPreview}>Retoucher le montage</Button>
  )}

  {mp4Url && phase !== "rendering" && !previewOpen && (
    <div className="space-y-2">
      {phase === "done" && <p className="text-sm font-medium">Ta vidéo est prête</p>}
      <div className="flex items-center gap-2 flex-wrap">
        <a href={mp4Url} download target="_blank" rel="noopener noreferrer" className="inline-flex" onClick={(event) => { event.preventDefault(); void handleDownload(); }}>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1.5" />
            {downloading ? "Téléchargement…" : "Télécharger le MP4"}
          </Button>
        </a>
        {downloadFailed && <a href={mp4Url} target="_blank" rel="noopener noreferrer" className="text-xs underline">Ouvrir le MP4 dans un nouvel onglet</a>}
        {phase === "done" && !archived && archiveRetryAvailable && (
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
  );
}

/** Attente du MP4 dans la barre du bas : courte, toujours à l'écran. */
function BarProgress() {
  const seconds = useElapsedSeconds(true);
  return (
    <span role="status" className="flex items-center gap-1.5 text-2xs font-medium text-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Je fabrique ta vidéo… {formatElapsed(seconds)}
    </span>
  );
}

/** Attente du MP4 hors aperçu : ce que fait le moteur, et le temps réel écoulé. */
function RenderingProgress({ message }: { message: string }) {
  const seconds = useElapsedSeconds(true);
  return (
    <p role="status" className="text-2xs text-muted-foreground text-center">
      {message} {waitNote(seconds)}
    </p>
  );
}
