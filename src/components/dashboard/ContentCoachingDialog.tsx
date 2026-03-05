import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import CoachingShell from "@/components/coaching/CoachingShell";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Loader2, ArrowLeft, ArrowRight, Rocket, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | "loading" | "result";

interface ContentIdea {
  subject: string;
  hook: string;
  angle: string;
  objective_tag: string;
  why_it_works: string;
  brief: string;
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
  onSelect?: (data: { subject: string; format: string; objective: string; carouselSubMode?: "text" | "photo" | "mix" }) => void;
}

const OBJECTIFS = [
  { id: "inspirer", emoji: "🌟", label: "Inspirer" },
  { id: "eduquer", emoji: "📚", label: "Éduquer" },
  { id: "vendre", emoji: "💰", label: "Vendre" },
  { id: "creer_du_lien", emoji: "💬", label: "Créer du lien" },
];

const CANAUX = [
  { id: "instagram", emoji: "📸", label: "Instagram" },
  { id: "linkedin", emoji: "💼", label: "LinkedIn" },
];

const FORMATS_BY_CANAL: Record<string, { id: string; emoji: string; label: string }[]> = {
  instagram: [
    { id: "post", emoji: "📝", label: "Post" },
    { id: "carousel", emoji: "🎠", label: "Carrousel" },
    { id: "reel", emoji: "🎬", label: "Reel" },
    { id: "story", emoji: "📱", label: "Story" },
  ],
  linkedin: [
    { id: "post", emoji: "📝", label: "Post" },
    { id: "carousel", emoji: "🎠", label: "Carrousel" },
  ],
};

const EDITORIAL_ANGLES = [
  { id: "enquete", emoji: "🔎", label: "Enquête / Décryptage", desc: "Analyser un phénomène avec un angle inédit" },
  { id: "test", emoji: "🧪", label: "Test grandeur nature", desc: "Tester un conseil et donner ton verdict" },
  { id: "coup-de-gueule", emoji: "🔥", label: "Coup de gueule", desc: "Taper sur une frustration partagée" },
  { id: "mythe", emoji: "💥", label: "Mythe à déconstruire", desc: "Démonter une croyance répandue" },
  { id: "storytelling", emoji: "📖", label: "Storytelling + leçon", desc: "Raconter une galère et en tirer une leçon" },
  { id: "histoire-cliente", emoji: "💬", label: "Histoire cliente", desc: "Illustrer un blocage via un cas réel" },
  { id: "surf-actu", emoji: "📡", label: "Surf sur l'actu", desc: "Rebondir sur une actualité" },
  { id: "regard-philo", emoji: "🧠", label: "Regard philo / sociétal", desc: "Prendre de la hauteur, côté France Culture" },
  { id: "conseil-contre-intuitif", emoji: "🔄", label: "Conseil contre-intuitif", desc: "Aller à contre-courant" },
  { id: "before-after", emoji: "✨", label: "Before / After", desc: "Montrer une évolution concrète" },
  { id: "identification", emoji: "🪞", label: "Identification / Quotidien", desc: "Situations où l'audience se reconnaît" },
  { id: "build-in-public", emoji: "🏗️", label: "Build in public", desc: "Partager les coulisses en transparence" },
  { id: "analyse-profondeur", emoji: "📊", label: "Analyse en profondeur", desc: "Décortiquer un sujet avec des données" },
];

const RECOMMENDED_BY_OBJECTIVE: Record<string, string[]> = {
  inspirer: ["storytelling", "regard-philo", "build-in-public", "before-after"],
  eduquer: ["enquete", "mythe", "analyse-profondeur", "conseil-contre-intuitif", "test"],
  vendre: ["histoire-cliente", "before-after", "storytelling", "test"],
  creer_du_lien: ["identification", "coup-de-gueule", "build-in-public", "surf-actu", "storytelling"],
};

const TONS = [
  { id: "intime", emoji: "💛", label: "Intime et personnel" },
  { id: "expert", emoji: "🧠", label: "Expert et informatif" },
  { id: "engage", emoji: "🔥", label: "Engagé et provoc" },
];

function LoadingMessage() {
  const messages = [
    "Je fouille dans ton branding…",
    "Je cherche des angles originaux…",
    "Je formule 6 idées différentes…",
    "J'écris un hook percutant pour chaque…",
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

export default function ContentCoachingDialog({ open, onOpenChange, onSelect }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [objectif, setObjectif] = useState("");
  const [hasSujet, setHasSujet] = useState<boolean | null>(null);
  const [sujet, setSujet] = useState("");
  const [canal, setCanal] = useState("");
  const [format, setFormat] = useState("");
  const [contentType, setContentType] = useState("");
  const [tonEnvie, setTonEnvie] = useState("");
  const [result, setResult] = useState<ContentResult | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<ContentIdea | null>(null);
  const [carouselSubMode, setCarouselSubMode] = useState<"text" | "photo" | "mix" | null>(null);

  const reset = () => {
    setStep(1);
    setObjectif("");
    setHasSujet(null);
    setSujet("");
    setCanal("");
    setFormat("");
    setContentType("");
    setTonEnvie("");
    setResult(null);
    setSelectedSubject(null);
    setSelectedIdea(null);
    setCarouselSubMode(null);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleObjectifSelect = (id: string) => {
    setObjectif(id);
    setStep(2);
  };

  const handleSujetNext = () => {
    setStep(3);
  };

  const handleNoSujet = () => {
    setHasSujet(false);
    setSujet("");
    setStep(3);
  };

  const handleCanalSelect = (id: string) => {
    setCanal(id);
    setFormat("");
    setContentType("");
    setStep(4);
  };

  const handleFormatSelect = (id: string) => {
    setFormat(id);
    setContentType("");
    if (id === "carousel") {
      setCarouselSubMode(null);
    } else {
      setStep(5);
    }
  };

  const handleContentTypeSelect = (id: string) => {
    setContentType(id);
    setStep(6);
  };

  const handleTonSelect = async (id: string) => {
    setTonEnvie(id);
    await generateIdeas(id);
  };

  const generateIdeas = async (ton?: string) => {
    const tonToUse = ton || tonEnvie;
    if (!tonToUse) return;
    setStep("loading");
    setResult(null);
    setSelectedIdea(null);
    setSelectedSubject(null);

    try {
      const { data, error } = await invokeWithTimeout("content-coaching", {
        body: {
          answers: {
            objectif,
            sujet: hasSujet ? sujet : null,
            canal,
            format,
            content_type: contentType || null,
            ton_envie: tonToUse,
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
      setStep("result");
    } catch (e: any) {
      toast.error(e?.isTimeout ? "Ça prend plus longtemps que prévu. Réessaie." : e.message || "Erreur lors de l'analyse");
      setStep(6);
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

    // Extract format from redirect_route
    let finalFormat = format || "";
    if (result.redirect_route) {
      const routeMatch = result.redirect_route.match(/format=(\w+)/);
      if (routeMatch) finalFormat = routeMatch[1];
    }

    if (onSelect) {
      // Callback mode (used when already on /creer)
      // Call onSelect BEFORE closing dialog to avoid unmount race
      onSelect({ subject: finalSubject, format: finalFormat, objective: finalObjective, carouselSubMode: finalFormat === "carousel" ? (carouselSubMode || "text") : undefined });
      onOpenChange(false);
    } else {
      // Navigate mode (used from Dashboard)
      onOpenChange(false);
      const baseRoute = result.redirect_route?.split("?")[0] || "/creer";
      const existingParams = new URLSearchParams(result.redirect_route?.split("?")[1] || "");
      existingParams.set("subject", finalSubject);
      existingParams.set("objective", finalObjective);
      if (carouselSubMode) existingParams.set("carouselSubMode", carouselSubMode);
      navigate(`${baseRoute}?${existingParams.toString()}`);
    }
  };

  const handleSelectAlternative = (alt: string) => {
    setSelectedSubject(alt);
  };

  const isEducatif = objectif === "eduquer";
  const totalSteps = 6;

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

          {/* Step 1: Objectif */}
          {step === 1 && (
            <div className="space-y-3 animate-fade-in">
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
            </div>
          )}

          {/* Step 2: Sujet */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-sm font-medium text-foreground">Tu as un sujet en tête ?</p>

              {hasSujet === null && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setHasSujet(true)}
                    className="rounded-xl border-2 border-border bg-card p-4 text-center hover:border-primary hover:shadow-sm transition-all group"
                  >
                    <span className="text-2xl block mb-1">💡</span>
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Oui, j'ai une idée</span>
                  </button>
                  <button
                    onClick={handleNoSujet}
                    className="rounded-xl border-2 border-border bg-card p-4 text-center hover:border-primary hover:shadow-sm transition-all group"
                  >
                    <span className="text-2xl block mb-1">🤷</span>
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Non, aide-moi</span>
                  </button>
                </div>
              )}

              {hasSujet === true && (
                <div className="space-y-3">
                  <Textarea
                    value={sujet}
                    onChange={(e) => setSujet(e.target.value)}
                    placeholder="Ex : ma pire erreur de communication..."
                    rows={2}
                  />
                  <div className="flex justify-between">
                    <Button variant="ghost" size="sm" onClick={() => { setHasSujet(null); setSujet(""); }} className="gap-1">
                      <ArrowLeft className="h-3.5 w-3.5" /> Retour
                    </Button>
                    <Button size="sm" onClick={handleSujetNext} disabled={!sujet.trim()} className="gap-1">
                      Suivant <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {hasSujet === null && (
                <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Retour
                </Button>
              )}
            </div>
          )}

          {/* Step 3: Canal */}
          {step === 3 && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-sm font-medium text-foreground">Sur quel canal tu veux publier ?</p>
              <div className="grid grid-cols-2 gap-2">
                {CANAUX.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleCanalSelect(c.id)}
                    className="rounded-xl border-2 border-border bg-card p-4 text-center hover:border-primary hover:shadow-sm transition-all group"
                  >
                    <span className="text-2xl block mb-1">{c.emoji}</span>
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{c.label}</span>
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="gap-1">
                <ArrowLeft className="h-3.5 w-3.5" /> Retour
              </Button>
            </div>
          )}

          {/* Step 4: Format */}
          {step === 4 && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-sm font-medium text-foreground">Quel format tu sens le mieux aujourd'hui ?</p>
              {isEducatif && (
                <p className="text-xs text-primary bg-primary/5 border border-primary/10 rounded-lg px-3 py-2">
                  💡 Pour un contenu éducatif, le carrousel fonctionne très bien
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {(FORMATS_BY_CANAL[canal] || []).map(f => (
                  <button
                    key={f.id}
                    onClick={() => handleFormatSelect(f.id)}
                    className={`rounded-xl border-2 p-4 text-center transition-all group ${
                      format === f.id
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-card hover:border-primary hover:shadow-sm"
                    }`}
                  >
                    <span className="text-2xl block mb-1">{f.emoji}</span>
                    <span className={`text-sm font-semibold transition-colors ${
                      format === f.id ? "text-primary" : "text-foreground group-hover:text-primary"
                    }`}>{f.label}</span>
                  </button>
                ))}
              </div>

              {/* Sous-choix carrousel texte / photo */}
              {format === "carousel" && (
                <div className="space-y-2 animate-fade-in">
                  <p className="text-xs font-semibold text-muted-foreground">Quel type de carrousel ?</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => { setCarouselSubMode("text"); setStep(5); }}
                      className={`rounded-xl border-2 p-3 text-center transition-all ${
                        carouselSubMode === "text"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <span className="text-lg block mb-0.5">📝</span>
                      <span className="text-xs font-semibold text-foreground">Texte</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">L'IA rédige tes slides</p>
                    </button>
                    <button
                      onClick={() => { setCarouselSubMode("photo"); setStep(5); }}
                      className={`rounded-xl border-2 p-3 text-center transition-all ${
                        carouselSubMode === "photo"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <span className="text-lg block mb-0.5">📸</span>
                      <span className="text-xs font-semibold text-foreground">Photo</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Tes photos en plein écran</p>
                    </button>
                    <button
                      onClick={() => { setCarouselSubMode("mix"); setStep(5); }}
                      className={`rounded-xl border-2 p-3 text-center transition-all ${
                        carouselSubMode === "mix"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <span className="text-lg block mb-0.5">✨</span>
                      <span className="text-xs font-semibold text-foreground">Mixte</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Photos intégrées + slides texte</p>
                    </button>
                  </div>
                </div>
              )}

              <Button variant="ghost" size="sm" onClick={() => setStep(3)} className="gap-1">
                <ArrowLeft className="h-3.5 w-3.5" /> Retour
              </Button>
            </div>
          )}

          {/* Step 5: Angle éditorial */}
          {step === 5 && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-sm font-medium text-foreground">Quel angle éditorial ?</p>

              {(() => {
                const recommendedIds = RECOMMENDED_BY_OBJECTIVE[objectif] || [];
                const recommended = EDITORIAL_ANGLES.filter(a => recommendedIds.includes(a.id));
                const others = EDITORIAL_ANGLES.filter(a => !recommendedIds.includes(a.id));

                return (
                  <>
                    {recommended.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-primary uppercase tracking-wider">📌 Recommandés pour toi</p>
                        <div className="grid grid-cols-2 gap-2">
                          {recommended.map(a => (
                            <button
                              key={a.id}
                              onClick={() => handleContentTypeSelect(a.id)}
                              className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 text-center hover:border-primary hover:shadow-sm transition-all group"
                            >
                              <span className="text-xl block mb-0.5">{a.emoji}</span>
                              <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{a.label}</span>
                              <span className="text-[10px] text-muted-foreground block mt-0.5 leading-tight">{a.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {others.length > 0 && (
                      <details className="group">
                        <summary className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors py-1">
                          Voir tous les angles ({others.length} de plus) ▾
                        </summary>
                        <div className="grid grid-cols-2 gap-2 mt-2 animate-fade-in">
                          {others.map(a => (
                            <button
                              key={a.id}
                              onClick={() => handleContentTypeSelect(a.id)}
                              className="rounded-xl border-2 border-border bg-card p-3 text-center hover:border-primary hover:shadow-sm transition-all group"
                            >
                              <span className="text-xl block mb-0.5">{a.emoji}</span>
                              <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{a.label}</span>
                              <span className="text-[10px] text-muted-foreground block mt-0.5 leading-tight">{a.desc}</span>
                            </button>
                          ))}
                        </div>
                      </details>
                    )}

                    <button
                      onClick={() => { setContentType(""); setStep(6); }}
                      className="w-full text-xs text-muted-foreground hover:text-primary transition-colors py-1"
                    >
                      L'IA choisit pour moi →
                    </button>
                  </>
                );
              })()}

              <Button variant="ghost" size="sm" onClick={() => setStep(4)} className="gap-1">
                <ArrowLeft className="h-3.5 w-3.5" /> Retour
              </Button>
            </div>
          )}

          {/* Step 6: Ton */}
          {step === 6 && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-sm font-medium text-foreground">Quel ton pour ce contenu ?</p>
              <div className="space-y-2">
                {TONS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleTonSelect(t.id)}
                    className="w-full rounded-xl border-2 border-border bg-card p-3 text-left hover:border-primary hover:shadow-sm transition-all group flex items-center gap-3"
                  >
                    <span className="text-xl">{t.emoji}</span>
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{t.label}</span>
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep(5)} className="gap-1">
                <ArrowLeft className="h-3.5 w-3.5" /> Retour
              </Button>
            </div>
          )}

          {/* Loading */}
          {step === "loading" && (
            <div className="space-y-4 animate-fade-in py-4">
              {/* Skeleton des 6 idées */}
              <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-border bg-muted/30 p-3.5 animate-pulse"
                    style={{ animationDelay: `${i * 150}ms`, animationFillMode: "backwards" }}
                  >
                    <div className="h-3.5 bg-muted rounded-full w-3/4 mb-2" />
                    <div className="flex gap-2">
                      <div className="h-2.5 bg-muted rounded-full w-1/3" />
                      <div className="h-2.5 bg-muted rounded-full w-1/4" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Message rotatif */}
              <LoadingMessage />

              {/* Tip */}
              <p className="text-[11px] text-muted-foreground text-center px-4">
                💡 L'IA analyse ton branding pour proposer des idées vraiment adaptées à ton univers.
              </p>
            </div>
          )}

          {/* Result */}
          {step === "result" && result && (
            <div className="space-y-4 animate-fade-in">
              {/* Ideas grid */}
              {result.ideas?.length ? (
                <>
                  <p className="text-sm font-medium text-foreground">6 idées pour toi. Choisis celle qui te fait vibrer :</p>
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
                          className={`w-full text-left rounded-xl border-2 p-3.5 transition-all ${
                            isSelected
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-border bg-card hover:border-primary/40"
                          }`}
                        >
                          <p className={`text-sm font-bold leading-snug ${isSelected ? "text-primary" : "text-foreground"}`}>
                            « {idea.hook} »
                          </p>
                          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                            {idea.subject}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              {idea.angle}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {objectiveEmojis[idea.objective_tag] || "✨"} {idea.objective_tag}
                            </span>
                          </div>
                          {isSelected && (
                            <div className="mt-3 pt-3 border-t border-border/50 space-y-2 animate-fade-in">
                              <p className="text-xs text-foreground leading-relaxed">{idea.brief}</p>
                              <p className="text-[11px] text-muted-foreground italic">{idea.why_it_works}</p>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                /* Fallback : ancien format */
                <>
                  <div className="rounded-xl border border-primary/20 bg-[hsl(var(--rose-pale))] p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sujet recommandé</p>
                    <p className="text-sm font-bold text-foreground">{selectedSubject || result.recommended_subject}</p>
                  </div>
                  {!hasSujet && result.subject_alternatives && result.subject_alternatives.length > 0 && (
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

              {/* Format info */}
              <div className="rounded-xl border border-border bg-card p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Format recommandé</p>
                <p className="text-sm font-bold text-foreground">{result.recommended_format}</p>
                <p className="text-xs text-muted-foreground italic">{result.format_reason}</p>
              </div>

              {/* CTA + Regenerate */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => generateIdeas()}
                  className="gap-1.5"
                >
                  <RefreshCw className="h-4 w-4" /> Autres idées
                </Button>
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
