import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Mic, Loader2, Check, Copy } from "lucide-react";
import { STORYTELLING_STEPS, STEP_DB_FIELDS } from "@/lib/storytelling-steps";

interface StorytellingData {
  id?: string;
  step_1_raw: string;
  step_2_location: string;
  step_3_action: string;
  step_4_thoughts: string;
  step_5_emotions: string;
  step_6_full_story: string;
  step_7_polished: string;
  pitch_short: string;
  pitch_medium: string;
  pitch_long: string;
  current_step: number;
  completed: boolean;
}

const EMPTY_DATA: StorytellingData = {
  step_1_raw: "", step_2_location: "", step_3_action: "", step_4_thoughts: "",
  step_5_emotions: "", step_6_full_story: "", step_7_polished: "",
  pitch_short: "", pitch_medium: "", pitch_long: "",
  current_step: 1, completed: false,
};

function getFieldForStep(step: number): keyof StorytellingData | null {
  const map: Record<number, keyof StorytellingData> = {
    1: "step_1_raw", 2: "step_2_location", 3: "step_3_action",
    4: "step_4_thoughts", 5: "step_5_emotions", 6: "step_6_full_story", 7: "step_7_polished",
  };
  return map[step] || null;
}

export default function StorytellingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<StorytellingData>(EMPTY_DATA);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [pitchTab, setPitchTab] = useState<"short" | "medium" | "long">("short");
  const [profile, setProfile] = useState<any>(null);
  const [writeManually, setWriteManually] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch data
  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const [stRes, profRes, bpRes] = await Promise.all([
        supabase.from("storytelling").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("activite, prenom, tons").eq("user_id", user.id).single(),
        supabase.from("brand_profile").select("mission, offer, target_description, tone_register, key_expressions, things_to_avoid").eq("user_id", user.id).maybeSingle(),
      ]);
      if (stRes.data) {
        const { id, user_id, created_at, updated_at, ...rest } = stRes.data;
        setData(rest as StorytellingData);
        setExistingId(id);
        setCurrentStep(rest.current_step || 1);
      }
      const merged = { ...(profRes.data || {}), ...(bpRes.data || {}) };
      setProfile(merged);
      setLoading(false);
    };
    fetch();
  }, [user]);

  // Auto-save
  const debouncedSave = useCallback((updated: StorytellingData) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      if (!user) return;
      const payload = { ...updated };
      delete (payload as any).id;
      if (existingId) {
        await supabase.from("storytelling").update(payload as any).eq("id", existingId);
      } else {
        const { data: inserted } = await supabase.from("storytelling").insert({ ...payload, user_id: user.id } as any).select("id").single();
        if (inserted) setExistingId(inserted.id);
      }
    }, 2000);
  }, [user, existingId]);

  const updateField = (field: keyof StorytellingData, value: string) => {
    const updated = { ...data, [field]: value };
    setData(updated);
    debouncedSave(updated);
  };

  const currentStepDef = STORYTELLING_STEPS[currentStep - 1];
  const field = getFieldForStep(currentStep);
  const currentText = field ? (data[field] as string) : "";

  // Speech recognition
  const { isListening, isSupported, toggle: toggleMic } = useSpeechRecognition((text) => {
    if (!field) return;
    const newVal = currentText + (currentText ? " " : "") + text;
    updateField(field, newVal);
  });

  // Navigate steps
  const goToStep = (step: number) => {
    setCurrentStep(step);
    setAiResult(null);
    setWriteManually(false);
    const maxStep = Math.max(data.current_step, step);
    if (maxStep > data.current_step) {
      const updated = { ...data, current_step: maxStep };
      setData(updated);
      debouncedSave(updated);
    }
  };

  const nextStep = () => {
    if (currentStep < 8) goToStep(currentStep + 1);
    else {
      // Complete & go to recap
      const updated = { ...data, completed: true, current_step: 8 };
      setData(updated);
      debouncedSave(updated);
      window.location.href = "/branding/storytelling/recap";
    }
  };

  const prevStep = () => { if (currentStep > 1) goToStep(currentStep - 1); };

  // AI: improve text
  const handleAiImprove = async () => {
    if (!currentText.trim()) {
      toast({ title: "Écris d'abord quelque chose avant d'utiliser l'IA.", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const { data: fnData, error } = await supabase.functions.invoke("storytelling-ai", {
        body: { type: "improve", text: currentText, step_context: currentStepDef.aiStepContext, profile },
      });
      if (error) throw error;
      setAiResult(fnData.content);
    } catch (e: any) {
      toast({ title: "Erreur IA", description: e.message, variant: "destructive" });
    }
    setAiLoading(false);
  };

  // AI: generate story (step 6)
  const handleGenerateStory = async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const { data: fnData, error } = await supabase.functions.invoke("storytelling-ai", {
        body: {
          type: "generate-story",
          steps: {
            step_1_raw: data.step_1_raw, step_2_location: data.step_2_location,
            step_3_action: data.step_3_action, step_4_thoughts: data.step_4_thoughts,
            step_5_emotions: data.step_5_emotions,
          },
          profile,
        },
      });
      if (error) throw error;
      updateField("step_6_full_story", fnData.content);
      // Also prefill step 7
      updateField("step_7_polished", fnData.content);
    } catch (e: any) {
      toast({ title: "Erreur IA", description: e.message, variant: "destructive" });
    }
    setAiLoading(false);
  };

  // AI: generate pitch (step 8)
  const handleGeneratePitch = async () => {
    setAiLoading(true);
    try {
      const storyText = data.step_7_polished || data.step_6_full_story;
      const { data: fnData, error } = await supabase.functions.invoke("storytelling-ai", {
        body: { type: "generate-pitch", storytelling: storyText, profile },
      });
      if (error) throw error;
      let parsed: any;
      try {
        const raw = fnData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(raw);
      } catch {
        parsed = { short: fnData.content, medium: "", long: "" };
      }
      const updated = { ...data, pitch_short: parsed.short || "", pitch_medium: parsed.medium || "", pitch_long: parsed.long || "" };
      setData(updated);
      debouncedSave(updated);
    } catch (e: any) {
      toast({ title: "Erreur IA", description: e.message, variant: "destructive" });
    }
    setAiLoading(false);
  };

  const acceptAi = () => {
    if (aiResult && field) updateField(field, aiResult);
    setAiResult(null);
  };

  const rejectAi = () => setAiResult(null);

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copié !" });
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div>
    </div>
  );

  const completedSteps = [
    data.step_1_raw, data.step_2_location, data.step_3_action, data.step_4_thoughts,
    data.step_5_emotions, data.step_6_full_story, data.step_7_polished, data.pitch_short,
  ].filter((s) => s && s.trim().length > 0).length;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Mon storytelling" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-1">Ton histoire</h1>
        <p className="text-[15px] text-muted-foreground italic mb-8">
          On va écrire ton histoire ensemble. 8 étapes, à ton rythme. Prends un café, installe-toi.
        </p>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {STORYTELLING_STEPS.map((step, i) => (
              <div key={i} className="flex items-center">
                <button
                  onClick={() => goToStep(step.number)}
                  className={`relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    step.number < currentStep || (data[getFieldForStep(step.number) as keyof StorytellingData] as string)?.trim()
                      ? "bg-primary text-primary-foreground"
                      : step.number === currentStep
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/30 animate-pulse"
                        : "border-2 border-rose-soft bg-background text-muted-foreground"
                  }`}
                >
                  {(data[getFieldForStep(step.number) as keyof StorytellingData] as string)?.trim() && step.number !== currentStep
                    ? <Check className="h-3.5 w-3.5" />
                    : step.number
                  }
                </button>
                {i < 7 && <div className={`w-4 sm:w-8 h-0.5 ${step.number < currentStep ? "bg-primary" : "bg-rose-soft"}`} />}
              </div>
            ))}
          </div>
          <p className="font-mono-ui text-[12px] text-muted-foreground mt-3 text-center">
            Étape {currentStep} sur 8
          </p>
        </div>

        {/* Step content */}
        <div className="animate-fade-in-x" key={currentStep}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{currentStepDef.icon}</span>
            <h2 className="font-display text-xl font-bold text-foreground">{currentStepDef.title}</h2>
          </div>
          <p className="text-[15px] text-foreground leading-relaxed mb-4">{currentStepDef.consigne}</p>

          {/* Help collapsible */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors w-full mb-3">
              <span>{currentStepDef.helpTitle}</span>
              <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mb-4">
              <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed whitespace-pre-line">
                {currentStepDef.helpContent}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Comparison blocks (steps 3 & 5) */}
          {currentStepDef.comparison && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl bg-rose-pale border border-destructive/20 p-4 text-[13px] leading-relaxed whitespace-pre-line">
                {currentStepDef.comparison.bad}
              </div>
              <div className="rounded-xl bg-rose-pale border border-cal-published-border/40 p-4 text-[13px] leading-relaxed whitespace-pre-line">
                {currentStepDef.comparison.good}
              </div>
            </div>
          )}

          {/* Examples */}
          {currentStepDef.examples && (
            <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-4 whitespace-pre-line">
              {currentStepDef.examples}
            </div>
          )}

          {/* Step 6: Generate or write manually */}
          {currentStepDef.isGenerateStep && !writeManually && !data.step_6_full_story?.trim() ? (
            <div className="space-y-3 mb-4">
              <Button
                onClick={handleGenerateStory}
                disabled={aiLoading}
                className="w-full rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux h-12 text-base"
              >
                {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Je rédige ton histoire...</> : "✨ Générer mon storytelling"}
              </Button>
              <button
                onClick={() => setWriteManually(true)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors underline"
              >
                Je préfère écrire moi-même →
              </button>
            </div>
          ) : null}

          {/* Step 8: Pitch */}
          {currentStepDef.isPitchStep ? (
            <div className="space-y-4 mb-4">
              <Button
                onClick={handleGeneratePitch}
                disabled={aiLoading}
                className="w-full rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux h-12 text-base"
              >
                {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Je génère tes pitchs...</> : "✨ Générer mon pitch"}
              </Button>

              {(data.pitch_short || data.pitch_medium || data.pitch_long) && (
                <div>
                  <div className="flex gap-1 bg-rose-pale rounded-xl p-1 mb-3">
                    {(["short", "medium", "long"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setPitchTab(tab)}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                          pitchTab === tab ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground"
                        }`}
                      >
                        {tab === "short" ? "Version courte" : tab === "medium" ? "Version moyenne" : "Version longue"}
                      </button>
                    ))}
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <textarea
                      value={pitchTab === "short" ? data.pitch_short : pitchTab === "medium" ? data.pitch_medium : data.pitch_long}
                      onChange={(e) => updateField(pitchTab === "short" ? "pitch_short" : pitchTab === "medium" ? "pitch_medium" : "pitch_long", e.target.value)}
                      className="w-full min-h-[120px] bg-transparent text-[15px] leading-relaxed resize-none focus:outline-none"
                    />
                    <div className="flex justify-end mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyText(pitchTab === "short" ? data.pitch_short : pitchTab === "medium" ? data.pitch_medium : data.pitch_long)}
                        className="rounded-pill text-xs"
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copier
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Textarea (not for step 8, and for step 6 only if manual or has content) */}
          {!currentStepDef.isPitchStep && (!currentStepDef.isGenerateStep || writeManually || data.step_6_full_story?.trim()) && field && (
            <div className="relative mb-4">
              <textarea
                value={currentText}
                onChange={(e) => updateField(field, e.target.value)}
                placeholder={currentStepDef.placeholder}
                className={`w-full ${currentStepDef.textareaHeight} rounded-xl border-2 border-input bg-card px-4 py-3 pr-12 text-[15px] leading-relaxed placeholder:text-placeholder placeholder:italic focus:outline-none focus:border-primary transition-colors resize-none`}
                style={{ fieldSizing: "content" } as any}
              />
              {/* Mic button */}
              {isSupported ? (
                <button
                  onClick={toggleMic}
                  className={`absolute right-3 top-3 p-2 rounded-full transition-all ${
                    isListening ? "text-primary animate-pulse bg-primary/10" : "text-placeholder hover:text-primary"
                  }`}
                  title={isListening ? "Arrêter la dictée" : "Dicter"}
                >
                  <Mic className="h-5 w-5" />
                </button>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1">💡 Tu peux aussi utiliser la dictée vocale de ton téléphone</p>
              )}
              {isListening && (
                <p className="font-mono-ui text-[11px] text-primary mt-1">Je t'écoute...</p>
              )}
            </div>
          )}

          {/* AI improve button (steps 1-5, 7) */}
          {!currentStepDef.isGenerateStep && !currentStepDef.isPitchStep && (
            <div className="mb-4">
              <Button
                variant="outline"
                onClick={handleAiImprove}
                disabled={aiLoading || !currentText.trim()}
                className="rounded-pill text-sm"
              >
                {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Je retravaille ton texte...</> : currentStepDef.aiButtonLabel}
              </Button>
            </div>
          )}

          {/* Step 6 regenerate button */}
          {currentStepDef.isGenerateStep && data.step_6_full_story?.trim() && (
            <div className="mb-4 flex gap-2">
              <Button variant="outline" onClick={handleGenerateStory} disabled={aiLoading} className="rounded-pill text-sm">
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "🔄 Regénérer"}
              </Button>
            </div>
          )}

          {/* AI result preview */}
          {aiResult && (
            <div className="rounded-xl bg-rose-pale border-l-4 border-primary p-4 mb-4 animate-fade-in">
              <p className="font-mono-ui text-[12px] text-muted-foreground mb-2">Version améliorée :</p>
              <p className="text-[14px] text-foreground leading-relaxed whitespace-pre-line mb-3">{aiResult}</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={acceptAi} className="rounded-pill text-xs bg-primary text-primary-foreground">
                  ✅ Utiliser cette version
                </Button>
                <Button size="sm" variant="outline" onClick={rejectAi} className="rounded-pill text-xs">
                  ❌ Garder ma version
                </Button>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-border mt-6">
            {currentStep > 1 ? (
              <Button variant="ghost" onClick={prevStep} className="text-sm text-muted-foreground">
                ← Étape précédente
              </Button>
            ) : <div />}
            <Button onClick={nextStep} className="rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux px-6">
              {currentStep === 8 ? "Terminer et voir mon storytelling →" : "Étape suivante →"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
