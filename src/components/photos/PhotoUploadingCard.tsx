/**
 * PhotoUploadingCard — carte optimiste de la grille /photos : vignette « Envoi
 * en cours… » affichée dès la sélection du fichier, avant même la ligne en
 * base. Remplacée par la vraie PhotoCard quand la photo arrive dans la grille.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { PendingLibraryUpload } from "@/hooks/use-user-photos";

export function PhotoUploadingCard({ upload }: { upload: PendingLibraryUpload }) {
  const [previewFailed, setPreviewFailed] = useState(false);

  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted/40">
      {/* Aperçu local du fichier ; un HEIC d'iPhone n'est pas affichable par le
          navigateur → fond neutre */}
      {upload.previewUrl && !previewFailed && (
        <img
          src={upload.previewUrl}
          alt={upload.name}
          className="h-full w-full object-cover"
          onError={() => setPreviewFailed(true)}
        />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/55">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <Loader2 className="h-6 w-6 animate-spin text-primary relative" />
        <p className="text-xs font-medium text-foreground relative">Envoi en cours…</p>
      </div>
    </div>
  );
}
