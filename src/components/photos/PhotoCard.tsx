/**
 * PhotoCard — vignette tile for /photos gallery.
 *
 * State machine:
 *   - pending / processing → shimmer + elapsed timer (Improvement C)
 *   - failed               → error overlay + Retry button
 *   - ready                → image + hover actions (open detail, delete)
 */

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, RefreshCw, Trash2, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getSignedPhotoUrl, type UserPhotoRow } from "@/lib/photo-storage";

interface PhotoCardProps {
  photo: UserPhotoRow;
  onOpen: (photo: UserPhotoRow) => void;
  onDelete: (photo: UserPhotoRow) => void;
  onRetry: (photo: UserPhotoRow) => void;
  retrying?: boolean;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m${String(rem).padStart(2, "0")}`;
}

export function PhotoCard({ photo, onOpen, onDelete, onRetry, retrying }: PhotoCardProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Sign URL when ready
  useEffect(() => {
    let cancelled = false;
    if (photo.status !== "ready") {
      setPreviewUrl(null);
      return;
    }
    setPreviewError(false);
    getSignedPhotoUrl(photo.storage_path).then((url) => {
      if (cancelled) return;
      setPreviewUrl(url);
      if (!url) setPreviewError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [photo.status, photo.storage_path, previewAttempt]);

  // Elapsed timer for pending/processing
  useEffect(() => {
    if (photo.status !== "pending" && photo.status !== "processing") {
      setElapsedMs(0);
      return;
    }
    const start = new Date(photo.created_at).getTime();
    const tick = () => setElapsedMs(Date.now() - start);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [photo.status, photo.created_at]);

  const isProcessing = photo.status === "pending" || photo.status === "processing";
  const isFailed = photo.status === "failed";
  const isReady = photo.status === "ready";

  return (
    <div
      className={cn(
        "group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted/40",
        isReady && "hover:border-primary/50 transition-colors focus-within:border-primary/50",
      )}
    >
      {/* Image preview */}
      {isReady && previewUrl && !previewError && (
        <img
          src={previewUrl}
          alt={photo.name ?? "Photo"}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setPreviewError(true)}
        />
      )}
      {isReady && !previewUrl && !previewError && (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageIcon className="h-6 w-6" />
        </div>
      )}
      {/* Aperçu indisponible (signature ou chargement KO) — la photo existe,
          seul l'aperçu a échoué : on propose de recharger la vignette */}
      {isReady && previewError && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center">
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
          <p className="text-2xs text-muted-foreground">Aperçu indisponible</p>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs relative z-20"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewError(false);
              setPreviewAttempt((a) => a + 1);
            }}
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Réessayer
          </Button>
        </div>
      )}

      {/* Processing shimmer */}
      {isProcessing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted/60 to-muted/30">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <Loader2 className="h-6 w-6 animate-spin text-primary relative" />
          <p className="text-xs font-medium text-foreground relative">
            {photo.background_prompt || photo.background_preset_key
              ? "Retouche en cours…"
              : "Ajout en cours…"}
          </p>
          <p className="text-2xs text-muted-foreground relative">{formatElapsed(elapsedMs)}</p>
        </div>
      )}

      {/* Failed overlay */}
      {isFailed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-destructive/10 p-3 text-center">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <p className="text-xs font-medium text-foreground">Échec de la retouche</p>
          {photo.error_message && (
            <p className="text-2xs text-muted-foreground line-clamp-2">{photo.error_message}</p>
          )}
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              disabled={retrying}
              onClick={(e) => {
                e.stopPropagation();
                onRetry(photo);
              }}
            >
              {retrying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="h-3 w-3 mr-1" /> Réessayer
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(photo);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Hover actions for ready photos.
          La vignette était un <div onClick> : ni atteignable au clavier, ni
          annoncée aux lecteurs d'écran (audit UX 14/08). C'est maintenant un
          vrai <button> en surcouche — pas de bouton imbriqué, la corbeille
          passe simplement au-dessus (z-20). */}
      {isReady && (
        <>
          <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors pointer-events-none" />
          <button
            type="button"
            onClick={() => onOpen(photo)}
            className="absolute inset-0 z-10 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            aria-label={`Ouvrir ${photo.name ?? "la photo"}`}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(photo);
            }}
            className="absolute top-2 right-2 z-20 h-7 w-7 rounded-full bg-background/90 text-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shadow-sm"
            aria-label={`Supprimer ${photo.name ?? "la photo"}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {(photo.description || photo.name) && (
            <div className="absolute bottom-0 left-0 right-0 z-10 px-3 py-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <p className="text-2xs text-white font-medium truncate">
                {photo.description || photo.name}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
