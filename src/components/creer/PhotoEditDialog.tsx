import { useState, useEffect } from "react";
import { Loader2, Sparkles, Wand2, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface PhotoEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Original photo (full base64 data URL) */
  originalBase64: string;
  /** Optional name for alt text */
  name?: string;
  /** Called when the user validates the new version */
  onApply: (newBase64: string) => void;
}

interface Preset {
  key: string;
  label: string;
  mode: "remove_bg" | "replace_bg";
  prompt?: string;
}

const PRESETS: Preset[] = [
  {
    key: "transparent",
    label: "Fond transparent",
    mode: "remove_bg",
  },
  {
    key: "studio_white",
    label: "Fond studio blanc",
    mode: "replace_bg",
    prompt: "clean white studio background, soft natural shadow under the subject",
  },
  {
    key: "golden_hour",
    label: "Lumière dorée",
    mode: "replace_bg",
    prompt: "warm golden hour lighting, soft bokeh background, cozy ambient light",
  },
];

export function PhotoEditDialog({
  open,
  onOpenChange,
  originalBase64,
  name,
  onApply,
}: PhotoEditDialogProps) {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();

  const [prompt, setPrompt] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);

  // Reset state every time we re-open
  useEffect(() => {
    if (open) {
      setPrompt("");
      setSelectedPreset(null);
      setIsGenerating(false);
      setPreviewBase64(null);
    }
  }, [open]);

  const handlePreset = (key: string) => {
    setSelectedPreset(key);
    const p = PRESETS.find((p) => p.key === key);
    if (p?.mode === "replace_bg" && p.prompt) {
      setPrompt(p.prompt);
    } else if (p?.mode === "remove_bg") {
      setPrompt("");
    }
  };

  const handleGenerate = async () => {
    const preset = selectedPreset
      ? PRESETS.find((p) => p.key === selectedPreset)
      : null;

    let mode: "remove_bg" | "replace_bg" = "replace_bg";
    let finalPrompt = prompt.trim();

    if (preset?.mode === "remove_bg") {
      mode = "remove_bg";
      finalPrompt = "";
    } else if (finalPrompt.length < 3) {
      toast({
        title: "Décris d'abord ton fond",
        description: "Choisis un preset ou écris quelques mots (ex : plage au coucher du soleil).",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    const { data, error } = await invokeWithTimeout(
      "photoroom-edit",
      {
        body: {
          image_base64: originalBase64,
          mode,
          prompt: mode === "replace_bg" ? finalPrompt : undefined,
          workspace_id:
            activeWorkspace?.id && activeWorkspace.id !== "self"
              ? activeWorkspace.id
              : undefined,
        },
      },
      90_000,
    );

    setIsGenerating(false);

    if (error || !data?.image_base64) {
      toast({
        title: "Édition impossible",
        description: error?.message || "Réessaie dans quelques instants.",
        variant: "destructive",
      });
      return;
    }

    setPreviewBase64(data.image_base64);
  };

  const handleApply = () => {
    if (!previewBase64) return;
    onApply(previewBase64);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            Modifier le fond
          </DialogTitle>
          <DialogDescription>
            L'IA détoure ta photo et remplace l'arrière-plan. Choisis un preset ou décris ce que tu veux.
          </DialogDescription>
        </DialogHeader>

        {/* Aperçus avant / après */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Avant</p>
            <div className="aspect-square rounded-lg overflow-hidden border border-border bg-muted">
              <img
                src={originalBase64}
                alt={name ? `Original – ${name}` : "Original"}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Après</p>
            <div
              className={cn(
                "aspect-square rounded-lg overflow-hidden border border-border relative",
                "bg-[conic-gradient(at_top_left,_#f3f3f3_25%,_#ffffff_25%_50%,_#f3f3f3_50%_75%,_#ffffff_75%)] bg-[length:16px_16px]",
              )}
            >
              {isGenerating && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">Génération…</p>
                </div>
              )}
              {previewBase64 ? (
                <img
                  src={previewBase64}
                  alt="Aperçu"
                  className="w-full h-full object-cover"
                />
              ) : !isGenerating ? (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground p-4 text-center">
                  L'aperçu apparaîtra ici
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Presets rapides */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Idées rapides</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => handlePreset(p.key)}
                disabled={isGenerating}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border transition-colors",
                  selectedPreset === p.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:border-primary/40",
                  isGenerating && "opacity-50 cursor-not-allowed",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt libre */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            Ou décris le fond que tu veux
          </label>
          <Textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              // If user types a custom prompt, deselect "transparent" preset
              if (selectedPreset === "transparent") setSelectedPreset(null);
            }}
            placeholder="Ex : plage au coucher du soleil, bokeh chaleureux, ombre douce"
            maxLength={300}
            disabled={isGenerating || selectedPreset === "transparent"}
            className="min-h-[60px] resize-none text-sm"
          />
          <p className="text-[10px] text-muted-foreground text-right">
            {prompt.length} / 300
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Annuler
          </Button>
          {previewBase64 && (
            <Button
              type="button"
              variant="outline"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Réessayer
            </Button>
          )}
          {!previewBase64 ? (
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Génération…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Générer le nouveau fond
                </>
              )}
            </Button>
          ) : (
            <Button type="button" onClick={handleApply} disabled={isGenerating}>
              Utiliser cette version
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
