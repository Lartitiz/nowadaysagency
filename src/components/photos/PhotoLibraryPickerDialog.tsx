/**
 * PhotoLibraryPickerDialog — pick ready photos from the user photothèque to
 * inject into PhotoUploadZone as if they had been uploaded.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Image as ImageIcon, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUserPhotos } from "@/hooks/use-user-photos";
import { getSignedPhotoUrl, getSignedPhotoUrls, type UserPhotoRow } from "@/lib/photo-storage";

interface PhotoLibraryPickerDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  maxSelectable: number;
  onConfirm: (photos: UserPhotoRow[]) => void;
}

function PickerThumb({
  photo,
  url,
  selected,
  disabled,
  onToggle,
}: {
  photo: UserPhotoRow;
  url: string | null;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
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
      {url ? (
        <img
          src={url}
          alt={photo.name ?? "Photo"}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageIcon className="h-5 w-5" />
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
}: PhotoLibraryPickerDialogProps) {
  const { data: photos, isLoading } = useUserPhotos();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [urlMap, setUrlMap] = useState<Map<string, string>>(new Map());

  const readyPhotos = useMemo(
    () => (photos ?? []).filter((p) => p.status === "ready"),
    [photos],
  );

  // Reset selection on every open
  useEffect(() => {
    if (open) setSelectedIds([]);
  }, [open]);

  // Batch-sign all ready photos when the dialog opens or photos change
  useEffect(() => {
    if (!open || readyPhotos.length === 0) {
      setUrlMap(new Map());
      return;
    }
    let cancelled = false;
    getSignedPhotoUrls(readyPhotos.map((p) => p.storage_path)).then((map) => {
      if (!cancelled) setUrlMap(map);
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
          <DialogTitle>Choisir dans ta photothèque</DialogTitle>
          <DialogDescription>
            Sélectionne jusqu'à {maxSelectable} photo{maxSelectable > 1 ? "s" : ""} déjà prête{maxSelectable > 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[200px] max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Chargement…
            </div>
          ) : readyPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-foreground font-medium">Ta photothèque est vide.</p>
              <p className="text-xs text-muted-foreground">
                <Link to="/photos" className="text-primary hover:underline">
                  Ajoute tes photos ici
                </Link>{" "}
                pour pouvoir les réutiliser dans tes contenus.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 p-1">
              {readyPhotos.map((p) => (
                <PickerThumb
                  key={p.id}
                  photo={p}
                  selected={selectedIds.includes(p.id)}
                  disabled={atMax}
                  onToggle={() => toggle(p.id)}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex sm:justify-between items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {selectedIds.length} / {maxSelectable} sélectionnée{selectedIds.length > 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={handleConfirm} disabled={selectedIds.length === 0}>
              Utiliser ces photos
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
