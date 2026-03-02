import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import CoachingShell from "@/components/coaching/CoachingShell";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Loader2, ArrowLeft, ArrowRight, Rocket } from "lucide-react";
import { toast } from "sonner";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | "loading" | "result";

interface ContentResult {
  recommended_subject: string;
  subject_alternatives: string[];
  recommended_format: string;
  format_reason: string;
  redirect_route: string;
  redirect_params: { subject: string; objective: string };
  quick_brief: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
    { id: "post_texte", emoji: "📝", label: "Post texte" },
    { id: "carrousel", emoji: "🎠", label: "Carrousel" },
    { id: "reel", emoji: "🎬", label: "Reel" },
    { id: "story", emoji: "📱", label: "Story" },
  ],
  linkedin: [
    { id: "post_texte", emoji: "📝", label: "Post texte" },
    { id: "carrousel", emoji: "🎠", label: "Carrousel" },
  ],
};

const CONTENT_TYPES_BY_FORMAT: Record<string, { id: string; emoji: string; label: string }[]> = {
  carrousel: [
    { id: "mythe_realite", emoji: "🔍", label: "Mythe vs Réalité" },
    { id: "liste_tips", emoji: "📋", label: "Liste / Tips" },
    { id: "tutoriel", emoji: "🛠️", label: "Tutoriel pas à pas" },
    { id: "avant_apres", emoji: "✨", label: "Avant / Après" },
    { id: "storytelling", emoji: "📖", label: "Storytelling" },
    { id: "checklist", emoji: "✅", label: "Checklist" },
  ],
  post_texte: [
    { id: "storytelling", emoji: "📖", label: "Storytelling" },
    { id: "opinion", emoji: "🔥", label: "Opinion / Prise de position" },
    { id: "conseil", emoji: "💡", label: "Conseil actionnable" },
    { id: "temoignage", emoji: "💬", label: "Témoignage client" },
    { id: "coulisses", emoji: "🎬", label: "Coulisses" },
    { id: "lecon_apprise", emoji: "🎓", label: "Leçon apprise" },
  ],
  reel: [
    { id: "tutoriel_rapide", emoji: "⚡", label: "Tutoriel rapide" },
    { id: "behind_scenes", emoji: "🎬", label: "Behind the scenes" },
    { id: "trend", emoji: "🎵", label: "Tendance / Trend" },
    { id: "faq", emoji: "❓", label: "FAQ / Question récurrente" },
    { id: "transition", emoji: "✨", label: "Transition avant/après" },
  ],
  story: [
    { id: "sondage", emoji: "📊", label: "Sondage / Quiz" },
    { id: "behind_scenes", emoji: "🎬", label: "Behind the scenes" },
    { id: "teasing", emoji: "👀", label: "Teasing" },
    { id: "qna", emoji: "💬", label: "Q&A / Boîte à questions" },
    { id: "quotidien", emoji: "☀️", label: "Tranche de vie" },
  ],
};

const TONS = [
  { id: "intime", emoji: "💛", label: "Intime et personnel" },
  { id: "expert", emoji: "🧠", label: "Expert et informatif" },
  { id: "engage", emoji: "🔥", label: "Engagé et provoc" },
];

export default function ContentCoachingDialog({ open, onOpenChange }: Props) {
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
    // If content types exist for this format, go to step 5, else skip to step 6 (ton)
    const types = CONTENT_TYPES_BY_FORMAT[id];
    if (types?.length) {
      setStep(5);
    } else {
      setStep(6);
    }
  };

  const handleContentTypeSelect = (id: string) => {
    setContentType(id);
    setStep(6);
  };

  const handleTonSelect = async (id: string) => {
    setTonEnvie(id);
    setStep("loading");

    try {
      const { data, error } = await supabase.functions.invoke("content-coaching", {
        body: {
          answers: {
            objectif,
            sujet: hasSujet ? sujet : null,
            canal,
            format,
            content_type: contentType || null,
            ton_envie: id,
          },
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setResult(data);
      setStep("result");
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'analyse");
      setStep(6);
    }
  };

  const handleGo = () => {
    if (!result) return;
    const finalSubject = selectedSubject || result.recommended_subject;
    const params = new URLSearchParams({
      subject: finalSubject,
      objective: result.redirect_params?.objective || objectif,
    });
    onOpenChange(false);
    navigate(`${result.redirect_route}?${params.toString()}`);
  };

  const handleSelectAlternative = (alt: string) => {
    setSelectedSubject(alt);
  };

  const isEducatif = objectif === "eduquer";
  const currentContentTypes = CONTENT_TYPES_BY_FORMAT[format] || [];
  const totalSteps = currentContentTypes.length > 0 ? 6 : 5;

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
                    className="rounded-xl border-2 border-border bg-card p-4 text-center hover:border-primary hover:shadow-sm transition-all group"
                  >
                    <span className="text-2xl block mb-1">{f.emoji}</span>
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{f.label}</span>
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep(3)} className="gap-1">
                <ArrowLeft className="h-3.5 w-3.5" /> Retour
              </Button>
            </div>
          )}

          {/* Step 5: Content Type */}
          {step === 5 && currentContentTypes.length > 0 && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-sm font-medium text-foreground">Quel type de contenu ?</p>
              <div className="grid grid-cols-2 gap-2">
                {currentContentTypes.map(ct => (
                  <button
                    key={ct.id}
                    onClick={() => handleContentTypeSelect(ct.id)}
                    className="rounded-xl border-2 border-border bg-card p-3 text-center hover:border-primary hover:shadow-sm transition-all group"
                  >
                    <span className="text-xl block mb-0.5">{ct.emoji}</span>
                    <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{ct.label}</span>
                  </button>
                ))}
              </div>
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
              <Button variant="ghost" size="sm" onClick={() => setStep(currentContentTypes.length > 0 ? 5 : 4)} className="gap-1">
                <ArrowLeft className="h-3.5 w-3.5" /> Retour
              </Button>
            </div>
          )}

          {/* Loading */}
          {step === "loading" && (
            <div className="py-10 text-center animate-fade-in">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">L'IA prépare ton brief…</p>
              <p className="text-xs text-muted-foreground mt-1">Quelques secondes.</p>
            </div>
          )}

          {/* Result */}
          {step === "result" && result && (
            <div className="space-y-4 animate-fade-in">
              {/* Subject */}
              <div className="rounded-xl border border-primary/20 bg-[hsl(var(--rose-pale))] p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sujet recommandé</p>
                <p className="text-sm font-bold text-foreground">{selectedSubject || result.recommended_subject}</p>
              </div>

              {/* Alternatives (if no subject was provided) */}
              {!hasSujet && result.subject_alternatives?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">Autres idées :</p>
                  {[result.recommended_subject, ...result.subject_alternatives].map((alt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectAlternative(alt)}
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

              {/* Format */}
              <div className="rounded-xl border border-border bg-card p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Format recommandé</p>
                <p className="text-sm font-bold text-foreground">{result.recommended_format}</p>
                <p className="text-xs text-muted-foreground italic">{result.format_reason}</p>
              </div>

              {/* Brief */}
              <div className="rounded-xl border border-border bg-card p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Mini-brief</p>
                <p className="text-sm text-foreground leading-relaxed">{result.quick_brief}</p>
              </div>

              {/* CTA */}
              <Button onClick={handleGo} className="w-full gap-2 text-base h-12">
                <Rocket className="h-5 w-5" /> C'est parti, on crée !
              </Button>
            </div>
          )}
        </div>
    </CoachingShell>
  );
}
