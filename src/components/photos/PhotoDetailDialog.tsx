/**
 * PhotoDetailDialog — full preview of a ready photo.
 *
 * Photos retouchées : bascule Avant/Après + téléchargement des deux versions.
 * Photos bibliothèque (un seul fichier) : vue simple + description/tags IA,
 * régénérables via l'edge photo-describe.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Download, Loader2, Package, RefreshCw, Shirt, Sparkles, Wand2 } from "lucide-react";
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
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";

interface PhotoDetailDialogProps {
  photo: UserPhotoRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Ouvre le dialog packshot pour cette photo (le détail se ferme). */
  onPackshot?: (photo: UserPhotoRow) => void;
  /** Ouvre la retouche IA (remplacement de décor) pour cette photo. */
  onRetouche?: (photo: UserPhotoRow) => void;
  /** Ouvre la mise en scène (produit porté/en situation) pour cette photo. */
  onMiseEnScene?: (photo: UserPhotoRow) => void;
  /** Ouvre le Portrait pro (fond de marque, visage intact) — photos kind=portrait. */
  onPortraitPro?: (photo: UserPhotoRow) => void;
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

export function PhotoDetailDialog({ photo, open, onOpenChange, onPackshot, onRetouche, onMiseEnScene, onPortraitPro }: PhotoDetailDialogProps) {
  const navigate = useNavigate();
  const [view, setView] = useState<"after" | "before">("after");
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Description/tags régénérés : la prop `photo` peut être périmée après un
  // appel photo-describe, on garde la dernière valeur renvoyée par l'edge.
  const [meta, setMeta] = useState<{ description: string | null; tags: string[] } | null>(null);
  const [describing, setDescribing] = useState(false);
  const [productActionsOpen, setProductActionsOpen] = useState(false);

  // Photo bibliothèque = un seul fichier (pas de version originale distincte)
  const hasRetouch =
    !!photo?.original_storage_path && photo.original_storage_path !== photo.storage_path;

  // Packshot / Mettre en scène = actions produit : mises en avant seulement si
  // la photo est un produit (ou pas encore classée — comportement historique).
  const isProductPhoto =
    !photo?.kind || photo.kind === "produit" || photo.kind === "produit_porte";

  useEffect(() => {
    if (!photo || !open) return;
    setView("after");
    setProductActionsOpen(false);
    setMeta({ description: photo.description, tags: photo.tags ?? [] });
    let cancelled = false;
    Promise.all([
      getSignedPhotoUrl(photo.storage_path),
      photo.original_storage_path !== photo.storage_path
        ? getSignedPhotoUrl(photo.original_storage_path)
        : Promise.resolve(null),
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
      const filename = !hasRetouch
        ? `${baseName}.jpg`
        : view === "after"
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

  async function handleDescribe() {
    if (!photo || describing) return;
    setDescribing(true);
    try {
      const { data, error } = await invokeWithTimeout(
        "photo-describe",
        { body: { mode: "describe", photo_id: photo.id, workspace_id: photo.workspace_id } },
        60_000,
      );
      if (error) throw new Error(error.message);
      setMeta({
        description: typeof data?.description === "string" ? data.description : null,
        tags: Array.isArray(data?.tags) ? data.tags : [],
      });
      toast.success("Description mise à jour");
    } catch (e: any) {
      toast.error(e?.message || "Description impossible pour le moment");
    } finally {
      setDescribing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        {/* min-w-0 : sans lui, un nom long (fichier brut, suffixes) fixe la
            largeur minimale de la grille du dialogue — le truncate ne joue
            jamais et le dialogue déborde de l'écran en mobile. */}
        <DialogHeader className="min-w-0">
          <DialogTitle className="truncate">{photo.name ?? "Photo"}</DialogTitle>
          {photo.background_prompt && (
            <DialogDescription className="line-clamp-2">
              {photo.background_prompt}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Before/After toggle — seulement pour les photos retouchées */}
        {hasRetouch && (
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
        )}

        <div className="rounded-xl overflow-hidden border border-border bg-muted/40 max-h-[60vh] flex items-center justify-center">
          {url ? (
            <img loading="lazy"
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

        {/* Description + tags IA (matière du matching photo ↔ contenu) */}
        {photo.status === "ready" && (
          <div className="rounded-xl bg-muted/50 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {meta?.description ? (
                  <p className="text-xs text-foreground leading-snug">{meta.description}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Pas encore de description IA.
                  </p>
                )}
                {!!meta?.tags?.length && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {meta.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-2xs"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleDescribe}
                disabled={describing}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Régénérer la description"
                title="Régénérer la description"
              >
                {describing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {/* Portrait pro : l'action vedette des photos de personne — fond de
              marque via détourage Photoroom, visage jamais re-généré. */}
          {photo.status === "ready" && photo.kind === "portrait" && onPortraitPro && (
            <Button onClick={() => onPortraitPro(photo)}>
              <Camera className="h-4 w-4 mr-2" /> Portrait pro
            </Button>
          )}
          {photo.status === "ready" && onRetouche && (
            <Button variant="outline" onClick={() => onRetouche(photo)}>
              <Wand2 className="h-4 w-4 mr-2" /> Modifier le fond
            </Button>
          )}
          {photo.status === "ready" && isProductPhoto && onPackshot && (
            <Button variant="outline" onClick={() => onPackshot(photo)}>
              <Package className="h-4 w-4 mr-2" /> Packshot e-commerce
            </Button>
          )}
          {photo.status === "ready" && isProductPhoto && onMiseEnScene && (
            <Button variant="outline" onClick={() => onMiseEnScene(photo)}>
              <Shirt className="h-4 w-4 mr-2" /> Mettre en scène
            </Button>
          )}
          {photo.status === "ready" && (
            <Button
              /* Un seul bouton vedette à la fois : quand Portrait pro est là,
                 Créer un contenu passe en secondaire. */
              variant={photo.kind === "portrait" && onPortraitPro ? "outline" : "default"}
              onClick={() => {
                navigate("/creer", { state: { libraryPhotoIds: [photo.id] } });
                onOpenChange(false);
              }}
            >
              <Sparkles className="h-4 w-4 mr-2" /> Créer un contenu
            </Button>
          )}
          <Button variant="outline" onClick={handleDownload} disabled={downloading || !url}>
            {downloading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Téléchargement…
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" /> Télécharger{" "}
                {!hasRetouch ? "la photo" : view === "after" ? "la retouche" : "l'originale"}
              </>
            )}
          </Button>
        </div>

        {/* Actions produit repliées pour les photos non-produit : jamais cachées
            (le classement IA peut se tromper), mais avec le contexte pour
            décider — un portrait « mis en scène » donne un clone IA imprévisible. */}
        {photo.status === "ready" && !isProductPhoto && (onPackshot || onMiseEnScene) && (
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setProductActionsOpen((s) => !s)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {productActionsOpen ? "Masquer les actions produit" : "Actions produit…"}
            </button>
            {productActionsOpen && (
              <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-xs text-amber-900">
                  {photo.kind === "portrait"
                    ? "Cette photo semble montrer une personne. Ces outils sont conçus pour des produits : sur un portrait, le résultat sera imprévisible (la personne serait re-générée par l'IA)."
                    : "Cette photo ne semble pas montrer un produit : ces outils sont conçus pour des photos produit."}
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  {onPackshot && (
                    <Button size="sm" variant="outline" onClick={() => onPackshot(photo)}>
                      <Package className="h-3.5 w-3.5 mr-1.5" /> Packshot quand même
                    </Button>
                  )}
                  {onMiseEnScene && (
                    <Button size="sm" variant="outline" onClick={() => onMiseEnScene(photo)}>
                      <Shirt className="h-3.5 w-3.5 mr-1.5" /> Mettre en scène quand même
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
