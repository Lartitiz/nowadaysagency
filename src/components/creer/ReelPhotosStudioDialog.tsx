import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { StudioVideoPanel } from "@/features/studio-video/StudioVideoPanel";
import type { VideoDraft } from "@/features/studio-video/sources";
import { uploadPhotoOriginal } from "@/lib/photo-storage";
import { CHEMIN_TARIFS } from "@/lib/retour-apres-detour";
import { photosToVideoReferences, reelPhotosVideoDraft } from "@/lib/reel-photos-studio";
import type { PhotoItem } from "./PhotoUploadZone";

interface Props { open: boolean; onClose: () => void; photos: PhotoItem[]; isFree: boolean }

/**
 * Studio vidéo ouvert depuis /creer avec les photos du Reel déjà posées
 * (12/11/2026) : avant, elle devait les recharger elle-même dans le Studio.
 * /creer reste ouvert derrière ; le clip est gardé dans le Studio vidéo.
 */
export default function ReelPhotosStudioDialog({ open, onClose, photos, isFree }: Props) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const [draft, setDraft] = useState<VideoDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const uploads = useRef(new Map<number, string>());
  const count = Math.min(photos.length, 4);

  const prepare = async () => {
    if (!user || busy) return;
    setBusy(true); setError("");
    try {
      const images = await photosToVideoReferences(photos, async (file, name) =>
        (await uploadPhotoOriginal({ file, userId: user.id, workspaceId, purpose: "library", name })).photoId, uploads.current);
      setDraft(reelPhotosVideoDraft(images));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tes photos n'ont pas pu être préparées. Réessaie dans un instant.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Animer {count > 1 ? "tes photos" : "ta photo"} en vidéo</DialogTitle>
          <DialogDescription>
            Ton Reel reste ouvert derrière. Le clip sera gardé dans le Studio vidéo : tu pourras l'ajouter au montage de ton Reel.
          </DialogDescription>
        </DialogHeader>
        {isFree ? (
          <div className="rounded-md border p-3 text-sm space-y-2" data-testid="reel-studio-premium">
            <p>La vidéo est comprise dans Premium : 3 vidéos par mois (6 avec Ta Binôme de Com').</p>
            <a href={CHEMIN_TARIFS} className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Passer à Premium</a>
          </div>
        ) : draft ? (
          <StudioVideoPanel workspaceId={workspaceId} writable initialDraft={draft}
            draftKey={user ? `studio-video:${user.id}:${workspaceId}:creer-reel:${draft.images.map((i) => i.id).join(",")}` : undefined} />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {photos.slice(0, 4).map((p, i) => (
                <figure key={p.id || i} className="text-2xs text-muted-foreground">
                  <img src={p.preview || p.base64} alt={p.name || `Photo ${i + 1}`} className="h-20 w-full rounded-md object-cover" />
                  {count === 2 && <figcaption className="mt-1 text-center">{i === 0 ? "Avant" : "Après"}</figcaption>}
                </figure>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {photos.length > 4 ? "Le Studio vidéo part de 4 photos au plus : on garde les 4 premières. " : ""}
              Elles seront aussi rangées dans « Mes photos ».
            </p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="button" onClick={prepare} disabled={busy}>{busy ? "Préparation de tes photos…" : "Préparer mon clip"}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
