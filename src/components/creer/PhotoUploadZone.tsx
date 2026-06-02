import { useState, useRef, useCallback, useEffect, DragEvent as ReactDragEvent } from "react";
import { Upload, X, GripVertical, Wand2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PhotoEditDialog } from "./PhotoEditDialog";

const MAX_FILE_SIZE_MB = 25;

function isHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return type === "image/heic" || type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

async function convertHeicIfNeeded(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  // Dynamic import — heic2any only loads when actually needed (~80kb)
  const heic2any = (await import("heic2any")).default;
  const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const out = Array.isArray(blob) ? blob[0] : blob;
  const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  return new File([out], newName, { type: "image/jpeg" });
}

export interface PhotoItem {
  base64: string;
  preview: string;
  name: string;
  context?: string;
  /** Original image kept the first time the photo is edited, so the user can revert. */
  originalBase64?: string;
  /** True when the current base64 has been retouched via PhotoRoom. */
  edited?: boolean;
}

export interface PhotoUploadZoneProps {
  maxPhotos?: number;
  onPhotosChange: (photos: PhotoItem[]) => void;
  onDescriptionChange: (description: string) => void;
  initialPhotos?: PhotoItem[];
  initialDescription?: string;
  title?: string;
  /**
   * Compact mode: hides the large drop zone and the global description textarea.
   * Keeps thumbnails grid + counter, exposes a discreet "+ Ajouter d'autres photos"
   * link and a toggle to refine per-photo context. Use when photos and description
   * have already been provided in a previous step.
   */
  compact?: boolean;
  /** Hide the "Ou décris tes photos en quelques mots" textarea. */
  hideDescription?: boolean;
}

function resizeAndEncode(file: File, maxWidth = 1024, quality = 0.8): Promise<{ base64: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = Math.round(h * (maxWidth / w));
        w = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const base64 = canvas.toDataURL("image/jpeg", quality);
      resolve({ base64, preview: objectUrl });
    };
    img.onerror = () => reject(new Error("load"));
    img.src = objectUrl;
  });
}

export function PhotoUploadZone({
  maxPhotos = 10,
  onPhotosChange,
  onDescriptionChange,
  initialPhotos,
  initialDescription,
  title,
  compact = false,
  hideDescription = false,
}: PhotoUploadZoneProps) {
  const [photos, setPhotos] = useState<PhotoItem[]>(initialPhotos ?? []);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [showContexts, setShowContexts] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFull = photos.length >= maxPhotos;

  // Resync quand le parent fournit de nouvelles initialPhotos (changement de format,
  // rehydratation après "Partir de photos", etc.). Comparaison par identité de
  // référence : le parent passe un état React stable tant qu'il ne change pas.
  useEffect(() => {
    if (initialPhotos) setPhotos(initialPhotos);
  }, [initialPhotos]);

  const updatePhotos = useCallback(
    (next: PhotoItem[]) => {
      setPhotos(next);
      onPhotosChange(next);
    },
    [onPhotosChange],
  );

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const remaining = maxPhotos - photos.length;
      if (remaining <= 0) return;
      const all = Array.from(files);
      const rejectedType = all.filter(f => !f.type.startsWith("image/") && !isHeic(f));
      rejectedType.forEach(f => toast.error(`"${f.name}" n'est pas une image.`));
      const candidates = all.filter(f => f.type.startsWith("image/") || isHeic(f)).slice(0, remaining);

      const results = await Promise.allSettled(
        candidates.map(async (f) => {
          if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            throw new Error(`trop lourde (${(f.size / 1024 / 1024).toFixed(1)} Mo, max ${MAX_FILE_SIZE_MB} Mo)`);
          }
          const converted = await convertHeicIfNeeded(f);
          const { base64, preview } = await resizeAndEncode(converted);
          return { base64, preview, name: converted.name } as PhotoItem;
        }),
      );

      const items: PhotoItem[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          items.push(r.value);
        } else {
          const f = candidates[i];
          const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
          console.warn("[photo-upload] failed", f.name, f.type, f.size, r.reason);
          if (reason.startsWith("trop lourde")) {
            toast.error(`"${f.name}" est ${reason}.`);
          } else if (isHeic(f)) {
            toast.error(`Impossible de convertir "${f.name}". Réessaie ou exporte-la en JPEG depuis ton iPhone.`);
          } else {
            toast.error(`Impossible de lire "${f.name}". Format non supporté ou fichier corrompu.`);
          }
        }
      });

      if (items.length === 0) return;
      const next = [...photos, ...items];
      updatePhotos(next);
    },
    [photos, maxPhotos, updatePhotos],
  );

  const removePhoto = useCallback(
    (idx: number) => {
      const next = photos.filter((_, i) => i !== idx);
      URL.revokeObjectURL(photos[idx].preview);
      updatePhotos(next);
    },
    [photos, updatePhotos],
  );

  const updateContext = useCallback(
    (idx: number, value: string) => {
      const next = photos.map((p, i) => (i === idx ? { ...p, context: value } : p));
      updatePhotos(next);
    },
    [photos, updatePhotos],
  );

  // ── PhotoRoom edit ────────────────────────────────
  const applyEditedPhoto = useCallback(
    (idx: number, newBase64: string) => {
      const next = photos.map((p, i) => {
        if (i !== idx) return p;
        // Keep the very first version as originalBase64 so we can revert.
        const originalBase64 = p.originalBase64 ?? p.base64;
        return {
          ...p,
          base64: newBase64,
          preview: newBase64, // data URL works directly as <img src>
          originalBase64,
          edited: true,
        };
      });
      updatePhotos(next);
    },
    [photos, updatePhotos],
  );

  const revertPhoto = useCallback(
    (idx: number) => {
      const next = photos.map((p, i) => {
        if (i !== idx || !p.originalBase64) return p;
        return {
          ...p,
          base64: p.originalBase64,
          preview: p.originalBase64,
          edited: false,
        };
      });
      updatePhotos(next);
    },
    [photos, updatePhotos],
  );

  // ── Drop zone events ──────────────────────────────
  const isFileDrag = (e: ReactDragEvent) =>
    Array.from(e.dataTransfer.types || []).includes("Files");
  const onDragEnter = (e: ReactDragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    if (!isFull) setIsDragOver(true);
  };
  const onDragLeave = (e: ReactDragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setIsDragOver(false);
  };
  const onDragOverZone = (e: ReactDragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
  };
  const onDrop = (e: ReactDragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setIsDragOver(false);
    if (isFull) return;
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  };

  // ── Thumbnail reorder (HTML5 drag) ─────────────────
  const onThumbDragStart = (idx: number) => setDragIdx(idx);
  const onThumbDragOver = (e: ReactDragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const next = [...photos];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    setDragIdx(idx);
    updatePhotos(next);
  };
  const onThumbDragEnd = () => setDragIdx(null);

  // ── Description ────────────────────────────────────
  const handleDesc = (val: string) => {
    setDescription(val);
    onDescriptionChange(val);
  };

  return (
    <div className="space-y-4">
      {title && (
        <p className="text-sm font-semibold text-foreground">{title}</p>
      )}
      {/* ── Drop zone (hidden in compact mode) ─────────── */}
      {!compact && (
        <div
          onClick={() => !isFull && inputRef.current?.click()}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOverZone}
          onDrop={onDrop}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer",
            isFull
              ? "border-border opacity-50 cursor-not-allowed"
              : isDragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/40",
          )}
        >
          <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium text-foreground">
            Glisse tes photos ici ou clique pour sélectionner
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            JPG, PNG, HEIC (iPhone) • Max {maxPhotos} photos • {MAX_FILE_SIZE_MB} Mo / photo
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files) processFiles(e.target.files); e.target.value = ""; }}
      />

      {/* ── Thumbnails grid ───────────────────── */}
      {photos.length > 0 && (
        <div
          onDragEnter={compact ? onDragEnter : undefined}
          onDragLeave={compact ? onDragLeave : undefined}
          onDragOver={compact ? onDragOverZone : undefined}
          onDrop={compact ? onDrop : undefined}
          className={cn(
            "relative space-y-2 rounded-xl transition-colors",
            compact && !isFull && "border border-dashed border-transparent hover:border-border p-2 -m-2",
            compact && isDragOver && "border-primary bg-primary/5",
          )}
        >
          {compact && isDragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/10 border-2 border-dashed border-primary pointer-events-none">
              <div className="flex items-center gap-2 text-primary font-medium text-sm">
                <Upload className="h-4 w-4" />
                Dépose tes photos ici
              </div>
            </div>
          )}
          <div className="flex justify-between items-center gap-2">
            {compact && !isFull ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-xs text-primary hover:underline font-medium"
              >
                + Ajouter d'autres photos
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setShowContexts((v) => !v)}
              className="text-xs text-primary hover:underline font-medium"
            >
              {showContexts
                ? "− Masquer le contexte par photo"
                : compact
                ? "Affiner le contexte par photo"
                : "+ Ajouter un contexte par photo"}
            </button>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
            {photos.map((p, idx) => (
              <div key={`${p.name}-${idx}`} className="flex flex-col gap-1.5">
                <div
                  draggable
                  onDragStart={() => onThumbDragStart(idx)}
                  onDragOver={(e) => onThumbDragOver(e, idx)}
                  onDragEnd={onThumbDragEnd}
                  className={cn(
                    "relative aspect-square group rounded-lg overflow-hidden border border-border cursor-grab active:cursor-grabbing",
                    dragIdx === idx && "opacity-50 ring-2 ring-primary",
                  )}
                >
                  <img
                    src={p.preview}
                    alt={p.name}
                    className="w-full h-full object-cover rounded-lg"
                    draggable={false}
                  />
                  <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors rounded-lg" />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removePhoto(idx); }}
                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Supprimer ${p.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setEditIdx(idx); }}
                    className="absolute top-1 left-1 h-5 w-5 rounded-full bg-primary/85 text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Modifier le fond de ${p.name}`}
                    title="Modifier le fond avec l'IA"
                  >
                    <Wand2 className="h-3 w-3" />
                  </button>
                  {p.edited && p.originalBase64 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); revertPhoto(idx); }}
                      className="absolute bottom-1 right-1 h-5 px-1.5 rounded-full bg-foreground/80 text-background flex items-center gap-0.5 text-[9px] font-medium opacity-90 hover:opacity-100 transition-opacity"
                      title="Revenir à l'original"
                    >
                      <Undo2 className="h-2.5 w-2.5" />
                      Original
                    </button>
                  )}
                  <GripVertical className="absolute bottom-1 left-1 h-3.5 w-3.5 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                </div>
                {showContexts && (
                  <Input
                    value={p.context ?? ""}
                    onChange={(e) => updateContext(idx, e.target.value)}
                    placeholder="Ex : le moment, le lieu ou le détail à retenir"
                    maxLength={200}
                    className="h-8 text-xs px-2"
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {photos.length} / {maxPhotos} photos
          </p>
        </div>
      )}

      {/* ── Text description (hidden in compact mode or when explicitly hidden) ─────── */}
      {!compact && !hideDescription && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Ou décris tes photos en quelques mots
          </label>
          {photos.length > 0 && (
            <p className="text-xs text-muted-foreground">(optionnel si tu as uploadé tes photos)</p>
          )}
          <Textarea
            value={description}
            onChange={(e) => handleDesc(e.target.value)}
            placeholder="Ex : 3 photos prises ce matin, ambiance lumineuse, ce que je voulais montrer en une phrase"
            className="min-h-[72px] resize-none"
          />
        </div>
      )}

      {/* ── PhotoRoom edit dialog ─────────────────── */}
      {editIdx !== null && photos[editIdx] && (
        <PhotoEditDialog
          open={editIdx !== null}
          onOpenChange={(o) => { if (!o) setEditIdx(null); }}
          originalBase64={photos[editIdx].originalBase64 ?? photos[editIdx].base64}
          name={photos[editIdx].name}
          onApply={(newBase64) => applyEditedPhoto(editIdx, newBase64)}
        />
      )}
    </div>
  );
}
