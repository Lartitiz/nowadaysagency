/**
 * SeasonalPhotoDialog — décline une photo produit pour un marronnier
 * (« ta boutique en version Noël ») et branche la sortie sur le calendrier.
 *
 * Pipeline image = le socle Portrait pro (useGeneratePhotoVariant) : détourage
 * Photoroom, produit préservé au pixel, décor de saison aux couleurs de la
 * charte, 1 crédit, nouvelle photo de bibliothèque (l'originale intacte).
 * La sortie vedette « Planifier le post » crée un post-idée dans le calendrier
 * à J-offset avant le marronnier, photo attachée (media_urls, URL signée 1 an).
 */

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarPlus, ImagePlus, Loader2, ShieldCheck, Sparkles } from "lucide-react";
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
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useQuery } from "@tanstack/react-query";
import {
  useGeneratePhotoVariant,
  useRetouchExistingPhoto,
  useUserPhotos,
} from "@/hooks/use-user-photos";
import { getSignedPhotoUrl, getSignedPhotoUrls, type UserPhotoRow } from "@/lib/photo-storage";
import { derivedPhotoDescription, derivedPhotoName } from "@/lib/photo-naming";
import { hexToFrenchColorName } from "@/lib/background-suggestions";
import {
  nextMarronniers,
  plannedPostDate,
  type MarronnierOccurrence,
} from "@/lib/marronniers";

interface SeasonalPhotoDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Marronnier mis en avant (celui de la carte du calendrier). */
  initialOccurrence?: MarronnierOccurrence | null;
  /** Rafraîchit la grille du calendrier après planification. */
  onPlanned?: () => void;
}

const ADJUST_CHIPS: { key: string; label: string; directive: string }[] = [
  { key: "autre", label: "Une autre version", directive: "Propose une variation différente du même décor." },
  { key: "sobre", label: "Plus sobre", directive: "Le décor doit être nettement plus sobre et minimaliste." },
  { key: "festif", label: "Plus festif", directive: "Le décor doit être plus festif et généreux, sans devenir kitsch." },
];

const MAX_PICKER = 9;

export function SeasonalPhotoDialog({
  open,
  onOpenChange,
  initialOccurrence,
  onPlanned,
}: SeasonalPhotoDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const { column, value } = useWorkspaceFilter();
  const { data: allPhotos } = useUserPhotos();
  const { mutate: generateVariant, isPending: isGenerating } = useGeneratePhotoVariant();
  const { mutate: adjust, isPending: isAdjusting } = useRetouchExistingPhoto();

  const occurrences = useMemo(() => nextMarronniers(new Date(), 3), []);
  const [occKey, setOccKey] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [result, setResult] = useState<UserPhotoRow | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [adjustingKey, setAdjustingKey] = useState<string | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);

  const occ =
    occurrences.find((o) => o.marronnier.key === occKey) ??
    (initialOccurrence &&
      occurrences.find((o) => o.marronnier.key === initialOccurrence.marronnier.key)) ??
    occurrences[0];

  // Photos produit prêtes (le kind classé par l'IA à l'upload)
  const productPhotos = useMemo(
    () =>
      (allPhotos ?? [])
        .filter(
          (p) =>
            p.status === "ready" &&
            (!p.kind || p.kind === "produit" || p.kind === "produit_porte"),
        )
        .slice(0, MAX_PICKER),
    [allPhotos],
  );
  const selectedPhoto = productPhotos.find((p) => p.id === selectedPhotoId) ?? productPhotos[0];

  // Vignettes signées du picker
  const { data: thumbUrls } = useQuery({
    queryKey: ["seasonal-picker-urls", productPhotos.map((p) => p.id).join(",")],
    queryFn: async () => {
      const map = await getSignedPhotoUrls(productPhotos.map((p) => p.storage_path));
      return map;
    },
    enabled: open && productPhotos.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Couleurs de la charte → suffixe de prompt (tons de marque)
  const { data: charter } = useQuery({
    queryKey: ["seasonal-brand-colors", column, value],
    queryFn: async () => {
      // TS2589 (instanciation trop profonde) sur ce .eq(column) dynamique —
      // même parade que PlanPage : cast du from() en any.
      const { data } = await (supabase.from("brand_charter") as any)
        .select("color_primary, color_background")
        .eq(column, value)
        .maybeSingle();
      return data ?? null;
    },
    enabled: open && !!value,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!open) return;
    setOccKey(initialOccurrence?.marronnier.key ?? null);
    setSelectedPhotoId(null);
    setResult(null);
    setResultUrl(null);
    setSourceUrl(null);
  }, [open, initialOccurrence]);

  const busy = isGenerating || isAdjusting || isPlanning;

  const buildPrompt = (): string => {
    const tones = [charter?.color_primary, charter?.color_background]
      .map((h) => (h ? hexToFrenchColorName(h) : null))
      .filter(Boolean);
    return (
      occ.marronnier.scenePrompt +
      (tones.length ? ` Palette cohérente avec la marque : tons ${tones.join(" et ")}.` : "")
    );
  };

  const refreshResult = async (photoId: string) => {
    const { data } = await supabase.from("user_photos").select("*").eq("id", photoId).maybeSingle();
    if (data) {
      const row = data as UserPhotoRow;
      setResult(row);
      setResultUrl(await getSignedPhotoUrl(row.storage_path));
    }
  };

  const handleGenerate = async () => {
    if (!selectedPhoto) return;
    try {
      setSourceUrl(
        await getSignedPhotoUrl(selectedPhoto.original_storage_path || selectedPhoto.storage_path),
      );
      const m = occ.marronnier;
      const { photoId } = await generateVariant({
        sourcePhoto: selectedPhoto,
        backgroundPrompt: buildPrompt(),
        name: derivedPhotoName(selectedPhoto.name, m.label, "Produit"),
        kind: selectedPhoto.kind ?? "produit",
        tags: Array.from(new Set(["saisonnier", m.key, ...(selectedPhoto.tags ?? [])])),
        description: derivedPhotoDescription(
          `Version ${m.label}`,
          selectedPhoto.description,
          `Photo produit en décor ${m.label}`,
        ),
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
      const base = result.background_prompt ?? buildPrompt();
      await adjust({ photo: result, backgroundPrompt: `${base} ${chip.directive}`.trim() });
      await refreshResult(result.id);
    } catch (e: any) {
      toast.error(e?.message || "L'ajustement a échoué, réessaie.");
    } finally {
      setAdjustingKey(null);
    }
  };

  const postDate = plannedPostDate(occ, new Date());
  const postDateLabel = format(postDate, "EEEE d MMMM", { locale: fr });

  const handlePlan = async () => {
    if (!result || !user?.id) return;
    setIsPlanning(true);
    try {
      const m = occ.marronnier;
      // URL longue durée : le post vivra jusqu'au marronnier (et au-delà).
      const mediaUrl = await getSignedPhotoUrl(result.storage_path, 60 * 60 * 24 * 365);
      const { error } = await supabase.from("calendar_posts").insert({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        date: format(postDate, "yyyy-MM-dd"),
        theme: `${m.emoji} ${m.label} — ${result.name ?? "photo produit"}`,
        status: "idea",
        canal: "instagram",
        format: "post",
        notes: `Photo « ${result.name} » préparée pour ${m.label} (dans ta bibliothèque). Généré par la déclinaison saisonnière.`,
        media_urls: mediaUrl ? [mediaUrl] : null,
      } as never);
      if (error) throw new Error(error.message);
      toast.success(`Posé dans ton calendrier le ${postDateLabel}.`);
      onPlanned?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "La planification a échoué, réessaie.");
    } finally {
      setIsPlanning(false);
    }
  };

  const hasResult = !!result && !!resultUrl;
  const m = occ.marronnier;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {hasResult ? `Prête pour ${m.label}` : `Version ${m.label}`}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            Ton produit est préservé au pixel — seul le décor change.
          </DialogDescription>
        </DialogHeader>

        {!hasResult ? (
          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1.5">Quelle photo produit ?</p>
                {productPhotos.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center">
                    <ImagePlus className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">
                      Aucune photo produit dans ta bibliothèque — ajoute-en une d'abord.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {productPhotos.map((p) => {
                      const url = thumbUrls?.get(p.storage_path);
                      const selected = selectedPhoto?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={busy}
                          onClick={() => setSelectedPhotoId(p.id)}
                          className={cn(
                            "relative aspect-square overflow-hidden rounded-lg border bg-muted/40 transition",
                            selected ? "ring-2 ring-primary border-primary" : "border-border hover:border-primary/40",
                          )}
                        >
                          {url ? (
                            <img src={url} alt={p.name ?? "Photo produit"} className="h-full w-full object-cover" />
                          ) : (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground absolute inset-0 m-auto" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1.5">Pour quel moment ?</p>
                <div className="flex flex-col gap-1.5">
                  {occurrences.map((o) => {
                    const selected = o.marronnier.key === m.key;
                    return (
                      <button
                        key={o.marronnier.key}
                        type="button"
                        disabled={busy}
                        onClick={() => setOccKey(o.marronnier.key)}
                        className={cn(
                          "rounded-lg border p-2.5 text-left transition-colors",
                          selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30",
                        )}
                      >
                        <p className="text-[13px] font-medium leading-tight">
                          {o.marronnier.emoji} {o.marronnier.label} ·{" "}
                          {format(o.date, "d MMM", { locale: fr })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{o.marronnier.shortScene}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter className="flex-row items-center gap-2 sm:justify-between">
              <span className="text-xs rounded-full bg-primary/10 text-primary px-2.5 py-1 shrink-0">1 crédit</span>
              <Button onClick={handleGenerate} disabled={busy || !selectedPhoto}>
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération… (~15 s)
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" /> Créer la version {m.label}
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
                  <img src={resultUrl!} alt={`Version ${m.label}`} className="w-full object-cover" />
                </div>
                <figcaption className="text-xs text-muted-foreground text-center">Version {m.label}</figcaption>
              </figure>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Ajuster (1 crédit, toujours depuis ta photo d'origine)</p>
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

            <div className="rounded-lg bg-muted/50 p-3 flex items-center gap-2.5">
              <CalendarPlus className="h-5 w-5 shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground">
                Une idée de post « {m.label} » sera posée dans ton calendrier le{" "}
                <span className="text-foreground font-medium">{postDateLabel}</span> (
                {m.postOffsetDays === 1 ? "la veille" : `${m.postOffsetDays} jours avant`}), avec
                cette photo.
              </p>
            </div>

            <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-end">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => {
                toast.success("Photo gardée dans ta bibliothèque.");
                onOpenChange(false);
              }}>
                Juste garder la photo
              </Button>
              <Button size="sm" disabled={busy} onClick={handlePlan}>
                {isPlanning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Planification…
                  </>
                ) : (
                  <>
                    <CalendarPlus className="h-4 w-4 mr-2" /> Planifier le post
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
