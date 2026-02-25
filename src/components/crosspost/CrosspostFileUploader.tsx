import { useRef, useState, useCallback } from "react";
import { Upload, FileText, X, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
  type: "image" | "pdf";
  name: string;
  uploading: boolean;
  signedUrl?: string;
}

interface CrosspostFileUploaderProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

export default function CrosspostFileUploader({ files, onFilesChange, maxFiles = 10, disabled }: CrosspostFileUploaderProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const processFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const remaining = maxFiles - files.length;
    if (remaining <= 0) {
      toast({ title: "Limite atteinte", description: `Maximum ${maxFiles} fichiers.`, variant: "destructive" });
      return;
    }

    const valid: UploadedFile[] = [];
    for (const f of arr.slice(0, remaining)) {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        toast({ title: "Type non supporté", description: `${f.name} n'est pas un PNG, JPG, WEBP ou PDF.`, variant: "destructive" });
        continue;
      }
      const isImage = f.type.startsWith("image/");
      valid.push({
        id: crypto.randomUUID(),
        file: f,
        preview: isImage ? URL.createObjectURL(f) : undefined,
        type: isImage ? "image" : "pdf",
        name: f.name,
        uploading: false,
      });
    }
    if (valid.length) onFilesChange([...files, ...valid]);
  }, [files, maxFiles, onFilesChange, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!disabled) processFiles(e.dataTransfer.files);
  }, [disabled, processFiles]);

  const removeFile = (id: string) => {
    const f = files.find((x) => x.id === id);
    if (f?.preview) URL.revokeObjectURL(f.preview);
    onFilesChange(files.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      {files.length < maxFiles && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 bg-muted/30",
            disabled && "opacity-50 pointer-events-none"
          )}
        >
          <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Glisse tes captures ici ou clique pour importer</p>
          <p className="text-xs text-muted-foreground mt-1">PNG, JPG, PDF · {maxFiles} fichiers max</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) processFiles(e.target.files); e.target.value = ""; }}
          />
        </div>
      )}

      {/* Grid previews */}
      {files.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">{files.length}/{maxFiles} fichiers</p>
          <div className="grid grid-cols-3 max-md:grid-cols-2 gap-2">
            {files.map((f) => (
              <div key={f.id} className="relative group rounded-lg border border-border bg-card overflow-hidden">
                {f.type === "image" && f.preview ? (
                  <img src={f.preview} alt={f.name} className="w-full h-24 object-cover" />
                ) : (
                  <div className="w-full h-24 flex flex-col items-center justify-center bg-muted/40">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground truncate px-1.5 py-1">{f.name}</p>
                {f.uploading && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
                  className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  disabled={disabled}
                >
                  <X className="h-3.5 w-3.5 text-foreground" />
                </button>
              </div>
            ))}
          </div>
          {files.length < maxFiles && (
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => inputRef.current?.click()} disabled={disabled}>
              <Plus className="h-3.5 w-3.5" /> Ajouter d'autres fichiers
            </Button>
          )}
        </>
      )}
    </div>
  );
}
