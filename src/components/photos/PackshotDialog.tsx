/**
 * PackshotDialog — packshot e-commerce fond blanc à partir d'une photo de la
 * bibliothèque.
 *
 * Détourage + fond blanc pur via l'edge photoroom-edit (mode packshot :
 * background.color déterministe, jamais de prompt IA). Options : cadrage carré
 * marketplace 2000x2000 avec marges, ombre douce. Le résultat s'ajoute à la
 * bibliothèque comme NOUVELLE photo taguée « packshot » — l'originale n'est
 * jamais modifiée.
 */

import { useEffect, useState } from "react";
import { Download, Loader2, Package, RotateCcw, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  uploadPhotoOriginal,
  userPhotoToRawBase64,
  type UserPhotoRow,
} from "@/lib/photo-storage";

interface PackshotDialogProps {
  photo: UserPhotoRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "photo"
  );
}

function dataUrlToBlob(dataUrl: string): Blob {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) throw new Error("Image invalide");
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

export function PackshotDialog({ photo, open, onOpenChange }: PackshotDialogProps) {
  const { user } = useAuth();

  const [sourceBase64, setSourceBase64] = useState<string | null>(null);
  const [square, setSquare] = useState(true);
  const [shadow, setShadow] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultBase64, setResultBase64] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset + chargement de la source à chaque ouverture
  useEffect(() => {
    if (!open || !photo) return;
    setSourceBase64(null);
    setSquare(true);
    setShadow(true);
    setIsGenerating(false);
    setResultBase64(null);
    setIsSaving(false);
    let cancelled = false;
    userPhotoToRawBase64(photo)
      .then((b64) => {
        if (!cancelled) setSourceBase64(b64);
      })
      .catch((e: any) => {
        if (!cancelled) toast.error(e?.message || "Impossible de charger la photo.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, photo]);

  if (!photo) return null;

  const handleGenerate = async () => {
    if (!sourceBase64 || isGenerating) return;
    setIsGenerating(true);

    const { data, error } = await invokeWithTimeout(
      "photoroom-edit",
      {
        body: {
          image_base64: sourceBase64,
          mode: "packshot",
          packshot_square: square,
          packshot_shadow: shadow,
          workspace_id: photo.workspace_id,
        },
      },
      90_000,
    );

    setIsGenerating(false);

    if (error || !data?.image_base64) {
      toast.error("Packshot impossible", {
        description: error?.message || "Réessaie dans quelques instants.",
      });
      return;
    }
    setResultBase64(data.image_base64);
  };

  const handleDownload = () => {
    if (!resultBase64) return;
    try {
      const blob = dataUrlToBlob(resultBase64);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${slugify(photo.name ?? "photo")}-packshot.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
    } catch (e: any) {
      toast.error(e?.message || "Téléchargement impossible");
    }
  };

  const handleSave = async () => {
    if (!resultBase64 || !user?.id || isSaving) return;
    setIsSaving(true);
    try {
      const blob = dataUrlToBlob(resultBase64);
      const file = new File([blob], `${slugify(photo.name ?? "photo")}-packshot.jpg`, {
        type: blob.type || "image/jpeg",
      });
      const { photoId } = await uploadPhotoOriginal({
        file,
        userId: user.id,
        workspaceId: photo.workspace_id,
        name: `${photo.name ?? "Photo"} — packshot`,
        purpose: "library",
      });

      // Métadonnées héritées de la source : pas besoin d'un appel vision,
      // on sait déjà ce que la photo contient.
      const tags = Array.from(new Set(["packshot", ...(photo.tags ?? [])])).slice(0, 6);
      const description = photo.description
        ? `Packshot fond blanc — ${photo.description}`
        : "Packshot e-commerce sur fond blanc";
      const { error: updError } = await supabase
        .from("user_photos")
        .update({
          tags,
          description,
          source_type: "generated",
          background_preset_key: "packshot",
        })
        .eq("id", photoId);
      if (updError) {
        console.warn("[PackshotDialog] metadata update failed:", updError.message);
      }

      toast.success("Packshot ajouté à ta bibliothèque");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Enregistrement impossible");
    } finally {
      setIsSaving(false);
    }
  };

  const busy = isGenerating || isSaving;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Packshot e-commerce
          </DialogTitle>
          <DialogDescription>
            L'IA détoure ton produit et le pose sur un fond blanc pur, prêt pour ta
            boutique ou les marketplaces (Etsy, Amazon…).
          </DialogDescription>
        </DialogHeader>

        {/* Aperçus avant / après */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Ta photo</p>
            <div className="aspect-square rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center">
              {sourceBase64 ? (
                <img
                  loading="lazy"
                  src={sourceBase64}
                  alt={photo.name ? `Original – ${photo.name}` : "Original"}
                  className="w-full h-full object-contain"
                />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Packshot</p>
            <div className="aspect-square rounded-lg overflow-hidden border border-border relative bg-white">
              {isGenerating && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">Détourage…</p>
                </div>
              )}
              {resultBase64 ? (
                <img
                  loading="lazy"
                  src={resultBase64}
                  alt="Aperçu du packshot"
                  className="w-full h-full object-contain"
                />
              ) : !isGenerating ? (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground p-4 text-center">
                  L'aperçu apparaîtra ici
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-foreground">Format</p>
            <div className="flex gap-1.5">
              {[
                { key: true, label: "Carré marketplace" },
                { key: false, label: "Format d'origine" },
              ].map((opt) => (
                <button
                  key={String(opt.key)}
                  type="button"
                  onClick={() => setSquare(opt.key)}
                  disabled={busy}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border transition-colors",
                    square === opt.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:border-primary/40",
                    busy && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="packshot-shadow" className="text-xs font-medium text-foreground">
              Ombre douce sous le produit
            </label>
            <Switch
              id="packshot-shadow"
              checked={shadow}
              onCheckedChange={setShadow}
              disabled={busy}
            />
          </div>
          <p className="text-2xs text-muted-foreground">
            Chaque génération utilise 1 crédit photo. Le packshot s'ajoute comme nouvelle
            photo, ton originale reste intacte.
          </p>
        </div>

        {/* 4 boutons ne tiennent pas dans max-w-2xl : Annuler disparaît après
            génération (le X ferme) et le footer peut wrapper au besoin. */}
        <DialogFooter className="flex-col sm:flex-row sm:flex-wrap gap-2">
          {!resultBase64 && (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Annuler
            </Button>
          )}
          {resultBase64 && (
            <>
              <Button type="button" variant="outline" onClick={handleGenerate} disabled={busy}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Réessayer
              </Button>
              <Button type="button" variant="outline" onClick={handleDownload} disabled={busy}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Télécharger
              </Button>
              <Button type="button" onClick={handleSave} disabled={busy}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Enregistrement…
                  </>
                ) : (
                  "Ajouter à ma bibliothèque"
                )}
              </Button>
            </>
          )}
          {!resultBase64 && (
            <Button type="button" onClick={handleGenerate} disabled={busy || !sourceBase64}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Génération…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Générer le packshot
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
