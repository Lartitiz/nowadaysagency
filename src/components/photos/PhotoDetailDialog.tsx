/**
 * PhotoDetailDialog — full preview of a ready photo with Before/After toggle
 * and descriptive download.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  downloadPhoto,
  getSignedPhotoUrl,
  type UserPhotoRow,
} from "@/lib/photo-storage";

interface PhotoDetailDialogProps {
  photo: UserPhotoRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "photo";
}

export function PhotoDetailDialog({ photo, open, onOpenChange }: PhotoDetailDialogProps) {
  const navigate = useNavigate();
  const [view, setView] = useState<"after" | "before">("after");
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!photo || !open) return;
    setView("after");
    let cancelled = false;
    Promise.all([
      getSignedPhotoUrl(photo.storage_path),
      getSignedPhotoUrl(photo.original_storage_path),
    ]).then(([a, b]) => {
      if (cancelled) return;
      setAfterUrl(a);
      setBeforeUrl(b);
    });
    return () => {
      cancelled = true;
    };
  }, [photo, open]);

  if (!photo) return null;

  const url = view === "after" ? afterUrl : beforeUrl;

  async function handleDownload() {
    if (!photo) return;
    setDownloading(true);
    try {
      const baseName = slugify(photo.name ?? "photo");
      const filename =
        view === "after"
          ? `${baseName}-retouchee.jpg`
          : `${baseName}-originale.jpg`;
      const path = view === "after" ? photo.storage_path : photo.original_storage_path;
      await downloadPhoto(path, filename);
    } catch (e: any) {
      toast.error(e?.message || "Téléchargement impossible");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="truncate">{photo.name ?? "Photo"}</DialogTitle>
          {photo.background_prompt && (
            <DialogDescription className="line-clamp-2">
              {photo.background_prompt}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Before/After toggle */}
        <div className="flex items-center gap-1 rounded-full bg-muted p-1 self-start text-xs">
          <button
            type="button"
            onClick={() => setView("after")}
            className={cn(
              "px-3 py-1 rounded-full font-medium transition-colors",
              view === "after"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Retouchée
          </button>
          <button
            type="button"
            onClick={() => setView("before")}
            className={cn(
              "px-3 py-1 rounded-full font-medium transition-colors",
              view === "before"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Originale
          </button>
        </div>

        <div className="rounded-xl overflow-hidden border border-border bg-muted/40 max-h-[60vh] flex items-center justify-center">
          {url ? (
            <img
              src={url}
              alt={`${photo.name ?? "Photo"} (${view === "after" ? "retouchée" : "originale"})`}
              className="max-h-[60vh] w-full object-contain"
            />
          ) : (
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleDownload} disabled={downloading || !url}>
            {downloading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Téléchargement…
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" /> Télécharger {view === "after" ? "la retouche" : "l'originale"}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
