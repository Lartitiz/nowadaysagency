import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useBrandProfile } from "@/hooks/use-profile";
import { usePersona, useBrandProposition, useBrandStrategy } from "@/hooks/use-branding";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import AuditRecommendationBanner from "@/components/AuditRecommendationBanner";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Mic, Loader2, Check, Copy, Save, ArrowRight } from "lucide-react";

interface StrategyData {
  id?: string;
  step_1_hidden_facets: string;
  facet_1: string; facet_1_format: string;
  facet_2: string; facet_2_format: string;
  facet_3: string; facet_3_format: string;
  pillar_major: string;
  pillar_minor_1: string; pillar_minor_2: string; pillar_minor_3: string;
  creative_concept: string;
  ai_facets: any; ai_pillars: any; ai_concepts: any;
  current_step: number; completed: boolean;
}

const EMPTY: StrategyData = {
  step_1_hidden_facets: "",
  facet_1: "", facet_1_format: "", facet_2: "", facet_2_format: "", facet_3: "", facet_3_format: "",
  pillar_major: "", pillar_minor_1: "", pillar_minor_2: "", pillar_minor_3: "",
  creative_concept: "",
  ai_facets: null, ai_pillars: null, ai_concepts: null,
  current_step: 1, completed: false,
};

const STEPS = [
  { number: 1, icon: "🗣️", title: "Ose parler plus" },
  { number: 2, icon: "🔎", title: "Tes piliers" },
  { number: 3, icon: "✨", title: "Ton concept créatif" },
];

const FORMAT_OPTIONS = ["Story perso", "Post coulisses", "Carrousel \"je crois en...\"", "Reel face cam", "Newsletter intime"];

export default function StrategiePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const [data, setData] = useState<StrategyData>(EMPTY);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [aiLoading, setAiLoading] = useState(false);
  const { data: profile } = useProfile();
  const { data: tone } = useBrandProfile();
  const { data: personaHook } = usePersona();
  const { data: propositionHook } = useBrandProposition();
  const { data: strategyHook, isLoading: strategyLoading } = useBrandStrategy();
  const persona = personaHook as any;
  const proposition = propositionHook as any;
  const [activeField, setActiveField] = useState("step_1_hidden_facets");
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user || !loading || strategyLoading) return;
    if (strategyHook) {
      const { id, user_id, created_at, updated_at, ...rest } = strategyHook as any;
      setData({ ...EMPTY, ...rest } as StrategyData);
      setExistingId(id);
      const savedStep = rest.current_step || 1;
      const mappedStep = savedStep <= 1 ? 1 : savedStep === 2 ? 2 : savedStep === 3 ? 2 : 3;
      setCurrentStep(Math.min(mappedStep, 3));
    }
    setLoading(false);
  }, [user?.id, strategyLoading, strategyHook]);

  const saveNow = useCallback(async (updated: StrategyData) => {
    if (!user) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    const payload = { ...updated };
    delete (payload as any).id;
    if (existingId) {
      await supabase.from("brand_strategy").update(payload as any).eq("id", existingId);
      queryClient.invalidateQueries({ queryKey: ["brand-strategy"] });
    } else {
      const { data: inserted } = await supabase.from("brand_strategy").insert({ ...payload, user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined } as any).select("id").single();
      if (inserted) {
        setExistingId(inserted.id);
        queryClient.invalidateQueries({ queryKey: ["brand-strategy"] });
      }
    }
  }, [user, existingId]);

  const debouncedSave = useCallback((updated: StrategyData) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveNow(updated), 2000);
  }, [saveNow]);

  const updateField = (field: keyof StrategyData, value: string) => {
    const updated = { ...data, [field]: value };
    setData(updated);
    debouncedSave(updated);
  };

  const { isListening, isSupported, toggle: toggleMic } = useSpeechRecognition((text) => {
    const f = activeField as keyof StrategyData;
    const cur = (data[f] as string) || "";
    updateField(f, cur + (cur ? " " : "") + text);
  });

  const goToStep = (step: number) => {
    setCurrentStep(step);
    const maxStep = Math.max(data.current_step, step);
    if (maxStep > data.current_step) {
      const updated = { ...data, current_step: maxStep };
      setData(updated);
      debouncedSave(updated);
    }
  };

  const nextStep = async () => {
    if (currentStep < 3) goToStep(currentStep + 1);
    else {
      const updated = { ...data, completed: true, current_step: 3 };
      setData(updated);
      await saveNow(updated);
      navigate("/branding/strategie/recap");
    }
  };

  const prevStep = () => { if (currentStep > 1) goToStep(currentStep - 1); };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copié !" });
  };

  const saveIdeaToBox = async (titre: string, angle: string, format: string) => {
    if (!user) return;
    await supabase.from("saved_ideas").insert({
      user_id: user.id, titre, angle, format, canal: "instagram",
      objectif: "visibilite", status: "to_explore",
      workspace_id: workspaceId !== user.id ? workspaceId : undefined,
    } as any);
    toast({ title: "💾 Idée sauvegardée dans ta boîte à idées !" });
  };

  const handleAiFacets = async () => {
    setAiLoading(true);
    try {
      const { data: fn, error } = await supabase.functions.invoke("strategy-ai", {
        body: { type: "facets", text: data.step_1_hidden_facets, facets: [data.facet_1, data.facet_2, data.facet_3], profile, persona, tone },
      });
      if (error) throw error;
      const raw = fn.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw);
      const updated = { ...data, ai_facets: parsed };
      setData(updated);
      debouncedSave(updated);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Oups, un souci", description: friendlyError(e), variant: "destructive" });
    }
    setAiLoading(false);
  };

  const handleAiPillars = async () => {
    setAiLoading(true);
    try {
      const { data: fn, error } = await supabase.functions.invoke("strategy-ai", {
        body: {
          type: "pillars",
          profile, persona, proposition, tone, facets: [data.facet_1, data.facet_2, data.facet_3].filter(Boolean),
        },
      });
      if (error) throw error;
      const raw = fn.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw);
      const updated = { ...data, ai_pillars: parsed };
      setData(updated);
      debouncedSave(updated);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Oups, un souci", description: friendlyError(e), variant: "destructive" });
    }
    setAiLoading(false);
  };

  const acceptPillars = () => {
    if (!data.ai_pillars) return;
    const updated = {
      ...data,
      pillar_major: data.ai_pillars.majeure?.pilier || "",
      pillar_minor_1: data.ai_pillars.mineures?.[0]?.pilier || "",
      pillar_minor_2: data.ai_pillars.mineures?.[1]?.pilier || "",
      pillar_minor_3: data.ai_pillars.mineures?.[2]?.pilier || "",
    };
    setData(updated);
    debouncedSave(updated);
    toast({ title: "Piliers appliqués !" });
  };

  const handleAiConcepts = async () => {
    setAiLoading(true);
    try {
      const { data: fn, error } = await supabase.functions.invoke("strategy-ai", {
        body: {
          type: "concepts", creative_text: data.creative_concept,
          profile, persona, proposition, tone,
          pillars: { major: data.pillar_major, minors: [data.pillar_minor_1, data.pillar_minor_2, data.pillar_minor_3].filter(Boolean) },
        },
      });
      if (error) throw error;
      const raw = fn.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw);
      const updated = { ...data, ai_concepts: parsed };
      setData(updated);
      debouncedSave(updated);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Oups, un souci", description: friendlyError(e), variant: "destructive" });
    }
    setAiLoading(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div>
    </div>
  );

  const MicButton = ({ field }: { field: string }) => (
    isSupported ? (
      <button
        onClick={() => { setActiveField(field); toggleMic(); }}
        className={`absolute right-3 top-3 p-2 rounded-full transition-all ${
          isListening && activeField === field ? "text-primary animate-pulse bg-primary/10" : "text-muted-foreground hover:text-primary"
        }`}
      >
        <Mic className="h-5 w-5" />
      </button>
    ) : null
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Ma ligne éditoriale" useFromParam />
        <AuditRecommendationBanner />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-1">Ta stratégie de contenu</h1>
        <p className="text-[15px] text-muted-foreground italic mb-6">
          Pas un plan de publication : une vision claire de ce que tu racontes, pourquoi, et comment tu le rends mémorable.
        </p>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {STEPS.map((step, i) => (
              <div key={i} className="flex items-center">
                <button
                  onClick={() => goToStep(step.number)}
                  className={`relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    step.number < currentStep ? "bg-primary text-primary-foreground"
                      : step.number === currentStep ? "bg-primary text-primary-foreground ring-4 ring-primary/30 animate-pulse"
                        : "border-2 border-rose-soft bg-background text-muted-foreground"
                  }`}
                >
                  {step.number < currentStep ? <Check className="h-3.5 w-3.5" /> : step.number}
                </button>
                {i < 2 && <div className={`w-12 sm:w-24 h-0.5 ${step.number < currentStep ? "bg-primary" : "bg-rose-soft"}`} />}
              </div>
            ))}
          </div>
          <p className="font-mono-ui text-[12px] text-muted-foreground mt-3 text-center">Étape {currentStep} sur 3</p>
        </div>

        {/* STEP 1: Facettes */}
        {currentStep === 1 && (
          <div className="animate-fade-in-x">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🗣️</span>
              <h2 className="font-display text-xl font-bold text-foreground">Les facettes de toi que tu ne montres pas encore</h2>
            </div>
            <p className="text-[15px] text-foreground leading-relaxed mb-4">
              Ton audience a besoin de comprendre qui tu es. Pas juste ce que tu vends.
            </p>

            <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-4">
              <p>Pense à : tes convictions personnelles, tes passions, tes routines, tes doutes, tes contradictions...</p>
            </div>

            <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-5">
              <p className="font-semibold mb-1">Exemples :</p>
              <p>• Une graphiste freelance qui parle aussi de ses lectures sur le design engagé</p>
               <p>• Une coach en reconversion qui partage ses routines bien-être + ses galères d'auto-entrepreneure</p>
               <p>• Une consultante en communication qui raconte sa vie de maman sans filtre</p>
            </div>

            <div className="relative mb-5">
              <textarea
                value={data.step_1_hidden_facets}
                onChange={(e) => updateField("step_1_hidden_facets", e.target.value)}
                onFocus={() => setActiveField("step_1_hidden_facets")}
                placeholder="Les facettes de moi que je n'ose pas encore montrer..."
                className="w-full min-h-[150px] rounded-xl border-2 border-input bg-card px-4 py-3 pr-12 text-[15px] leading-relaxed placeholder:text-muted-foreground placeholder:italic focus:outline-none focus:border-primary transition-colors resize-none"
              />
              <MicButton field="step_1_hidden_facets" />
            </div>

            <p className="font-display text-sm font-bold text-foreground mb-3">3 choses qui font partie de toi mais que tu ne montres pas encore :</p>
            {[
              { field: "facet_1" as const, formatField: "facet_1_format" as const, placeholder: "Ex : mes lectures féministes" },
              { field: "facet_2" as const, formatField: "facet_2_format" as const, placeholder: "Ex : mes galères de maman" },
              { field: "facet_3" as const, formatField: "facet_3_format" as const, placeholder: "Ex : mon rapport à l'argent" },
            ].map(({ field, formatField, placeholder }) => (
              <div key={field} className="flex gap-2 mb-3 items-start">
                <Input
                  value={(data[field] as string) || ""}
                  onChange={(e) => updateField(field, e.target.value)}
                  placeholder={placeholder}
                  className="flex-1"
                />
                <select
                  value={(data[formatField] as string) || ""}
                  onChange={(e) => updateField(formatField, e.target.value)}
                  className="rounded-lg border-2 border-input bg-card px-3 py-2 text-[13px] min-w-[140px]"
                >
                  <option value="">Format...</option>
                  {FORMAT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            ))}

            <Button onClick={handleAiFacets} disabled={aiLoading} className="w-full mt-4 mb-4">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "✨"} Trouver d'autres facettes à explorer
            </Button>

            {data.ai_facets && Array.isArray(data.ai_facets) && (
              <div className="space-y-3 mb-4">
                {data.ai_facets.map((f: any, i: number) => (
                  <div key={i} className="rounded-xl border-2 border-border bg-card p-4">
                    <p className="font-semibold text-sm text-foreground mb-1">{f.facette}</p>
                    <p className="text-[12px] text-muted-foreground mb-1">💡 {f.pourquoi}</p>
                    <p className="text-[12px] text-muted-foreground mb-1">📱 Format : {f.format}</p>
                    <p className="text-[13px] text-foreground italic mb-2">"{f.accroche}"</p>
                    <div className="flex gap-2">
                      <button onClick={() => copyText(f.accroche)} className="text-[11px] text-primary hover:underline flex items-center gap-1"><Copy className="h-3 w-3" /> Copier</button>
                      <button onClick={() => saveIdeaToBox(f.facette, f.accroche, f.format)} className="text-[11px] text-primary hover:underline flex items-center gap-1"><Save className="h-3 w-3" /> Sauvegarder</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Pillars */}
        {currentStep === 2 && (
          <div className="animate-fade-in-x">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🔎</span>
              <h2 className="font-display text-xl font-bold text-foreground">Tes grandes thématiques</h2>
            </div>
            <p className="text-[15px] text-foreground leading-relaxed mb-4">
              Identifie 3 à 5 grandes thématiques que tu vas aborder régulièrement.
            </p>

            <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-4">
              <p className="font-semibold mb-1">Attention : ta thématique n'est PAS ton produit.</p>
              <p>❌ Tu ne dis pas : "Ma thématique c'est : rouge à lèvres."</p>
              <p>✅ Tu dis : "Ma thématique, c'est la féminité libre, assumée et inclusive."</p>
            </div>

            <div className="mb-5">
              <label className="font-display text-sm font-bold text-foreground block mb-2">🔥 Ta majeure : la thématique centrale</label>
              <Input
                value={data.pillar_major}
                onChange={(e) => updateField("pillar_major", e.target.value)}
                placeholder="La communication authentique / L'entrepreneuriat engagé / Le bien-être accessible..."
              />
            </div>

            <div className="mb-5">
              <label className="font-display text-sm font-bold text-foreground block mb-2">🌱 Tes mineures : les thématiques satellites</label>
              <div className="space-y-2">
                <Input value={data.pillar_minor_1} onChange={(e) => updateField("pillar_minor_1", e.target.value)} placeholder="Ex : L'écologie joyeuse" />
                <Input value={data.pillar_minor_2} onChange={(e) => updateField("pillar_minor_2", e.target.value)} placeholder="Ex : Les coulisses de l'entrepreneuriat" />
                <Input value={data.pillar_minor_3} onChange={(e) => updateField("pillar_minor_3", e.target.value)} placeholder="Ex : La slow life (optionnel)" />
              </div>
            </div>

            <Button onClick={handleAiPillars} disabled={aiLoading} className="w-full mb-4">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "✨"} Suggérer des piliers de contenu
            </Button>

            {data.ai_pillars && (
              <div className="space-y-3 mb-4">
                {data.ai_pillars.majeure && (
                  <div className="rounded-xl border-2 border-primary/30 bg-card p-4">
                    <p className="font-semibold text-sm text-foreground mb-1">🔥 {data.ai_pillars.majeure.pilier}</p>
                    <p className="text-[12px] text-muted-foreground mb-2">{data.ai_pillars.majeure.explication}</p>
                    <p className="text-[12px] text-foreground">Sujets : {data.ai_pillars.majeure.sujets?.join(" · ")}</p>
                  </div>
                )}
                {data.ai_pillars.mineures?.map((m: any, i: number) => (
                  <div key={i} className="rounded-xl border-2 border-border bg-card p-4">
                    <p className="font-semibold text-sm text-foreground mb-1">🌱 {m.pilier}</p>
                    <p className="text-[12px] text-muted-foreground mb-2">{m.explication}</p>
                    <p className="text-[12px] text-foreground">Sujets : {m.sujets?.join(" · ")}</p>
                  </div>
                ))}
                <Button variant="outline" onClick={acceptPillars} className="w-full">
                  ✅ Appliquer ces piliers
                </Button>
              </div>
            )}

            <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground border-l-4 border-primary mt-4">
              💡 Tes piliers de contenu seront utilisés dans l'atelier d'idées pour te proposer des sujets encore plus ciblés.{" "}
              <Link to="/atelier" className="font-semibold text-primary hover:underline">Aller à l'atelier →</Link>
            </div>
          </div>
        )}

        {/* STEP 3: Creative concept */}
        {currentStep === 3 && (
          <div className="animate-fade-in-x">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">✨</span>
              <h2 className="font-display text-xl font-bold text-foreground">Le twist qui te rend mémorable</h2>
            </div>
            <p className="text-[15px] text-foreground leading-relaxed mb-4">
              Tu as ton sujet, tu as ton format. Maintenant : comment tu peux le présenter d'une manière qu'on n'a pas déjà vue 15 fois ?
            </p>

            <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-5">
              <p className="font-semibold mb-2">💥 5 pistes à explorer :</p>
              <p>🎭 Une mise en scène inattendue → "Et si je devais vendre ce produit à ma moi de 15 ans ?"</p>
              <p>🎁 Une analogie visuelle ou absurde → "Ma marque, c'est un mix entre un cappuccino mousseux et un jean brut"</p>
              <p>🎬 Un format narratif détourné → Journal intime, appel entre potes, fausse pub...</p>
              <p>🧪 Une expérience ou un jeu → Test à l'aveugle, mini-défi, quizz...</p>
              <p>🪞 Un miroir inversé → Et si ton client parlait de toi à sa meilleure amie ?</p>
            </div>

            <label className="font-display text-sm font-bold text-foreground block mb-2">Ton concept créatif signature : c'est quoi TA manière de présenter les choses ?</label>
            <div className="relative mb-5">
              <textarea
                value={data.creative_concept}
                onChange={(e) => updateField("creative_concept", e.target.value)}
                onFocus={() => setActiveField("creative_concept")}
                placeholder="Ma touche à moi, c'est..."
                className="w-full min-h-[150px] rounded-xl border-2 border-input bg-card px-4 py-3 pr-12 text-[15px] leading-relaxed placeholder:text-muted-foreground placeholder:italic focus:outline-none focus:border-primary transition-colors resize-none"
              />
              <MicButton field="creative_concept" />
            </div>

            <Button onClick={handleAiConcepts} disabled={aiLoading} className="w-full mb-4">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "✨"} Générer des concepts créatifs
            </Button>

            {data.ai_concepts && Array.isArray(data.ai_concepts) && (
              <div className="space-y-3 mb-4">
                {data.ai_concepts.map((c: any, i: number) => (
                  <div key={i} className="rounded-xl border-2 border-border bg-card p-4">
                    <p className="font-semibold text-sm text-foreground mb-1">{c.concept}</p>
                    <p className="text-[13px] text-foreground mb-1">📝 {c.exemple}</p>
                    <p className="text-[12px] text-muted-foreground mb-1">📱 Format : {c.format}</p>
                    <p className="text-[12px] text-muted-foreground mb-2">💡 {c.pourquoi}</p>
                    <button onClick={() => saveIdeaToBox(c.concept, c.exemple, c.format)} className="text-[11px] text-primary hover:underline flex items-center gap-1">
                      <Save className="h-3 w-3" /> Sauvegarder dans ma boîte à idées
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={prevStep} disabled={currentStep === 1}>← Précédent</Button>
          <Button onClick={nextStep}>
            {currentStep < 3 ? "Suivant →" : "Voir le récap →"}
          </Button>
        </div>
      </main>
    </div>
  );
}
