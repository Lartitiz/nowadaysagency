/**
 * OfferMockupDialog — « Mockup de mon offre » (segment offres immatérielles :
 * ebook, formation, guide… rien à photographier).
 *
 * Compositing DÉTERMINISTE (src/lib/offer-mockup) : la capture est incrustée
 * au pixel près sur un support procédural, fond uni couleur de marque —
 * offert, instantané, texte net. L'aperçu est live : changer de support ou de
 * fond re-compose gratuitement. « Mettre en ambiance » (1 crédit) enregistre
 * le mockup en bibliothèque puis rouvre « Modifier le fond » (#437) dessus.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, ImagePlus, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId, useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { convertHeicIfNeeded } from "@/lib/heic";
import { uploadPhotoOriginal, type UserPhotoRow } from "@/lib/photo-storage";
import {
  MOCKUP_SUPPORTS,
  pickDefaultSupport,
  renderOfferMockup,
  resolveBackgroundColor,
  type MockupSupport,
} from "@/lib/offer-mockup";

interface OfferMockupDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Enchaîne sur « Modifier le fond » (ambiance IA, 1 crédit) après l'ajout. */
  onOpenRetouch?: (photo: UserPhotoRow) => void;
}

type BgChoice = "marque" | "blanc";

export function OfferMockupDialog({ open, onOpenChange, onOpenRetouch }: OfferMockupDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const { column, value } = useWorkspaceFilter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const [support, setSupport] = useState<MockupSupport>("tablette");
  const [bg, setBg] = useState<BgChoice>("marque");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedPhotoId, setSavedPhotoId] = useState<string | null>(null);

  // Couleurs de la charte pour le fond « uni couleur de marque »
  const { data: charter } = useQuery({
    queryKey: ["mockup-brand-colors", column, value],
    queryFn: async () => {
      const { data } = await supabase
        .from("brand_charter")
        .select("color_background, color_primary")
        .eq(column, value)
        .maybeSingle();
      return data ?? null;
    },
    enabled: open && !!value,
    staleTime: 5 * 60 * 1000,
  });
  const brandBg = resolveBackgroundColor(charter ?? null);
  const background = bg === "marque" ? brandBg : "#FFFFFF";

  // Reset à l'ouverture
  useEffect(() => {
    if (!open) return;
    setImage(null);
    setImageName("");
    setSupport("tablette");
    setBg("marque");
    setPreviewUrl(null);
    setSavedPhotoId(null);
  }, [open]);

  // Aperçu live : re-compose à chaque changement (déterministe, ~30 ms)
  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    let url: string | null = null;
    renderOfferMockup({ image, support, background })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        // Le mockup affiché n'est plus celui enregistré
        setSavedPhotoId(null);
      })
      .catch(() => toast.error("Impossible de composer le mockup"));
    return () => {
      cancelled = true;
    };
  }, [image, support, background]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const converted = await convertHeicIfNeeded(file);
      const bitmap = await createImageBitmap(converted);
      setImage(bitmap);
      setImageName(converted.name.replace(/\.[^.]+$/, ""));
      setSupport(pickDefaultSupport(bitmap.width, bitmap.height));
    } catch {
      toast.error("Cette image n'a pas pu être lue — essaie un PNG ou un JPEG.");
    }
  };

  /** Enregistre le mockup courant en bibliothèque (kind=produit, generated). */
  const saveToLibrary = async (): Promise<UserPhotoRow> => {
    if (!image) throw new Error("Ajoute d'abord ta couverture");
    if (!user?.id || !workspaceId) throw new Error("Espace de travail introuvable");
    if (workspaceId === user.id) {
      throw new Error("Espace de travail en cours de chargement, réessaie dans 1 seconde.");
    }
    const blob = await renderOfferMockup({ image, support, background });
    const supportLabel = MOCKUP_SUPPORTS.find((s) => s.key === support)?.label ?? support;
    const baseName = imageName || "mon offre";
    const file = new File([blob], `mockup-${baseName}.jpg`, { type: "image/jpeg" });
    const { photoId } = await uploadPhotoOriginal({
      file,
      userId: user.id,
      workspaceId,
      name: `Mockup — ${baseName}`,
      purpose: "library",
    });
    // Métadonnées connues d'avance : pas d'appel vision (0 coût), comme la mise en scène.
    const description = `Mockup de l'offre « ${baseName} » sur ${supportLabel.toLowerCase()}, fond uni`;
    const { error: metaErr } = await supabase
      .from("user_photos")
      .update({
        kind: "produit",
        source_type: "generated",
        tags: ["mockup"],
        description,
      })
      .eq("id", photoId);
    if (metaErr) console.warn("[OfferMockupDialog] metadata update failed:", metaErr.message);
    setSavedPhotoId(photoId);
    const { data } = await supabase.from("user_photos").select("*").eq("id", photoId).maybeSingle();
    if (!data) throw new Error("Photo introuvable après l'ajout");
    return data as UserPhotoRow;
  };

  const handleSave = async (then: "none" | "create" | "ambiance") => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const photo = await saveToLibrary();
      if (then === "create") {
        onOpenChange(false);
        navigate("/creer", { state: { libraryPhotoIds: [photo.id] } });
      } else if (then === "ambiance") {
        onOpenChange(false);
        onOpenRetouch?.(photo);
      } else {
        toast.success("Mockup ajouté à ta bibliothèque.");
        onOpenChange(false);
      }
    } catch (e: any) {
      toast.error(e?.message || "L'ajout a échoué, réessaie.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!image) return;
    const blob = await renderOfferMockup({ image, support, background });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mockup-${imageName || "offre"}.jpg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !isSaving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Mockup de mon offre
          </DialogTitle>
          <DialogDescription>
            Transforme ton ebook, ta formation ou ton guide en visuel pro — sans rien
            photographier. Ta couverture reste au pixel près.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {!image ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-border hover:border-foreground/30 transition-colors p-10 flex flex-col items-center gap-2 text-center"
          >
            <ImagePlus className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium">Ajoute la capture de ta couverture</span>
            <span className="text-xs text-muted-foreground">
              Export Canva, 1re page de ton PDF, écran de ta formation…
            </span>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="w-[260px] shrink-0">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Aperçu du mockup"
                    className="w-full rounded-xl border border-border"
                  />
                ) : (
                  <div className="aspect-square rounded-xl border border-border bg-muted/40 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1.5"
                >
                  Changer l'image
                </button>
              </div>

              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Sur quel support ? (offert)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {MOCKUP_SUPPORTS.map((s) => (
                      <Button
                        key={s.key}
                        size="sm"
                        variant="outline"
                        className={cn(
                          "rounded-full h-7 text-xs",
                          support === s.key && "border-primary ring-1 ring-primary",
                        )}
                        onClick={() => setSupport(s.key)}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Et derrière ?</p>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn(
                        "rounded-full h-7 text-xs",
                        bg === "marque" && "border-primary ring-1 ring-primary",
                      )}
                      onClick={() => setBg("marque")}
                    >
                      <span
                        className="h-3 w-3 rounded-full mr-1.5 border border-black/10"
                        style={{ backgroundColor: brandBg }}
                      />
                      Couleur de ma marque
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn(
                        "rounded-full h-7 text-xs",
                        bg === "blanc" && "border-primary ring-1 ring-primary",
                      )}
                      onClick={() => setBg("blanc")}
                    >
                      Blanc
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Aller plus loin</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs w-full justify-start"
                    disabled={isSaving}
                    onClick={() => handleSave("ambiance")}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Mettre en ambiance — bureau, lin, atelier… · 1 crédit
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-between items-center">
              <span className="text-xs rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1">
                Offert
              </span>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleDownload} disabled={isSaving}>
                  <Download className="h-4 w-4 mr-2" /> Télécharger
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => handleSave("create")}
                >
                  <Sparkles className="h-4 w-4 mr-2" /> Créer un post avec
                </Button>
                <Button size="sm" disabled={isSaving || !!savedPhotoId} onClick={() => handleSave("none")}>
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
