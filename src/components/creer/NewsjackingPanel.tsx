import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, Loader2, Sparkles, EyeOff, ChevronDown, Bookmark, BookmarkCheck, Newspaper, Lightbulb } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ActuAngle {
  vehicule: string;
  hook: string;
  description: string;
  format_suggere: string;
}

interface Actu {
  titre: string;
  resume: string;
  source: string;
  source_url?: string;
  type: "globale" | "niche";
  axe?: string;
  ton?: string;
  force_pont?: "fort" | "moyen" | "fragile";
  pertinence: string;
  // angles are now generated on demand
}

interface NewsjackingPanelProps {
  onSelect: (data: { subject: string; context: string; format?: string; vehicule?: string }) => void;
  onClose: () => void;
  workspaceId?: string;
}

const VEHICULE_CONFIG: Record<string, { emoji: string; label: string; className: string }> = {
  recit_experience: { emoji: "📖", label: "Récit", className: "bg-[hsl(var(--accent))]/20 text-[hsl(var(--accent-foreground))]" },
  declencheur_externe: { emoji: "🔗", label: "Déclencheur", className: "bg-primary/10 text-primary" },
  constat_decale: { emoji: "🔍", label: "Constat", className: "bg-secondary/40 text-secondary-foreground" },
  montrer_plutot_quexpliquer: { emoji: "👁", label: "Montrer", className: "bg-[hsl(var(--accent))]/30 text-[hsl(var(--accent-foreground))]" },
  parallele_absurde: { emoji: "🎭", label: "Parallèle", className: "bg-primary/15 text-primary" },
};

const FORMAT_LABELS: Record<string, string> = {
  post: "Post",
  carousel: "Carrousel",
  reel: "Reel",
  story: "Story",
  linkedin: "LinkedIn",
};

const AXE_CONFIG: Record<string, { emoji: string; label: string }> = {
  // Nouveaux axes (micro-phénomènes culturels)
  mot_qui_revient: { emoji: "💬", label: "Mot" },
  obsession_collective: { emoji: "🌀", label: "Obsession" },
  comportement_emergent: { emoji: "🔄", label: "Comportement" },
  debat_recurrent: { emoji: "⚖️", label: "Débat" },
  objet_culturel: { emoji: "🎬", label: "Culture" },
  actu_connectable: { emoji: "📰", label: "Actu" },
  // Anciens (rétro-compat)
  societe_debat: { emoji: "🗣️", label: "Société" },
  economie_argent: { emoji: "💶", label: "Économie" },
  culture_pop: { emoji: "🎬", label: "Culture" },
  science_decouverte: { emoji: "🔬", label: "Science" },
  politique_loi: { emoji: "⚖️", label: "Politique" },
  viral_insolite: { emoji: "🌀", label: "Viral" },
};

const TON_CONFIG: Record<string, { emoji: string; label: string; className: string }> = {
  // Nouveaux registres
  confortable: { emoji: "🪴", label: "Confortable", className: "bg-secondary/40 text-secondary-foreground" },
  entre_deux: { emoji: "🔀", label: "Angle inattendu", className: "bg-primary/10 text-primary" },
  decalant: { emoji: "✨", label: "Décalant", className: "bg-[hsl(var(--accent))]/30 text-[hsl(var(--accent-foreground))]" },
  // Anciens (rétro-compat)
  serieux_marquant: { emoji: "💭", label: "Marquant", className: "bg-secondary/40 text-secondary-foreground" },
  drole_decale: { emoji: "😏", label: "Drôle", className: "bg-[hsl(var(--accent))]/30 text-[hsl(var(--accent-foreground))]" },
  surprenant_contre_intuitif: { emoji: "⚡", label: "Surprenant", className: "bg-primary/10 text-primary" },
};

const PONT_CONFIG: Record<string, { emoji: string; label: string; className: string }> = {
  fort: { emoji: "🟢", label: "Pont direct", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  moyen: { emoji: "🟡", label: "Pont élargi", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  fragile: { emoji: "🔴", label: "Pont fragile", className: "bg-muted text-muted-foreground" },
};

interface AnglesState {
  loading: boolean;           // chargement du primary (1er angle)
  data?: ActuAngle[];         // angles actuellement affichés (1 si seulement primary, 3 après variants)
  error?: string;
  errorCode?: "TIMEOUT" | "AUTH" | "NETWORK" | "RATE_LIMIT" | "SERVER" | "UNKNOWN";
  startedAt?: number;
  slow?: boolean;             // true après 15s sans réponse
  primaryOnly?: boolean;      // true si on a 1 angle (primary) sans variantes encore
  variantsLoading?: boolean;  // chargement des 2 variantes à la demande
  variantsError?: string;
  variantsSlow?: boolean;
}

// Combien d'actus dont on pré-calcule l'angle "primary" en arrière-plan
// dès que la recherche d'actus aboutit.
const PRECOMPUTE_COUNT = 2;

const VIBES: { id: string; emoji: string; label: string }[] = [
  { id: "scoop", emoji: "💥", label: "Actu choc à rebondir" },
  { id: "phenomene", emoji: "🌀", label: "Phénomène culturel" },
  { id: "debat", emoji: "⚖️", label: "Débat clivant" },
  { id: "stat", emoji: "📊", label: "Stat ou étude étonnante" },
  { id: "tendance", emoji: "🌱", label: "Tendance émergente" },
  { id: "culture", emoji: "🎬", label: "Sortie culturelle" },
  { id: "combat", emoji: "🧭", label: "Combat / cause de société" },
];

const MAX_VIBES = 3;
const MAX_INTENT_CHARS = 200;

export default function NewsjackingPanel({ onSelect, onClose, workspaceId }: NewsjackingPanelProps) {
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [actus, setActus] = useState<Actu[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedActu, setExpandedActu] = useState<number | null>(null);
  const [isQuotaError, setIsQuotaError] = useState(false);
  const [filter, setFilter] = useState<"all" | "globale" | "niche">("all");
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());
  const [savingIdx, setSavingIdx] = useState<Set<number>>(new Set());
  // Intention de recherche (optionnelle)
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [customIntent, setCustomIntent] = useState("");
  // angles cache, keyed by actu index
  const [anglesByIdx, setAnglesByIdx] = useState<Record<number, AnglesState>>({});
  // Déduplication synchrone des fetchs d'angles (évite spinner infini lié au
  // batching React 18 quand l'updater est différé).
  const primaryStartedRef = useRef<Set<number>>(new Set());
  const variantsStartedRef = useRef<Set<number>>(new Set());
  // Compteur écoulé pendant la recherche (rassure l'utilisatrice)
  const [searchElapsed, setSearchElapsed] = useState(0);
  useEffect(() => {
    if (!loading) { setSearchElapsed(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setSearchElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);
  // URLs déjà retournées dans cette session — passées à Perplexity pour
  // éviter qu'une même actu remonte à chaque "Relancer".
  const seenUrlsRef = useRef<Set<string>>(new Set());
  const navigate = useNavigate();
  const { user } = useAuth();

  const toggleVibe = (id: string) => {
    setSelectedVibes((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= MAX_VIBES) return prev;
      return [...prev, id];
    });
  };

  const fetchActus = useCallback(async () => {
    setStarted(true);
    setLoading(true);
    setError(null);
    setActus(null);
    setExpandedActu(null);
    setIsQuotaError(false);
    setFilter("all");
    setHidden(new Set());
    setSavedIdx(new Set());
    setSavingIdx(new Set());
    setAnglesByIdx({});
    primaryStartedRef.current = new Set();
    variantsStartedRef.current = new Set();

    try {
      const intent = {
        vibes: selectedVibes,
        custom: customIntent.trim() || undefined,
      };
      // Si on est explicitement sur l'onglet "Globale" au moment de relancer,
      // on demande au serveur de désancrer la recherche de la niche.
      const force_macro = filter === "globale";
      const excluded_urls = Array.from(seenUrlsRef.current).slice(-50);
      const { data, error: fnError } = await invokeWithTimeout("newsjacking-ai", {
        body: { workspace_id: workspaceId || undefined, intent, force_macro, excluded_urls },
      }, 180000);

      if (fnError) {
        const msg = fnError.message || "";
        if (fnError.isRateLimit || msg.includes("limit_reached") || msg.includes("crédits")) {
          setIsQuotaError(true);
          setError("Tu as utilisé tous tes crédits de recherche ce mois-ci.");
        } else {
          setError("La recherche a échoué, réessaie.");
        }
        return;
      }

      if (data?.error) {
        if (data.error.includes("limit_reached") || data.error.includes("crédits") || data.error.includes("générations")) {
          setIsQuotaError(true);
          setError(data.message || data.error);
        } else {
          setError(data.error);
        }
        return;
      }

      if (!data?.actus || !Array.isArray(data.actus)) {
        setError("Résultats inattendus, réessaie.");
        return;
      }

      // Mémorise les URLs retournées pour les exclure des prochaines relances
      for (const a of data.actus as Actu[]) {
        const url = (a as any).source_url;
        if (typeof url === "string" && url) seenUrlsRef.current.add(url);
      }

      setActus(data.actus);
      if (data.actus.length === 0 && data.message) {
        setError(data.message);
      }

      // Pré-calcul des angles "primary" pour les premières actus visibles.
      // Non-bloquant : les actus s'affichent immédiatement, les angles arrivent en fond.
      if (data.actus.length > 0) {
        const toPrefetch = (data.actus as Actu[]).slice(0, PRECOMPUTE_COUNT);
        toPrefetch.forEach((actu, idx) => {
          // Petit délai progressif pour éviter de saturer l'edge function
          setTimeout(() => fetchPrimaryAngle(idx, actu), idx * 600);
        });
      }
    } catch {
      setError("La recherche a échoué, réessaie.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, selectedVibes, customIntent, filter]);

  // NOTE: pas d'auto-fetch au montage. L'utilisatrice déclenche la recherche
  // explicitement via le CTA "Lancer la recherche" pour éviter de consommer
  // un crédit par erreur et pour ne pas relancer si workspaceId arrive en async.

  // Helper commun pour mapper une erreur d'invocation vers un message / code
  const mapFnError = (fnError: any): { errMsg: string; errorCode: AnglesState["errorCode"] } => {
    const msg = fnError?.message || "";
    if (fnError?.isRateLimit || msg.includes("limit_reached")) {
      return { errMsg: "Tu as atteint ta limite de générations.", errorCode: "RATE_LIMIT" };
    }
    if (fnError?.isTimeout) {
      return { errMsg: "L'IA met trop de temps à répondre. Réessaie dans un instant.", errorCode: "TIMEOUT" };
    }
    if (fnError?.isAuth) {
      return { errMsg: "Ta session a expiré. Recharge la page et reconnecte-toi.", errorCode: "AUTH" };
    }
    if (fnError?.isNetwork) {
      return { errMsg: "Connexion instable. Vérifie ton internet et réessaie.", errorCode: "NETWORK" };
    }
    return { errMsg: "Génération échouée, réessaie.", errorCode: "SERVER" };
  };

  // Charge UN angle (mode "primary") — appel court, prompt allégé.
  const fetchPrimaryAngle = useCallback(async (idx: number, actu: Actu) => {
    let shouldFetch = false;
    setAnglesByIdx((prev) => {
      // Skip si déjà en cours ou déjà chargé
      if (prev[idx]?.data || prev[idx]?.loading) return prev;
      shouldFetch = true;
      return { ...prev, [idx]: { loading: true, startedAt: Date.now(), slow: false, primaryOnly: true } };
    });
    if (!shouldFetch) return;

    const t0 = Date.now();
    console.log(`[newsjacking-angles] primary start idx=${idx} title="${String(actu.titre).slice(0, 60)}"`);

    const slowTimer = setTimeout(() => {
      setAnglesByIdx((prev) => {
        const s = prev[idx];
        if (!s?.loading) return prev;
        return { ...prev, [idx]: { ...s, slow: true } };
      });
    }, 15000);

    const finish = (next: Partial<AnglesState>) => {
      clearTimeout(slowTimer);
      console.log(`[newsjacking-angles] primary done idx=${idx} in ${Date.now() - t0}ms`, next.errorCode || "ok");
      setAnglesByIdx((prev) => ({ ...prev, [idx]: { ...prev[idx], loading: false, ...next } }));
    };

    try {
      const { data, error: fnError } = await invokeWithTimeout("newsjacking-angles", {
        body: { actu, workspace_id: workspaceId || undefined, mode: "primary" },
      }, 120000);

      if (fnError) {
        const { errMsg, errorCode } = mapFnError(fnError);
        finish({ error: errMsg, errorCode });
        return;
      }
      if (data?.error) {
        finish({ error: data.message || data.error, errorCode: "SERVER" });
        return;
      }
      if (!data?.angles || !Array.isArray(data.angles) || data.angles.length === 0) {
        finish({ error: "Format inattendu, réessaie.", errorCode: "SERVER" });
        return;
      }
      finish({ data: data.angles.slice(0, 1), primaryOnly: true });
    } catch (e) {
      console.error("[newsjacking-angles] primary unexpected throw", e);
      finish({ error: "Génération échouée, réessaie.", errorCode: "UNKNOWN" });
    }
  }, [workspaceId]);

  // Charge 2 angles complémentaires en évitant le véhicule du primary
  const fetchVariants = useCallback(async (idx: number, actu: Actu) => {
    let primaryVehicule: string | undefined;
    let shouldFetch = false;
    setAnglesByIdx((prev) => {
      const s = prev[idx];
      if (!s?.data || !s.primaryOnly || s.variantsLoading) return prev;
      primaryVehicule = s.data[0]?.vehicule;
      shouldFetch = true;
      return { ...prev, [idx]: { ...s, variantsLoading: true, variantsSlow: false, variantsError: undefined } };
    });
    if (!shouldFetch) return;

    const t0 = Date.now();
    console.log(`[newsjacking-angles] variants start idx=${idx}`);

    const slowTimer = setTimeout(() => {
      setAnglesByIdx((prev) => {
        const s = prev[idx];
        if (!s?.variantsLoading) return prev;
        return { ...prev, [idx]: { ...s, variantsSlow: true } };
      });
    }, 15000);

    const finishVariants = (next: { angles?: ActuAngle[]; error?: string }) => {
      clearTimeout(slowTimer);
      console.log(`[newsjacking-angles] variants done idx=${idx} in ${Date.now() - t0}ms`, next.error || "ok");
      setAnglesByIdx((prev) => {
        const s = prev[idx];
        if (!s) return prev;
        if (next.error) {
          return { ...prev, [idx]: { ...s, variantsLoading: false, variantsError: next.error } };
        }
        const newAngles = [...(s.data || []), ...(next.angles || [])];
        return { ...prev, [idx]: { ...s, variantsLoading: false, data: newAngles, primaryOnly: false } };
      });
    };

    try {
      const { data, error: fnError } = await invokeWithTimeout("newsjacking-angles", {
        body: {
          actu,
          workspace_id: workspaceId || undefined,
          mode: "variants",
          exclude_vehicules: primaryVehicule ? [primaryVehicule] : [],
        },
      }, 130000);

      if (fnError) {
        const { errMsg } = mapFnError(fnError);
        finishVariants({ error: errMsg });
        return;
      }
      if (data?.error) {
        finishVariants({ error: data.message || data.error });
        return;
      }
      if (!data?.angles || !Array.isArray(data.angles)) {
        finishVariants({ error: "Format inattendu, réessaie." });
        return;
      }
      finishVariants({ angles: data.angles });
    } catch (e) {
      console.error("[newsjacking-angles] variants unexpected throw", e);
      finishVariants({ error: "Génération échouée, réessaie." });
    }
  }, [workspaceId]);

  // Alias rétro-compat : si la 5ᵉ actu (non pré-calculée) est ouverte → on lance le primary.
  const fetchAngles = fetchPrimaryAngle;

  const handleToggleActu = (idx: number, actu: Actu) => {
    if (expandedActu === idx) {
      setExpandedActu(null);
      return;
    }
    setExpandedActu(idx);
    // Lazy-fetch si pas déjà pré-calculé
    fetchPrimaryAngle(idx, actu);
  };

  const handleHide = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setHidden((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    if (expandedActu === idx) setExpandedActu(null);
  };

  const handleSaveActu = async (idx: number, actu: Actu, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || savedIdx.has(idx) || savingIdx.has(idx)) return;
    setSavingIdx((prev) => new Set(prev).add(idx));

    const sourceLine = actu.source ? `\n\nSource : ${actu.source}` : "";
    const notesText = `${actu.resume}\n\n💡 Pertinence : ${actu.pertinence}${sourceLine}`;
    const axeLabel = actu.axe ? AXE_CONFIG[actu.axe]?.label || actu.axe : null;

    const { error } = await (supabase.from("saved_ideas") as any).insert({
      user_id: user.id,
      workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      titre: `📰 ${actu.titre}`,
      angle: ["actualité", axeLabel].filter(Boolean).join(", "),
      format: "actu",
      canal: "instagram",
      type: "draft",
      status: "to_explore",
      notes: notesText,
      source_module: "newsjacking",
      content_data: actu,
    });

    setSavingIdx((prev) => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });

    if (error) {
      console.error("Save actu error:", error);
      toast.error("Impossible de sauvegarder l'actu");
      return;
    }

    setSavedIdx((prev) => new Set(prev).add(idx));
    toast.success("📌 Sauvegardée dans Mes idées", {
      action: { label: "Voir", onClick: () => navigate("/idees") },
    });
  };

  const handleSelectAngle = (actu: Actu, angle: ActuAngle) => {
    const context = `ACTUALITÉ : ${actu.titre}\nSource : ${actu.source}\nRésumé : ${actu.resume}\nPertinence : ${actu.pertinence}\n\nANGLE CHOISI :\nVéhicule : ${angle.vehicule}\nHook : ${angle.hook}\nDéveloppement : ${angle.description}\nFormat suggéré : ${angle.format_suggere}`;
    onSelect({
      subject: angle.hook,
      context,
      format: angle.format_suggere,
      vehicule: angle.vehicule,
    });
  };

  const visibleActus = actus
    ? actus
        .map((a, i) => ({ actu: a, idx: i }))
        .filter(({ idx }) => !hidden.has(idx))
        .filter(({ actu }) => filter === "all" ? true : actu.type === filter)
    : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Button>
        {started && !loading && (
          <Button variant="outline" size="sm" onClick={fetchActus} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Relancer
          </Button>
        )}
      </div>

      {/* Idle — CTA explicite pour déclencher la recherche (consomme 1 crédit) */}
      {!started && !loading && (
        <div className="rounded-2xl border border-dashed border-primary/30 bg-card p-6 space-y-5">
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-3">
                <Newspaper className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Trouver des actus à surfer pour ta marque</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                L'IA explore l'actu fraîche et croise avec l'univers de ta marque. La recherche prend 30 à 60 secondes et consomme 1 crédit.
              </p>
            </div>
          </div>

          {/* Intention (optionnelle) */}
          <div className="space-y-3 rounded-xl bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-foreground">
                Quel type d'actu tu cherches&nbsp;? <span className="text-muted-foreground font-normal">(optionnel)</span>
              </p>
              {selectedVibes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedVibes([])}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Réinitialiser
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {VIBES.map((v) => {
                const active = selectedVibes.includes(v.id);
                const disabled = !active && selectedVibes.length >= MAX_VIBES;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => toggleVibe(v.id)}
                    disabled={disabled}
                    className={cn(
                      "text-xs px-2.5 py-1.5 rounded-full border transition-colors flex items-center gap-1",
                      active
                        ? "bg-primary/15 border-primary/30 text-primary font-medium"
                        : "bg-background border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
                      disabled && "opacity-40 cursor-not-allowed hover:border-border hover:text-muted-foreground"
                    )}
                  >
                    <span>{v.emoji}</span> {v.label}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Ou précise toi-même :</label>
              <textarea
                value={customIntent}
                onChange={(e) => setCustomIntent(e.target.value.slice(0, MAX_INTENT_CHARS))}
                placeholder="ex : une actu qui touche les mamans solos, un truc qui a fait jaser cette semaine…"
                rows={2}
                className="w-full text-xs rounded-lg border border-border bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex justify-end">
                <span className="text-[10px] text-muted-foreground">{customIntent.length}/{MAX_INTENT_CHARS}</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-primary/5 px-3.5 py-2.5">
            <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Petit secret :</span> pas besoin que l'actu soit "dans ton secteur". Ce qui compte, c'est le lien que tu crées. Et souvent, c'est l'angle inattendu qui marque le plus.
            </p>
          </div>

          <div className="flex justify-center">
            <Button size="sm" onClick={fetchActus} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Lancer la recherche
            </Button>
          </div>
        </div>
      )}


      {/* Récap intention — visible dès qu'une recherche a été lancée avec une intention */}
      {started && !loading && actus && (selectedVibes.length > 0 || customIntent.trim()) && (
        <div className="rounded-xl bg-muted/30 border border-border px-3 py-2 flex items-start gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground shrink-0 mt-0.5">🎯 Intention :</span>
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selectedVibes.map((id) => {
              const v = VIBES.find((x) => x.id === id);
              if (!v) return null;
              return (
                <span key={id} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {v.emoji} {v.label}
                </span>
              );
            })}
            {customIntent.trim() && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-background border border-border text-foreground/80 truncate max-w-full">
                "{customIntent.trim()}"
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStarted(false)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0"
          >
            Modifier
          </button>
        </div>
      )}

      {/* Filter tabs */}
      {actus && actus.length > 0 && !loading && (
        <div className="flex gap-2">
          {([
            { id: "all", label: "Tout", emoji: "✨" },
            { id: "globale", label: "Globale", emoji: "🌍" },
            { id: "niche", label: "Ma niche", emoji: "🎯" },
          ] as const).map((tab) => {
            const visibleSet = actus.filter((_, i) => !hidden.has(i));
            const count = tab.id === "all" ? visibleSet.length : visibleSet.filter(a => a.type === tab.id).length;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5",
                  filter === tab.id
                    ? "bg-primary/10 border-primary/20 text-primary font-medium"
                    : "bg-transparent border-muted text-muted-foreground hover:border-primary/10"
                )}
              >
                {tab.emoji} {tab.label}
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full",
                  filter === tab.id ? "bg-primary/20" : "bg-muted"
                )}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">
            L'IA explore l'univers de ta marque et l'actu…
          </p>
          <p className="text-xs text-muted-foreground/80 tabular-nums">
            {searchElapsed < 30
              ? `Recherche en cours… ${searchElapsed}s`
              : `L'IA fouille le web, ça peut prendre jusqu'à 2 min… ${searchElapsed}s`}
          </p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-center py-12 space-y-4">
          <p className="text-sm text-muted-foreground">{error}</p>
          {isQuotaError ? (
            <Button variant="default" size="sm" onClick={() => window.location.href = "/pricing"}>
              Voir les plans
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={fetchActus} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Réessayer
            </Button>
          )}
        </div>
      )}

      {/* Results */}
      {!loading && actus && actus.length > 0 && (
        <>
          {visibleActus.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-muted-foreground">
                {hidden.size === actus.length
                  ? "Tu as masqué toutes les actus."
                  : `Aucune actu ${filter === "globale" ? "globale" : "de ta niche"} à afficher.`}
              </p>
              <Button variant="ghost" size="sm" onClick={() => { setFilter("all"); setHidden(new Set()); }}>
                Tout réafficher
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {visibleActus.length} actu{visibleActus.length > 1 ? "s" : ""} • clique sur "Voir les angles" pour découvrir une 1ʳᵉ idée (puis 2 variantes à la demande)
              </p>
              <AnimatePresence>
                {visibleActus.map(({ actu, idx }, displayI) => {
                  const isExpanded = expandedActu === idx;
                  const anglesState = anglesByIdx[idx];
                  const axe = actu.axe ? AXE_CONFIG[actu.axe] : null;
                  const ton = actu.ton ? TON_CONFIG[actu.ton] : null;
                  const pont = actu.force_pont ? PONT_CONFIG[actu.force_pont] : null;
                  return (
                    <motion.div
                      key={`${filter}-${idx}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(displayI * 0.06, 0.3) }}
                      className={cn(
                        "rounded-[20px] border bg-card p-4 transition-shadow",
                        isExpanded ? "shadow-md ring-1 ring-primary/20" : "hover:shadow-sm"
                      )}
                    >
                      {/* Card header */}
                      <div className="flex items-start gap-3">
                        <span className="text-lg mt-0.5 shrink-0">{actu.type === "globale" ? "📰" : "🎯"}</span>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm leading-snug">{actu.titre}</h4>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{actu.resume}</p>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {actu.type === "globale" ? "Globale" : "Niche"}
                            </span>
                            {axe && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/40 text-secondary-foreground">
                                {axe.emoji} {axe.label}
                              </span>
                            )}
                            {ton && (
                              <span className={cn("text-[10px] px-2 py-0.5 rounded-full", ton.className)}>
                                {ton.emoji} {ton.label}
                              </span>
                            )}
                            {pont && (
                              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", pont.className)} title="Force du lien entre l'actu et ton univers de marque">
                                {pont.emoji} {pont.label}
                              </span>
                            )}
                            {actu.source_url ? (
                              <a
                                href={actu.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors underline-offset-2 hover:underline"
                                title="Voir l'article source"
                              >
                                {actu.source} ↗
                              </a>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{actu.source}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 italic">💡 {actu.pertinence}</p>
                        </div>
                      </div>

                      {/* Card actions */}
                      <div className="flex items-center gap-2 mt-3 pl-8">
                        <Button
                          size="sm"
                          variant={isExpanded ? "outline" : "default"}
                          onClick={() => handleToggleActu(idx, actu)}
                          className="gap-1.5 flex-1"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronDown className="h-3.5 w-3.5 rotate-180 transition-transform" /> Replier
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3.5 w-3.5" /> Voir les angles
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleSaveActu(idx, actu, e)}
                          disabled={savedIdx.has(idx) || savingIdx.has(idx)}
                          className={cn(
                            "gap-1.5",
                            savedIdx.has(idx) ? "text-primary" : "text-muted-foreground"
                          )}
                          title={savedIdx.has(idx) ? "Déjà sauvegardée" : "Sauvegarder pour plus tard"}
                        >
                          {savingIdx.has(idx) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : savedIdx.has(idx) ? (
                            <BookmarkCheck className="h-3.5 w-3.5" />
                          ) : (
                            <Bookmark className="h-3.5 w-3.5" />
                          )}
                          {savedIdx.has(idx) ? "Sauvegardée" : "Sauvegarder"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleHide(idx, e)}
                          className="gap-1.5 text-muted-foreground"
                          title="Masquer cette actu"
                        >
                          <EyeOff className="h-3.5 w-3.5" /> Pas pour moi
                        </Button>
                      </div>

                      {/* Angles section (lazy) */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-4 space-y-3 pl-8">
                              {anglesState?.loading && (
                                <div className="flex flex-col gap-1 py-4 text-xs text-muted-foreground">
                                  <div className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    <span className="animate-pulse">Génération des angles…</span>
                                  </div>
                                  {anglesState.slow && (
                                    <p className="pl-6 text-[11px] text-muted-foreground/80">
                                      L'IA met plus de temps que prévu (jusqu'à 60 s parfois). Tu peux attendre encore un peu.
                                    </p>
                                  )}
                                </div>
                              )}

                              {anglesState?.error && (
                                <div className="py-3 space-y-2">
                                  <p className="text-xs text-muted-foreground">{anglesState.error}</p>
                                  <Button size="sm" variant="outline" onClick={() => {
                                    setAnglesByIdx((prev) => {
                                      const next = { ...prev };
                                      delete next[idx];
                                      return next;
                                    });
                                    fetchAngles(idx, actu);
                                  }} className="gap-1.5">
                                    <RefreshCw className="h-3.5 w-3.5" /> Réessayer
                                  </Button>
                                </div>
                              )}

                              {anglesState?.data && (
                                <>
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    {anglesState.primaryOnly ? "1ʳᵉ idée d'angle" : "Angles proposés"}
                                  </p>
                                  {anglesState.data.map((angle, j) => {
                                    const vc = VEHICULE_CONFIG[angle.vehicule] || { emoji: "✨", label: angle.vehicule, className: "bg-muted" };
                                    return (
                                      <div key={j} className="rounded-2xl border bg-background p-3 space-y-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", vc.className)}>
                                            {vc.emoji} {vc.label}
                                          </span>
                                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground/70 italic">
                                            💡 idéal en {FORMAT_LABELS[angle.format_suggere] || angle.format_suggere}
                                          </span>
                                        </div>
                                        <p className="text-sm font-semibold leading-snug">« {angle.hook} »</p>
                                        <p className="text-xs text-muted-foreground">{angle.description}</p>
                                        <Button
                                          size="sm"
                                          variant="default"
                                          className="w-full mt-1"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelectAngle(actu, angle);
                                          }}
                                        >
                                          Choisir cet angle
                                        </Button>
                                      </div>
                                    );
                                  })}

                                  {/* Bouton "Voir 2 autres angles" si on n'a que le primary */}
                                  {anglesState.primaryOnly && !anglesState.variantsLoading && !anglesState.variantsError && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        fetchVariants(idx, actu);
                                      }}
                                      className="w-full gap-1.5"
                                    >
                                      <Sparkles className="h-3.5 w-3.5" /> Voir 2 autres angles
                                    </Button>
                                  )}

                                  {anglesState.variantsLoading && (
                                    <div className="flex flex-col gap-1 py-2 text-xs text-muted-foreground">
                                      <div className="flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                        <span className="animate-pulse">Recherche de 2 autres angles…</span>
                                      </div>
                                      {anglesState.variantsSlow && (
                                        <p className="pl-6 text-[11px] text-muted-foreground/80">
                                          L'IA met plus de temps que prévu. Tu peux attendre encore un peu.
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {anglesState.variantsError && (
                                    <div className="py-2 space-y-2">
                                      <p className="text-xs text-muted-foreground">{anglesState.variantsError}</p>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          fetchVariants(idx, actu);
                                        }}
                                        className="gap-1.5"
                                      >
                                        <RefreshCw className="h-3.5 w-3.5" /> Réessayer
                                      </Button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              <Button variant="outline" size="sm" onClick={fetchActus} className="w-full gap-1.5 mt-2">
                <RefreshCw className="h-3.5 w-3.5" /> Relancer la recherche
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
