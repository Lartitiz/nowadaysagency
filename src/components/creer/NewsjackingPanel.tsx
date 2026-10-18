import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, Loader2, Sparkles, EyeOff, ChevronDown, Bookmark, BookmarkCheck, Newspaper, Lightbulb, Link2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatLabel } from "@/lib/idea-state";
import { supabase } from "@/integrations/supabase/client";
import { quotaLimitMessage, readableError } from "@/lib/error-messages";
import { useAuth } from "@/contexts/AuthContext";
import { dateActu } from "./newsjacking-date";
import { ecrireListeActus, lireListeActus } from "./newsjacking-session";

import { type ActuAngle, type Actu, type NewsjackingPanelProps, type AnglesState, VEHICULE_CONFIG, AXE_CONFIG, PONT_CONFIG, PRECOMPUTE_COUNT, VIBES, MAX_VIBES, MAX_INTENT_CHARS, stripCitations, searchStageLabel } from "./newsjacking-config";

export default function NewsjackingPanel({ onSelect, onClose, workspaceId }: NewsjackingPanelProps) {
  const { user } = useAuth();
  // Liste déjà payée, gardée dans l'onglet (newsjacking-session.ts).
  const [gardee] = useState(() => lireListeActus(user?.id, workspaceId));
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(!!gardee);
  const [actus, setActus] = useState<Actu[] | null>(gardee?.actus ?? null);
  const [error, setError] = useState<string | null>(null);
  // Résultat vide "propre" (pas une erreur) : le moteur a cherché mais n'a trouvé
  // aucun pont assez solide. On affiche un écran dédié avec une porte de sortie
  // (relancer en mode élargi) plutôt que de coincer l'utilisatrice.
  const [emptyMsg, setEmptyMsg] = useState<string | null>(null);
  const [broadenedEmpty, setBroadenedEmpty] = useState(false);
  const [expandedActu, setExpandedActu] = useState<number | null>(null);
  const [isQuotaError, setIsQuotaError] = useState(false);
  const [filter, setFilter] = useState<"all" | "globale" | "niche">(gardee?.filter ?? "all");
  const [hidden, setHidden] = useState<Set<number>>(new Set(gardee?.hidden));
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set(gardee?.savedIdx));
  const [savingIdx, setSavingIdx] = useState<Set<number>>(new Set());
  // Intention de recherche (optionnelle)
  const [selectedVibes, setSelectedVibes] = useState<string[]>(gardee?.vibes ?? []);
  const [customIntent, setCustomIntent] = useState(gardee?.intent ?? "");
  const [urlInput, setUrlInput] = useState("");
  const [preciser, setPreciser] = useState(() => !!gardee?.vibes?.length || !!gardee?.intent);
  // angles cache, keyed by actu index
  const [anglesByIdx, setAnglesByIdx] = useState<Record<number, AnglesState>>(gardee?.angles ?? {});
  // Déduplication synchrone des fetchs d'angles (évite spinner infini lié au
  // batching React 18 quand l'updater est différé). Angles gardés = déjà chargés.
  const primaryStartedRef = useRef<Set<number>>(new Set(Object.keys(gardee?.angles ?? {}).map(Number)));
  const variantsStartedRef = useRef<Set<number>>(new Set(Object.entries(gardee?.angles ?? {}).filter(([, a]) => !a.primaryOnly).map(([i]) => Number(i))));
  useEffect(() => {
    ecrireListeActus(user?.id, actus ? { actus, angles: anglesByIdx, filter, hidden: [...hidden], savedIdx: [...savedIdx], vibes: selectedVibes, intent: customIntent, workspaceId } : null);
  }, [user?.id, workspaceId, actus, anglesByIdx, filter, hidden, savedIdx, selectedVibes, customIntent]);
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
  const seenUrlsRef = useRef<Set<string>>(new Set((gardee?.actus ?? []).map((a) => a.source_url).filter(Boolean) as string[]));
  const navigate = useNavigate();

  const toggleVibe = (id: string) => {
    setSelectedVibes((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= MAX_VIBES) return prev;
      return [...prev, id];
    });
  };

  const fetchActus = useCallback(async (opts?: { broaden?: boolean }) => {
    const broaden = opts?.broaden === true;
    setStarted(true);
    setLoading(true);
    setError(null);
    setEmptyMsg(null);
    setBroadenedEmpty(false);
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
      // "broaden" = porte de sortie depuis un résultat vide : on désancre de la
      // niche et on relâche le pont (mode macro côté serveur). Sinon, on désancre
      // aussi quand l'utilisatrice est sur l'onglet "Globale" au moment de relancer.
      const force_macro = broaden || filter === "globale";
      const excluded_urls = Array.from(seenUrlsRef.current).slice(-50);
      const { data, error: fnError } = await invokeWithTimeout("newsjacking-ai", {
        body: { workspace_id: workspaceId || undefined, intent, force_macro, excluded_urls },
      }, 180000);

      if (fnError) {
        const msg = fnError.message || "";
        if (data?.error === "limit_reached" && data?.quota?.reason !== "error") {
          setIsQuotaError(true);
          setError(quotaLimitMessage(data?.quota) || "Tu as atteint une de tes limites du mois. Elle revient le 1er du mois.");
        } else {
          setError("La recherche a échoué, réessaie.");
        }
        return;
      }

      if (data?.error) {
        if (data.error === "limit_reached" && data?.quota?.reason !== "error") {
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
      if (data.actus.length === 0) {
        // Pas une erreur : recherche réussie mais aucun pont assez solide.
        // On bascule sur l'écran dédié (avec porte de sortie "élargir").
        setEmptyMsg(
          data.message ||
            "Pas de phénomène assez connectable cette fois : aucun pont solide vers ta marque."
        );
        setBroadenedEmpty(broaden);
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

  const fetchFromUrl = useCallback(async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    let normalized = trimmed;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    try { new URL(normalized); } catch {
      setError("Lien invalide. Vérifie l'URL.");
      return;
    }

    setStarted(true);
    setLoading(true);
    setError(null);
    setEmptyMsg(null);
    setBroadenedEmpty(false);
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
      const { data, error: fnError } = await invokeWithTimeout("newsjacking-from-url", {
        body: {
          url: normalized,
          workspace_id: workspaceId && workspaceId !== user?.id ? workspaceId : undefined,
        },
      }, 90000);

      if (fnError) {
        const msg = fnError.message || "";
        if (data?.error === "limit_reached" && data?.quota?.reason !== "error") {
          setIsQuotaError(true);
          setError(quotaLimitMessage(data?.quota) || "Tu as atteint une de tes limites du mois. Elle revient le 1er du mois.");
        } else {
          setError(readableError(fnError, "L’analyse du lien n’a pas abouti. Vérifie l’adresse et réessaie."));
        }
        return;
      }

      if (data?.error) {
        if (data.error === "limit_reached" && data?.quota?.reason !== "error") {
          setIsQuotaError(true);
          setError(data.message || data.error);
        } else {
          setError(data.error);
        }
        return;
      }

      if (!data?.actus || !Array.isArray(data.actus) || data.actus.length === 0) {
        setError("Aucune analyse exploitable, réessaie avec un autre lien.");
        return;
      }

      for (const a of data.actus as Actu[]) {
        const url = a.source_url;
        if (typeof url === "string" && url) seenUrlsRef.current.add(url);
      }

      setActus(data.actus);
      setExpandedActu(0);

      // Pré-calcul de l'angle "primary" pour l'unique actu
      setTimeout(() => fetchPrimaryAngle(0, data.actus[0]), 200);
    } catch {
      setError("Analyse du lien échouée, réessaie.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlInput, workspaceId, user?.id]);

  // NOTE: pas d'auto-fetch au montage. L'utilisatrice déclenche la recherche
  // explicitement via le CTA "Lancer la recherche" pour éviter de consommer
  // un crédit par erreur et pour ne pas relancer si workspaceId arrive en async.

  // Helper commun pour mapper une erreur d'invocation vers un message / code
  const mapFnError = (fnError: any): { errMsg: string; errorCode: AnglesState["errorCode"] } => {
    const msg = fnError?.message || "";
    if (fnError?.data?.error === "limit_reached" && fnError?.data?.quota?.reason !== "error") {
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
    // Garde synchrone : empêche les doubles lancements sans dépendre du
    // flush différé de setAnglesByIdx.
    if (primaryStartedRef.current.has(idx)) return;
    primaryStartedRef.current.add(idx);
    setAnglesByIdx((prev) => {
      if (prev[idx]?.data || prev[idx]?.loading) return prev;
      return { ...prev, [idx]: { loading: true, startedAt: Date.now(), slow: false, primaryOnly: true } };
    });

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
      // En cas d'erreur, libérer le verrou pour permettre un vrai "Réessayer".
      if (next.error) primaryStartedRef.current.delete(idx);
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
  const fetchVariants = useCallback(async (idx: number, actu: Actu, primaryVehicule?: string) => {
    // Garde synchrone (même rationale que fetchPrimaryAngle).
    if (variantsStartedRef.current.has(idx)) return;
    variantsStartedRef.current.add(idx);
    setAnglesByIdx((prev) => {
      const s = prev[idx];
      if (!s?.data || !s.primaryOnly || s.variantsLoading) return prev;
      return { ...prev, [idx]: { ...s, variantsLoading: true, variantsSlow: false, variantsError: undefined } };
    });

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
      if (next.error) variantsStartedRef.current.delete(idx);
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

  // Sur téléphone, « Choisir cet angle » arrivait sous l'écran (957 px) : on l'amène au milieu dès qu'il est prêt.
  const angleOuvertPret = expandedActu !== null && !!anglesByIdx[expandedActu]?.data?.length;
  useEffect(() => {
    if (!angleOuvertPret) return;
    const t = setTimeout(() => document.querySelector(`[data-choisir-angle="${expandedActu}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
    return () => clearTimeout(t);
  }, [angleOuvertPret, expandedActu]);

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
    const faitsBloc = actu.faits_cles && actu.faits_cles.length > 0
      ? `\n\nFAITS DE L'ARTICLE (à exploiter, ne rien inventer d'autre) :\n${actu.faits_cles.map(f => `- ${f}`).join("\n")}`
      : "";
    const context = `ACTUALITÉ : ${actu.titre}\nSource : ${actu.source}\nRésumé : ${actu.resume}\nPertinence : ${actu.pertinence}${faitsBloc}\n\nANGLE CHOISI :\nVéhicule : ${angle.vehicule}\nHook : ${angle.hook}\nDéveloppement : ${angle.description}\nFormat suggéré : ${angle.format_suggere}`;
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
          <Button variant="outline" size="sm" onClick={() => fetchActus()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Relancer · 3 crédits
          </Button>
        )}
      </div>

      {/* Départ : le bouton principal visible sans défiler (18/10/2026) ; préciser et coller un lien restent à un clic. */}
      {!started && !loading && (
        <div className="rounded-2xl border border-dashed border-primary/30 bg-card p-5 space-y-4">
          <div className="text-center space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Trouver une actu à relier à ton activité</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              L'IA cherche l'actu récente et la croise avec ta marque (30 à 60 secondes). Chaque actu vient avec le lien de sa source.
            </p>
            <p className="text-2xs text-muted-foreground/80 max-w-md mx-auto">
              💳 3 crédits pour lancer la recherche : elle prépare aussi les angles des 2 premières actus (rien si elle ne trouve rien). Ensuite, les angles d'une autre actu = 1 crédit.
            </p>
          </div>

          <div className="text-center">
            <button type="button" onClick={() => setPreciser((v) => !v)} aria-expanded={preciser} className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-4">
              Préciser ce que je cherche (facultatif) <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", preciser && "rotate-180")} />
            </button>
          </div>
          {preciser && (<>
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
                  className="text-2xs text-muted-foreground hover:text-foreground underline underline-offset-2"
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
              <label className="text-2xs text-muted-foreground">Ou précise toi-même :</label>
              <textarea
                value={customIntent}
                onChange={(e) => setCustomIntent(e.target.value.slice(0, MAX_INTENT_CHARS))}
                placeholder="ex : une actu qui touche les mamans solos, un truc qui a fait jaser cette semaine…"
                rows={2}
                className="w-full text-xs rounded-lg border border-border bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex justify-end">
                <span className="text-2xs text-muted-foreground">{customIntent.length}/{MAX_INTENT_CHARS}</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-primary/5 px-3.5 py-2.5">
            <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-2xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Petit secret :</span> pas besoin que l'actu soit "dans ton secteur". Ce qui compte, c'est le lien que tu crées. Et souvent, c'est l'angle inattendu qui marque le plus.
            </p>
          </div>

          </>)}

          <div className="flex justify-center">
            <Button onClick={() => fetchActus()} className="gap-1.5 w-full sm:w-auto">
              <Sparkles className="h-3.5 w-3.5" /> Lancer la recherche
            </Button>
          </div>

          <div className="text-center">
            <span className="text-2xs uppercase tracking-wider text-muted-foreground">ou</span>
          </div>

          {/* Analyser un lien d'actu */}
          <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-medium text-foreground">
                Tu as déjà un article en tête&nbsp;? <span className="text-muted-foreground font-normal">Colle son lien.</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://…"
                className="flex-1 text-xs rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && urlInput.trim()) {
                    e.preventDefault();
                    fetchFromUrl();
                  }
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={fetchFromUrl}
                disabled={!urlInput.trim()}
                className="gap-1.5 shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5" /> Analyser ce lien
              </Button>
            </div>
            <p className="text-2xs text-muted-foreground">
              L'IA lit l'article et te propose des angles connectés à ta marque. 💳 2 crédits (lecture + 1ᵉʳ angle). Articles web uniquement (pas YouTube ni réseaux sociaux).
            </p>
          </div>

        </div>
      )}


      {/* Récap intention — visible dès qu'une recherche a été lancée avec une intention */}
      {started && !loading && actus && (selectedVibes.length > 0 || customIntent.trim()) && (
        <div className="rounded-xl bg-muted/30 border border-border px-3 py-2 flex items-start gap-2 flex-wrap">
          <span className="text-2xs text-muted-foreground shrink-0 mt-0.5">🎯 Intention :</span>
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selectedVibes.map((id) => {
              const v = VIBES.find((x) => x.id === id);
              if (!v) return null;
              return (
                <span key={id} className="text-2xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {v.emoji} {v.label}
                </span>
              );
            })}
            {customIntent.trim() && (
              <span className="text-2xs px-2 py-0.5 rounded-full bg-background border border-border text-foreground/80 truncate max-w-full">
                "{customIntent.trim()}"
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStarted(false)}
            className="text-2xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0"
          >
            Modifier
          </button>
        </div>
      )}

      {/* Filter tabs */}
      {started && actus && actus.length > 0 && !loading && (
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
                  "text-2xs px-1.5 py-0.5 rounded-full",
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
          <AnimatePresence mode="wait">
            <motion.p
              key={searchStageLabel(searchElapsed)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="text-sm text-muted-foreground text-center"
            >
              {searchStageLabel(searchElapsed)}
            </motion.p>
          </AnimatePresence>
          <p className="text-xs text-muted-foreground/80 tabular-nums">
            {searchElapsed < 30
              ? `Recherche en cours… ${searchElapsed}s`
              : `Ça peut prendre jusqu'à 2 min, c'est normal… ${searchElapsed}s`}
          </p>
        </div>
      )}

      {/* Error */}
      {started && !loading && error && (
        <div className="text-center py-12 space-y-4">
          <p className="text-sm text-muted-foreground">{error}</p>
          {isQuotaError ? (
            <Button variant="default" size="sm" onClick={() => navigate("/pricing")}>
              Voir les plans
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => fetchActus()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Réessayer
            </Button>
          )}
        </div>
      )}

      {/* Empty — recherche réussie mais aucun pont assez solide.
          Porte de sortie : relancer en mode élargi (pont relâché). */}
      {started && !loading && !error && actus && actus.length === 0 && emptyMsg && (
        <div className="text-center py-10 space-y-5">
          <div className="flex justify-center">
            <div className="rounded-full bg-muted p-3">
              <Newspaper className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <p className="text-sm font-semibold text-foreground">
              {broadenedEmpty ? "Toujours rien de net cette fois" : "Rien de solide cette fois"}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{emptyMsg}</p>
          </div>

          {broadenedEmpty ? (
            // On a DÉJÀ élargi et c'est toujours vide : on ne repropose pas la
            // même relance (qui recoûterait un crédit pour rien).
            <div className="flex flex-col items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStarted(false)} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Changer d'intention
              </Button>
              <p className="text-2xs text-muted-foreground max-w-xs leading-relaxed">
                Tu peux aussi coller le lien d'une actu que tu as déjà en tête : l'IA en tirera des angles connectés à ta marque.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Button size="sm" onClick={() => fetchActus({ broaden: true })} className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Montre-moi quand même les actus chaudes
              </Button>
              <p className="text-2xs text-muted-foreground max-w-xs leading-relaxed">
                On relâche le filtre : des actus grand public avec une piste de réaction, même sans lien direct à ta marque. 3 crédits.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStarted(false)}
                className="gap-1.5 text-muted-foreground"
              >
                Affiner mon intention
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {started && !loading && actus && actus.length > 0 && (
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
                {visibleActus.length} actu{visibleActus.length > 1 ? "s" : ""} • les angles des 2 premières sont prêts ; pour les autres, "Voir les angles" = 1 crédit
              </p>
              <AnimatePresence>
                {visibleActus.map(({ actu, idx }, displayI) => {
                  const isExpanded = expandedActu === idx;
                  const anglesState = anglesByIdx[idx];
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
                          <h4 className="font-medium text-sm leading-snug">{stripCitations(actu.titre)}</h4>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{stripCitations(actu.resume)}</p>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {actu.from_url && (
                              <span className="text-2xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                                🔗 D'après ton lien
                              </span>
                            )}
                            {pont && (
                              <span className={cn("text-2xs px-2 py-0.5 rounded-full font-medium", pont.className)} title="Force du lien entre l'actu et ton univers de marque">
                                {pont.emoji} {pont.label}
                              </span>
                            )}
                            {actu.source_url ? (
                              <a
                                href={actu.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-2xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors underline-offset-2 hover:underline"
                                title="Voir l'article source"
                              >
                                {actu.source}{actu.date_publication ? ` · ${dateActu(actu.date_publication)}` : ""} ↗
                              </a>
                            ) : (
                              <span className="text-2xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{actu.source}{actu.date_publication ? ` · ${dateActu(actu.date_publication)}` : ""}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 italic">💡 {stripCitations(actu.pertinence)}</p>
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
                          <EyeOff className="h-3.5 w-3.5" /> Masquer
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
                                    <p className="pl-6 text-2xs text-muted-foreground/80">
                                      L'IA met plus de temps que prévu (jusqu'à 60 s parfois). Tu peux attendre encore un peu.
                                    </p>
                                  )}
                                </div>
                              )}

                              {anglesState?.error && (
                                <div className="py-3 space-y-2">
                                  <p className="text-xs text-muted-foreground">{anglesState.error}</p>
                                  <Button size="sm" variant="outline" onClick={() => {
                                    primaryStartedRef.current.delete(idx);
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
                                          <span className={cn("text-2xs px-2 py-0.5 rounded-full font-medium", vc.className)}>
                                            {vc.emoji} {vc.label}
                                          </span>
                                          <span className="text-2xs px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground/70 italic">
                                            💡 idéal en {formatLabel(angle.format_suggere)}
                                          </span>
                                        </div>
                                        <p className="text-sm font-semibold leading-snug">« {angle.hook} »</p>
                                        <p className="text-xs text-muted-foreground">{angle.description}</p>
                                        <Button
                                          size="sm"
                                          variant="default"
                                          data-choisir-angle={j === 0 ? idx : undefined}
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
                                        fetchVariants(idx, actu, anglesState.data?.[0]?.vehicule);
                                      }}
                                      className="w-full gap-1.5"
                                    >
                                      <Sparkles className="h-3.5 w-3.5" /> Voir 2 autres angles · 1 crédit
                                    </Button>
                                  )}

                                  {anglesState.variantsLoading && (
                                    <div className="flex flex-col gap-1 py-2 text-xs text-muted-foreground">
                                      <div className="flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                        <span className="animate-pulse">Recherche de 2 autres angles…</span>
                                      </div>
                                      {anglesState.variantsSlow && (
                                        <p className="pl-6 text-2xs text-muted-foreground/80">
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
                                          variantsStartedRef.current.delete(idx);
                                          fetchVariants(idx, actu, anglesState.data?.[0]?.vehicule);
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

              <Button variant="outline" size="sm" onClick={() => fetchActus()} className="w-full gap-1.5 mt-2">
                <RefreshCw className="h-3.5 w-3.5" /> Relancer la recherche · 3 crédits
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
