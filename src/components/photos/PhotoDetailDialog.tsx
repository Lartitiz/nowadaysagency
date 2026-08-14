/**
 * PhotoDetailDialog — full preview of a ready photo.
 *
 * Photos retouchées : bascule Avant/Après + téléchargement des deux versions.
 * Photos bibliothèque (un seul fichier) : vue simple + description/tags IA,
 * régénérables via l'edge photo-describe.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  ChevronDown,
  Download,
  Loader2,
  Package,
  RefreshCw,
  Shirt,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
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
  /** Demande la suppression (le détail se ferme, la confirmation est côté page). */
  onDelete?: (photo: UserPhotoRow) => void;
}

/** Une entrée du menu « Retoucher ». `fits` = l'outil convient à ce type de photo. */
interface RetouchOption {
  key: string;
  icon: typeof Camera;
  title: string;
  hint: string;
  fits: boolean;
  run: () => void;
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

export function PhotoDetailDialog({ photo, open, onOpenChange, onPackshot, onRetouche, onMiseEnScene, onPortraitPro, onDelete }: PhotoDetailDialogProps) {
  const navigate = useNavigate();
  const [view, setView] = useState<"after" | "before">("after");
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Description/tags régénérés : la prop `photo` peut être périmée après un
  // appel photo-describe, on garde la dernière valeur renvoyée par l'edge.
  const [meta, setMeta] = useState<{ description: string | null; tags: string[] } | null>(null);
  const [describing, setDescribing] = useState(false);
  // Une seule porte « Retoucher » (audit UX 14/08) : les 4 outils de retouche
  // étaient 4 boutons frères en escalier, avec le bouton vedette « Créer un
  // contenu » coincé au milieu de la 2e ligne.
  const [retouchOpen, setRetouchOpen] = useState(false);

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
    setRetouchOpen(false);
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

  // Les outils de retouche, dans l'ordre où ils ont du sens pour CETTE photo.
  // Ceux qui ne conviennent pas ne disparaissent pas (le classement IA peut se
  // tromper) : ils passent sous un repli avec la raison.
  const isPortrait = photo.kind === "portrait";
  const retouchOptions: RetouchOption[] = [];
  if (isPortrait && onPortraitPro) {
    retouchOptions.push({
      key: "portrait",
      icon: Camera,
      title: "Mon portrait sur un fond de marque",
      hint: "Ton visage n'est jamais modifié — seul le fond change.",
      fits: true,
      run: () => onPortraitPro(photo),
    });
  }
  if (onPackshot) {
    retouchOptions.push({
      key: "packshot",
      icon: Package,
      title: "Fond blanc pour ma boutique",
      hint: "Pour Etsy, ta boutique, les marketplaces.",
      fits: isProductPhoto,
      run: () => onPackshot(photo),
    });
  }
  if (onMiseEnScene) {
    retouchOptions.push({
      key: "mise-en-scene",
      icon: Shirt,
      title: "Mon produit porté ou en situation",
      hint: "L'ambiance vient de ta charte de marque.",
      fits: isProductPhoto,
      run: () => onMiseEnScene(photo),
    });
  }
  if (onRetouche) {
    retouchOptions.push({
      key: "decor",
      icon: Wand2,
      title: "Changer le décor",
      hint: "Ton originale reste toujours récupérable.",
      fits: true,
      run: () => onRetouche(photo),
    });
  }
  const fittingOptions = retouchOptions.filter((o) => o.fits);
  const otherOptions = retouchOptions.filter((o) => !o.fits);

  function renderOption(o: RetouchOption) {
    const Icon = o.icon;
    return (
      <button
        key={o.key}
        type="button"
        onClick={() => {
          setRetouchOpen(false);
          o.run();
        }}
        className="w-full text-left rounded-xl border border-border p-3 transition-colors hover:border-primary/50 hover:bg-background"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground min-w-0">
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{o.title}</span>
          </span>
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-2xs text-primary">
            1 crédit
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{o.hint}</p>
      </button>
    );
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
          <div className="rounded-xl bg-muted/50 px-3 py-2.5 min-w-0">
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

        {/* Une action principale, une porte pour tout le reste.
            min-w-0 OBLIGATOIRE sur la rangée : DialogContent est une grille, et
            un enfant de grille a min-width:auto — sans ça, la rangée ne peut pas
            rétrécir sous la largeur de ses boutons et c'est TOUT le dialogue qui
            déborde de l'écran en mobile (constaté en 390 px le 14/08). Et sous
            640 px on EMPILE : côte à côte, « Créer un contenu » se rognait en
            « Créer un co… » et « Retoucher » en « R… ». */}
        {photo.status === "ready" && (
          <div className="flex flex-col sm:flex-row gap-2 min-w-0">
            <Button
              className="w-full sm:flex-[2] min-w-0"
              onClick={() => {
                navigate("/creer", { state: { libraryPhotoIds: [photo.id] } });
                onOpenChange(false);
              }}
            >
              <Sparkles className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">Créer un contenu</span>
            </Button>
            {retouchOptions.length > 0 && (
              <Button
                variant="outline"
                className="w-full sm:flex-1 min-w-0"
                aria-expanded={retouchOpen}
                onClick={() => setRetouchOpen((s) => !s)}
              >
                <Wand2 className="h-4 w-4 mr-2 shrink-0" />
                <span className="truncate">Retoucher</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 ml-1.5 shrink-0 transition-transform",
                    retouchOpen && "rotate-180",
                  )}
                />
              </Button>
            )}
          </div>
        )}

        {photo.status === "ready" && retouchOpen && (
          <div className="rounded-xl bg-muted/50 p-2 space-y-2 min-w-0">
            {fittingOptions.map(renderOption)}
            {/* Les outils qui ne collent pas au type détecté restent atteignables
                (le classement IA peut se tromper) mais sous un repli, avec la
                raison — un portrait « mis en scène » donne un clone IA. */}
            {otherOptions.length > 0 && (
              <details className="px-1">
                <summary className="cursor-pointer list-none py-1.5 text-xs text-muted-foreground hover:text-foreground">
                  {isPortrait
                    ? "Outils prévus pour des photos de produit…"
                    : "Voir aussi les outils produit…"}
                </summary>
                <p className="pb-2 text-xs text-muted-foreground">
                  {isPortrait
                    ? "Cette photo montre une personne. Sur un portrait, ces outils re-génèrent le sujet : le résultat sera imprévisible."
                    : "Cette photo ne semble pas montrer un produit — le résultat peut surprendre."}
                </p>
                <div className="space-y-2 pb-1">{otherOptions.map(renderOption)}</div>
              </details>
            )}
          </div>
        )}

        {/* Actions de service : détachées par un filet, jamais en concurrence
            avec l'action principale. « Supprimer » manquait ici — la corbeille
            de la vignette est en opacity-0/hover, donc hors d'atteinte au doigt. */}
        <div className="flex items-center gap-4 border-t border-border pt-3 min-w-0">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || !url}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Télécharger{hasRetouch ? (view === "after" ? " la retouche" : " l'originale") : ""}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onDelete(photo);
              }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
