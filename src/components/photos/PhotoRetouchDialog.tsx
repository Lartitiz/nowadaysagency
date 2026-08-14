/**
 * PhotoRetouchDialog — retouche IA d'une photo DÉJÀ en bibliothèque.
 *
 * Pas d'upload : on part de la photo cliquée. On décrit le décor voulu, l'IA
 * (Photoroom) remplace le fond sur place. L'originale reste récupérable via la
 * bascule Avant/Après du détail. Le champ décor est pré-rempli avec le dernier
 * prompt de la photo s'il existe (retouche itérable).
 */

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useRetouchExistingPhoto } from "@/hooks/use-user-photos";
import { getSignedPhotoUrl, type UserPhotoRow } from "@/lib/photo-storage";
import { useBackgroundSuggestions } from "@/hooks/use-background-suggestions";

interface PhotoRetouchDialogProps {
  photo: UserPhotoRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PhotoRetouchDialog({ photo, open, onOpenChange }: PhotoRetouchDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { mutate, isPending } = useRetouchExistingPhoto();
  const suggestions = useBackgroundSuggestions();

  // On repart de l'originale (before) comme aperçu quand la photo est déjà
  // retouchée, sinon de son unique fichier.
  const sourcePath = photo?.original_storage_path || photo?.storage_path;

  useEffect(() => {
    if (!photo || !open) return;
    setPrompt(photo.background_prompt ?? "");
    setPreviewUrl(null);
    let cancelled = false;
    if (sourcePath) {
      getSignedPhotoUrl(sourcePath).then((u) => {
        if (!cancelled) setPreviewUrl(u);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [photo, open, sourcePath]);

  async function handleSubmit() {
    if (!photo) return;
    if (prompt.trim().length < 3) {
      toast.error("Décris le décor souhaité (3 caractères min).");
      return;
    }
    try {
      await mutate({ photo, backgroundPrompt: prompt.trim() });
      toast.success("Retouche lancée : la photo se met à jour dans la galerie.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Échec du lancement");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Changer le décor
          </DialogTitle>
          <DialogDescription>
            Décris le décor que tu veux derrière ton sujet — l'IA remplace le fond. Ta photo
            d'origine reste récupérable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Aperçu de la photo source */}
          <div className="rounded-xl overflow-hidden border border-border bg-muted/40 flex items-center justify-center max-h-[240px]">
            {previewUrl ? (
              <img
                loading="lazy"
                src={previewUrl}
                alt={photo?.name ?? "Photo"}
                className="w-full max-h-[240px] object-contain"
              />
            ) : (
              <div className="h-40 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Prompt décor */}
          <div className="space-y-1.5">
            <Label htmlFor="retouche-prompt" className="text-xs">
              Décris le décor que tu veux
            </Label>
            <Textarea
              id="retouche-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Décris l'ambiance, la lumière, les éléments du fond…"
              maxLength={500}
              className="min-h-[80px] resize-none"
              disabled={isPending}
            />
            {/* Ces pastilles étaient indiscernables des TAGS inertes de la fiche
                photo : même forme, même taille (text-2xs), aucune bordure. Le
                contraste n'était pas en cause (6,9:1, au-dessus de l'AA) — c'est
                l'affordance qui manquait. Bordure + fond distinct + cible plus
                haute (audit 14/08). */}
            {suggestions.length > 0 && (
              <div className="pt-1.5">
                <p className="text-xs text-muted-foreground mb-1.5">
                  Ou pars d'une idée tirée de ta charte :
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPrompt(s)}
                      disabled={isPending}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-muted/50 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !photo}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Envoi…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" /> Générer le nouveau fond · 1 crédit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
