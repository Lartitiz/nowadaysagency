import { versTarifs } from "@/lib/retour-apres-detour";
/**
 * MiseEnSceneDialog — « Mettre en scène » une photo produit de la bibliothèque.
 *
 * Parcours piste A (validé en maquettes 09/07/2026) : zéro formulaire — la
 * charte guide l'ambiance, un clic génère 1 proposition (1 crédit) via
 * l'edge product-on-model (gpt-image, fidélité produit haute). Le bouton
 * « Voir 2 autres variantes » en génère 2 de plus à la demande (maîtrise des
 * coûts 09/07/2026 : les 3 d'office triplaient la facture OpenAI). Le lien
 * « Ajuster les réglages » ouvre les choix (porté/posé, cadrage, ambiance).
 *
 * Écran résultat : la photo produit d'origine reste affichée en vis-à-vis
 * permanent (validation fidélité fusionnée — le CTA dit « C'est fidèle »).
 * Les ajustements régénèrent TOUJOURS à partir de la photo d'origine (1 crédit),
 * jamais de l'image générée (sinon le produit s'érode).
 *
 * Rangement automatique (P4, 18/10/2026, choix de Laetitia) : chaque image
 * reçue (proposition, variante, ajustement) est rangée dans « Mes photos » dès
 * qu'elle arrive. Fermer la fenêtre ne perd plus rien ; « Retirer cet essai »
 * l'enlève de la bibliothèque.
 */

import { PhotoDirectionPicker } from "./PhotoDirectionPicker";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, Download, Info, Loader2, RotateCcw, Shirt, Sparkles, Trash2 } from "lucide-react";
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
import { readableError } from "@/lib/error-messages";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  discardPhotoAttempt,
  userPhotoToRawBase64,
  type UserPhotoRow,
} from "@/lib/photo-storage";
import {
  dataUrlToBlob,
  MISE_EN_SCENE_KIND,
  saveGeneratedPhoto,
  slugifyPhotoName as slugify,
} from "@/lib/photo-auto-save";
import { useRefreshUserPhotos } from "@/hooks/use-user-photos";
import PhotoDetailComparison from "./PhotoDetailComparison";

interface MiseEnSceneDialogProps {
  photo: UserPhotoRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Mode = "auto" | "porte" | "pose";
type Framing = "auto" | "sans_visage" | "portrait";

const ADJUST_CHIPS: { key: string; label: string; prompt: string }[] = [
  {
    key: "fond_net",
    label: "Fond net",
    prompt:
      "Le fond doit être COMPLÈTEMENT NET, aucun flou d'arrière-plan : tous les détails du décor lisibles et précis, comme au grand angle d'un téléphone (f/11).",
  },
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

/** Une image reçue et son id dans « Mes photos » (null si le rangement a échoué). */
interface Proposal {
  url: string;
  photoId: string | null;
}

export function MiseEnSceneDialog({ photo, open, onOpenChange }: MiseEnSceneDialogProps) {
  const { user } = useAuth();
  const refreshPhotos = useRefreshUserPhotos();
  const navigate = useNavigate();

  const [sourceBase64, setSourceBase64] = useState<string | null>(null);
  const [charterHint, setCharterHint] = useState<string | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState<Mode>("auto");
  const [framing, setFraming] = useState<Framing>("auto");
  const [ambiance, setAmbiance] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isAddingVariants, setIsAddingVariants] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [previousProposals, setPreviousProposals] = useState<Record<number, Proposal>>({});
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
    setIsAddingVariants(false);
    setProposals([]);
    setPreviousProposals({});
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

  const busy = isGenerating || isAdjusting || isAddingVariants || isSaving;
  const hasResult = proposals.length > 0;
  const selected: Proposal | undefined = proposals[selectedIdx];

  async function callEdge(
    adjustment: string | null,
    variants = false,
  ): Promise<string[] | null> {
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
          variants,
        },
      },
      variants ? 200_000 : 160_000,
    );

    if (data?.error === "premium_required") {
      toast.error("La mise en scène est réservée au plan Premium", {
        description: "Passe en Premium pour habiller tes produits.",
        action: { label: "Voir les plans", onClick: () => versTarifs(navigate) },
      });
      return null;
    }
    if (data?.error === "limit_reached" && data?.quota?.reason !== "error") {
      toast.error("Tu as utilisé toutes tes images du mois", {
        description: "Elles se rechargent au début du mois prochain.",
      });
      return null;
    }
    if (error || !Array.isArray(data?.images) || data.images.length === 0) {
      toast.error("Mise en scène impossible", {
        // Message du serveur en français tel quel, message technique traduit.
        description: readableError(error ?? data?.error, "Réessaie dans quelques instants."),
      });
      return null;
    }
    return data.images as string[];
  }

  // Range chaque image payée dans « Mes photos » dès réception. Un échec de
  // rangement ne jette pas l'image : elle reste ici avec « Ranger dans Mes photos ».
  async function keep(images: string[]): Promise<Proposal[]> {
    const kept: Proposal[] = [];
    let failed = false;
    for (const url of images) {
      let photoId: string | null = null;
      try {
        if (user?.id) photoId = await saveGeneratedPhoto({ dataUrl: url, source: photo!, userId: user.id, kind: MISE_EN_SCENE_KIND });
      } catch (e) {
        console.warn("[MiseEnSceneDialog] rangement automatique impossible:", e);
      }
      if (!photoId) failed = true;
      kept.push({ url, photoId });
    }
    // Grille à jour sans dépendre du Realtime ni d'un rechargement de page.
    refreshPhotos();
    if (failed) {
      toast.error("L'image n'a pas pu être rangée dans Mes photos", {
        description: "Réessaie avec « Ranger dans Mes photos » ou télécharge-la.",
      });
    }
    return kept;
  }

  const handleGenerate = async () => {
    if (busy) return;
    setIsGenerating(true);
    const images = await callEdge(null);
    const kept = images ? await keep(images) : null;
    setIsGenerating(false);
    if (kept) {
      setProposals(kept);
      setSelectedIdx(0);
    }
  };

  // 2 variantes de plus à la demande — générées depuis la photo d'origine et
  // ajoutées aux propositions existantes.
  const handleMoreVariants = async () => {
    if (busy || !hasResult) return;
    setIsAddingVariants(true);
    const images = await callEdge(null, true);
    const kept = images?.length ? await keep(images) : null;
    setIsAddingVariants(false);
    if (kept) {
      setSelectedIdx(proposals.length);
      setProposals((prev) => [...prev, ...kept]);
    }
  };

  const handleAdjust = async (adjustPrompt: string) => {
    if (busy || !hasResult) return;
    setIsAdjusting(true);
    const images = await callEdge(adjustPrompt);
    const kept = images?.length ? await keep(images.slice(0, 1)) : null;
    setIsAdjusting(false);
    if (kept) {
      // La nouvelle image remplace la proposition sélectionnée à l'écran
      // (générée depuis la photo d'origine, jamais depuis l'image précédente).
      // L'ancienne reste dans « Mes photos » : elle a été payée.
      setPreviousProposals(prev => ({ ...prev, [selectedIdx]: proposals[selectedIdx] }));
      setProposals((prev) => prev.map((p, i) => (i === selectedIdx ? kept[0] : p)));
      setCustomAdjust("");
    }
  };

  // Range la proposition sélectionnée si le rangement automatique a échoué.
  const ensureSaved = async (): Promise<string | null> => {
    if (!selected) return null;
    if (selected.photoId) return selected.photoId;
    const [again] = await keep([selected.url]);
    if (!again.photoId) return null;
    setProposals((prev) => prev.map((p, i) => (i === selectedIdx ? again : p)));
    return again.photoId;
  };

  const handleSave = async (thenCreate: boolean) => {
    if (!hasResult || isSaving) return;
    setIsSaving(true);
    try {
      const newId = await ensureSaved();
      if (!newId) return;
      if (thenCreate) {
        onOpenChange(false);
        navigate("/creer", { state: { libraryPhotoIds: [newId] } });
      } else {
        toast.success("Ta mise en scène est dans Mes photos");
        onOpenChange(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // « Retirer cet essai » : l'image quitte la bibliothèque (retrait récupérable).
  const handleRemove = async () => {
    if (!selected || busy) return;
    setIsSaving(true);
    try {
      if (selected.photoId) await discardPhotoAttempt(selected.photoId);
      refreshPhotos();
      setPreviousProposals((prev) => {
        const next: Record<number, Proposal> = {};
        for (const [k, v] of Object.entries(prev)) {
          const i = Number(k);
          if (i < selectedIdx) next[i] = v;
          else if (i > selectedIdx) next[i - 1] = v;
        }
        return next;
      });
      setProposals((prev) => prev.filter((_, i) => i !== selectedIdx));
      setSelectedIdx((i) => Math.max(0, Math.min(i, proposals.length - 2)));
      toast.success("Essai retiré de Mes photos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de retirer cet essai");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (!hasResult) return;
    try {
      const blob = dataUrlToBlob(selected!.url);
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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        // Filet : une image dont le rangement a échoué ne part pas sans prévenir.
        if (!v && proposals.some((p) => !p.photoId)
          && !window.confirm("Une image n'a pas pu être rangée dans Mes photos. Fermer quand même ?")) return;
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shirt className="h-4 w-4 text-primary" />
            Mon produit porté ou en situation
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
                {photo.kind === "portrait" && (
                  <p className="text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
                    Cette photo semble montrer une personne. La mise en scène est conçue
                    pour tes produits : sur un portrait, l'IA re-générerait la personne —
                    résultat imprévisible.
                  </p>
                )}
                {charterHint && (
                  <p className="text-xs rounded-lg bg-secondary/60 text-secondary-foreground px-3 py-2">
                    🎨 Ta charte guide l'ambiance : {charterHint}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Une proposition avec une personne vraie, un rendu photo spontané
                  (jamais de flou d'arrière-plan artificiel). Compte environ une minute —
                  tu pourras demander d'autres variantes ensuite.
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
                  <PhotoDirectionPicker disabled={busy} onChoose={d => setAmbiance((d.scenePrompt || `Fond uni ${d.background}`).slice(0, 200))} />
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
              1 crédit photo. L'image ira toute seule dans Mes photos, ta photo d'origine reste intacte.
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
                    Générer la mise en scène
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
                  <img loading="lazy" src={p.url} alt={`Proposition ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={handleMoreVariants}
              disabled={busy}
            >
              {isAddingVariants ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Nouvelles variantes en cours…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Voir 2 autres variantes (2 crédits)
                </>
              )}
            </Button>

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
                  src={selected?.url}
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
              <p className="text-xs text-muted-foreground">L’image sera régénérée depuis ton originale : d’autres détails peuvent changer.</p>
              {previousProposals[selectedIdx] && <Button variant="outline" size="sm" disabled={busy} onClick={() => {
                setProposals(prev => prev.map((p, i) => i === selectedIdx ? previousProposals[selectedIdx] : p));
                setPreviousProposals(prev => { const next = { ...prev }; delete next[selectedIdx]; return next; });
              }}>Annuler le dernier ajustement</Button>}
              {sourceBase64 && selected && <PhotoDetailComparison original={sourceBase64} proposal={selected.url} />}
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

            <DialogFooter className="flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
              {selected?.photoId ? (
                <p className="text-xs text-emerald-700 flex items-center gap-1 sm:mr-auto" data-testid="mise-en-scene-rangee">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  Déjà rangée dans Mes photos
                </p>
              ) : (
                <p className="text-xs text-amber-800 sm:mr-auto">Pas encore dans Mes photos</p>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={handleRemove} disabled={busy} className="text-muted-foreground">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Retirer cet essai
              </Button>
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
                    Un instant…
                  </>
                ) : selected?.photoId ? (
                  "C'est fidèle, terminer"
                ) : (
                  "Ranger dans Mes photos"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
