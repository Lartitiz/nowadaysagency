import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Loader2, ArrowLeft, ArrowRight, Rocket } from "lucide-react";
import { toast } from "sonner";

type Step = 1 | 2 | 3 | 4 | "loading" | "result";

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

const FORMATS = [
  { id: "post_texte", emoji: "📝", label: "Post texte" },
  { id: "carrousel", emoji: "🎠", label: "Carrousel" },
  { id: "reel", emoji: "🎬", label: "Reel" },
  { id: "story", emoji: "📱", label: "Story" },
];

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
  const [format, setFormat] = useState("");
  const [tonEnvie, setTonEnvie] = useState("");
  const [result, setResult] = useState<ContentResult | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  const reset = () => {
    setStep(1);
    setObjectif("");
    setHasSujet(null);
    setSujet("");
    setFormat("");
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

  const handleFormatSelect = (id: string) => {
    setFormat(id);
    setStep(4);
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
            format: id,
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
      setStep(4);
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {step === "result" ? "🚀 Ton brief est prêt !" : "🤔 Je sais pas quoi poster…"}
          </DialogTitle>
          <DialogDescription className="sr-only">Assistant de création de contenu</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {/* Step indicators */}
          {typeof step === "number" && (
            <div className="flex gap-1 mb-5">
              {[1, 2, 3, 4].map(s => (
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

          {/* Step 3: Format */}
          {step === 3 && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-sm font-medium text-foreground">Quel format tu sens le mieux aujourd'hui ?</p>
              {isEducatif && (
                <p className="text-xs text-primary bg-primary/5 border border-primary/10 rounded-lg px-3 py-2">
                  💡 Pour un contenu éducatif, le carrousel fonctionne très bien
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {FORMATS.map(f => (
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
              <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="gap-1">
                <ArrowLeft className="h-3.5 w-3.5" /> Retour
              </Button>
            </div>
          )}

          {/* Step 4: Ton */}
          {step === 4 && (
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
              <Button variant="ghost" size="sm" onClick={() => setStep(3)} className="gap-1">
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
      </DialogContent>
    </Dialog>
  );
}
