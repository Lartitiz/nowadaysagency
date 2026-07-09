/**
 * PortraitProDialog — « Portrait pro » d'une photo de personne (kind=portrait).
 *
 * Frontière technique assumée (et promesse produit) : le visage passe par
 * Photoroom UNIQUEMENT — détourage au pixel, jamais re-généré par une IA
 * d'image. Seul le fond change (photo-background-replace).
 *
 * Parcours maquetté (validé 09/07/2026) : zéro formulaire — 4 ambiances
 * générées depuis le branding (photo-describe mode portrait_ambiances, cache
 * serveur, « D'autres idées » régénère) + champ libre. La génération crée une
 * NOUVELLE photo de bibliothèque (l'originale reste intacte) ; l'écran
 * résultat garde l'originale en vis-à-vis, les chips d'ajustement regénèrent
 * la même ligne (1 crédit) toujours depuis la photo d'origine.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Loader2, RefreshCw, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useGeneratePortraitPro,
  useRetouchExistingPhoto,
} from "@/hooks/use-user-photos";
import { usePortraitAmbiances, type PortraitAmbiance } from "@/hooks/use-portrait-ambiances";
import {
  deletePhotoCompletely,
  downloadPhoto,
  getSignedPhotoUrl,
  type UserPhotoRow,
} from "@/lib/photo-storage";

interface PortraitProDialogProps {
  photo: UserPhotoRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const ADJUST_CHIPS: { key: string; label: string; directive: string }[] = [
  {
    key: "autre_version",
    label: "Une autre version",
    directive: "Propose une variation différente du même type de décor.",
  },
  {
    key: "plus_lumineux",
    label: "Plus lumineux",
    directive: "Le décor doit être nettement plus lumineux, lumière naturelle claire.",
  },
  {
    key: "plus_epure",
    label: "Plus épuré",
    directive: "Le décor doit être plus minimaliste et épuré, moins d'objets, plus de vide.",
  },
  {
    key: "fond_flou",
    label: "Fond plus flou",
    directive: "Le décor doit avoir une profondeur de champ douce, arrière-plan légèrement flouté.",
  },
];

export function PortraitProDialog({ photo, open, onOpenChange }: PortraitProDialogProps) {
  const navigate = useNavigate();
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [freePrompt, setFreePrompt] = useState("");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [result, setResult] = useState<UserPhotoRow | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [adjustingKey, setAdjustingKey] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const { ambiances, isLoading, isError, regenerate, isRegenerating } = usePortraitAmbiances(open);
  const { mutate: generate, isPending: isGenerating } = useGeneratePortraitPro();
  const { mutate: adjust, isPending: isAdjusting } = useRetouchExistingPhoto();

  const busy = isGenerating || isAdjusting || isDeleting;

  // Reset à chaque ouverture + aperçu de la photo source.
  useEffect(() => {
    if (!open || !photo) return;
    setSelectedIdx(0);
    setFreePrompt("");
    setResult(null);
    setResultUrl(null);
    setSourceUrl(null);
    let cancelled = false;
    const srcPath = photo.original_storage_path || photo.storage_path;
    getSignedPhotoUrl(srcPath).then((u) => {
      if (!cancelled) setSourceUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [open, photo]);

  if (!photo) return null;

  /** Le prompt de fond effectif : champ libre s'il est rempli, sinon l'ambiance choisie. */
  const activePrompt = (): { prompt: string; title?: string } | null => {
    const free = freePrompt.trim();
    if (free.length >= 3) return { prompt: free };
    const a: PortraitAmbiance | undefined = ambiances[selectedIdx];
    if (a?.prompt) return { prompt: a.prompt, title: a.title };
    return null;
  };

  const refreshResult = async (photoId: string) => {
    const { data } = await supabase
      .from("user_photos")
      .select("*")
      .eq("id", photoId)
      .maybeSingle();
    if (data) {
      const row = data as UserPhotoRow;
      setResult(row);
      const url = await getSignedPhotoUrl(row.storage_path);
      setResultUrl(url);
    }
  };

  const handleGenerate = async () => {
    const chosen = activePrompt();
    if (!chosen) {
      toast.error("Choisis une ambiance ou décris ton fond.");
      return;
    }
    try {
      const { photoId } = await generate({
        sourcePhoto: photo,
        backgroundPrompt: chosen.prompt,
        ambianceTitle: chosen.title,
      });
      await refreshResult(photoId);
    } catch (e: any) {
      if (e?.message?.includes("limit_reached") || e?.message?.includes("quota")) {
        toast.error("Plus de crédits ce mois-ci.", {
          action: { label: "Voir les plans", onClick: () => navigate("/abonnement") },
        });
      } else {
        toast.error(e?.message || "La génération a échoué, réessaie.");
      }
    }
  };

  const handleAdjust = async (chip: (typeof ADJUST_CHIPS)[number]) => {
    if (!result) return;
    setAdjustingKey(chip.key);
    try {
      const base = result.background_prompt ?? activePrompt()?.prompt ?? "";
      await adjust({ photo: result, backgroundPrompt: `${base} ${chip.directive}`.trim() });
      await refreshResult(result.id);
    } catch (e: any) {
      toast.error(e?.message || "L'ajustement a échoué, réessaie.");
    } finally {
      setAdjustingKey(null);
    }
  };

  const handleDelete = async () => {
    if (!result) return;
    setIsDeleting(true);
    try {
      await deletePhotoCompletely(result);
      setResult(null);
      setResultUrl(null);
      toast.success("Essai supprimé.");
    } catch (e: any) {
      toast.error(e?.message || "Suppression impossible");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async () => {
    if (!result) return;
    setIsDownloading(true);
    try {
      await downloadPhoto(result.storage_path, `${result.name ?? "portrait-pro"}.jpg`);
    } catch {
      toast.error("Téléchargement impossible");
    } finally {
      setIsDownloading(false);
    }
  };

  const hasResult = !!result && !!resultUrl;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return; // pas de fermeture pendant une génération
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {hasResult ? "Et voilà" : "Portrait pro"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            Ton visage n'est pas modifié — seul le fond change.
          </DialogDescription>
        </DialogHeader>

        {!hasResult ? (
          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="w-28 shrink-0 rounded-xl overflow-hidden border border-border bg-muted/40">
                {sourceUrl ? (
                  <img src={sourceUrl} alt={photo.name ?? "Portrait"} className="w-full object-cover" />
                ) : (
                  <div className="h-32 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" /> Ambiances imaginées pour ta marque
                  </p>
                  <button
                    type="button"
                    onClick={() => regenerate().catch(() => toast.error("Régénération impossible, réessaie."))}
                    disabled={isRegenerating || isLoading || busy}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-3 w-3", isRegenerating && "animate-spin")} />
                    D'autres idées
                  </button>
                </div>

                {isLoading || isRegenerating ? (
                  <div className="grid grid-cols-2 gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="h-16 rounded-lg border border-border bg-muted/40 animate-pulse" />
                    ))}
                  </div>
                ) : isError || !ambiances.length ? (
                  <p className="text-xs text-muted-foreground">
                    Les idées d'ambiances n'ont pas pu être générées — décris ton fond ci-dessous.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {ambiances.map((a, i) => (
                      <button
                        key={`${a.title}-${i}`}
                        type="button"
                        onClick={() => {
                          setSelectedIdx(i);
                          setFreePrompt("");
                        }}
                        disabled={busy}
                        className={cn(
                          "rounded-lg border p-2.5 text-left transition-colors",
                          selectedIdx === i && !freePrompt.trim()
                            ? "border-primary ring-1 ring-primary"
                            : "border-border hover:border-foreground/30",
                        )}
                      >
                        <p className="text-[13px] font-medium leading-tight">{a.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.description}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Input
              value={freePrompt}
              onChange={(e) => setFreePrompt(e.target.value)}
              placeholder="Ou décris le fond que tu imagines…"
              disabled={busy}
            />

            <DialogFooter className="items-center gap-2 sm:justify-between">
              <span className="text-xs rounded-full bg-primary/10 text-primary px-2.5 py-1">1 crédit</span>
              <Button onClick={handleGenerate} disabled={busy || isLoading}>
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération… (~15 s)
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" /> Générer mon portrait
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <figure className="space-y-1">
                <div className="rounded-xl overflow-hidden border border-border bg-muted/40">
                  {sourceUrl && <img src={sourceUrl} alt="Ta photo d'origine" className="w-full object-cover" />}
                </div>
                <figcaption className="text-xs text-muted-foreground text-center">Ta photo</figcaption>
              </figure>
              <figure className="space-y-1">
                <div className={cn("rounded-xl overflow-hidden border border-primary/40", isAdjusting && "opacity-60")}>
                  <img src={resultUrl!} alt="Portrait pro généré" className="w-full object-cover" />
                </div>
                <figcaption className="text-xs text-muted-foreground text-center">Portrait pro</figcaption>
              </figure>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Ajuster (1 crédit, toujours depuis ta photo d'origine)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ADJUST_CHIPS.map((chip) => (
                  <Button
                    key={chip.key}
                    size="sm"
                    variant="outline"
                    className="rounded-full h-7 text-xs"
                    disabled={busy}
                    onClick={() => handleAdjust(chip)}
                  >
                    {adjustingKey === chip.key && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                    {chip.label}
                  </Button>
                ))}
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between items-center">
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Supprimer cet essai
              </button>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleDownload} disabled={busy || isDownloading}>
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Télécharger
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    onOpenChange(false);
                    navigate("/creer", { state: { libraryPhotoIds: [result!.id] } });
                  }}
                >
                  <Sparkles className="h-4 w-4 mr-2" /> Créer un post avec
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    toast.success("Portrait ajouté à ta bibliothèque.");
                    onOpenChange(false);
                  }}
                >
                  Garder dans ma bibliothèque
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
