import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, MessageCircle, Lightbulb } from "lucide-react";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import PreGenCoaching, { type PreGenBrief } from "@/components/coach/PreGenCoaching";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import {
  HomepageData, EMPTY, STEPS, FRAMEWORKS, PAGE_TYPES,
} from "@/components/site/SiteShared";
import Step1Hook from "@/components/site/Step1Hook";
import Step2Problem from "@/components/site/Step2Problem";
import Step3Transform from "@/components/site/Step3Transform";
import Step4Plan from "@/components/site/Step4Plan";
import Step5OfferPrice from "@/components/site/Step5OfferPrice";
import Step6ForWho from "@/components/site/Step6ForWho";
import Step7WhoYouAre from "@/components/site/Step7WhoYouAre";
import Step8Guarantee from "@/components/site/Step8Guarantee";
import Step9FaqCta from "@/components/site/Step9FaqCta";
import Step10SeoLayout from "@/components/site/Step10SeoLayout";

export default function SiteAccueil() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const navigate = useNavigate();
  const [data, setData] = useState<HomepageData>(EMPTY);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, any>>({});
  const [brandingPercent, setBrandingPercent] = useState(100);
  const [showCoaching, setShowCoaching] = useState(false);
  const [coachingBrief, setCoachingBrief] = useState<PreGenBrief | null>(null);
  const [showIdeasDialog, setShowIdeasDialog] = useState(false);

  useEffect(() => {
    if (!user || !loading) return;
    const load = async () => {
      const { data: hp } = await (supabase.from("website_homepage") as any).select("*").eq(column, value).maybeSingle();
      if (hp) {
        const faq = Array.isArray(hp.faq) ? hp.faq as any[] : [];
        const plan_steps = Array.isArray((hp as any).plan_steps) ? (hp as any).plan_steps : [];
        const storybrand_data = (hp as any).storybrand_data || null;
        setData({ ...EMPTY, ...hp, faq, plan_steps, storybrand_data } as any);
        setStep(hp.current_step || 1);
      }
      const { getBrandingCompletion } = await import("@/lib/branding-completion");
      const { percent } = await getBrandingCompletion({ column, value });
      setBrandingPercent(percent);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const save = useCallback(async (updates: Partial<HomepageData>) => {
    if (!user) return;
    const newData = { ...data, ...updates };
    setData(newData);
    const dbPayload: any = { ...updates };
    if (updates.faq) dbPayload.faq = JSON.stringify(updates.faq);
    if (updates.plan_steps) dbPayload.plan_steps = JSON.stringify(updates.plan_steps);
    if (updates.storybrand_data) dbPayload.storybrand_data = JSON.stringify(updates.storybrand_data);
    if (updates.checklist_data) dbPayload.checklist_data = JSON.stringify(updates.checklist_data);
    await supabase.from("website_homepage").upsert(
      { 
        user_id: user.id, 
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        ...dbPayload, 
        current_step: step 
      },
      { onConflict: "user_id" }
    );
  }, [user, data, step]);

  const callAI = async (action: string, extraParams: Record<string, any> = {}) => {
    if (!user) return;
    setAiLoading(action);
    try {
      const body: any = { action, ...extraParams, workspace_id: workspaceId !== user?.id ? workspaceId : undefined };
      if (coachingBrief?.summary) {
        body.pre_gen_brief = coachingBrief.summary;
      }
      const { data: result, error } = await supabase.functions.invoke("website-ai", { body });
      if (error) throw error;
      const raw = result?.content || "";
      let parsed: any;
      try {
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = raw;
      }
      setAiResults((prev) => ({ ...prev, [action]: parsed }));
      return parsed;
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast.error(friendlyError(e));
    } finally {
      setAiLoading(null);
    }
  };

  const generateAll = async () => {
    if (brandingPercent < 30) {
      toast.error("Ton branding n'est pas assez complet. Remplis au moins ta proposition de valeur et ton persona.");
      return;
    }
    if (data.framework === "storybrand") {
      const result = await callAI("storybrand");
      if (result && typeof result === "object") {
        const updates: Partial<HomepageData> = {
          hook_title: result.hero || "",
          problem_block: `Externe : ${result.problem_external || ""}\nInterne : ${result.problem_internal || ""}\nPhilosophique : ${result.problem_philosophical || ""}`,
          presentation_block: `${result.guide_empathy || ""}\n\n${result.guide_authority || ""}`,
          plan_steps: result.plan || [],
          cta_primary: result.cta_direct || "",
          cta_secondary: result.cta_transitional || "",
          failure_block: result.failure || "",
          benefits_block: result.success || "",
          faq: Array.isArray(result.faq) ? result.faq : [],
          storybrand_data: result,
        };
        save(updates);
        toast.success("Page StoryBrand générée ! Parcours chaque étape pour peaufiner.");
      }
    } else {
      const result = await callAI("generate-all");
      if (result && typeof result === "object") {
        const updates: Partial<HomepageData> = {
          hook_title: result.titre || "",
          hook_subtitle: result.sous_titre || "",
          problem_block: result.probleme || "",
          benefits_block: result.benefices || "",
          offer_block: result.offre || "",
          presentation_block: result.presentation || "",
          faq: Array.isArray(result.faq) ? result.faq : [],
          cta_primary: Array.isArray(result.cta) ? result.cta[0] || "" : "",
          cta_secondary: Array.isArray(result.cta) ? result.cta[1] || "" : "",
        };
        save(updates);
        toast.success("Page générée ! Parcours chaque étape pour peaufiner.");
      }
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const goStep = (s: number) => {
    setStep(s);
    save({ current_step: s } as any);
  };

  const totalSteps = STEPS.length;
  const nextStep = () => {
    const next = Math.min(step + 1, totalSteps + 1);
    if (next === totalSteps + 1) {
      save({ completed: true, current_step: totalSteps } as any);
      navigate("/site/accueil/recap");
    } else {
      goStep(next);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="flex gap-1"><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} /></div></div>;

  const completedSteps = [
    data.hook_title || data.hook_subtitle,
    data.problem_block,
    data.benefits_block || data.offer_block,
    data.plan_steps.length > 0,
    data.offer_name || data.offer_price,
    data.for_who_ideal,
    data.presentation_block,
    data.guarantee_type,
    data.faq.length > 0 || data.cta_primary,
    data.seo_title || data.layout_done,
  ].filter(Boolean).length;

  const stepProps = { data, save, callAI, aiLoading, aiResults, copyText };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <Link to="/site" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" /> Retour à Site Web
        </Link>

        <div className="mb-6">
          <h1 className="font-display text-[26px] font-bold text-foreground">🌐 Ta page web</h1>
          <p className="mt-1 text-sm text-muted-foreground italic">Chaque section a un rôle précis. On les construit une par une.</p>
        </div>

        {brandingPercent < 50 && (
          <div className="rounded-xl bg-rose-pale border border-primary/20 p-4 mb-6">
            <p className="text-sm text-foreground">💡 Plus ton branding est complet, plus les textes générés seront pertinents. <Link to="/branding" className="text-primary font-semibold hover:underline">Compléter mon branding →</Link></p>
          </div>
        )}

        {/* Pre-gen coaching banner */}
        {!showCoaching && !coachingBrief && (
          <button
            onClick={() => setShowCoaching(true)}
            className="w-full rounded-xl border border-border bg-card hover:border-primary/40 p-4 mb-6 text-left transition-all group"
          >
            <div className="flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">💬 Besoin d'aide pour cadrer ta page ? Démarre un mini-coaching</p>
                <p className="text-xs text-muted-foreground mt-0.5">3-5 questions pour que l'IA comprenne exactement ce que tu veux.</p>
              </div>
            </div>
          </button>
        )}

        {showCoaching && !coachingBrief && (
          <div className="mb-6">
            <PreGenCoaching
              generationType="sales-page"
              onComplete={(brief) => {
                setCoachingBrief(brief);
                setShowCoaching(false);
                toast.success("Coaching terminé ! L'IA utilisera tes réponses pour la génération.");
              }}
              onSkip={() => setShowCoaching(false)}
            />
          </div>
        )}

        {coachingBrief && (
          <div className="rounded-xl border border-primary/20 bg-rose-pale p-4 mb-6 flex items-center justify-between">
            <p className="text-sm text-foreground">✅ Coaching terminé : l'IA utilisera tes réponses pour générer ta page.</p>
            <button onClick={() => { setCoachingBrief(null); setShowCoaching(false); }} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
          </div>
        )}

        {/* Page type selector */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-4">
          <p className="font-display text-base font-bold text-foreground mb-3">Quel type de page ?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PAGE_TYPES.map((pt) => {
              if (pt.isLink) {
                return (
                  <Link key={pt.value} to={pt.to!} className="text-left rounded-xl border-2 border-border hover:border-primary/50 bg-card p-3 transition-all">
                    <span className="text-lg">{pt.emoji}</span>
                    <p className="font-display text-sm font-bold text-foreground mt-1">{pt.label}</p>
                    <p className="text-[11px] text-muted-foreground">{pt.desc}</p>
                  </Link>
                );
              }
              return (
                <button
                  key={pt.value}
                  onClick={() => save({ page_type: pt.value })}
                  className={`text-left rounded-xl border-2 p-3 transition-all ${data.page_type === pt.value ? "border-primary bg-rose-pale" : "border-border hover:border-primary/50 bg-card"}`}
                >
                  <span className="text-lg">{pt.emoji}</span>
                  <p className="font-display text-sm font-bold text-foreground mt-1">{pt.label}</p>
                  <p className="text-[11px] text-muted-foreground">{pt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Framework selector */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-6">
          <p className="font-display text-base font-bold text-foreground mb-3">Quel angle pour ta page ?</p>
          <div className="space-y-2">
            {FRAMEWORKS.map((fw) => (
              <button
                key={fw.value}
                onClick={() => save({ framework: fw.value })}
                className={`w-full text-left rounded-xl border-2 p-4 transition-all ${data.framework === fw.value ? "border-primary bg-rose-pale" : "border-border hover:border-primary/50 bg-card"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{fw.emoji}</span>
                  <span className="font-display text-sm font-bold text-foreground">{fw.label}</span>
                  {fw.recommended && <span className="font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-primary text-primary-foreground">recommandé</span>}
                </div>
                <p className="text-[12px] text-muted-foreground mt-1 ml-7">{fw.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Generate all button */}
        <Button onClick={generateAll} disabled={aiLoading === "generate-all" || aiLoading === "storybrand"} className="w-full mb-6 h-12 text-base font-bold">
          <Sparkles className="h-5 w-5 mr-2" />
          {aiLoading === "generate-all" || aiLoading === "storybrand" ? "Génération en cours..." : data.framework === "storybrand" ? "✨ Générer ma page StoryBrand" : "✨ Générer toute ma page"}
        </Button>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-ui text-[11px] text-muted-foreground">{completedSteps} / {totalSteps} sections complétées</span>
          </div>
          <div className="flex gap-1">
            {STEPS.map((s, i) => (
              <button key={i} onClick={() => goStep(i + 1)} className={`flex-1 flex flex-col items-center gap-1 p-1.5 rounded-lg transition-all text-xs ${step === i + 1 ? "bg-primary text-primary-foreground" : i < completedSteps ? "bg-rose-pale text-foreground" : "bg-secondary text-muted-foreground"}`}>
                <span className="text-sm">{s.icon}</span>
                <span className="font-mono-ui text-[8px] font-semibold hidden sm:block leading-tight">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-6">
          {step === 1 && <Step1Hook {...stepProps} />}
          {step === 2 && <Step2Problem {...stepProps} />}
          {step === 3 && <Step3Transform {...stepProps} />}
          {step === 4 && <Step4Plan {...stepProps} />}
          {step === 5 && <Step5OfferPrice {...stepProps} />}
          {step === 6 && <Step6ForWho {...stepProps} />}
          {step === 7 && <Step7WhoYouAre {...stepProps} />}
          {step === 8 && <Step8Guarantee {...stepProps} />}
          {step === 9 && <Step9FaqCta {...stepProps} />}
          {step === 10 && <Step10SeoLayout {...stepProps} />}
        </div>

        {/* Red flags checker on generated content */}
        {(data.hook_title || data.problem_block || data.offer_block) && (
          <div className="mt-4">
            <RedFlagsChecker
              content={[data.hook_title, data.problem_block, data.benefits_block, data.offer_block, data.presentation_block, data.guarantee_text].filter(Boolean).join("\n\n")}
              onFix={() => {}}
            />
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={() => goStep(Math.max(1, step - 1))} disabled={step === 1}>← Précédent</Button>
          <Button variant="outline" onClick={() => setShowIdeasDialog(true)} className="gap-2">
            <Lightbulb className="h-4 w-4" /> Sauvegarder en idée
          </Button>
          <Button onClick={nextStep}>{step === totalSteps ? "Voir le récap →" : "Suivant →"}</Button>
        </div>
        <SaveToIdeasDialog
          open={showIdeasDialog}
          onOpenChange={setShowIdeasDialog}
          contentType="post_instagram"
          subject="Page d'accueil"
          contentData={{ type: "generated", text: `${data.hook_title || ""}\n\n${data.problem_block || ""}\n\n${data.offer_block || ""}` }}
          sourceModule="site-accueil"
          format="post"
        />
      </main>
    </div>
  );
}
