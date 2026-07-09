/**
 * MiseEnSceneDialog — « Mettre en scène » une photo produit de la bibliothèque.
 *
 * Parcours piste A (validé en maquettes 09/07/2026) : zéro formulaire — la
 * charte guide l'ambiance, un clic génère 3 propositions (3 crédits) via
 * l'edge product-on-model (gpt-image, fidélité produit haute). Le lien
 * « Ajuster les réglages » ouvre les choix (porté/posé, cadrage, ambiance).
 *
 * Écran résultat : la photo produit d'origine reste affichée en vis-à-vis
 * permanent (validation fidélité fusionnée — le CTA dit « C'est fidèle »).
 * Les ajustements régénèrent TOUJOURS à partir de la photo d'origine (1 crédit),
 * jamais de l'image générée (sinon le produit s'érode).
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Download, Info, Loader2, RotateCcw, Shirt, Sparkles } from "lucide-react";
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
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  uploadPhotoOriginal,
  userPhotoToRawBase64,
  type UserPhotoRow,
} from "@/lib/photo-storage";

interface MiseEnSceneDialogProps {
  photo: UserPhotoRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Mode = "auto" | "porte" | "pose";
type Framing = "auto" | "sans_visage" | "portrait";

const ADJUST_CHIPS: { key: string; label: string; prompt: string }[] = [
  {
    key: "sans_visage",
    label: "Sans visage",
    prompt: "Recadre : le visage ne doit pas être visible, gros plan sur le produit.",
  },
  {
    key: "autre_lieu",
    label: "Autre lieu",
    prompt: "Change complètement de lieu et de décor (garde exactement le même produit).",
  },
  {
    key: "autre_personne",
    label: "Autre personne",
    prompt: "Change de personne : autre carnation, autre âge, toujours naturelle et réaliste.",
  },
  {
    key: "plus_naturel",
    label: "Plus naturel",
    prompt: "Rends la photo encore plus spontanée et imparfaite, moins retouchée, moins posée.",
  },
];

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

export function MiseEnSceneDialog({ photo, open, onOpenChange }: MiseEnSceneDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sourceBase64, setSourceBase64] = useState<string | null>(null);
  const [charterHint, setCharterHint] = useState<string | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState<Mode>("auto");
  const [framing, setFraming] = useState<Framing>("auto");
  const [ambiance, setAmbiance] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [proposals, setProposals] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [customAdjust, setCustomAdjust] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Reset + chargement source/charte à chaque ouverture
  useEffect(() => {
    if (!open || !photo) return;
    setSourceBase64(null);
    setShowSettings(false);
    setMode("auto");
    setFraming("auto");
    setAmbiance("");
    setIsGenerating(false);
    setIsAdjusting(false);
    setProposals([]);
    setSelectedIdx(0);
    setCustomAdjust("");
    setIsSaving(false);
    let cancelled = false;
    userPhotoToRawBase64(photo)
      .then((b64) => {
        if (!cancelled) setSourceBase64(b64);
      })
      .catch((e: any) => {
        if (!cancelled) toast.error(e?.message || "Impossible de charger la photo.");
      });
    const col = photo.workspace_id ? "workspace_id" : "user_id";
    const val = photo.workspace_id ?? user?.id;
    if (val) {
      supabase
        .from("brand_charter")
        .select("photo_style, mood_keywords")
        .eq(col, val)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return;
          const moods = Array.isArray(data?.mood_keywords) ? data.mood_keywords : [];
          const parts = [...moods.slice(0, 3), data?.photo_style].filter(Boolean);
          setCharterHint(parts.length ? String(parts.join(" · ")).slice(0, 90) : null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, photo, user?.id]);

  if (!photo) return null;

  const busy = isGenerating || isAdjusting || isSaving;
  const hasResult = proposals.length > 0;

  async function callEdge(adjustment: string | null): Promise<string[] | null> {
    const { data, error } = await invokeWithTimeout(
      "product-on-model",
      {
        body: {
          photo_id: photo!.id,
          workspace_id: photo!.workspace_id,
          mode,
          framing,
          ambiance: ambiance.trim() || null,
          adjustment,
        },
      },
      adjustment ? 160_000 : 240_000,
    );

    if (data?.error === "premium_required") {
      toast.error("La mise en scène est réservée au plan Premium", {
        description: "Passe en Premium pour habiller tes produits.",
        action: { label: "Voir les plans", onClick: () => navigate("/abonnement") },
      });
      return null;
    }
    if (data?.error === "limit_reached" || error?.isRateLimit) {
      toast.error("Tu as utilisé toutes tes retouches photo du mois", {
        description: "Elles se rechargent au début du mois prochain.",
      });
      return null;
    }
    if (error || !Array.isArray(data?.images) || data.images.length === 0) {
      toast.error("Mise en scène impossible", {
        description: error?.message || data?.error || "Réessaie dans quelques instants.",
      });
      return null;
    }
    return data.images as string[];
  }

  const handleGenerate = async () => {
    if (busy) return;
    setIsGenerating(true);
    const images = await callEdge(null);
    setIsGenerating(false);
    if (images) {
      setProposals(images);
      setSelectedIdx(0);
    }
  };

  const handleAdjust = async (adjustPrompt: string) => {
    if (busy || !hasResult) return;
    setIsAdjusting(true);
    const images = await callEdge(adjustPrompt);
    setIsAdjusting(false);
    if (images?.length) {
      // La nouvelle image remplace la proposition sélectionnée (générée depuis
      // la photo d'origine, jamais depuis l'image précédente).
      setProposals((prev) => prev.map((p, i) => (i === selectedIdx ? images[0] : p)));
      setCustomAdjust("");
    }
  };

  const saveSelected = async (): Promise<string | null> => {
    if (!user?.id) return null;
    const dataUrl = proposals[selectedIdx];
    const blob = dataUrlToBlob(dataUrl);
    const file = new File([blob], `${slugify(photo.name ?? "photo")}-mise-en-scene.jpg`, {
      type: blob.type || "image/jpeg",
    });
    const { photoId } = await uploadPhotoOriginal({
      file,
      userId: user.id,
      workspaceId: photo.workspace_id,
      name: `${photo.name ?? "Photo"} — mise en scène`,
      purpose: "library",
    });

    // Métadonnées héritées de la photo produit source (pas d'appel vision).
    const tags = Array.from(new Set(["mise-en-scene", ...(photo.tags ?? [])])).slice(0, 6);
    const description = photo.description
      ? `Mise en scène IA — ${photo.description}`
      : "Produit mis en scène par IA";
    const { error: updError } = await supabase
      .from("user_photos")
      .update({
        tags,
        description,
        source_type: "generated",
        background_preset_key: "mise_en_scene",
      })
      .eq("id", photoId);
    if (updError) {
      console.warn("[MiseEnSceneDialog] metadata update failed:", updError.message);
    }
    return photoId;
  };

  const handleSave = async (thenCreate: boolean) => {
    if (!hasResult || isSaving) return;
    setIsSaving(true);
    try {
      const newId = await saveSelected();
      if (!newId) throw new Error("Enregistrement impossible");
      if (thenCreate) {
        onOpenChange(false);
        navigate("/creer", { state: { libraryPhotoIds: [newId] } });
      } else {
        toast.success("Mise en scène ajoutée à ta bibliothèque");
        onOpenChange(false);
      }
    } catch (e: any) {
      toast.error(e?.message || "Enregistrement impossible");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (!hasResult) return;
    try {
      const blob = dataUrlToBlob(proposals[selectedIdx]);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${slugify(photo.name ?? "photo")}-mise-en-scene.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
    } catch (e: any) {
      toast.error(e?.message || "Téléchargement impossible");
    }
  };

  const pill = (active: boolean) =>
    cn(
      "text-xs px-3 py-1.5 rounded-full border transition-colors",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-background text-foreground border-border hover:border-primary/40",
      busy && "opacity-50 cursor-not-allowed",
    );

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shirt className="h-4 w-4 text-primary" />
            Mettre en scène
          </DialogTitle>
          <DialogDescription>
            Ton produit porté ou en situation, comme une vraie photo — l'ambiance vient de
            ta charte de marque.
          </DialogDescription>
        </DialogHeader>

        {!hasResult ? (
          <>
            {/* Écran de lancement (piste A : zéro formulaire) */}
            <div className="grid grid-cols-[96px_1fr] gap-3 items-start">
              <div className="aspect-square rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center">
                {sourceBase64 ? (
                  <img
                    loading="lazy"
                    src={sourceBase64}
                    alt={photo.name ? `Produit – ${photo.name}` : "Produit"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                {charterHint && (
                  <p className="text-xs rounded-lg bg-secondary/60 text-secondary-foreground px-3 py-2">
                    🎨 Ta charte guide l'ambiance : {charterHint}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  3 propositions avec des personnes vraies et variées, un rendu photo
                  spontané (jamais de flou d'arrière-plan artificiel). Compte environ une
                  minute.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              disabled={busy}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", showSettings && "rotate-180")}
              />
              Ajuster les réglages
            </button>

            {showSettings && (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs font-medium text-foreground">Comment le montrer</p>
                  <div className="flex gap-1.5">
                    {(
                      [
                        { key: "auto", label: "Auto" },
                        { key: "porte", label: "Porté" },
                        { key: "pose", label: "Posé en situation" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        disabled={busy}
                        onClick={() => setMode(opt.key)}
                        className={pill(mode === opt.key)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs font-medium text-foreground">Cadrage</p>
                  <div className="flex gap-1.5">
                    {(
                      [
                        { key: "auto", label: "Auto" },
                        { key: "sans_visage", label: "Sans visage" },
                        { key: "portrait", label: "Portrait" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        disabled={busy}
                        onClick={() => setFraming(opt.key)}
                        className={pill(framing === opt.key)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground">Ambiance (optionnel)</p>
                  <Input
                    value={ambiance}
                    onChange={(e) => setAmbiance(e.target.value)}
                    placeholder="terrasse de café, bord de mer, atelier…"
                    maxLength={200}
                    disabled={busy}
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            <p className="text-2xs text-muted-foreground">
              3 crédits photo pour 3 propositions. Ta photo d'origine reste intacte.
            </p>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Annuler
              </Button>
              <Button type="button" onClick={handleGenerate} disabled={busy || !sourceBase64}>
                {isGenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Mise en scène en cours…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Générer 3 propositions
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Écran résultat : propositions + vis-à-vis produit permanent */}
            <div className="grid grid-cols-3 gap-2">
              {proposals.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedIdx(i)}
                  disabled={busy}
                  className={cn(
                    "aspect-[2/3] rounded-lg overflow-hidden border-2 transition-colors",
                    i === selectedIdx ? "border-primary" : "border-transparent hover:border-primary/40",
                  )}
                >
                  <img loading="lazy" src={p} alt={`Proposition ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="rounded-xl overflow-hidden border border-border bg-muted/40 relative">
                {isAdjusting && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground">Nouvelle version…</p>
                  </div>
                )}
                <img
                  loading="lazy"
                  src={proposals[selectedIdx]}
                  alt={`Proposition ${selectedIdx + 1} en grand`}
                  className="w-full max-h-[46vh] object-contain"
                />
              </div>
              <div className="space-y-1.5">
                <div className="aspect-square rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center">
                  {sourceBase64 ? (
                    <img loading="lazy" src={sourceBase64} alt="Photo produit d'origine" className="w-full h-full object-cover" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <p className="text-2xs text-muted-foreground text-center leading-snug">
                  Ton produit — compare les détails avant de garder
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Un détail à changer ? (1 crédit)</p>
              <div className="flex flex-wrap gap-1.5">
                {ADJUST_CHIPS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    disabled={busy}
                    onClick={() => handleAdjust(c.prompt)}
                    className={pill(false)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={customAdjust}
                  onChange={(e) => setCustomAdjust(e.target.value)}
                  placeholder="Ou décris-le : « les boucles plus visibles »"
                  maxLength={300}
                  disabled={busy}
                  className="text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customAdjust.trim()) handleAdjust(customAdjust.trim());
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || !customAdjust.trim()}
                  onClick={() => handleAdjust(customAdjust.trim())}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <p className="text-2xs text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Image générée par IA à partir de ta vraie photo produit. Instagram peut afficher
              un label « Info IA » sur ce type de visuel.
            </p>

            <DialogFooter className="flex-col sm:flex-row sm:flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handleDownload} disabled={busy}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Télécharger
              </Button>
              <Button type="button" variant="outline" onClick={() => handleSave(true)} disabled={busy}>
                Créer un post avec
              </Button>
              <Button type="button" onClick={() => handleSave(false)} disabled={busy}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Enregistrement…
                  </>
                ) : (
                  "C'est fidèle, ajouter à mes photos"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
