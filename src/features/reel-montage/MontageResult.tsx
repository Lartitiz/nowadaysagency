// Pied de l'écran de montage d'un reel : « Assembler mon reel », alertes (texte
// à revérifier, clip Studio muet), progression, erreur, lecteur, téléchargement,
// « Ranger cette vidéo » et statut. Sorti de ReelMontage.tsx à l'identique
// (fiche 16 de docs/robustesse/gros-fichiers.md, lot 6) ; seul le test « rendu
// des entrées actuelles » arrive calculé (`archiveRetryAvailable`).
import { Button } from "@/components/ui/button";
import { Loader2, Film, Download } from "lucide-react";
import type { MontageMode, Phase, Section, SelectedClip } from "./types";

interface MontageResultProps {
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

export function MontageResult({ spoken, ready, phase, archiving, needsReview, handleAssemble, setAssociationTexts, sectionTexts, setNeedsReview, montageMode, clips, tick, errorMsg, mp4Url, downloading, handleDownload, downloadFailed, archived, archiveRetryAvailable, handleArchiveRetry }: MontageResultProps) {
  return (
    <>
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
