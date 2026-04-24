/**
 * PhotosPage — gallery of user_photos with realtime updates,
 * upload dialog, and detail dialog.
 */

import { useState } from "react";
import { Plus, Image as ImageIcon, Loader2 } from "lucide-react";
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
import { useUserPhotos, useRetryPhotoRetouch, type UserPhotoRow } from "@/hooks/use-user-photos";
import { deletePhotoCompletely } from "@/lib/photo-storage";
import { PhotoCard } from "@/components/photos/PhotoCard";
import { PhotoUploadDialog } from "@/components/photos/PhotoUploadDialog";
import { PhotoDetailDialog } from "@/components/photos/PhotoDetailDialog";

export default function PhotosPage() {
  const { data: photos = [], isLoading } = useUserPhotos();
  const { retry, isRetrying } = useRetryPhotoRetouch();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailPhoto, setDetailPhoto] = useState<UserPhotoRow | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<UserPhotoRow | null>(null);

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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-6xl mx-auto px-4 py-8">
        <header className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl text-foreground mb-1">Mes photos</h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Importe une photo, décris l'ambiance que tu veux derrière, et l'IA remplace ton décor pour des visuels prêts à publier.
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nouvelle photo
          </Button>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : photos.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-base font-medium text-foreground mb-1">
              Pas encore de photo
            </p>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Lance ta première retouche pour voir tes visuels apparaître ici dès qu'ils sont prêts.
            </p>
            <Button onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Importer une photo
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {photos.map((p) => (
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
      </main>

      <PhotoUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
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
              L'originale et la version retouchée seront supprimées définitivement.
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
