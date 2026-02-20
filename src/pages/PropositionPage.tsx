import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Mic, Loader2, Check, Copy, Star, RefreshCw } from "lucide-react";

interface PropositionData {
  id?: string;
  step_1_what: string;
  step_2a_process: string;
  step_2b_values: string;
  step_2c_feedback: string;
  step_2d_refuse: string;
  step_3_for_whom: string;
  version_pitch_naturel: string;
  version_bio: string;
  version_networking: string;
  version_site_web: string;
  version_engagee: string;
  version_one_liner: string;
  version_final: string;
  current_step: number;
  completed: boolean;
}

const EMPTY: PropositionData = {
  step_1_what: "", step_2a_process: "", step_2b_values: "", step_2c_feedback: "",
  step_2d_refuse: "", step_3_for_whom: "",
  version_pitch_naturel: "", version_bio: "", version_networking: "",
  version_site_web: "", version_engagee: "", version_one_liner: "",
  version_final: "",
  current_step: 1, completed: false,
};

const STEPS = [
  { number: 1, icon: "🧐", title: "Ton métier, en simple" },
  { number: 2, icon: "🌟", title: "Ce qui te rend unique" },
  { number: 3, icon: "🔍", title: "Pour qui et ce que tu apportes" },
  { number: 4, icon: "💌", title: "Assemble ta proposition de valeur" },
];

const VERSION_CARDS = [
  { key: "version_pitch_naturel" as const, icon: "☕", label: "PITCH NATUREL", usage: "Pour : expliquer ton métier à une amie" },
  { key: "version_bio" as const, icon: "📱", label: "BIO", usage: "Pour : Instagram, LinkedIn, partout" },
  { key: "version_networking" as const, icon: "🎤", label: "PITCH NETWORKING", usage: "Pour : quand on te demande \"tu fais quoi ?\"" },
  { key: "version_site_web" as const, icon: "🌐", label: "SITE WEB", usage: "Pour : ta page d'accueil" },
  { key: "version_engagee" as const, icon: "🔥", label: "ENGAGÉE", usage: "Pour : post LinkedIn, newsletter, page À propos" },
  { key: "version_one_liner" as const, icon: "✨", label: "ONE-LINER", usage: "Pour : signature email, sticker, tote bag" },
];

export default function PropositionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<PropositionData>(EMPTY);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDiffPoints, setAiDiffPoints] = useState<string[] | null>(null);
  const [aiBenefit, setAiBenefit] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [persona, setPersona] = useState<any>(null);
  const [storytelling, setStorytelling] = useState<any>(null);
  const [tone, setTone] = useState<any>(null);
  const [favorite, setFavorite] = useState<string | null>(null);
  const [writeManually, setWriteManually] = useState(false);
  const [activeField, setActiveField] = useState<string>("step_2a_process");
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("brand_proposition").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("activite, prenom, mission").eq("user_id", user.id).single(),
      supabase.from("persona").select("step_1_frustrations, step_2_transformation").eq("user_id", user.id).maybeSingle(),
      supabase.from("storytelling").select("pitch_short").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_profile").select("tone_register, key_expressions, things_to_avoid, mission").eq("user_id", user.id).maybeSingle(),
    ]).then(([propRes, profRes, perRes, stRes, toneRes]) => {
      if (propRes.data) {
        const { id, user_id, created_at, updated_at, ...rest } = propRes.data as any;
        setData(rest as PropositionData);
        setExistingId(id);
        setCurrentStep(rest.current_step || 1);
      }
      setProfile(profRes.data || {});
      setPersona(perRes.data || null);
      setStorytelling(stRes.data || null);
      setTone(toneRes.data || null);
      if (!propRes.data?.step_1_what && profRes.data?.activite) {
        setData(prev => ({ ...prev, step_1_what: profRes.data.activite }));
      }
      setLoading(false);
    });
  }, [user]);

  const saveNow = useCallback(async (updated: PropositionData) => {
    if (!user) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    const payload = { ...updated };
    delete (payload as any).id;
    if (existingId) {
      await supabase.from("brand_proposition").update(payload as any).eq("id", existingId);
    } else {
      const { data: inserted } = await supabase.from("brand_proposition").insert({ ...payload, user_id: user.id } as any).select("id").single();
      if (inserted) setExistingId(inserted.id);
    }
  }, [user, existingId]);

  const debouncedSave = useCallback((updated: PropositionData) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveNow(updated), 2000);
  }, [saveNow]);

  const updateField = (field: keyof PropositionData, value: string) => {
    const updated = { ...data, [field]: value };
    setData(updated);
    debouncedSave(updated);
  };

  const { isListening, isSupported, toggle: toggleMic } = useSpeechRecognition((text) => {
    if (currentStep === 2) {
      const f = activeField as keyof PropositionData;
      const cur = data[f] as string || "";
      updateField(f, cur + (cur ? " " : "") + text);
    } else if (currentStep === 3) {
      const cur = data.step_3_for_whom;
      updateField("step_3_for_whom", cur + (cur ? " " : "") + text);
    }
  });

  const goToStep = (step: number) => {
    setCurrentStep(step);
    setAiDiffPoints(null);
    setAiBenefit(null);
    const maxStep = Math.max(data.current_step, step);
    if (maxStep > data.current_step) {
      const updated = { ...data, current_step: maxStep };
      setData(updated);
      debouncedSave(updated);
    }
  };

  const nextStep = async () => {
    if (currentStep < 4) goToStep(currentStep + 1);
    else {
      const updated = { ...data, completed: true, current_step: 4 };
      setData(updated);
      await saveNow(updated);
      navigate("/branding/proposition/recap");
    }
  };

  const prevStep = () => { if (currentStep > 1) goToStep(currentStep - 1); };

  const handleAiDifferentiation = async () => {
    if (!data.step_2a_process.trim() && !data.step_2b_values.trim()) {
      toast({ title: "Remplis au moins 2 champs avant d'utiliser l'IA.", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setAiDiffPoints(null);
    try {
      const { data: fn, error } = await supabase.functions.invoke("proposition-ai", {
        body: { type: "differentiation", step_2a: data.step_2a_process, step_2b: data.step_2b_values, step_2c: data.step_2c_feedback, step_2d: data.step_2d_refuse, profile },
      });
      if (error) throw error;
      const raw = fn.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      setAiDiffPoints(JSON.parse(raw));
    } catch (e: any) {
      toast({ title: "Erreur IA", description: e.message, variant: "destructive" });
    }
    setAiLoading(false);
  };

  const handleAiBenefit = async () => {
    if (!data.step_3_for_whom.trim()) {
      toast({ title: "Écris d'abord pour qui tu es faite.", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setAiBenefit(null);
    try {
      const { data: fn, error } = await supabase.functions.invoke("proposition-ai", {
        body: { type: "benefit", step_3_text: data.step_3_for_whom, persona, profile },
      });
      if (error) throw error;
      setAiBenefit(fn.content);
    } catch (e: any) {
      toast({ title: "Erreur IA", description: e.message, variant: "destructive" });
    }
    setAiLoading(false);
  };

  const handleGenerateVersions = async () => {
    setAiLoading(true);
    try {
      const { data: fn, error } = await supabase.functions.invoke("proposition-ai", {
        body: { type: "generate-versions", proposition_data: data, persona, storytelling, tone, profile },
      });
      if (error) throw error;
      const raw = fn.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw);
      const updated = {
        ...data,
        version_pitch_naturel: parsed.pitch_naturel || "",
        version_bio: parsed.bio || "",
        version_networking: parsed.networking || "",
        version_site_web: parsed.site_web || "",
        version_engagee: parsed.engagee || "",
        version_one_liner: parsed.one_liner || "",
      };
      setData(updated);
      debouncedSave(updated);
    } catch (e: any) {
      toast({ title: "Erreur IA", description: e.message, variant: "destructive" });
    }
    setAiLoading(false);
  };

  const selectFavorite = (versionKey: string, text: string) => {
    setFavorite(versionKey);
    updateField("version_final", text);
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copié !" });
  };

  const hasAnyVersion = VERSION_CARDS.some(v => data[v.key]?.trim());

  const filledSteps = [
    data.step_1_what,
    data.step_2a_process || data.step_2b_values,
    data.step_3_for_whom,
    data.version_final || data.version_pitch_naturel,
  ].filter(s => s && s.trim().length > 0).length;

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div>
    </div>
  );

  const step2Fields = [
    { key: "step_2a_process", label: "Comment tu travailles concrètement ?", aide: "Décris ton processus, ton savoir-faire, tes choix.", placeholder: "Je sélectionne mes matières localement, je travaille uniquement à la main..." },
    { key: "step_2b_values", label: "Qu'est-ce qui est important pour toi dans ta façon de faire ?", aide: "Parle de tes valeurs, de ce à quoi tu fais attention.", placeholder: "Je refuse le plastique. Je cherche la durabilité..." },
    { key: "step_2c_feedback", label: "Qu'est-ce que tes client·es te disent souvent ?", aide: "Repense aux compliments, retours, messages... Les mots exacts.", placeholder: "J'adore le toucher de ce cuir. C'est la première fois que..." },
    { key: "step_2d_refuse", label: "Que refuses-tu de faire ?", aide: "Parce que dire non, c'est aussi se positionner.", placeholder: "Je ne fais pas de production en série..." },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Ma proposition de valeur" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-1">Ta proposition de valeur</h1>
        <p className="text-[15px] text-muted-foreground italic mb-8">
          La phrase qui dit tout : ce que tu fais, pour qui, et pourquoi toi. C'est le socle de toute ta communication.
        </p>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {STEPS.map((step, i) => (
              <div key={i} className="flex items-center">
                <button
                  onClick={() => goToStep(step.number)}
                  className={`relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    step.number < currentStep
                      ? "bg-primary text-primary-foreground"
                      : step.number === currentStep
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/30 animate-pulse"
                        : "border-2 border-rose-soft bg-background text-muted-foreground"
                  }`}
                >
                  {step.number < currentStep ? <Check className="h-3.5 w-3.5" /> : step.number}
                </button>
                {i < 3 && <div className={`w-8 sm:w-16 h-0.5 ${step.number < currentStep ? "bg-primary" : "bg-rose-soft"}`} />}
              </div>
            ))}
          </div>
          <p className="font-mono-ui text-[12px] text-muted-foreground mt-3 text-center">Étape {currentStep} sur 4</p>
        </div>

        {/* STEP 1 */}
        {currentStep === 1 && (
          <div className="animate-fade-in-x">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🧐</span>
              <h2 className="font-display text-xl font-bold text-foreground">Ton métier, en simple</h2>
            </div>
            <p className="text-[15px] text-foreground leading-relaxed mb-4">Ici c'est très simple : écris ton métier. Pas besoin de fioritures.</p>
            <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-4">
              <p className="font-semibold mb-1">Exemples :</p>
              <p>Je suis couturière.<br/>Je suis coach en nutrition.<br/>Je crée des bijoux en céramique.<br/>J'accompagne des femmes en reconversion.</p>
            </div>
            <Input
              value={data.step_1_what}
              onChange={(e) => updateField("step_1_what", e.target.value)}
              placeholder="Je suis / Je fais..."
              className="mb-4"
            />
          </div>
        )}

        {/* STEP 2 */}
        {currentStep === 2 && (
          <div className="animate-fade-in-x">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🌟</span>
              <h2 className="font-display text-xl font-bold text-foreground">Comment tu le fais et ce qui rend ton approche spéciale</h2>
            </div>
            <p className="text-[15px] text-foreground leading-relaxed mb-4">Tu n'es pas la seule à faire ce que tu fais. Mais personne ne le fait comme toi.</p>
            {step2Fields.map((f) => (
              <div key={f.key} className="mb-5">
                <label className="font-display text-sm font-bold text-foreground block mb-1">{f.label}</label>
                <p className="text-[12px] text-muted-foreground mb-2">{f.aide}</p>
                <div className="relative">
                  <textarea
                    value={(data as any)[f.key] || ""}
                    onChange={(e) => updateField(f.key as keyof PropositionData, e.target.value)}
                    onFocus={() => setActiveField(f.key)}
                    placeholder={f.placeholder}
                    className="w-full min-h-[100px] rounded-xl border-2 border-input bg-card px-4 py-3 pr-12 text-[15px] leading-relaxed placeholder:text-placeholder placeholder:italic focus:outline-none focus:border-primary transition-colors resize-none"
                  />
                  {isSupported && (
                    <button
                      onClick={() => { setActiveField(f.key); toggleMic(); }}
                      className={`absolute right-3 top-3 p-2 rounded-full transition-all ${
                        isListening && activeField === f.key ? "text-primary animate-pulse bg-primary/10" : "text-placeholder hover:text-primary"
                      }`}
                    >
                      <Mic className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <Button onClick={handleAiDifferentiation} disabled={aiLoading} className="w-full rounded-pill h-12 text-base mb-3">
              {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyse en cours...</> : "✨ M'aider à formuler ce qui me rend unique"}
            </Button>
            {aiDiffPoints && (
              <div className="rounded-xl bg-rose-pale border border-border p-4 mb-4 space-y-2">
                <p className="font-mono-ui text-[11px] font-semibold text-muted-foreground mb-2">CE QUI TE REND UNIQUE :</p>
                {aiDiffPoints.map((pt, i) => (
                  <p key={i} className="text-[14px] text-foreground leading-relaxed">✦ {pt}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 3 */}
        {currentStep === 3 && (
          <div className="animate-fade-in-x">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🔍</span>
              <h2 className="font-display text-xl font-bold text-foreground">Pour qui tu es la bonne personne</h2>
            </div>
            <p className="text-[15px] text-foreground leading-relaxed mb-2">Qui est cette personne qui te dira un jour : "Merci, j'avais besoin de toi" ?</p>
            <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-4">
              <p className="font-semibold mb-1">👉 Commence par : "Je suis la bonne personne pour quelqu'un qui..."</p>
              <p className="mt-2">Exemples :<br/>...veut se sentir belle dans des fringues qui respectent la planète<br/>...cherche à se reconnecter à son corps<br/>...a envie de faire grandir son projet sans se perdre</p>
            </div>
            {persona?.step_1_frustrations && (
              <div className="rounded-xl bg-cal-published-bg border border-cal-published-border p-4 text-[13px] mb-4">
                <p className="font-semibold text-foreground mb-2">💡 Rappel de ton persona :</p>
                {persona.step_1_frustrations && <p className="text-foreground mb-1"><span className="font-semibold">Frustrations :</span> {persona.step_1_frustrations.slice(0, 200)}...</p>}
                {persona.step_2_transformation && <p className="text-foreground"><span className="font-semibold">Transformation :</span> {persona.step_2_transformation.slice(0, 200)}...</p>}
              </div>
            )}
            <div className="relative mb-4">
              <textarea
                value={data.step_3_for_whom}
                onChange={(e) => updateField("step_3_for_whom", e.target.value)}
                placeholder="Je suis la bonne personne pour quelqu'un qui..."
                className="w-full min-h-[150px] rounded-xl border-2 border-input bg-card px-4 py-3 pr-12 text-[15px] leading-relaxed placeholder:text-placeholder placeholder:italic focus:outline-none focus:border-primary transition-colors resize-none"
              />
              {isSupported && (
                <button onClick={toggleMic} className={`absolute right-3 top-3 p-2 rounded-full transition-all ${isListening ? "text-primary animate-pulse bg-primary/10" : "text-placeholder hover:text-primary"}`}>
                  <Mic className="h-5 w-5" />
                </button>
              )}
            </div>
            <Button onClick={handleAiBenefit} disabled={aiLoading} className="w-full rounded-pill h-12 text-base mb-3">
              {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Formulation en cours...</> : "✨ Formuler ce que j'apporte"}
            </Button>
            {aiBenefit && (
              <div className="rounded-xl bg-rose-pale border border-border p-4 mb-4">
                <p className="font-mono-ui text-[11px] font-semibold text-muted-foreground mb-2">PROPOSITION FORMULÉE :</p>
                <p className="text-[15px] text-foreground leading-relaxed">{aiBenefit}</p>
              </div>
            )}
          </div>
        )}

        {/* STEP 4 */}
        {currentStep === 4 && (
          <div className="animate-fade-in-x">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">💌</span>
              <h2 className="font-display text-xl font-bold text-foreground">Écris ta proposition de valeur</h2>
            </div>
            <p className="text-[15px] text-foreground leading-relaxed mb-4">On assemble tout. L'IA va te proposer 6 versions différentes, chacune adaptée à un usage précis.</p>

            {/* Recap */}
            <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-4 space-y-2">
              <p><span className="font-semibold">Ce que tu fais :</span> {data.step_1_what || "Non renseigné"}</p>
              <p><span className="font-semibold">Ce qui te rend unique :</span> {[data.step_2a_process, data.step_2b_values].filter(Boolean).join(" · ").slice(0, 200) || "Non renseigné"}</p>
              <p><span className="font-semibold">Pour qui et ce que tu apportes :</span> {data.step_3_for_whom?.slice(0, 200) || "Non renseigné"}</p>
            </div>

            <Button onClick={handleGenerateVersions} disabled={aiLoading} className="w-full rounded-pill h-12 text-base mb-4">
              {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération en cours...</> : "✨ Générer ma proposition de valeur"}
            </Button>

            {hasAnyVersion && (
              <>
                <div className="space-y-3 mb-4">
                  {VERSION_CARDS.map((v) => {
                    const text = data[v.key];
                    if (!text?.trim()) return null;
                    const isFav = favorite === v.key;
                    return (
                      <div key={v.key} className={`rounded-xl border-2 p-4 transition-all ${isFav ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{v.icon}</span>
                          <p className="font-mono-ui text-[11px] font-bold text-foreground tracking-wide">{v.label}</p>
                        </div>
                        <p className="font-mono-ui text-[10px] text-muted-foreground mb-3">{v.usage}</p>
                        <p className="text-[15px] text-foreground leading-relaxed mb-3">{text}</p>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => copyText(text)} className="rounded-pill text-[11px]">
                            <Copy className="h-3 w-3 mr-1" /> Copier
                          </Button>
                          <Button variant={isFav ? "default" : "outline"} size="sm" onClick={() => selectFavorite(v.key, text)} className="rounded-pill text-[11px]">
                            <Star className={`h-3 w-3 mr-1 ${isFav ? "fill-current" : ""}`} /> {isFav ? "Ma préférée" : "C'est ma préférée"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button variant="outline" onClick={handleGenerateVersions} disabled={aiLoading} className="rounded-pill text-sm mb-4">
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Ces propositions ne me parlent pas, regénérer
                </Button>
              </>
            )}

            {!writeManually && (
              <button onClick={() => setWriteManually(true)} className="text-sm text-muted-foreground hover:text-primary underline block mb-4">
                Je préfère écrire moi-même →
              </button>
            )}

            {/* Final textarea */}
            <div className="mb-4">
              <label className="font-display text-sm font-bold text-foreground block mb-2">Ma version finale (tu peux mixer, éditer, faire ta propre sauce) :</label>
              <textarea
                value={data.version_final}
                onChange={(e) => updateField("version_final", e.target.value)}
                placeholder="Écris ou édite ta proposition de valeur finale ici..."
                className="w-full min-h-[120px] rounded-xl border-2 border-input bg-card px-4 py-3 text-[15px] leading-relaxed placeholder:text-placeholder placeholder:italic focus:outline-none focus:border-primary transition-colors resize-none"
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center mt-6">
          <Button variant="outline" onClick={prevStep} disabled={currentStep === 1} className="rounded-pill">
            ← Précédent
          </Button>
          <Button onClick={nextStep} className="rounded-pill">
            {currentStep === 4 ? "Voir le récap →" : "Suivant →"}
          </Button>
        </div>
      </main>
    </div>
  );
}
