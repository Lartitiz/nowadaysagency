/**
 * PhotosPage — bibliothèque de photos de marque du workspace.
 *
 * Grille de photos décrites/taguées par l'IA à l'upload (edge photo-describe),
 * filtres par tag, panneau « Photos à prendre » (photo_wishlist), et état vide
 * en « séance photo » générée depuis le branding. La retouche IA historique
 * (remplacement de décor) reste accessible en action secondaire.
 */

import { useMemo, useRef, useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useUserPhotos,
  useRetryPhotoRetouch,
  useUploadLibraryPhotos,
  type UserPhotoRow,
} from "@/hooks/use-user-photos";
import { deletePhotoCompletely } from "@/lib/photo-storage";
import { PhotoCard } from "@/components/photos/PhotoCard";
import { PhotoUploadDialog } from "@/components/photos/PhotoUploadDialog";
import { PhotoDetailDialog } from "@/components/photos/PhotoDetailDialog";
import { PhotoWishlistPanel } from "@/components/photos/PhotoWishlistPanel";
import { PhotoShootEmptyState } from "@/components/photos/PhotoShootEmptyState";
import { useWorkspace } from "@/contexts/WorkspaceContext";

const MAX_BATCH = 20;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const HEIC_TYPES = ["image/heic", "image/heif"];
const MAX_TAG_CHIPS = 8;

export default function PhotosPage() {
  const { data: photos = [], isLoading } = useUserPhotos();
  const { retry, isRetrying } = useRetryPhotoRetouch();
  const { mutate: uploadLibrary, progress } = useUploadLibraryPhotos();
  const { activeWorkspace, loading: wsLoading } = useWorkspace();
  const wsReady = !!activeWorkspace && !wsLoading;

  const [retoucheOpen, setRetoucheOpen] = useState(false);
  const [detailPhoto, setDetailPhoto] = useState<UserPhotoRow | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<UserPhotoRow | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tags les plus fréquents de la bibliothèque → chips de filtre
  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of photos) {
      for (const t of p.tags ?? []) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TAG_CHIPS)
      .map(([tag]) => tag);
  }, [photos]);

  const filteredPhotos = useMemo(
    () => (tagFilter ? photos.filter((p) => (p.tags ?? []).includes(tagFilter)) : photos),
    [photos, tagFilter],
  );

  async function handleFilesSelected(list: FileList | null) {
    if (!list?.length) return;
    const files: File[] = [];
    for (const f of Array.from(list).slice(0, MAX_BATCH)) {
      if (!f.type.startsWith("image/")) {
        toast.error(`« ${f.name} » n'est pas une image.`);
        continue;
      }
      if (HEIC_TYPES.includes(f.type.toLowerCase()) || /\.hei[cf]$/i.test(f.name)) {
        toast.error(`« ${f.name} » est en HEIC — convertis-la en JPG ou PNG.`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`« ${f.name} » dépasse 15 Mo.`);
        continue;
      }
      files.push(f);
    }
    if (list.length > MAX_BATCH) {
      toast.info(`Maximum ${MAX_BATCH} photos à la fois — les premières ont été prises.`);
    }
    if (!files.length) return;

    try {
      const { uploaded, failed } = await uploadLibrary(files);
      if (uploaded > 0) {
        toast.success(
          uploaded === 1
            ? "Photo ajoutée — description IA en cours"
            : `${uploaded} photos ajoutées — descriptions IA en cours`,
        );
      }
      if (failed > 0) {
        toast.error(`${failed} photo${failed > 1 ? "s" : ""} n'a pas pu être envoyée.`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Échec de l'ajout");
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleRetry(photo: UserPhotoRow) {
    try {
      await retry(photo);
      toast.success("Nouvelle tentative lancée");
    } catch (e: any) {
      toast.error(e?.message || "Échec de la nouvelle tentative");
    }
  }

  async function confirmDelete() {
    if (!photoToDelete) return;
    try {
      await deletePhotoCompletely(photoToDelete);
      toast.success("Photo supprimée");
    } catch (e: any) {
      toast.error(e?.message || "Suppression impossible");
    } finally {
      setPhotoToDelete(null);
    }
  }

  const uploading = !!progress;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-6xl mx-auto px-4 py-8">
        <header className="flex flex-col gap-3 mb-8 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <h1 className="font-display text-3xl text-foreground mb-1">Mes photos</h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Ta matière visuelle. L'IA décrit chaque photo une fois, puis les propose au bon
              moment dans tes stories et tes posts.
            </p>
          </div>
          <div className="flex gap-2 shrink-0 self-start">
            <Button variant="outline" onClick={() => setRetoucheOpen(true)} disabled={!wsReady}>
              <Sparkles className="h-4 w-4 mr-2" /> Retouche IA
            </Button>
            <Button onClick={openFilePicker} disabled={!wsReady || uploading}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {progress ? `${progress.done}/${progress.total}` : "Envoi…"}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" /> Ajouter des photos
                </>
              )}
            </Button>
          </div>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = "";
          }}
        />

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : photos.length === 0 ? (
          <PhotoShootEmptyState onAddPhotos={openFilePicker} uploadDisabled={!wsReady || uploading} />
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full">
              {topTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mb-4">
                  <button
                    type="button"
                    onClick={() => setTagFilter(null)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                      tagFilter === null
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
                    )}
                  >
                    Toutes · {photos.length}
                  </button>
                  {topTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs transition-colors",
                        tagFilter === tag
                          ? "bg-primary text-primary-foreground font-medium"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              {filteredPhotos.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Aucune photo avec ce tag.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  {filteredPhotos.map((p) => (
                    <PhotoCard
                      key={p.id}
                      photo={p}
                      onOpen={setDetailPhoto}
                      onDelete={setPhotoToDelete}
                      onRetry={handleRetry}
                      retrying={isRetrying === p.id}
                    />
                  ))}
                </div>
              )}
            </div>

            <aside className="w-full lg:w-72 shrink-0">
              <PhotoWishlistPanel />
            </aside>
          </div>
        )}
      </main>

      <PhotoUploadDialog open={retoucheOpen} onOpenChange={setRetoucheOpen} />
      <PhotoDetailDialog
        photo={detailPhoto}
        open={!!detailPhoto}
        onOpenChange={(v) => !v && setDetailPhoto(null)}
      />

      <AlertDialog open={!!photoToDelete} onOpenChange={(v) => !v && setPhotoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette photo ?</AlertDialogTitle>
            <AlertDialogDescription>
              La photo sera supprimée définitivement de ta bibliothèque.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
