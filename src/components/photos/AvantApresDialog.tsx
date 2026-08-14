/**
 * AvantApresDialog — « Avant / Après » : montage déterministe de deux photos
 * (chantier→rénové, ancien→nouveau…) en un seul visuel prêt à poster.
 *
 * Compositing 100 % code (src/lib/avant-apres) : offert, instantané, net.
 * Chaque photo vient d'un upload direct ou de la photothèque ; mise en page
 * (côte à côte / haut-bas), format (4:5, carré, story) et étiquettes au choix,
 * l'étiquette « Après » aux couleurs de la charte. Aperçu live comme le
 * mockup d'offre.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, ImagePlus, Images, Loader2, Sparkles } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId, useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { convertHeicIfNeeded } from "@/lib/heic";
import { redescribePhoto } from "@/lib/photo-redescribe";
import {
  getSignedPhotoUrl,
  uploadPhotoOriginal,
  type UserPhotoRow,
} from "@/lib/photo-storage";
import { PhotoLibraryPickerDialog } from "@/components/photos/PhotoLibraryPickerDialog";
import {
  AVANT_APRES_FORMATS,
  AVANT_APRES_LABEL_MAX,
  AVANT_APRES_LAYOUTS,
  pickDefaultLayout,
  renderAvantApres,
  resolveAfterLabelColor,
  type AvantApresFormat,
  type AvantApresLayout,
} from "@/lib/avant-apres";

interface AvantApresDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Side = "before" | "after";

const SIDE_COPY: Record<Side, { title: string; hint: string }> = {
  before: { title: "Avant", hint: "chantier, ancien état…" },
  after: { title: "Après", hint: "le résultat" },
};

export function AvantApresDialog({ open, onOpenChange }: AvantApresDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const { column, value } = useWorkspaceFilter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickTargetRef = useRef<Side>("before");

  const [images, setImages] = useState<Record<Side, ImageBitmap | null>>({
    before: null,
    after: null,
  });
  const [layout, setLayout] = useState<AvantApresLayout>("cote_a_cote");
  const [layoutTouched, setLayoutTouched] = useState(false);
  const [format, setFormat] = useState<AvantApresFormat>("4:5");
  const [labels, setLabels] = useState<Record<Side, string>>({ before: "Avant", after: "Après" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadingSide, setLoadingSide] = useState<Side | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedPhotoId, setSavedPhotoId] = useState<string | null>(null);

  // Couleur primaire de la charte pour l'étiquette « Après »
  const { data: charter } = useQuery({
    queryKey: ["avant-apres-brand-colors", column, value],
    queryFn: async () => {
      // Même parade TS2589 que OfferMockupDialog sur le .eq(column) dynamique
      const { data } = await (supabase.from("brand_charter") as any)
        .select("color_primary")
        .eq(column, value)
        .maybeSingle();
      return data ?? null;
    },
    enabled: open && !!value,
    staleTime: 5 * 60 * 1000,
  });
  const afterLabelColor = resolveAfterLabelColor(charter ?? null);

  // Reset à l'ouverture
  useEffect(() => {
    if (!open) return;
    setImages({ before: null, after: null });
    setLayout("cote_a_cote");
    setLayoutTouched(false);
    setFormat("4:5");
    setLabels({ before: "Avant", after: "Après" });
    setPreviewUrl(null);
    setSavedPhotoId(null);
    setLoadingSide(null);
  }, [open]);

  const ready = !!images.before && !!images.after;

  // Aperçu live : re-compose à chaque changement (déterministe, ~30 ms)
  useEffect(() => {
    if (!images.before || !images.after) return;
    let cancelled = false;
    renderAvantApres({
      before: images.before,
      after: images.after,
      layout,
      format,
      beforeLabel: labels.before,
      afterLabel: labels.after,
      afterLabelColor,
    })
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setSavedPhotoId(null);
      })
      .catch(() => toast.error("Impossible de composer le montage"));
    return () => {
      cancelled = true;
    };
  }, [images, layout, format, labels, afterLabelColor]);

  const setSideImage = (side: Side, bitmap: ImageBitmap) => {
    setImages((cur) => {
      const next = { ...cur, [side]: bitmap };
      if (!layoutTouched && next.before && next.after) {
        setLayout(pickDefaultLayout(next.before, next.after));
      }
      return next;
    });
  };

  const handleFile = async (file: File | undefined) => {
    const side = pickTargetRef.current;
    if (!file) return;
    try {
      const converted = await convertHeicIfNeeded(file);
      const bitmap = await createImageBitmap(converted);
      setSideImage(side, bitmap);
    } catch {
      toast.error("Cette image n'a pas pu être lue : essaie un PNG ou un JPEG.");
    }
  };

  const handleLibraryPick = async (photos: UserPhotoRow[]) => {
    const side = pickTargetRef.current;
    const photo = photos[0];
    if (!photo) return;
    setLoadingSide(side);
    try {
      const url = await getSignedPhotoUrl(photo.storage_path);
      if (!url) throw new Error("Photo inaccessible");
      const blob = await (await fetch(url)).blob();
      const bitmap = await createImageBitmap(blob);
      setSideImage(side, bitmap);
    } catch {
      toast.error("Cette photo n'a pas pu être chargée, réessaie.");
    } finally {
      setLoadingSide(null);
    }
  };

  const composeBlob = async (): Promise<Blob> => {
    if (!images.before || !images.after) throw new Error("Ajoute les deux photos d'abord");
    return renderAvantApres({
      before: images.before,
      after: images.after,
      layout,
      format,
      beforeLabel: labels.before,
      afterLabel: labels.after,
      afterLabelColor,
    });
  };

  /** Enregistre le montage courant en bibliothèque (kind=ambiance, generated). */
  const saveToLibrary = async (): Promise<UserPhotoRow> => {
    if (!user?.id || !workspaceId) throw new Error("Espace de travail introuvable");
    if (workspaceId === user.id) {
      throw new Error("Espace de travail en cours de chargement, réessaie dans 1 seconde.");
    }
    const blob = await composeBlob();
    const file = new File([blob], "avant-apres.jpg", { type: "image/jpeg" });
    const { photoId } = await uploadPhotoOriginal({
      file,
      userId: user.id,
      workspaceId,
      name: `${labels.before.trim() || "Avant"} / ${labels.after.trim() || "Après"}`,
      purpose: "library",
    });
    // Description de départ : elle dit la MISE EN PAGE, pas ce qu'on voit. Or
    // c'est le sujet qui compte pour retrouver la photo (une cuisine rénovée,
    // une coupe de cheveux…). photo-describe prend le relais (audit 14/08).
    const description = `Montage ${labels.before.trim() || "avant"} / ${labels.after.trim() || "après"} (${
      layout === "cote_a_cote" ? "côte à côte" : "haut/bas"
    })`;
    const { error: metaErr } = await supabase
      .from("user_photos")
      .update({
        kind: "ambiance",
        source_type: "generated",
        tags: ["avant-après"],
        description,
      })
      .eq("id", photoId);
    if (metaErr) console.warn("[AvantApresDialog] metadata update failed:", metaErr.message);
    redescribePhoto(photoId, workspaceId);
    setSavedPhotoId(photoId);
    const { data } = await supabase.from("user_photos").select("*").eq("id", photoId).maybeSingle();
    if (!data) throw new Error("Photo introuvable après l'ajout");
    return data as UserPhotoRow;
  };

  const handleSave = async (then: "none" | "create") => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const photo = await saveToLibrary();
      if (then === "create") {
        onOpenChange(false);
        navigate("/creer", { state: { libraryPhotoIds: [photo.id] } });
      } else {
        toast.success("Montage ajouté à ta bibliothèque.");
        onOpenChange(false);
      }
    } catch (e: any) {
      toast.error(e?.message || "L'ajout a échoué, réessaie.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await composeBlob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "avant-apres.jpg";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      toast.error(e?.message || "Téléchargement impossible");
    }
  };

  const slot = (side: Side) => {
    const img = images[side];
    return (
      <div key={side} className="flex-1 min-w-0">
        <p className="text-xs font-medium mb-1.5">{SIDE_COPY[side].title}</p>
        {img ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground truncate">Photo chargée ✓</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
              onClick={() => {
                pickTargetRef.current = side;
                fileInputRef.current?.click();
              }}
            >
              Changer
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
              onClick={() => {
                pickTargetRef.current = side;
                setPickerOpen(true);
              }}
            >
              Mes photos
            </button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="text-xs flex-1 min-w-0"
              disabled={loadingSide === side}
              onClick={() => {
                pickTargetRef.current = side;
                fileInputRef.current?.click();
              }}
            >
              {loadingSide === side ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <ImagePlus className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  <span className="truncate">Ajouter</span>
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs flex-1 min-w-0"
              disabled={loadingSide === side}
              onClick={() => {
                pickTargetRef.current = side;
                setPickerOpen(true);
              }}
            >
              <Images className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              <span className="truncate">Mes photos</span>
            </Button>
          </div>
        )}
        {!img && (
          <p className="text-2xs text-muted-foreground mt-1">{SIDE_COPY[side].hint}</p>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !isSaving && onOpenChange(v)}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Avant / Après
            </DialogTitle>
            <DialogDescription>
              Deux photos, un seul visuel : le format qui prouve ta transformation. Offert et
              instantané.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          <div className="space-y-4">
            <div className="flex gap-3">{(["before", "after"] as Side[]).map(slot)}</div>

            {ready && (
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-full sm:w-[240px] shrink-0">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Aperçu du montage avant/après"
                      className="w-full rounded-xl border border-border"
                    />
                  ) : (
                    <div className="aspect-[4/5] rounded-xl border border-border bg-muted/40 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-3 w-full">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Mise en page</p>
                    <div className="flex flex-wrap gap-1.5">
                      {AVANT_APRES_LAYOUTS.map((l) => (
                        <Button
                          key={l.key}
                          size="sm"
                          variant="outline"
                          className={cn(
                            "rounded-full h-7 text-xs",
                            layout === l.key && "border-primary ring-1 ring-primary",
                          )}
                          onClick={() => {
                            setLayout(l.key);
                            setLayoutTouched(true);
                          }}
                        >
                          {l.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Format</p>
                    <div className="flex flex-wrap gap-1.5">
                      {AVANT_APRES_FORMATS.map((f) => (
                        <Button
                          key={f.key}
                          size="sm"
                          variant="outline"
                          className={cn(
                            "rounded-full h-7 text-xs",
                            format === f.key && "border-primary ring-1 ring-primary",
                          )}
                          onClick={() => setFormat(f.key)}
                        >
                          {f.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">
                      Étiquettes (« 2024 / 2026 », « Achat / Revente »…)
                    </p>
                    <div className="flex gap-1.5">
                      {(["before", "after"] as Side[]).map((side) => (
                        <Input
                          key={side}
                          value={labels[side]}
                          maxLength={AVANT_APRES_LABEL_MAX}
                          placeholder={SIDE_COPY[side].title}
                          className="h-8 text-xs"
                          onChange={(e) =>
                            setLabels((cur) => ({ ...cur, [side]: e.target.value }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {ready && (
              <DialogFooter className="w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 self-start sm:self-center shrink-0">
                  Offert
                </span>
                <div className="flex flex-wrap justify-end gap-2 min-w-0">
                  <Button variant="outline" size="sm" onClick={handleDownload} disabled={isSaving}>
                    <Download className="h-4 w-4 mr-2" /> Télécharger
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => handleSave("create")}
                  >
                    <Sparkles className="h-4 w-4 mr-2" /> Créer un post
                  </Button>
                  <Button
                    size="sm"
                    disabled={isSaving || !!savedPhotoId}
                    onClick={() => handleSave("none")}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Ajout…
                      </>
                    ) : savedPhotoId ? (
                      "Ajouté ✓"
                    ) : (
                      "Ajouter à ma bibliothèque"
                    )}
                  </Button>
                </div>
              </DialogFooter>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PhotoLibraryPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        maxSelectable={1}
        onConfirm={handleLibraryPick}
      />
    </>
  );
}
