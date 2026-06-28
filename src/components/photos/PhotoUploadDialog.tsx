/**
 * PhotoUploadDialog — choose a photo + describe the desired background,
 * then trigger the photo-background-replace pipeline.
 */

import { useState, useRef, type DragEvent as ReactDragEvent } from "react";
import { Loader2, Upload, X, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreatePhotoRetouch } from "@/hooks/use-user-photos";
import { useWorkspace } from "@/contexts/WorkspaceContext";

interface PhotoUploadDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const PROMPT_SUGGESTIONS = [
  "Studio photo lumière douce, fond beige uni",
  "Atelier d'artiste, lumière naturelle, plantes en arrière-plan",
  "Plage tropicale au coucher du soleil, palmiers flous",
  "Café cosy parisien, ambiance chaleureuse, bokeh",
  "Bureau minimaliste scandinave, bois clair et blanc",
];

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const HEIC_TYPES = ["image/heic", "image/heif"];

export function PhotoUploadDialog({ open, onOpenChange }: PhotoUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { mutate, isPending } = useCreatePhotoRetouch();
  const { activeWorkspace, loading: wsLoading } = useWorkspace();
  const ready = !!activeWorkspace && !wsLoading;

  function reset() {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPrompt("");
    setName("");
  }

  function selectFile(f: File | null | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Le fichier doit être une image.");
      return;
    }
    if (HEIC_TYPES.includes(f.type.toLowerCase()) || /\.hei[cf]$/i.test(f.name)) {
      toast.error("Le format HEIC n'est pas encore pris en charge. Convertis la photo en JPG ou PNG.");
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      toast.error("La photo dépasse 15 Mo. Réduis-la puis réessaie.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    if (!name) setName(f.name.replace(/\.[^.]+$/, "").slice(0, 80));
  }

  async function handleSubmit() {
    if (!file) {
      toast.error("Choisis une photo.");
      return;
    }
    if (prompt.trim().length < 3) {
      toast.error("Décris le décor souhaité (3 caractères min).");
      return;
    }
    try {
      await mutate({
        file,
        backgroundPrompt: prompt.trim(),
        name: name.trim() || undefined,
      });
      toast.success("Retouche lancée — la photo apparaîtra dans la galerie.");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Échec du lancement");
    }
  }

  function onDrop(e: ReactDragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) selectFile(f);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Nouvelle photo retouchée
          </DialogTitle>
          <DialogDescription>
            Importe une photo, décris le décor que tu veux derrière, et l'IA s'occupe du reste.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone / preview */}
          {!file ? (
            <div
              onClick={() => inputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragOver(false);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
              )}
            >
              <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium text-foreground">
                Glisse ta photo ici ou clique pour sélectionner
              </p>
              <p className="text-xs text-muted-foreground mt-1">JPG, PNG • Max ~10 Mo</p>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-border">
              {previewUrl && (
                <img src={previewUrl} alt="Aperçu" className="w-full max-h-[260px] object-cover" />
              )}
              <button
                type="button"
                onClick={reset}
                className="absolute top-2 right-2 h-7 w-7 rounded-full bg-background/90 text-foreground flex items-center justify-center shadow-sm hover:bg-background"
                aria-label="Retirer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              selectFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="photo-name" className="text-xs">
              Nom de la photo (optionnel)
            </Label>
            <Input
              id="photo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Portrait studio Mai 2025"
              maxLength={120}
              disabled={isPending}
            />
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <Label htmlFor="photo-prompt" className="text-xs">
              Décor souhaité (prompt)
            </Label>
            <Textarea
              id="photo-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Décris l'ambiance, la lumière, les éléments du fond…"
              maxLength={500}
              className="min-h-[80px] resize-none"
              disabled={isPending}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PROMPT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPrompt(s)}
                  disabled={isPending}
                  className="text-2xs px-2 py-1 rounded-full bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !file || !ready}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Envoi…
              </>
            ) : !ready ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Chargement de l'espace…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" /> Lancer la retouche
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
