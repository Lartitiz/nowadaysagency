import { useState, useRef, useCallback, useEffect, DragEvent as ReactDragEvent } from "react";
import { Upload, X, GripVertical } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PhotoItem {
  base64: string;
  preview: string;
  name: string;
  context?: string;
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
}: PhotoUploadZoneProps) {
  const [photos, setPhotos] = useState<PhotoItem[]>(initialPhotos ?? []);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [showContexts, setShowContexts] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFull = photos.length >= maxPhotos;

  // Sync initial values on mount only
  useEffect(() => {
    if (initialPhotos) setPhotos(initialPhotos);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      const batch = Array.from(files).filter(f => f.type.startsWith("image/")).slice(0, remaining);
      const items: PhotoItem[] = await Promise.all(
        batch.map(async (f) => {
          const { base64, preview } = await resizeAndEncode(f);
          return { base64, preview, name: f.name };
        }),
      );
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

  // ── Drop zone events ──────────────────────────────
  const onDragEnter = (e: ReactDragEvent) => { e.preventDefault(); if (!isFull) setIsDragOver(true); };
  const onDragLeave = (e: ReactDragEvent) => { e.preventDefault(); setIsDragOver(false); };
  const onDragOverZone = (e: ReactDragEvent) => { e.preventDefault(); };
  const onDrop = (e: ReactDragEvent) => {
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
            JPG, PNG • Max {maxPhotos} photos
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files) processFiles(e.target.files); e.target.value = ""; }}
      />

      {/* ── Thumbnails grid ───────────────────── */}
      {photos.length > 0 && (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowContexts((v) => !v)}
              className="text-xs text-primary hover:underline font-medium"
            >
              {showContexts ? "− Masquer les contextes" : "+ Ajouter un contexte par photo"}
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
                  <GripVertical className="absolute bottom-1 left-1 h-3.5 w-3.5 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                </div>
                {showContexts && (
                  <Input
                    value={p.context ?? ""}
                    onChange={(e) => updateContext(idx, e.target.value)}
                    placeholder="Ex : chantier Acacias, J2 démolition"
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
        </>
      )}

      {/* ── Text description ──────────────────── */}
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
          placeholder="Ex : 6 photos d'un soutien-gorge en dentelle ivoire, ambiance boudoir, lumière dorée"
          className="min-h-[72px] resize-none"
        />
      </div>
    </div>
  );
}
