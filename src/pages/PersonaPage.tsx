import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useBrandProfile } from "@/hooks/use-profile";
import { usePersona } from "@/hooks/use-branding";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useQueryClient } from "@tanstack/react-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import AuditRecommendationBanner from "@/components/AuditRecommendationBanner";
import CoachingFlow from "@/components/CoachingFlow";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Mic, Loader2, Check, ExternalLink } from "lucide-react";
import { PERSONA_STEPS } from "@/lib/persona-steps";

interface PersonaData {
  id?: string;
  starting_point: string;
  step_1_frustrations: string;
  step_2_transformation: string;
  step_3a_objections: string;
  step_3b_cliches: string;
  step_4_beautiful: string;
  step_4_inspiring: string;
  step_4_repulsive: string;
  step_4_feeling: string;
  step_4_pinterest_url: string;
  step_5_actions: string;
  pitch_short: string;
  pitch_medium: string;
  pitch_long: string;
  current_step: number;
  completed: boolean;
}

const EMPTY: PersonaData = {
  starting_point: "", step_1_frustrations: "", step_2_transformation: "",
  step_3a_objections: "", step_3b_cliches: "",
  step_4_beautiful: "", step_4_inspiring: "", step_4_repulsive: "", step_4_feeling: "",
  step_4_pinterest_url: "", step_5_actions: "",
  pitch_short: "", pitch_medium: "", pitch_long: "",
  current_step: 1, completed: false,
};

const STEP_FIELDS: Record<number, (keyof PersonaData)[]> = {
  1: ["step_1_frustrations"],
  2: ["step_2_transformation"],
  3: ["step_3a_objections", "step_3b_cliches"],
  4: ["step_4_beautiful", "step_4_inspiring", "step_4_repulsive", "step_4_feeling"],
  5: ["step_5_actions"],
};

export default function PersonaPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  const { data: personaHookData, isLoading: personaHookLoading } = usePersona();
  const [data, setData] = useState<PersonaData>(EMPTY);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const { data: profileData } = useProfile();
  const { data: brandProfileData } = useBrandProfile();
  const profile = profileData ? { ...profileData, ...(brandProfileData || {}) } : null;
  const [activeTextarea, setActiveTextarea] = useState<keyof PersonaData | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Coaching mode detection
  const fromAudit = searchParams.get("from") === "audit";
  const recId = searchParams.get("rec_id") || undefined;
  const isNewPersona = searchParams.get("new") === "true";
  const [coachingMode, setCoachingMode] = useState(false);

  useEffect(() => {
    if (fromAudit && recId) setCoachingMode(true);
  }, [fromAudit, recId]);

  useEffect(() => {
    if (personaHookLoading) return;
    if (!isNewPersona && personaHookData) {
      const { id, user_id, created_at, updated_at, ...rest } = personaHookData;
      // If persona is completed or on final step, redirect to recap page
      if ((rest.completed || (rest.current_step ?? 0) >= 5) && !fromAudit && !isNewPersona) {
        navigate("/branding/persona/recap", { replace: true });
        return;
      }
      setData(rest as PersonaData);
      setExistingId(id);
      setCurrentStep(rest.current_step || 1);
      if (rest.starting_point) setStarted(true);
    }
    setLoading(false);
  }, [personaHookLoading, personaHookData]);

  const saveNow = useCallback(async (updated: PersonaData) => {
    if (!user) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    const payload = { ...updated };
    delete (payload as any).id;
    if (existingId) {
      await supabase.from("persona").update(payload as any).eq("id", existingId);
      queryClient.invalidateQueries({ queryKey: ["persona"] });
    } else {
      // New persona: is_primary = false if other personas exist, true otherwise
      const { count } = await (supabase.from("persona") as any).select("id", { count: "exact", head: true }).eq(column, value);
      const isPrimary = !count || count === 0;
      const { data: inserted } = await supabase.from("persona").insert({
        ...payload,
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        is_primary: isPrimary,
      } as any).select("id").single();
      if (inserted) {
        setExistingId(inserted.id);
        queryClient.invalidateQueries({ queryKey: ["persona"] });
      }
    }
  }, [user, existingId, column, value]);

  const debouncedSave = useCallback((updated: PersonaData) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveNow(updated), 2000);
  }, [saveNow]);

  const updateField = (field: keyof PersonaData, value: string) => {
    const updated = { ...data, [field]: value };
    setData(updated);
    debouncedSave(updated);
  };

  const { isListening, isSupported, toggle: toggleMic } = useSpeechRecognition((text) => {
    if (!activeTextarea) return;
    const current = data[activeTextarea] as string;
    updateField(activeTextarea, current + (current ? " " : "") + text);
  });

  const goToStep = (step: number) => {
    setCurrentStep(step);
    setAiResult(null);
    setActiveTextarea(null);
    const maxStep = Math.max(data.current_step, step);
    if (maxStep > data.current_step) {
      const updated = { ...data, current_step: maxStep };
      setData(updated);
      debouncedSave(updated);
    }
  };

  const nextStep = async () => {
    if (currentStep < 5) goToStep(currentStep + 1);
    else {
      const updated = { ...data, completed: true, current_step: 5 };
      setData(updated);
      await saveNow(updated);
      navigate("/branding/persona/recap");
    }
  };

  const prevStep = () => { if (currentStep > 1) goToStep(currentStep - 1); };

  const handleStart = (sp: string) => {
    const updated = { ...data, starting_point: sp };
    setData(updated);
    debouncedSave(updated);
    setStarted(true);
  };

  const handleAi = async () => {
    const step = PERSONA_STEPS[currentStep - 1];
    setAiLoading(true);
    setAiResult(null);
    try {
      const { data: fnData, error } = await supabase.functions.invoke("persona-ai", {
        body: { type: step.aiType, profile, persona: data },
      });
      if (error) throw error;
      setAiResult(fnData.content);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Oups, un souci", description: friendlyError(e), variant: "destructive" });
    }
    setAiLoading(false);
  };

  const completedSteps = PERSONA_STEPS.filter((_, i) => {
    const fields = STEP_FIELDS[i + 1];
    return fields.some((f) => (data[f] as string)?.trim());
  }).length;

  const stepDef = PERSONA_STEPS[currentStep - 1];

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Mon client·e idéal·e" useFromParam />
        {!coachingMode && <AuditRecommendationBanner />}

        {/* Coaching mode */}
        {coachingMode ? (
          <div className="mb-8">
            <h1 className="font-display text-[26px] font-bold text-foreground mb-4">Ton client·e idéal·e</h1>
            <CoachingFlow
              module="persona"
              recId={recId}
              conseil={sessionStorage.getItem("audit_recommendation") ? JSON.parse(sessionStorage.getItem("audit_recommendation")!).conseil : undefined}
              onComplete={() => {
                setCoachingMode(false);
                sessionStorage.removeItem("audit_recommendation");
                navigate("/mon-plan");
              }}
              onSkip={() => {
                setCoachingMode(false);
                sessionStorage.removeItem("audit_recommendation");
              }}
            />
          </div>
        ) : (
          <>
        <h1 className="font-display text-[26px] font-bold text-foreground mb-1">Ton client·e idéal·e</h1>
        <p className="text-[15px] text-muted-foreground italic mb-8">
          On va construire le portrait de la personne que tu veux toucher. Pas une fiche froide : un vrai portrait vivant.
        </p>

        {/* Préambule */}
        {!started ? (
          <div className="animate-fade-in">
            <div className="rounded-xl bg-rose-pale p-5 mb-6">
              <p className="text-sm font-semibold text-foreground mb-4">Avant de commencer, choisis ton point de départ :</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={() => handleStart("existing")}
                  className="text-left rounded-xl border-2 border-border bg-card p-4 hover:border-primary transition-all">
                  <p className="text-sm font-bold text-foreground mb-1">J'ai déjà des client·es</p>
                  <p className="text-xs text-muted-foreground">Pense à UN·E client·e qui représente parfaitement ta cliente idéale.</p>
                </button>
                <button onClick={() => handleStart("imagined")}
                  className="text-left rounded-xl border-2 border-border bg-card p-4 hover:border-primary transition-all">
                  <p className="text-sm font-bold text-foreground mb-1">Je n'ai pas encore de client·es</p>
                  <p className="text-xs text-muted-foreground">Tu vas imaginer ta cliente idéale : le type de personne que tu rêves d'accompagner.</p>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Progress bar */}
            <div className="mb-8">
              <div className="flex items-center justify-between">
                {PERSONA_STEPS.map((s, i) => (
                  <div key={i} className="flex items-center">
                    <button onClick={() => goToStep(s.number)}
                      className={`relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        (STEP_FIELDS[s.number] || []).some((f) => (data[f] as string)?.trim()) && s.number !== currentStep
                          ? "bg-primary text-primary-foreground"
                          : s.number === currentStep
                            ? "bg-primary text-primary-foreground ring-4 ring-primary/30 animate-pulse"
                            : "border-2 border-rose-soft bg-background text-muted-foreground"
                      }`}>
                      {(STEP_FIELDS[s.number] || []).some((f) => (data[f] as string)?.trim()) && s.number !== currentStep
                        ? <Check className="h-3.5 w-3.5" /> : s.number}
                    </button>
                    {i < 4 && <div className={`w-6 sm:w-12 h-0.5 ${s.number < currentStep ? "bg-primary" : "bg-rose-soft"}`} />}
                  </div>
                ))}
              </div>
              <p className="font-mono-ui text-[12px] text-muted-foreground mt-3 text-center">Étape {currentStep} sur 5</p>
            </div>

            {/* Step content */}
            <div className="animate-fade-in-x" key={currentStep}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{stepDef.icon}</span>
                <h2 className="font-display text-xl font-bold text-foreground">{stepDef.title}</h2>
              </div>
              <p className="text-[15px] text-foreground leading-relaxed mb-4">{stepDef.consigne}</p>

              {/* Help */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors w-full mb-3">
                  <span>{stepDef.helpTitle}</span>
                  <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mb-4">
                  <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed whitespace-pre-line">
                    {stepDef.helpContent}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Examples */}
              {stepDef.examples && (
                <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-4 whitespace-pre-line">
                  {stepDef.examples}
                </div>
              )}

              {/* Textareas per step */}
              {currentStep === 1 && (
                <TextareaWithMic field="step_1_frustrations" placeholder="Ce qui coince pour elle en ce moment, c'est..." height="min-h-[200px]"
                  value={data.step_1_frustrations} onChange={(v) => updateField("step_1_frustrations", v)}
                  isSupported={isSupported} isListening={isListening && activeTextarea === "step_1_frustrations"}
                  onMicToggle={() => { setActiveTextarea("step_1_frustrations"); toggleMic(); }} />
              )}

              {currentStep === 2 && (
                <TextareaWithMic field="step_2_transformation" placeholder="Elle rêverait de pouvoir..." height="min-h-[200px]"
                  value={data.step_2_transformation} onChange={(v) => updateField("step_2_transformation", v)}
                  isSupported={isSupported} isListening={isListening && activeTextarea === "step_2_transformation"}
                  onMicToggle={() => { setActiveTextarea("step_2_transformation"); toggleMic(); }} />
              )}

              {currentStep === 3 && (
                <>
                  <p className="text-sm font-semibold text-foreground mb-2">Ses objections au moment d'acheter</p>
                  <TextareaWithMic field="step_3a_objections" placeholder="Ce qui la fait hésiter, c'est..." height="min-h-[150px]"
                    value={data.step_3a_objections} onChange={(v) => updateField("step_3a_objections", v)}
                    isSupported={isSupported} isListening={isListening && activeTextarea === "step_3a_objections"}
                    onMicToggle={() => { setActiveTextarea("step_3a_objections"); toggleMic(); }} />
                  <p className="text-sm font-semibold text-foreground mb-2 mt-4">Les clichés qu'elle a en tête</p>
                  <TextareaWithMic field="step_3b_cliches" placeholder="Elle pense que..." height="min-h-[150px]"
                    value={data.step_3b_cliches} onChange={(v) => updateField("step_3b_cliches", v)}
                    isSupported={isSupported} isListening={isListening && activeTextarea === "step_3b_cliches"}
                    onMicToggle={() => { setActiveTextarea("step_3b_cliches"); toggleMic(); }} />
                </>
              )}

              {currentStep === 4 && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <MiniTextarea label="Ce qu'elle trouve beau" placeholder="Feed aéré, couleurs pastel, ambiance bohème..."
                      value={data.step_4_beautiful} onChange={(v) => updateField("step_4_beautiful", v)} />
                    <MiniTextarea label="Ce qui l'inspire ou la touche" placeholder="Lumière naturelle, visages sans retouche..."
                      value={data.step_4_inspiring} onChange={(v) => updateField("step_4_inspiring", v)} />
                    <MiniTextarea label="Ce qui la rebute" placeholder="Trop de pub, visuels ultra-léchés, stock photos..."
                      value={data.step_4_repulsive} onChange={(v) => updateField("step_4_repulsive", v)} />
                    <MiniTextarea label="Ce qu'elle a besoin de ressentir" placeholder="Confiance, chaleur, engagement, paix..."
                      value={data.step_4_feeling} onChange={(v) => updateField("step_4_feeling", v)} />
                  </div>
                  <a href="https://www.pinterest.fr/pin-creation-tool/" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline mb-2">
                    📌 Créer mon moodboard sur Pinterest <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <p className="text-xs text-muted-foreground mb-3">Sélectionne des images qui correspondent à l'univers de ta cliente.</p>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Lien vers mon moodboard Pinterest (optionnel)</label>
                    <Input value={data.step_4_pinterest_url} onChange={(e) => updateField("step_4_pinterest_url", e.target.value)}
                      placeholder="https://www.pinterest.fr/..." className="rounded-[10px] h-11" />
                  </div>
                </>
              )}

              {currentStep === 5 && (
                <>
                  <p className="text-sm font-semibold text-foreground mb-2">Mes premières actions</p>
                  <TextareaWithMic field="step_5_actions" placeholder="Mes prochaines actions..." height="min-h-[150px]"
                    value={data.step_5_actions} onChange={(v) => updateField("step_5_actions", v)}
                    isSupported={isSupported} isListening={isListening && activeTextarea === "step_5_actions"}
                    onMicToggle={() => { setActiveTextarea("step_5_actions"); toggleMic(); }} />

                  <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mt-4 mb-4">
                    <p className="font-semibold mb-1">💬 Va à leur rencontre</p>
                    <p>Le meilleur moyen de valider tout ça ? Parler à de vraies personnes. Contacte 5 personnes qui correspondent à ton persona et pose-leur des questions ouvertes. Pas pour vendre : pour écouter.</p>
                  </div>

                  <Button variant="outline" className="rounded-pill text-sm" onClick={handleDownloadPdf}>
                    📄 Télécharger mon guide d'entretien
                  </Button>
                </>
              )}


              {/* AI button */}
              <div className="mt-4 mb-4">
                <Button onClick={handleAi} disabled={aiLoading} variant="outline" className="rounded-pill text-sm border-primary/30 text-primary hover:bg-primary/5">
                  {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> L'IA travaille...</> : stepDef.aiButtonLabel}
                </Button>
              </div>

              {/* AI Result */}
              {aiResult && (
                <div className="rounded-xl bg-rose-pale border-l-4 border-primary p-4 mb-4 animate-fade-in">
                  <p className="font-mono-ui text-[12px] text-muted-foreground mb-2">✨ Résultat :</p>
                  <div className="text-[13px] text-foreground leading-relaxed whitespace-pre-line max-h-[400px] overflow-y-auto">
                    {formatAiResult(aiResult)}
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between mt-8 pt-4 border-t border-border">
                <Button variant="ghost" onClick={prevStep} disabled={currentStep === 1} className="rounded-pill text-sm">
                  ← Étape précédente
                </Button>
                <Button onClick={nextStep} className="rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux text-sm">
                  {currentStep === 5 ? "Terminer et voir ma fiche →" : "Étape suivante →"}
                </Button>
              </div>
            </div>
          </>
        )}
          </>
        )}
      </main>
    </div>
  );

  function handleDownloadPdf() {
    const prenom = profile?.prenom || "toi";
    const activite = profile?.activite || "ton activité";
    const content = generateInterviewText(prenom, activite);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `guide-entretien-${prenom.toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Guide téléchargé !" });
  }
}

function generateInterviewText(prenom: string, activite: string): string {
  return `GUIDE D'ENTRETIEN : VA À LA RENCONTRE DE TA CLIENTE IDÉALE
Préparé pour ${prenom} — ${activite}

──────────────────────────

INTRODUCTION

"Merci beaucoup de prendre ce temps avec moi. J'ai quelques questions à te poser pour mieux comprendre ton expérience, tes besoins, ton ressenti et m'aider à améliorer mon projet. L'objectif, ce n'est pas de te vendre quoi que ce soit, mais plutôt d'écouter ton point de vue. Il n'y a pas de bonne ou mauvaise réponse, tu peux être super spontanée. Et bien sûr, tout reste entre nous !"

──────────────────────────

THÈME 1 : SON EXPÉRIENCE

- Avant de me connaître, est-ce que tu avais déjà testé ce genre de ${activite} ?
- Qu'est-ce qui t'avait plu ou déplu ?
- Qu'est-ce qui t'avait freiné·e au départ ?

THÈME 2 : SES FRUSTRATIONS ET ENVIES

- Qu'est-ce qui te frustre le plus dans ce domaine ?
- Si tu pouvais claquer des doigts, qu'est-ce que tu changerais ?
- Qu'est-ce qui te manque dans les marques/services que tu connais ?

THÈME 3 : SES BÉNÉFICES RECHERCHÉS

- Qu'est-ce que tu espérais en faisant appel à ce type de service/produit ?
- Comment tu aimerais te sentir idéalement après ?
- Qu'est-ce que ça changerait pour toi ?

THÈME 4 : SES BLOCAGES

- Qu'est-ce qui te fait hésiter à acheter/t'engager ?
- Qu'est-ce qui pourrait te donner confiance pour passer le cap ?
- Qu'aurais-tu besoin d'entendre pour te sentir rassurée ?

THÈME 5 : SES CLICHÉS

- Y a-t-il une idée toute faite que tu as souvent entendue sur ce domaine ?
- Quand tu as découvert ce que je propose, est-ce que quelque chose t'a surprise ?
- Est-ce que tu t'es déjà dit "ce n'est pas pour moi" ? Pourquoi ?

THÈME 6 : SON RESSENTI (SI ELLE EST DÉJÀ CLIENTE)

- Qu'est-ce que tu as aimé ou ressenti de positif ?
- Si tu devais me recommander en une phrase, tu dirais quoi ?
- Quel mot tu utiliserais pour décrire ma marque ?
- Pourquoi m'avoir choisie plutôt qu'un·e autre ?

──────────────────────────

MES NOTES :



`;
}

function formatAiResult(raw: string): string {
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map((item, i) => {
        const parts = Object.entries(item).map(([k, v]) => `${k}: ${v}`).join("\n");
        return `${i + 1}. ${parts}`;
      }).join("\n\n");
    }
    if (parsed.freins && parsed.cliches) {
      const freins = parsed.freins.map((f: any, i: number) => `${i + 1}. "${f.phrase}" (${f.type})\n   → Idée contenu : ${f.idee_contenu}`).join("\n");
      const cliches = parsed.cliches.map((c: any, i: number) => `${i + 1}. "${c.idee_recue}"\n   Frein profond : ${c.frein_profond}\n   → ${c.idee_contenu}`).join("\n");
      return `FREINS :\n${freins}\n\nCLICHÉS :\n${cliches}`;
    }
    if (parsed.contenus_instagram) {
      const ig = parsed.contenus_instagram.map((c: any, i: number) => `${i + 1}. ${c.sujet} (${c.format}) → ${c.pourquoi}`).join("\n");
      const nl = (parsed.newsletters || []).map((n: string, i: number) => `${i + 1}. ${n}`).join("\n");
      const am = (parsed.ameliorations_message || []).map((a: string, i: number) => `${i + 1}. ${a}`).join("\n");
      const sig = parsed.contenu_signature || "";
      const hd = (parsed.actions_hors_digital || []).map((a: string, i: number) => `${i + 1}. ${a}`).join("\n");
      return `📱 CONTENUS INSTAGRAM :\n${ig}\n\n📧 NEWSLETTERS :\n${nl}\n\n✏️ AMÉLIORATIONS MESSAGE :\n${am}\n\n⭐ CONTENU SIGNATURE :\n${sig}\n\n🤝 ACTIONS HORS DIGITAL :\n${hd}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

function TextareaWithMic({ field, placeholder, height, value, onChange, isSupported, isListening, onMicToggle }: {
  field: string; placeholder: string; height: string; value: string; onChange: (v: string) => void;
  isSupported: boolean; isListening: boolean; onMicToggle: () => void;
}) {
  return (
    <div className="relative mb-4">
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full ${height} rounded-xl border-2 border-input bg-card px-4 py-3 pr-12 text-[15px] leading-relaxed placeholder:text-placeholder placeholder:italic focus:outline-none focus:border-primary transition-colors resize-none`}
        style={{ fieldSizing: "content" } as any} />
      {isSupported ? (
        <button onClick={onMicToggle}
          className={`absolute right-3 top-3 p-2 rounded-full transition-all ${isListening ? "text-primary animate-pulse bg-primary/10" : "text-placeholder hover:text-primary"}`}>
          <Mic className="h-5 w-5" />
        </button>
      ) : (
        <p className="text-[11px] text-muted-foreground mt-1">💡 Tu peux aussi utiliser la dictée vocale de ton téléphone</p>
      )}
      {isListening && <p className="font-mono-ui text-[11px] text-primary mt-1">Je t'écoute...</p>}
    </div>
  );
}

function MiniTextarea({ label, placeholder, value, onChange }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium mb-1.5 block">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full min-h-[80px] rounded-xl border-2 border-input bg-card px-3 py-2 text-[14px] leading-relaxed placeholder:text-placeholder placeholder:italic focus:outline-none focus:border-primary transition-colors resize-none" />
    </div>
  );
}
