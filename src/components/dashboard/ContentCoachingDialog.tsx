import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import CoachingShell from "@/components/coaching/CoachingShell";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { ArrowLeft, Rocket, RefreshCw, Sparkles, Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { normalizeFormat } from "@/lib/format-normalizer";
import { useCreateIdea } from "@/hooks/use-saved-ideas";

type Step = 1 | 2 | "loading" | "result";

interface ContentIdea {
  subject: string;
  angle: string;
  lens?: string;
  boldness?: "safe" | "bold" | "provoc";
  objective_tag: string;
  why_it_works: string;
  hook?: string;
  brief?: string;
}

interface ContentResult {
  ideas?: ContentIdea[];
  recommended_format: string;
  format_reason: string;
  redirect_route: string;
  recommended_subject?: string;
  subject_alternatives?: string[];
  redirect_params?: { subject: string; objective: string };
  quick_brief?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (data: { subject: string; format: string; objective: string; carouselSubMode?: "text" | "photo" | "mix" | "pure_photo" }) => void;
  onNewsjackingRedirect?: () => void;
}

const OBJECTIFS = [
  { id: "inspirer", emoji: "🌟", label: "Inspirer" },
  { id: "eduquer", emoji: "📚", label: "Éduquer" },
  { id: "vendre", emoji: "💰", label: "Vendre" },
  { id: "creer_du_lien", emoji: "💬", label: "Créer du lien" },
];

const CANAL_FORMATS = [
  {
    canal: "instagram",
    emoji: "📸",
    label: "Instagram",
    formats: [
      { id: "post", emoji: "📝", label: "Post" },
      { id: "carousel", emoji: "🎠", label: "Carrousel" },
      { id: "reel", emoji: "🎬", label: "Reel" },
      { id: "story", emoji: "📱", label: "Story" },
    ],
  },
  {
    canal: "linkedin",
    emoji: "💼",
    label: "LinkedIn",
    formats: [
      { id: "post", emoji: "📝", label: "Post" },
      { id: "carousel", emoji: "🎠", label: "Carrousel" },
    ],
  },
  {
    canal: "pinterest",
    emoji: "📌",
    label: "Pinterest",
    formats: [
      { id: "pinterest", emoji: "📝", label: "Épingle texte" },
      { id: "pinterest_visual", emoji: "🎨", label: "Visuelle" },
    ],
  },
  {
    canal: "newsletter",
    emoji: "📧",
    label: "Newsletter",
    formats: [
      { id: "newsletter", emoji: "📧", label: "Newsletter" },
    ],
  },
];

function LoadingMessage() {
  const messages = [
    "Je fouille ton univers…",
    "Je cherche des angles…",
    "Je formule 4 idées…",
    "Derniers ajustements…",
  ];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <p className="text-sm font-medium text-primary text-center animate-fade-in" key={index}>
      {messages[index]}
    </p>
  );
}

export default function ContentCoachingDialog({ open, onOpenChange, onSelect, onNewsjackingRedirect }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const workspaceId = useWorkspaceId();
  const [step, setStep] = useState<Step>(1);
  const [objectif, setObjectif] = useState("");
  const [sujet, setSujet] = useState("");
  const [canal, setCanal] = useState("");
  const [format, setFormat] = useState("");
  const [result, setResult] = useState<ContentResult | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<ContentIdea | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [carouselSubMode, setCarouselSubMode] = useState<"text" | "photo" | "mix" | "pure_photo" | null>(null);
  const [savedIdeas, setSavedIdeas] = useState<Set<number>>(new Set());
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const createIdea = useCreateIdea();

  const reset = () => {
    setStep(1);
    setObjectif("");
    setSujet("");
    setCanal("");
    setFormat("");
    setResult(null);
    setSelectedIdea(null);
    setSelectedSubject(null);
    setCarouselSubMode(null);
    setSavedIdeas(new Set());
  };

  const handleSaveIdea = async (idea: ContentIdea, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (savedIdeas.has(index)) return;
    if (!user) return;
    try {
      await createIdea.mutateAsync({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        titre: idea.subject,
        angle: idea.angle || null,
        format: normalizeFormat(format) || format || null,
        canal: canal || null,
        objectif: idea.objective_tag || objectif || null,
        type: "idea",
        status: "to_explore",
        notes: idea.why_it_works || null,
        source_module: "content_coaching",
      });
      setSavedIdeas((prev) => new Set(prev).add(index));
    } catch (err) {
      console.error("Save idea error:", err);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  /* Step 1: select objective → go to step 2 (subject text is taken if filled) */
  const handleObjectifSelect = (id: string) => {
    setObjectif(id);
    setStep(2);
  };

  /* "Surprise" — skip everything, generate with auto */
  const handleSurprise = () => {
    setObjectif("auto");
    setSujet("");
    setCanal("auto");
    setFormat("auto");
    generateIdeas({ objectif: "auto", canal: "auto", format: "auto", sujet: "" });
  };

  /* Step 2: select a canal+format → generate immediately */
  const handleFormatSelect = (canalId: string, formatId: string) => {
    setCanal(canalId);
    setFormat(formatId);
    if (formatId === "carousel") {
      // Show sub-mode picker inline — don't generate yet
      setCarouselSubMode(null);
    } else {
      generateIdeas({ objectif, canal: canalId, format: formatId, sujet });
    }
  };

  const handleCarouselSubSelect = (sub: "text" | "photo" | "mix" | "pure_photo") => {
    setCarouselSubMode(sub);
    generateIdeas({ objectif, canal, format: "carousel", sujet });
  };

  const generateIdeas = async (params?: { objectif: string; canal: string; format: string; sujet: string; intensity?: "bold" }) => {
    const p = params || { objectif, canal, format, sujet };
    setStep("loading");
    setResult(null);
    setSelectedIdea(null);
    setSelectedSubject(null);

    try {
      const { data, error } = await invokeWithTimeout("content-coaching", {
        body: {
          answers: {
            objectif: p.objectif,
            sujet: p.sujet || null,
            canal: p.canal,
            format: p.format,
            content_type: "auto",
            ton_envie: "auto",
          },
          intensity: p.intensity,
          workspace_id: workspaceId !== user?.id ? workspaceId : undefined,
        },
      }, 120000);
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
      setStep("result");
    } catch (e: any) {
      console.error("[ContentCoaching] Error:", e);
      const msg = e?.isTimeout
        ? "La génération des idées prend trop de temps. Réessaie."
        : (typeof e?.message === "string" ? e.message : "Erreur lors de l'analyse.");
      toast.error(msg);
      setStep(2);
    }
  };

  const regenerateLens = async (idx: number, idea: ContentIdea, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (!idea.lens || regeneratingIdx !== null) return;
    const prevIdea = result?.ideas?.[idx];
    if (!prevIdea) return;
    setRegeneratingIdx(idx);
    try {
      const { data, error } = await invokeWithTimeout("content-coaching", {
        body: {
          answers: {
            objectif,
            sujet: sujet || null,
            canal,
            format,
            content_type: "auto",
            ton_envie: "auto",
          },
          workspace_id: workspaceId !== user?.id ? workspaceId : undefined,
          regenerate_lens: idea.lens,
        },
      }, 120000);
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const newIdea: ContentIdea | undefined = data?.ideas?.[0];
      if (!newIdea) throw new Error("Réponse invalide");
      setResult((prev) =>
        prev && prev.ideas
          ? { ...prev, ideas: prev.ideas.map((it, i) => (i === idx ? newIdea : it)) }
          : prev,
      );
      setSelectedIdea((cur) => (cur === prevIdea ? null : cur));
      setSavedIdeas((prev) => {
        if (!prev.has(idx)) return prev;
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    } catch (err: any) {
      console.error("[ContentCoaching] regenerateLens error:", err);
      const msg = err?.isTimeout
        ? "La régénération prend trop de temps. Réessaie."
        : (typeof err?.message === "string" ? err.message : "Erreur lors de la régénération.");
      toast.error(msg);
    } finally {
      setRegeneratingIdx(null);
    }
  };



  const handleGo = () => {
    if (!result) return;

    let finalSubject: string;
    let finalObjective: string;

    if (selectedIdea) {
      finalSubject = selectedIdea.subject;
      finalObjective = selectedIdea.objective_tag || objectif;
    } else if (result.ideas?.length) {
      finalSubject = result.ideas[0].subject;
      finalObjective = result.ideas[0].objective_tag || objectif;
    } else {
      finalSubject = selectedSubject || result.recommended_subject || "";
      finalObjective = result.redirect_params?.objective || objectif;
    }

    // Resolve format from (in priority order): user-picked format, redirect_route hint,
    // recommended_format. Then normalize to a canonical value. If we can't, send
    // the user to the format step instead of crashing later with "Format non supporté".
    let rawFormat: string = format || "";
    if (!rawFormat || rawFormat === "auto") {
      if (result.redirect_route) {
        const routeMatch = result.redirect_route.match(/format=(\w+)/);
        if (routeMatch) rawFormat = routeMatch[1];
      }
    }
    if (!rawFormat || rawFormat === "auto") {
      rawFormat = (result.recommended_format || "").toLowerCase();
    }
    const finalFormat = normalizeFormat(rawFormat);

    if (onSelect) {
      if (!finalFormat) {
        // Unknown format: bounce to /creer with subject/objective so the user
        // can pick the format manually instead of triggering a generation crash.
        onOpenChange(false);
        const params = new URLSearchParams();
        if (finalSubject) params.set("sujet", finalSubject);
        if (finalObjective) params.set("objectif", finalObjective);
        navigate(`/creer${params.toString() ? `?${params}` : ""}`);
        toast.info("Choisis un format pour continuer.");
        return;
      }
      onSelect({
        subject: finalSubject,
        format: finalFormat,
        objective: finalObjective,
        carouselSubMode: finalFormat === "carousel" ? (carouselSubMode || "text") : undefined,
      });
      onOpenChange(false);
    } else {
      onOpenChange(false);
      const baseRoute = "/creer";
      const existingParams = new URLSearchParams();
      if (finalFormat) existingParams.set("format", finalFormat);
      if (finalSubject) existingParams.set("sujet", finalSubject);
      if (finalObjective) existingParams.set("objectif", finalObjective);
      if (finalFormat === "carousel" && carouselSubMode) existingParams.set("carouselSubMode", carouselSubMode);
      navigate(`${baseRoute}?${existingParams.toString()}`);
      if (!finalFormat) toast.info("Choisis un format pour continuer.");
    }
  };

  const handleSelectAlternative = (alt: string) => {
    setSelectedSubject(alt);
  };

  const totalSteps = 2;

  return (
    <CoachingShell
      open={open}
      onOpenChange={handleOpenChange}
      title="Coach contenu"
      description="Je t'aide à trouver quoi poster et comment."
      emoji="💡"
    >
      <div className="py-2">
        {/* Step indicators */}
        {typeof step === "number" && (
          <div className="flex gap-1 mb-5">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
              <div key={s} className={`h-1.5 rounded-full flex-1 transition-colors ${
                s < step ? "bg-primary" : s === step ? "bg-primary/60" : "bg-muted"
              }`} />
            ))}
          </div>
        )}

        {/* ─── Step 1: Objectif + Sujet fusionnés ─── */}
        {step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-sm font-medium text-foreground">C'est quoi ton objectif avec ce contenu ?</p>
            <div className="grid grid-cols-2 gap-2">
              {OBJECTIFS.map(o => (
                <button
                  key={o.id}
                  onClick={() => handleObjectifSelect(o.id)}
                  className="rounded-xl border-2 border-border bg-card p-4 text-center hover:border-primary hover:shadow-sm transition-all group"
                >
                  <span className="text-2xl block mb-1">{o.emoji}</span>
                  <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{o.label}</span>
                </button>
              ))}
            </div>

            {/* Optional subject field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Un sujet en tête ? (facultatif)</label>
              <Textarea
                value={sujet}
                onChange={(e) => setSujet(e.target.value)}
                placeholder="Ex : ma pire erreur de communication..."
                rows={2}
              />
            </div>

            {/* Surprise shortcut */}
            <button
              onClick={handleSurprise}
              className="w-full rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-3 text-center transition-all hover:border-primary/50 hover:bg-primary/10 group"
            >
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-primary">Surprise — l'IA décide tout</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">L'IA choisit l'objectif, le format et l'angle pour toi</p>
            </button>
          </div>
        )}

        {/* ─── Step 2: Canal + Format fusionnés ─── */}
        {step === 2 && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-sm font-medium text-foreground">Quel canal et format ?</p>

            {CANAL_FORMATS.map(group => (
              <div key={group.canal} className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <span>{group.emoji}</span> {group.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group.formats.map(f => {
                    const isSelected = canal === group.canal && format === f.id;
                    return (
                      <button
                        key={`${group.canal}-${f.id}`}
                        onClick={() => handleFormatSelect(group.canal, f.id)}
                        className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-foreground hover:border-primary/40 hover:text-primary"
                        }`}
                      >
                        {f.emoji} {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Inline carousel sub-mode picker */}
            {format === "carousel" && carouselSubMode === null && (
              <div className="space-y-2 animate-fade-in rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold text-foreground">Quel type de carrousel ?</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    { id: "text" as const, emoji: "📝", label: "Texte", desc: "L'IA rédige tes slides" },
                    { id: "photo" as const, emoji: "📸", label: "Full photo", desc: "Photos + texte par-dessus" },
                    { id: "mix" as const, emoji: "✨", label: "Mixte", desc: "Photos + slides texte" },
                    { id: "pure_photo" as const, emoji: "🖼️", label: "Juste photo", desc: "Photos seules, aucun texte" },
                  ]).map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => handleCarouselSubSelect(sub.id)}
                      className="rounded-xl border-2 border-border bg-card p-3 text-center transition-all hover:border-primary/40"
                    >
                      <span className="text-lg block mb-0.5">{sub.emoji}</span>
                      <span className="text-xs font-semibold text-foreground">{sub.label}</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{sub.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={() => { setStep(1); setCanal(""); setFormat(""); setCarouselSubMode(null); }} className="gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Retour
            </Button>
          </div>
        )}

        {/* ─── Loading ─── */}
        {step === "loading" && (
          <div className="space-y-3 animate-fade-in py-3">
            <div className="space-y-1.5">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-muted/30 p-2.5 animate-pulse"
                  style={{ animationDelay: `${i * 150}ms`, animationFillMode: "backwards" }}
                >
                  <div className="h-2.5 bg-muted rounded-full w-2/3" />
                </div>
              ))}
            </div>
            <LoadingMessage />
          </div>
        )}

        {/* ─── Result ─── */}
        {step === "result" && result && (
          <div className="space-y-4 animate-fade-in">
            {result.ideas?.length ? (
              <>
                <p className="text-sm font-medium text-foreground">4 idées pour toi. Choisis celle qui te fait vibrer :</p>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {result.ideas.map((idea, i) => {
                    const isSelected = selectedIdea === idea;
                    const objectiveEmojis: Record<string, string> = {
                      visibilite: "👀",
                      engagement: "🤝",
                      vente: "💰",
                      credibilite: "🎓",
                    };
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedIdea(isSelected ? null : idea)}
                        className={`w-full text-left rounded-xl border-2 p-3 transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border bg-card hover:border-primary/40"
                        }`}
                      >
                        <div className={regeneratingIdx === i ? "opacity-60 transition-opacity" : "transition-opacity"}>
                          <p className={`text-sm font-bold leading-snug ${isSelected ? "text-primary" : "text-foreground"}`}>
                            {idea.subject}
                          </p>
                          {idea.angle && (
                            <p
                              className={`mt-2 text-[11px] leading-relaxed text-muted-foreground border-l-2 border-primary/40 pl-2 ${
                                isSelected ? "" : "line-clamp-3"
                              }`}
                            >
                              {idea.angle}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {idea.boldness && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              idea.boldness === "provoc" ? "bg-rose-pale text-primary" :
                              idea.boldness === "bold" ? "bg-[#FFF9DB] text-[#92400E]" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {idea.boldness === "provoc" ? "💥 Provoc" : idea.boldness === "bold" ? "🔥 Audacieux" : "🌱 Sûr"}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {objectiveEmojis[idea.objective_tag] || "✨"} {idea.objective_tag}
                          </span>
                          {!isSelected && (
                            <span className="ml-auto text-[10px] text-muted-foreground/70">Voir le détail →</span>
                          )}
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => handleSaveIdea(idea, i, e)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSaveIdea(idea, i, e as any);
                              }
                            }}
                            title={savedIdeas.has(i) ? "Idée sauvegardée" : "Sauvegarder dans Mes idées"}
                            className={`${isSelected ? "" : ""} ${!isSelected ? "" : "ml-auto"} inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all ${
                              savedIdeas.has(i)
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
                            }`}
                          >
                            {savedIdeas.has(i) ? (
                              <><BookmarkCheck className="h-3 w-3" /> Sauvegardée</>
                            ) : (
                              <><Bookmark className="h-3 w-3" /> Sauvegarder</>
                            )}
                          </span>
                        </div>
                        {isSelected && idea.why_it_works && (
                          <div className="mt-3 pt-3 border-t border-border/50 animate-fade-in">
                            <p className="text-[11px] text-muted-foreground italic">💡 {idea.why_it_works}</p>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-primary/20 bg-[hsl(var(--rose-pale))] p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sujet recommandé</p>
                  <p className="text-sm font-bold text-foreground">{selectedSubject || result.recommended_subject}</p>
                </div>
                {result.subject_alternatives && result.subject_alternatives.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">Autres idées :</p>
                    {[result.recommended_subject, ...result.subject_alternatives].map((alt, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectAlternative(alt!)}
                        className={`w-full text-left rounded-lg border p-2.5 text-sm transition-all ${
                          (selectedSubject || result.recommended_subject) === alt
                            ? "border-primary bg-primary/5 font-medium text-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                )}
                {result.quick_brief && (
                  <div className="rounded-xl border border-border bg-card p-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">Mini-brief</p>
                    <p className="text-sm text-foreground leading-relaxed">{result.quick_brief}</p>
                  </div>
                )}
              </>
            )}

            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Format recommandé</p>
              <p className="text-sm font-bold text-foreground">{result.recommended_format}</p>
              <p className="text-xs text-muted-foreground italic">{result.format_reason}</p>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => generateIdeas()}
                className="gap-1.5"
              >
                <RefreshCw className="h-4 w-4" /> Autres idées
              </Button>
              {result.ideas?.length ? (
                <Button
                  variant="outline"
                  onClick={() => generateIdeas({ objectif, canal, format, sujet, intensity: "bold" })}
                  className="gap-1.5"
                  title="Sors des sentiers battus — idées plus audacieuses"
                >
                  🔥 Pousse plus loin
                </Button>
              ) : null}
              <Button
                onClick={handleGo}
                disabled={!!(result.ideas?.length && !selectedIdea)}
                className="flex-1 gap-2 text-base h-12"
              >
                <Rocket className="h-5 w-5" /> C'est parti, on crée !
              </Button>
            </div>
            {result.ideas?.length && !selectedIdea && (
              <p className="text-xs text-center text-muted-foreground">Choisis une idée pour continuer</p>
            )}
          </div>
        )}
      </div>
    </CoachingShell>
  );
}
