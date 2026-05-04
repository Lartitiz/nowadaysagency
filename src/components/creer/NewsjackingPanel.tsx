import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, Loader2, Sparkles, EyeOff, ChevronDown, Bookmark, BookmarkCheck } from "lucide-react";
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

interface AnglesState {
  loading: boolean;
  data?: ActuAngle[];
  error?: string;
}

export default function NewsjackingPanel({ onSelect, onClose, workspaceId }: NewsjackingPanelProps) {
  const [loading, setLoading] = useState(false);
  const [actus, setActus] = useState<Actu[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedActu, setExpandedActu] = useState<number | null>(null);
  const [isQuotaError, setIsQuotaError] = useState(false);
  const [filter, setFilter] = useState<"all" | "globale" | "niche">("all");
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());
  const [savingIdx, setSavingIdx] = useState<Set<number>>(new Set());
  // angles cache, keyed by actu index
  const [anglesByIdx, setAnglesByIdx] = useState<Record<number, AnglesState>>({});
  const navigate = useNavigate();
  const { user } = useAuth();

  const fetchActus = useCallback(async () => {
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

    try {
      const { data, error: fnError } = await invokeWithTimeout("newsjacking-ai", {
        body: { workspace_id: workspaceId || undefined },
      }, 90000);

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

      setActus(data.actus);
      if (data.actus.length === 0 && data.message) {
        setError(data.message);
      }
    } catch {
      setError("La recherche a échoué, réessaie.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchActus();
  }, [fetchActus]);

  const fetchAngles = useCallback(async (idx: number, actu: Actu) => {
    // Don't refetch if already loaded
    if (anglesByIdx[idx]?.data) return;

    setAnglesByIdx((prev) => ({ ...prev, [idx]: { loading: true } }));

    try {
      const { data, error: fnError } = await invokeWithTimeout("newsjacking-angles", {
        body: { actu, workspace_id: workspaceId || undefined },
      }, 50000);

      if (fnError) {
        const msg = fnError.message || "";
        const errMsg = fnError.isRateLimit || msg.includes("limit_reached")
          ? "Tu as atteint ta limite de générations."
          : "Génération échouée, réessaie.";
        setAnglesByIdx((prev) => ({ ...prev, [idx]: { loading: false, error: errMsg } }));
        return;
      }

      if (data?.error) {
        setAnglesByIdx((prev) => ({ ...prev, [idx]: { loading: false, error: data.message || data.error } }));
        return;
      }

      if (!data?.angles || !Array.isArray(data.angles)) {
        setAnglesByIdx((prev) => ({ ...prev, [idx]: { loading: false, error: "Format inattendu, réessaie." } }));
        return;
      }

      setAnglesByIdx((prev) => ({ ...prev, [idx]: { loading: false, data: data.angles } }));
    } catch {
      setAnglesByIdx((prev) => ({ ...prev, [idx]: { loading: false, error: "Génération échouée, réessaie." } }));
    }
  }, [anglesByIdx, workspaceId]);

  const handleToggleActu = (idx: number, actu: Actu) => {
    if (expandedActu === idx) {
      setExpandedActu(null);
      return;
    }
    setExpandedActu(idx);
    // Lazy-fetch angles when expanding
    fetchAngles(idx, actu);
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
        {!loading && (
          <Button variant="outline" size="sm" onClick={fetchActus} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Relancer
          </Button>
        )}
      </div>

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
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">
            L'IA explore l'univers de ta marque et l'actu…
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
                {visibleActus.length} actu{visibleActus.length > 1 ? "s" : ""} • clique sur "Voir les angles" pour générer 3 idées
              </p>
              <AnimatePresence>
                {visibleActus.map(({ actu, idx }, displayI) => {
                  const isExpanded = expandedActu === idx;
                  const anglesState = anglesByIdx[idx];
                  const axe = actu.axe ? AXE_CONFIG[actu.axe] : null;
                  const ton = actu.ton ? TON_CONFIG[actu.ton] : null;
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
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{actu.source}</span>
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
                                <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                  <span className="animate-pulse">Génération des angles…</span>
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
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Angles proposés</p>
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
