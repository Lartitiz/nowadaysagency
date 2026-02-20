import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Mic, Loader2, Check, Copy, Star, RefreshCw, Save } from "lucide-react";

interface NicheData {
  id?: string;
  step_1a_cause: string;
  step_1b_combats: string;
  step_1c_alternative: string;
  step_2_refusals: string;
  market: string;
  niche_specific: string;
  need: string;
  ideal_public: string;
  version_descriptive: string;
  version_pitch: string;
  version_manifeste: string;
  version_final: string;
  ai_combats: any;
  ai_limits: any;
  current_step: number;
  completed: boolean;
}

const EMPTY: NicheData = {
  step_1a_cause: "", step_1b_combats: "", step_1c_alternative: "",
  step_2_refusals: "", market: "", niche_specific: "", need: "", ideal_public: "",
  version_descriptive: "", version_pitch: "", version_manifeste: "", version_final: "",
  ai_combats: null, ai_limits: null, current_step: 1, completed: false,
};

const STEPS = [
  { number: 1, icon: "🔥", title: "Ton combat" },
  { number: 2, icon: "🚫", title: "Tes limites claires" },
  { number: 3, icon: "💎", title: "Assemble ta niche" },
];

export default function NichePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<NicheData>(EMPTY);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [aiLoading, setAiLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [persona, setPersona] = useState<any>(null);
  const [proposition, setProposition] = useState<any>(null);
  const [tone, setTone] = useState<any>(null);
  const [favorite, setFavorite] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<string>("step_1a_cause");
  const [brandingWarning, setBrandingWarning] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("brand_niche").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("activite, prenom, mission").eq("user_id", user.id).single(),
      supabase.from("persona").select("step_1_frustrations, step_2_transformation").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_proposition").select("step_1_what, step_2a_process, step_3_for_whom, version_final").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_profile").select("tone_register, key_expressions, things_to_avoid").eq("user_id", user.id).maybeSingle(),
      supabase.from("storytelling").select("step_7_polished").eq("user_id", user.id).maybeSingle(),
    ]).then(([nicheRes, profRes, perRes, propRes, toneRes, stRes]) => {
      if (nicheRes.data) {
        const { id, user_id, created_at, updated_at, ...rest } = nicheRes.data as any;
        setData(rest as NicheData);
        setExistingId(id);
        setCurrentStep(rest.current_step || 1);
      }
      setProfile(profRes.data || {});
      setPersona(perRes.data || null);
      setProposition(propRes.data || null);
      setTone(toneRes.data || null);
      // Check if branding is incomplete
      const hasStory = !!stRes.data?.step_7_polished;
      const hasPersona = !!perRes.data?.step_1_frustrations;
      const hasProp = !!propRes.data?.version_final;
      const hasTone = !!toneRes.data?.tone_register;
      setBrandingWarning(!hasStory || !hasPersona || !hasProp || !hasTone);
      setLoading(false);
    });
  }, [user]);

  const debouncedSave = useCallback((updated: NicheData) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      if (!user) return;
      const payload = { ...updated };
      delete (payload as any).id;
      if (existingId) {
        await supabase.from("brand_niche").update(payload as any).eq("id", existingId);
      } else {
        const { data: inserted } = await supabase.from("brand_niche").insert({ ...payload, user_id: user.id } as any).select("id").single();
        if (inserted) setExistingId(inserted.id);
      }
    }, 2000);
  }, [user, existingId]);

  const updateField = (field: keyof NicheData, value: string) => {
    const updated = { ...data, [field]: value };
    setData(updated);
    debouncedSave(updated);
  };

  const { isListening, isSupported, toggle: toggleMic } = useSpeechRecognition((text) => {
    const f = activeField as keyof NicheData;
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

  const nextStep = () => {
    if (currentStep < 3) goToStep(currentStep + 1);
    else {
      const updated = { ...data, completed: true, current_step: 3 };
      setData(updated);
      debouncedSave(updated);
      navigate("/branding/niche/recap");
    }
  };

  const prevStep = () => { if (currentStep > 1) goToStep(currentStep - 1); };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copié !" });
  };

  const saveIdeaToBox = async (combat: any) => {
    if (!user) return;
    await supabase.from("saved_ideas").insert({
      user_id: user.id,
      titre: combat.idee_contenu,
      angle: "coup_de_gueule",
      format: "Post engagé",
      canal: "instagram",
      objectif: "visibilite",
      status: "to_explore",
      notes: `Manifeste : ${combat.manifeste}`,
    } as any);
    toast({ title: "💾 Idée sauvegardée dans ta boîte à idées !" });
  };

  // AI handlers
  const handleAiCombats = async () => {
    if (!data.step_1a_cause.trim() && !data.step_1b_combats.trim()) {
      toast({ title: "Remplis au moins ta cause ou tes combats.", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    try {
      const { data: fn, error } = await supabase.functions.invoke("niche-ai", {
        body: { type: "combats", step_1a: data.step_1a_cause, step_1b: data.step_1b_combats, step_1c: data.step_1c_alternative, profile, proposition },
      });
      if (error) throw error;
      const raw = fn.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw);
      const updated = { ...data, ai_combats: parsed };
      setData(updated);
      debouncedSave(updated);
    } catch (e: any) {
      toast({ title: "Erreur IA", description: e.message, variant: "destructive" });
    }
    setAiLoading(false);
  };

  const handleAiLimits = async () => {
    if (!data.step_2_refusals.trim()) {
      toast({ title: "Écris d'abord ce que tu ne veux plus.", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    try {
      const { data: fn, error } = await supabase.functions.invoke("niche-ai", {
        body: { type: "limits", step_2: data.step_2_refusals, profile },
      });
      if (error) throw error;
      const raw = fn.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw);
      const updated = { ...data, ai_limits: parsed };
      setData(updated);
      debouncedSave(updated);
    } catch (e: any) {
      toast({ title: "Erreur IA", description: e.message, variant: "destructive" });
    }
    setAiLoading(false);
  };

  const handleGenerateNiche = async () => {
    setAiLoading(true);
    try {
      const { data: fn, error } = await supabase.functions.invoke("niche-ai", {
        body: {
          type: "generate-niche",
          profile, persona, proposition, tone,
          market: data.market, niche_specific: data.niche_specific,
          need: data.need, ideal_public: data.ideal_public,
          niche_step1_summary: data.step_1a_cause,
          niche_step2_summary: data.step_2_refusals,
        },
      });
      if (error) throw error;
      const raw = fn.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw);
      const updated = {
        ...data,
        version_descriptive: parsed.descriptive || "",
        version_pitch: parsed.pitch || "",
        version_manifeste: parsed.manifeste || "",
      };
      setData(updated);
      debouncedSave(updated);
    } catch (e: any) {
      toast({ title: "Erreur IA", description: e.message, variant: "destructive" });
    }
    setAiLoading(false);
  };

  const selectFavorite = (version: string, text: string) => {
    setFavorite(version);
    updateField("version_final", text);
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
          isListening && activeField === field ? "text-primary animate-pulse bg-primary/10" : "text-placeholder hover:text-primary"
        }`}
      >
        <Mic className="h-5 w-5" />
      </button>
    ) : null
  );

  const versions = [
    { key: "version_descriptive", label: "Descriptive", text: data.version_descriptive },
    { key: "version_pitch", label: "Pitch", text: data.version_pitch },
    { key: "version_manifeste", label: "Manifeste", text: data.version_manifeste },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Ma niche" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-1">Ta niche</h1>
        <p className="text-[15px] text-muted-foreground italic mb-6">
          Ta niche ne te limite pas : elle te rend lisible. C'est le moment de poser ce qui fait qu'on pense à toi.
        </p>

        {/* Context box */}
        <div className="rounded-xl bg-rose-pale p-5 text-[13px] text-foreground leading-relaxed mb-4">
          <p className="font-semibold mb-2">💡 Ta niche se construit sur tout ce que tu as déjà posé :</p>
          <ul className="space-y-1 ml-1">
            <li>• Ton histoire (qui tu es)</li>
            <li>• Ton persona (à qui tu parles)</li>
            <li>• Ta proposition de valeur (ce que tu apportes d'unique)</li>
            <li>• Ton ton & style (comment tu t'exprimes)</li>
          </ul>
          <p className="mt-2">Ici, on va ajouter les pièces manquantes : ton combat, tes limites, et ton positionnement final.</p>
        </div>

        {brandingWarning && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-[13px] text-amber-800 mb-6">
            Quelques sections de ton Branding ne sont pas encore complétées. Ça marche quand même, mais tes résultats seront plus précis si tu les remplis.{" "}
            <Link to="/branding" className="font-semibold text-primary hover:underline">Retour au Branding →</Link>
          </div>
        )}

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
                {i < 2 && <div className={`w-12 sm:w-24 h-0.5 ${step.number < currentStep ? "bg-primary" : "bg-rose-soft"}`} />}
              </div>
            ))}
          </div>
          <p className="font-mono-ui text-[12px] text-muted-foreground mt-3 text-center">Étape {currentStep} sur 3</p>
        </div>

        {/* STEP 1: Ton combat */}
        {currentStep === 1 && (
          <div className="animate-fade-in-x">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🔥</span>
              <h2 className="font-display text-xl font-bold text-foreground">Le drapeau que tu portes</h2>
            </div>
            <p className="text-[15px] text-foreground leading-relaxed mb-4">
              Ta marque ne se contente pas de vendre. Elle porte un message, répare une injustice, remet du sens. C'est ça qui te rend inoubliable.
            </p>

            {/* A: Ta cause */}
            <div className="mb-5">
              <label className="font-display text-sm font-bold text-foreground block mb-1">Ta cause</label>
              <p className="text-[12px] text-muted-foreground mb-2">Si tu devais résumer la cause que tu défends, ce serait quoi ? Ce que tu ne supportes plus dans ton secteur ?</p>
              <div className="relative">
                <textarea
                  value={data.step_1a_cause}
                  onChange={(e) => updateField("step_1a_cause", e.target.value)}
                  onFocus={() => setActiveField("step_1a_cause")}
                  placeholder="Ce que je veux changer dans mon secteur, c'est..."
                  className="w-full min-h-[150px] rounded-xl border-2 border-input bg-card px-4 py-3 pr-12 text-[15px] leading-relaxed placeholder:text-placeholder placeholder:italic focus:outline-none focus:border-primary transition-colors resize-none"
                />
                <MicButton field="step_1a_cause" />
              </div>
            </div>

            {/* B: Tes combats */}
            <div className="mb-5">
              <label className="font-display text-sm font-bold text-foreground block mb-1">Tes combats</label>
              <p className="text-[12px] text-muted-foreground mb-2">Quelles pratiques tu refuses ? Quelles croyances dépassées tu veux déconstruire ?</p>
              <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-3">
                <p className="font-semibold mb-1">💥 4 types d'opposants à explorer :</p>
                <ul className="space-y-1 ml-1">
                  <li>• Des groupes de gens : les influenceurs désalignés, les gourous du marketing agressif...</li>
                  <li>• Des systèmes établis : la pression de la perf, la course au "toujours plus"...</li>
                  <li>• Des fausses solutions : le greenwashing, les hacks miracles...</li>
                  <li>• Des idéologies dépassées : "il faut être partout", "écolo = triste"...</li>
                </ul>
              </div>
              <div className="relative">
                <textarea
                  value={data.step_1b_combats}
                  onChange={(e) => updateField("step_1b_combats", e.target.value)}
                  onFocus={() => setActiveField("step_1b_combats")}
                  placeholder="Ce qui me révolte, c'est... Les fausses solutions que je refuse, c'est..."
                  className="w-full min-h-[150px] rounded-xl border-2 border-input bg-card px-4 py-3 pr-12 text-[15px] leading-relaxed placeholder:text-placeholder placeholder:italic focus:outline-none focus:border-primary transition-colors resize-none"
                />
                <MicButton field="step_1b_combats" />
              </div>
            </div>

            {/* C: Le lien avec ton offre */}
            <div className="mb-5">
              <label className="font-display text-sm font-bold text-foreground block mb-1">Le lien avec ton offre</label>
              <p className="text-[12px] text-muted-foreground mb-2">Pour chaque combat, qu'est-ce que tu proposes à la place ?</p>
              <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-3">
                <p className="font-semibold mb-1">Exemples :</p>
                <p>❌ Le système médical brutal → ✅ L'écoute du corps et la prévention douce</p>
                <p>❌ La fast fashion floue → ✅ Une mode belle, claire et consciente</p>
                <p>❌ Le marketing de la manipulation → ✅ La communication comme outil d'émancipation</p>
              </div>
              <div className="relative">
                <textarea
                  value={data.step_1c_alternative}
                  onChange={(e) => updateField("step_1c_alternative", e.target.value)}
                  onFocus={() => setActiveField("step_1c_alternative")}
                  placeholder="À la place, je propose..."
                  className="w-full min-h-[120px] rounded-xl border-2 border-input bg-card px-4 py-3 pr-12 text-[15px] leading-relaxed placeholder:text-placeholder placeholder:italic focus:outline-none focus:border-primary transition-colors resize-none"
                />
                <MicButton field="step_1c_alternative" />
              </div>
            </div>

            <Button onClick={handleAiCombats} disabled={aiLoading} className="w-full rounded-pill h-12 text-base mb-3">
              {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyse en cours...</> : "✨ Formuler mes combats et mon manifeste"}
            </Button>

            {/* AI combats results */}
            {data.ai_combats && Array.isArray(data.ai_combats) && (
              <div className="space-y-3 mt-4">
                <p className="font-mono-ui text-[11px] font-semibold text-muted-foreground">TES COMBATS FORMULÉS :</p>
                {data.ai_combats.map((c: any, i: number) => (
                  <div key={i} className="rounded-xl bg-card border border-border p-4 space-y-2">
                    <p className="text-[13px] text-foreground"><span className="font-semibold">❌ Ce que je refuse :</span> {c.refuse}</p>
                    <p className="text-[13px] text-foreground"><span className="font-semibold">✅ Ce que je propose :</span> {c.propose}</p>
                    <div className="rounded-lg bg-rose-pale p-3">
                      <p className="text-[14px] text-foreground font-semibold italic">"{c.manifeste}"</p>
                    </div>
                    <p className="text-[12px] text-muted-foreground"><span className="font-semibold">💡 Idée de contenu :</span> {c.idee_contenu}</p>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => copyText(c.manifeste)} className="rounded-pill text-[11px]">
                        <Copy className="h-3 w-3 mr-1" /> Copier le manifeste
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => saveIdeaToBox(c)} className="rounded-pill text-[11px]">
                        <Save className="h-3 w-3 mr-1" /> Sauvegarder l'idée
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Tes limites */}
        {currentStep === 2 && (
          <div className="animate-fade-in-x">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🚫</span>
              <h2 className="font-display text-xl font-bold text-foreground">Tes limites claires</h2>
            </div>
            <p className="text-[15px] text-foreground leading-relaxed mb-4">
              Parfois, on ne trouve pas sa niche en se demandant "pour qui je veux travailler" mais en étant honnête : avec qui je ne veux PLUS bosser.
            </p>

            <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-4">
              <p className="font-semibold mb-2">Pour creuser :</p>
              <ul className="space-y-1 ml-1">
                <li>• Des profils avec lesquels tu te sens vidée après une collaboration ?</li>
                <li>• Des demandes qui te mettent la boule au ventre ?</li>
                <li>• Des sujets ou des formats qui t'éloignent de tes valeurs ?</li>
                <li>• Des moments où tu t'es sentie obligée, pas légitime, ou utilisée ?</li>
              </ul>
            </div>

            <div className="relative mb-4">
              <textarea
                value={data.step_2_refusals}
                onChange={(e) => updateField("step_2_refusals", e.target.value)}
                onFocus={() => setActiveField("step_2_refusals")}
                placeholder="Je ne veux plus travailler avec / sur / pour..."
                className="w-full min-h-[200px] rounded-xl border-2 border-input bg-card px-4 py-3 pr-12 text-[15px] leading-relaxed placeholder:text-placeholder placeholder:italic focus:outline-none focus:border-primary transition-colors resize-none"
              />
              <MicButton field="step_2_refusals" />
            </div>

            <Button onClick={handleAiLimits} disabled={aiLoading} className="w-full rounded-pill h-12 text-base mb-3">
              {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyse en cours...</> : "✨ Clarifier mes limites"}
            </Button>

            {data.ai_limits && Array.isArray(data.ai_limits) && (
              <div className="mt-4">
                <p className="font-mono-ui text-[11px] font-semibold text-muted-foreground mb-3">TES LIMITES ÉCLAIRÉES :</p>
                <div className="space-y-2">
                  {data.ai_limits.map((l: any, i: number) => (
                    <div key={i} className="rounded-xl bg-card border border-border p-4 grid grid-cols-2 gap-3">
                      <div>
                        <p className="font-mono-ui text-[10px] font-semibold text-muted-foreground mb-1">CE QUE JE REFUSE</p>
                        <p className="text-[13px] text-foreground">{l.refuse}</p>
                      </div>
                      <div>
                        <p className="font-mono-ui text-[10px] font-semibold text-muted-foreground mb-1">CE QUE ÇA DIT DE MA NICHE</p>
                        <p className="text-[13px] text-foreground">{l.eclaire}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Assemble ta niche */}
        {currentStep === 3 && (
          <div className="animate-fade-in-x">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">💎</span>
              <h2 className="font-display text-xl font-bold text-foreground">Assemble ta niche</h2>
            </div>
            <p className="text-[15px] text-foreground leading-relaxed mb-4">
              On met tout ensemble. L'IA va prendre tout ce que tu as construit dans ton Branding et formuler ta niche de manière limpide.
            </p>

            {/* Recap box */}
            <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-6 space-y-2">
              <p className="font-semibold mb-2">📋 Résumé de ton Branding :</p>
              <RecapLine label="Ce que tu fais" value={proposition?.step_1_what} link="/branding/proposition" />
              <RecapLine label="Ce qui te rend unique" value={proposition?.step_2a_process} link="/branding/proposition" />
              <RecapLine label="Pour qui" value={proposition?.step_3_for_whom} link="/branding/proposition" />
              <RecapLine label="Ta proposition de valeur" value={proposition?.version_final} link="/branding/proposition" />
              <RecapLine label="Les frustrations de ta cible" value={persona?.step_1_frustrations} link="/branding/persona" />
              <RecapLine label="Ton combat" value={data.step_1a_cause} link="" />
              <RecapLine label="Ce que tu refuses" value={data.step_2_refusals} link="" />
            </div>

            {/* 4 niche fields */}
            <div className="space-y-4 mb-6">
              {[
                { key: "market", icon: "🛍", label: "Ton marché", aide: "Le secteur dans lequel tu évolues.", placeholder: "La mode / Le bien-être / La déco / La nutrition / Le coaching..." },
                { key: "niche_specific", icon: "🔍", label: "Ta niche", aide: "La partie spécifique de ce marché sur laquelle tu te concentres.", placeholder: "La mode éthique pour femmes actives / La nutrition végétale pour personnes stressées..." },
                { key: "need", icon: "🧩", label: "Le besoin auquel tu réponds", aide: "Quel problème ou quelle frustration tu veux soulager ?", placeholder: "Se sentir bien dans ses vêtements sans culpabiliser..." },
                { key: "ideal_public", icon: "👥", label: "Ton public idéal", aide: "À qui tu veux parler ? Qui tu as envie d'aider ?", placeholder: "Jeunes mamans écolo / Entrepreneuses en reconversion..." },
              ].map((f) => (
                <div key={f.key}>
                  <label className="font-display text-sm font-bold text-foreground block mb-0.5">{f.icon} {f.label}</label>
                  <p className="text-[12px] text-muted-foreground mb-1.5">{f.aide}</p>
                  <Input
                    value={(data as any)[f.key] || ""}
                    onChange={(e) => updateField(f.key as keyof NicheData, e.target.value)}
                    placeholder={f.placeholder}
                  />
                </div>
              ))}
            </div>

            <Button onClick={handleGenerateNiche} disabled={aiLoading} className="w-full rounded-pill h-12 text-base mb-4">
              {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération en cours...</> : "✨ Générer ma niche"}
            </Button>

            {/* Generated versions */}
            {(data.version_descriptive || data.version_pitch || data.version_manifeste) && (
              <div className="space-y-3 mb-6">
                {versions.filter(v => v.text).map((v) => (
                  <div key={v.key} className={`rounded-xl border-2 p-4 transition-all ${favorite === v.key ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                    <p className="font-mono-ui text-[10px] font-semibold text-muted-foreground mb-2">{v.label.toUpperCase()}</p>
                    <p className="text-[14px] text-foreground leading-relaxed mb-3 whitespace-pre-line">{v.text}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => copyText(v.text)} className="rounded-pill text-[11px]">
                        <Copy className="h-3 w-3 mr-1" /> Copier
                      </Button>
                      <Button
                        variant={favorite === v.key ? "default" : "outline"}
                        size="sm"
                        onClick={() => selectFavorite(v.key, v.text)}
                        className="rounded-pill text-[11px]"
                      >
                        <Star className="h-3 w-3 mr-1" /> {favorite === v.key ? "Ma préférée !" : "C'est ma préférée"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Final version textarea */}
            {(data.version_descriptive || data.version_final) && (
              <div className="mb-4">
                <label className="font-display text-sm font-bold text-foreground block mb-2">Ma version finale</label>
                <textarea
                  value={data.version_final}
                  onChange={(e) => updateField("version_final", e.target.value)}
                  placeholder="Écris ou modifie ta version finale ici..."
                  className="w-full min-h-[120px] rounded-xl border-2 border-input bg-card px-4 py-3 text-[15px] leading-relaxed placeholder:text-placeholder placeholder:italic focus:outline-none focus:border-primary transition-colors resize-none"
                />
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-4 border-t border-border">
          {currentStep > 1 ? (
            <Button variant="outline" onClick={prevStep} className="rounded-pill">← Étape précédente</Button>
          ) : (
            <Link to="/branding"><Button variant="outline" className="rounded-pill">← Retour</Button></Link>
          )}
          <Button onClick={nextStep} className="rounded-pill">
            {currentStep === 3 ? "💾 Enregistrer ma niche" : "Étape suivante →"}
          </Button>
        </div>
      </main>
    </div>
  );
}

function RecapLine({ label, value, link }: { label: string; value?: string | null; link: string }) {
  const display = value ? (value.length > 100 ? value.slice(0, 100) + "..." : value) : null;
  return (
    <p className="text-[13px]">
      <span className="font-semibold">{label} :</span>{" "}
      {display ? (
        <span className="text-foreground">{display}</span>
      ) : (
        <span className="text-muted-foreground italic">
          Non renseigné{link && <> — <Link to={link} className="text-primary hover:underline">Compléter →</Link></>}
        </span>
      )}
    </p>
  );
}
