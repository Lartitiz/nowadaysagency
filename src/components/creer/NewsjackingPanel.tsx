import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

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
  pertinence: string;
  angles: ActuAngle[];
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
};

const FORMAT_LABELS: Record<string, string> = {
  post: "Post",
  carousel: "Carrousel",
  reel: "Reel",
  story: "Story",
  linkedin: "LinkedIn",
};

export default function NewsjackingPanel({ onSelect, onClose, workspaceId }: NewsjackingPanelProps) {
  const [loading, setLoading] = useState(false);
  const [actus, setActus] = useState<Actu[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedActu, setSelectedActu] = useState<number | null>(null);
  const [isQuotaError, setIsQuotaError] = useState(false);
  const [filter, setFilter] = useState<"all" | "globale" | "niche">("all");

  const fetchActus = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActus(null);
    setSelectedActu(null);
    setIsQuotaError(false);
    setFilter("all");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("newsjacking-ai", {
        body: { workspace_id: workspaceId || undefined },
      });

      if (fnError) {
        const msg = typeof fnError === "object" && "message" in fnError ? (fnError as any).message : String(fnError);
        if (msg.includes("429") || msg.includes("limit_reached") || msg.includes("crédits")) {
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

  const handleSelectAngle = (actu: Actu, angle: ActuAngle) => {
    const context = `ACTUALITÉ : ${actu.titre}\nSource : ${actu.source}\nRésumé : ${actu.resume}\nPertinence : ${actu.pertinence}\n\nANGLE CHOISI :\nVéhicule : ${angle.vehicule}\nHook : ${angle.hook}\nDéveloppement : ${angle.description}\nFormat suggéré : ${angle.format_suggere}`;
    onSelect({
      subject: angle.hook,
      context,
      format: angle.format_suggere,
      vehicule: angle.vehicule,
    });
  };

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

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">
            L'IA explore l'actu de ta niche…
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
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{actus.length} actu{actus.length > 1 ? "s" : ""} pertinente{actus.length > 1 ? "s" : ""} trouvée{actus.length > 1 ? "s" : ""}</p>
          <AnimatePresence>
            {actus.map((actu, i) => {
              const isExpanded = selectedActu === i;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className={cn(
                    "rounded-[20px] border bg-card p-4 cursor-pointer transition-shadow",
                    isExpanded ? "shadow-md ring-1 ring-primary/20" : "hover:shadow-sm"
                  )}
                  onClick={() => setSelectedActu(isExpanded ? null : i)}
                >
                  {/* Card header */}
                  <div className="flex items-start gap-3">
                    <span className="text-lg mt-0.5">{actu.type === "globale" ? "📰" : "🎯"}</span>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm leading-snug">{actu.titre}</h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{actu.resume}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{actu.source}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{actu.type === "globale" ? "Actu globale" : "Actu niche"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pertinence */}
                  {!isExpanded && (
                    <p className="text-xs text-muted-foreground mt-2 italic pl-8">💡 {actu.pertinence}</p>
                  )}

                  {/* Expanded: angles */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <p className="text-xs text-muted-foreground mt-3 italic pl-8">💡 {actu.pertinence}</p>

                        <div className="mt-4 space-y-3 pl-8">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Angles proposés</p>
                          {actu.angles.map((angle, j) => {
                            const vc = VEHICULE_CONFIG[angle.vehicule] || { emoji: "✨", label: angle.vehicule, className: "bg-muted" };
                            return (
                              <div key={j} className="rounded-2xl border bg-background p-3 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", vc.className)}>
                                    {vc.emoji} {vc.label}
                                  </span>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    {FORMAT_LABELS[angle.format_suggere] || angle.format_suggere}
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
    </div>
  );
}
