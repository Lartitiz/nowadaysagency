/**
 * PhotoLibraryPickerDialog — pick ready photos from the user photothèque to
 * inject into PhotoUploadZone as if they had been uploaded.
 *
 * Le manque de photos se ressent ICI, en pleine création — pas sur /photos.
 * D'où l'import « depuis mon site ou Instagram » directement dans ce dialogue :
 * les photos rejoignent la bibliothèque puis sont PRÉ-SÉLECTIONNÉES, pour que
 * l'utilisatrice reparte avec son contenu sans jamais quitter /creer.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Globe, Image as ImageIcon, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUploadLibraryPhotos, useUserPhotos } from "@/hooks/use-user-photos";
import { getSignedPhotoUrls, type UserPhotoRow } from "@/lib/photo-storage";
import { SitePhotoImportDialog } from "@/components/photos/SitePhotoImportDialog";

interface PhotoLibraryPickerDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  maxSelectable: number;
  onConfirm: (photos: UserPhotoRow[]) => void;
  /**
   * Ouvre directement l'import site / Instagram à l'ouverture du picker.
   * Utilisé quand l'utilisatrice a explicitement cliqué « depuis mon site » :
   * lui réafficher d'abord une photothèque vide serait un clic pour rien.
   */
  autoOpenImport?: boolean;
}

function PickerThumb({
  photo,
  url,
  signDone,
  selected,
  disabled,
  onToggle,
}: {
  photo: UserPhotoRow;
  url: string | null;
  signDone: boolean;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  // Aperçu KO (signature échouée ou image en erreur) ≠ « en chargement » :
  // la photo reste sélectionnable, l'import passe par storage_path.
  const broken = imgError || (signDone && !url);
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled && !selected}
      className={cn(
        "group relative aspect-square overflow-hidden rounded-lg border bg-muted/40 transition",
        selected
          ? "ring-2 ring-primary border-primary"
          : "border-border hover:border-primary/40",
        disabled && !selected && "opacity-40 cursor-not-allowed",
      )}
    >
      {url && !imgError ? (
        <img
          src={url}
          alt={photo.name ?? "Photo"}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
          <ImageIcon className="h-5 w-5" />
          {broken && <span className="text-2xs px-1">Aperçu indisponible</span>}
        </div>
      )}
      {selected && (
        <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
          <Check className="h-3 w-3" />
        </div>
      )}
    </button>
  );
}

export function PhotoLibraryPickerDialog({
  open,
  onOpenChange,
  maxSelectable,
  onConfirm,
  autoOpenImport = false,
}: PhotoLibraryPickerDialogProps) {
  const { data: photos, isLoading } = useUserPhotos();
  const { mutate: uploadLibrary } = useUploadLibraryPhotos();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [urlMap, setUrlMap] = useState<Map<string, string>>(new Map());
  const [signDone, setSignDone] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const readyPhotos = useMemo(
    () => (photos ?? []).filter((p) => p.status === "ready"),
    [photos],
  );

  // Reset selection on every open
  useEffect(() => {
    if (open) setSelectedIds([]);
  }, [open]);

  // Entrée « depuis mon site » : on saute l'écran intermédiaire et on ouvre
  // l'import tout de suite. À la fermeture, le picker reprend la main avec les
  // photos importées déjà cochées.
  useEffect(() => {
    if (open && autoOpenImport) setImportOpen(true);
  }, [open, autoOpenImport]);

  /**
   * Verse les photos importées (site / Instagram) dans la bibliothèque, puis
   * coche celles qui viennent d'arriver — dans la limite de maxSelectable, le
   * surplus reste dans la bibliothèque pour plus tard.
   */
  async function handleImportedFiles(files: File[]) {
    setImporting(true);
    try {
      const { uploaded, failed, photoIds } = await uploadLibrary(files);
      if (uploaded > 0) {
        setSelectedIds((cur) => [...cur, ...photoIds].slice(0, maxSelectable));
        toast.success(
          uploaded === 1
            ? "Photo ajoutée à ta bibliothèque et sélectionnée"
            : `${uploaded} photos ajoutées et sélectionnées`,
        );
      }
      if (failed > 0) {
        toast.error(`${failed} photo${failed > 1 ? "s" : ""} n'a pas pu être ajoutée.`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Import impossible");
    } finally {
      setImporting(false);
    }
  }

  // Batch-sign all ready photos when the dialog opens or photos change
  useEffect(() => {
    if (!open || readyPhotos.length === 0) {
      setUrlMap(new Map());
      setSignDone(false);
      return;
    }
    let cancelled = false;
    setSignDone(false);
    getSignedPhotoUrls(readyPhotos.map((p) => p.storage_path)).then((map) => {
      if (cancelled) return;
      setUrlMap(map);
      setSignDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, readyPhotos]);

  const atMax = selectedIds.length >= maxSelectable;

  const toggle = (id: string) => {
    setSelectedIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= maxSelectable) return cur;
      return [...cur, id];
    });
  };

  const handleConfirm = () => {
    const selected = readyPhotos.filter((p) => selectedIds.includes(p.id));
    onConfirm(selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choisir dans mes photos</DialogTitle>
          <DialogDescription>
            Sélectionne jusqu'à {maxSelectable} photo{maxSelectable > 1 ? "s" : ""} déjà prête{maxSelectable > 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[200px] max-h-[60vh] overflow-y-auto">
          {isLoading || importing ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              {importing ? "Ajout de tes photos…" : "Chargement…"}
            </div>
          ) : readyPhotos.length === 0 ? (
            // Bibliothèque vide EN PLEINE CRÉATION : on ne renvoie pas vers
            // /photos (elle perdrait son contenu en cours), on propose de
            // récupérer ce qui est déjà publié, ici et maintenant.
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm text-foreground font-medium">Tu n'as encore aucune photo.</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Tu as sûrement déjà des photos en ligne : récupère-les en un clic, sans
                  quitter ton contenu.
                </p>
              </div>
              <Button onClick={() => setImportOpen(true)}>
                <Globe className="h-4 w-4 mr-2" /> Importer depuis mon site ou Instagram
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 p-1">
              {readyPhotos.map((p) => (
                <PickerThumb
                  key={p.id}
                  photo={p}
                  url={urlMap.get(p.storage_path) ?? null}
                  signDone={signDone}
                  selected={selectedIds.includes(p.id)}
                  disabled={atMax}
                  onToggle={() => toggle(p.id)}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {selectedIds.length} / {maxSelectable} sélectionnée{selectedIds.length > 1 ? "s" : ""}
            </p>
            {/* Bibliothèque déjà fournie : l'import reste accessible, en discret. */}
            {readyPhotos.length > 0 && (
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                disabled={importing}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
              >
                <Globe className="h-3.5 w-3.5" /> Importer d'autres photos
              </button>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importing}>
              Annuler
            </Button>
            <Button onClick={handleConfirm} disabled={selectedIds.length === 0 || importing}>
              Utiliser ces photos
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Import site / Instagram par-dessus le picker : au retour, les photos
          sont dans la bibliothèque ET déjà cochées. */}
      <SitePhotoImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        maxSelectable={maxSelectable}
        onImportFiles={handleImportedFiles}
      />
    </Dialog>
  );
}
