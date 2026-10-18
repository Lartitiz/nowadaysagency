/**
 * PackshotDialog — packshot e-commerce fond blanc à partir d'une photo de la
 * bibliothèque.
 *
 * Détourage + fond blanc pur via l'edge photoroom-edit (mode packshot :
 * background.color déterministe, jamais de prompt IA). Options : cadrage carré
 * marketplace 2000x2000 avec marges, ombre douce. Le résultat s'ajoute à la
 * bibliothèque comme NOUVELLE photo taguée « packshot » — l'originale n'est
 * jamais modifiée.
 *
 * Rangement automatique (P4, 18/10/2026, choix de Laetitia) : le résultat payé
 * est rangé dans « Mes photos » dès qu'il arrive ; fermer ne perd plus rien,
 * « Retirer cet essai » l'enlève de la bibliothèque.
 */

import { useEffect, useState } from "react";
import { Check, Download, Loader2, Package, RotateCcw, Sparkles, Trash2 } from "lucide-react";
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
import {
  discardPhotoAttempt,
  userPhotoToRawBase64,
  type UserPhotoRow,
} from "@/lib/photo-storage";
import {
  dataUrlToBlob,
  PACKSHOT_KIND,
  saveGeneratedPhoto,
  slugifyPhotoName as slugify,
} from "@/lib/photo-auto-save";
import { useRefreshUserPhotos } from "@/hooks/use-user-photos";

interface PackshotDialogProps {
  photo: UserPhotoRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PackshotDialog({ photo, open, onOpenChange }: PackshotDialogProps) {
  const { user } = useAuth();
  const refreshPhotos = useRefreshUserPhotos();

  const [sourceBase64, setSourceBase64] = useState<string | null>(null);
  const [square, setSquare] = useState(true);
  const [shadow, setShadow] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultBase64, setResultBase64] = useState<string | null>(null);
  // Id dans « Mes photos » du résultat affiché (null tant qu'il n'est pas rangé).
  const [resultPhotoId, setResultPhotoId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset + chargement de la source à chaque ouverture
  useEffect(() => {
    if (!open || !photo) return;
    setSourceBase64(null);
    setSquare(true);
    setShadow(true);
    setIsGenerating(false);
    setResultBase64(null);
    setResultPhotoId(null);
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

    if (error || !data?.image_base64) {
      setIsGenerating(false);
      toast.error("Packshot impossible", {
        description: error?.message || "Réessaie dans quelques instants.",
      });
      return;
    }
    // Image payée : rangée tout de suite, avant même qu'on la regarde.
    setResultBase64(data.image_base64);
    setResultPhotoId(null);
    await keep(data.image_base64);
    setIsGenerating(false);
  };

  async function keep(dataUrl: string): Promise<string | null> {
    if (!user?.id) return null;
    try {
      const photoId = await saveGeneratedPhoto({ dataUrl, source: photo!, userId: user.id, kind: PACKSHOT_KIND });
      setResultPhotoId(photoId);
      // Fait apparaître la nouvelle photo dans la grille sans dépendre du
      // Realtime ni d'un aller-retour sur la page.
      refreshPhotos();
      return photoId;
    } catch (e) {
      console.warn("[PackshotDialog] rangement automatique impossible:", e);
      toast.error("L'image n'a pas pu être rangée dans Mes photos", {
        description: "Réessaie avec « Ranger dans Mes photos » ou télécharge-la.",
      });
      return null;
    }
  }

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

  // Bouton principal : déjà rangé → on ferme ; rangement raté → on réessaie.
  const handleSave = async () => {
    if (!resultBase64 || isSaving) return;
    if (resultPhotoId) {
      toast.success("Ton packshot est dans Mes photos");
      onOpenChange(false);
      return;
    }
    setIsSaving(true);
    const id = await keep(resultBase64);
    setIsSaving(false);
    if (id) {
      toast.success("Ton packshot est dans Mes photos");
      onOpenChange(false);
    }
  };

  // « Retirer cet essai » : l'image quitte la bibliothèque (retrait récupérable).
  const handleRemove = async () => {
    if (!resultBase64 || isSaving) return;
    setIsSaving(true);
    try {
      if (resultPhotoId) await discardPhotoAttempt(resultPhotoId);
      refreshPhotos();
      setResultBase64(null);
      setResultPhotoId(null);
      toast.success("Essai retiré de Mes photos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de retirer cet essai");
    } finally {
      setIsSaving(false);
    }
  };

  const busy = isGenerating || isSaving;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        // Filet : une image dont le rangement a échoué ne part pas sans prévenir.
        if (!v && resultBase64 && !resultPhotoId
          && !window.confirm("Cette image n'a pas pu être rangée dans Mes photos. Fermer quand même ?")) return;
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Une photo pour mon e-commerce
          </DialogTitle>
          <DialogDescription>
            L'IA détoure ton produit et le pose sur un fond blanc pur, prêt pour ta
            boutique en ligne ou les marketplaces (Etsy, Amazon…).
          </DialogDescription>
        </DialogHeader>

        {photo.kind === "portrait" && (
          <p className="text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
            Cette photo semble montrer une personne. Le packshot est conçu pour tes
            produits : ici, il détourerait la personne sur fond blanc.
          </p>
        )}

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
            Chaque génération utilise 1 crédit photo. Le packshot va tout seul dans Mes
            photos, ton originale reste intacte.
          </p>
        </div>

        {/* 4 boutons ne tiennent pas dans max-w-2xl : Annuler disparaît après
            génération (le X ferme) et le footer peut wrapper au besoin. */}
        <DialogFooter className="flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
          {!resultBase64 && (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Annuler
            </Button>
          )}
          {resultBase64 && (
            <>
              {resultPhotoId ? (
                <p className="text-xs text-emerald-700 flex items-center gap-1 sm:mr-auto" data-testid="packshot-range">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  Déjà rangé dans Mes photos
                </p>
              ) : (
                !isGenerating && <p className="text-xs text-amber-800 sm:mr-auto">Pas encore dans Mes photos</p>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={handleRemove} disabled={busy} className="text-muted-foreground">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Retirer cet essai
              </Button>
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
                    Un instant…
                  </>
                ) : resultPhotoId ? (
                  "C'est bon, terminer"
                ) : (
                  "Ranger dans Mes photos"
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
