import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Sparkles, ChevronDown, ChevronUp, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface HomepageData {
  hook_title: string;
  hook_subtitle: string;
  hook_image_done: boolean;
  problem_block: string;
  benefits_block: string;
  offer_block: string;
  presentation_block: string;
  social_proof_done: boolean;
  faq: { question: string; reponse: string }[];
  cta_primary: string;
  cta_secondary: string;
  cta_objective: string;
  layout_notes: string;
  layout_done: boolean;
  current_step: number;
  completed: boolean;
  // New fields
  framework: string;
  plan_steps: { number: number; title: string; description: string }[];
  guarantee_type: string;
  guarantee_text: string;
  failure_block: string;
  storybrand_data: any;
}

const EMPTY: HomepageData = {
  hook_title: "", hook_subtitle: "", hook_image_done: false,
  problem_block: "", benefits_block: "", offer_block: "",
  presentation_block: "", social_proof_done: false,
  faq: [], cta_primary: "", cta_secondary: "", cta_objective: "",
  layout_notes: "", layout_done: false, current_step: 1, completed: false,
  framework: "emotional", plan_steps: [], guarantee_type: "", guarantee_text: "",
  failure_block: "", storybrand_data: null,
};

const STEPS = [
  { icon: "🎯", label: "Ton hook" },
  { icon: "😩", label: "Le problème" },
  { icon: "✨", label: "La transformation" },
  { icon: "🗺️", label: "Le plan" },
  { icon: "👋", label: "Qui tu es" },
  { icon: "🛡️", label: "Garantie" },
  { icon: "🦋", label: "FAQ + CTA" },
  { icon: "🎨", label: "Mets en forme" },
];

const FRAMEWORKS = [
  { value: "emotional", emoji: "💛", label: "Séquence émotionnelle", desc: "Empathie → Espoir → Confiance → Action. Le plus polyvalent.", recommended: true },
  { value: "storybrand", emoji: "📖", label: "StoryBrand (narratif)", desc: "Ta cliente est l'héroïne. Toi, tu es le guide. Idéal pour raconter une histoire." },
  { value: "pas", emoji: "⚡", label: "PAS (Problème · Agitation · Solution)", desc: "Direct et efficace. Pour les offres simples ou les pages de capture premium." },
];

const CTA_OBJECTIVES = [
  { value: "buy", label: "Acheter en ligne" },
  { value: "boutique", label: "Venir en boutique" },
  { value: "devis", label: "Demander un devis" },
  { value: "call", label: "Réserver un appel" },
  { value: "inscription", label: "S'inscrire" },
];

const GUARANTEE_TYPES = [
  { value: "refund", emoji: "💸", label: "Satisfaite ou remboursée" },
  { value: "call", emoji: "📞", label: "Appel découverte gratuit" },
  { value: "trial", emoji: "🔄", label: "Période d'essai" },
  { value: "none", emoji: "❌", label: "Pas de garantie" },
];

export default function SiteAccueil() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<HomepageData>(EMPTY);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, any>>({});
  const [brandingPercent, setBrandingPercent] = useState(100);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: hp } = await supabase.from("website_homepage").select("*").eq("user_id", user.id).maybeSingle();
      if (hp) {
        const faq = Array.isArray(hp.faq) ? hp.faq as any[] : [];
        const plan_steps = Array.isArray((hp as any).plan_steps) ? (hp as any).plan_steps : [];
        const storybrand_data = (hp as any).storybrand_data || null;
        setData({ ...EMPTY, ...hp, faq, plan_steps, storybrand_data });
        setStep(hp.current_step || 1);
      }
      const { getBrandingCompletion } = await import("@/lib/branding-context");
      const { percent } = await getBrandingCompletion(user.id);
      setBrandingPercent(percent);
      setLoading(false);
    };
    load();
  }, [user]);

  const save = useCallback(async (updates: Partial<HomepageData>) => {
    if (!user) return;
    const newData = { ...data, ...updates };
    setData(newData);
    const dbPayload: any = { ...updates };
    if (updates.faq) dbPayload.faq = JSON.stringify(updates.faq);
    if (updates.plan_steps) dbPayload.plan_steps = JSON.stringify(updates.plan_steps);
    if (updates.storybrand_data) dbPayload.storybrand_data = JSON.stringify(updates.storybrand_data);
    await supabase.from("website_homepage").upsert(
      { user_id: user.id, ...dbPayload, current_step: step },
      { onConflict: "user_id" }
    );
  }, [user, data, step]);

  const callAI = async (action: string, extraParams: Record<string, any> = {}) => {
    if (!user) return;
    setAiLoading(action);
    try {
      const { data: result, error } = await supabase.functions.invoke("website-ai", {
        body: { action, ...extraParams },
      });
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
      toast.error(e.message || "Erreur IA");
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
        toast.success("Page d'accueil générée ! Parcours chaque étape pour peaufiner.");
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
    data.presentation_block,
    data.guarantee_type,
    data.faq.length > 0 || data.cta_primary,
    data.layout_done,
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <Link to="/site" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" /> Retour à Site Web
        </Link>

        <div className="mb-6">
          <h1 className="font-display text-[26px] font-bold text-foreground">🏠 Ta page d'accueil</h1>
          <p className="mt-1 text-sm text-muted-foreground italic">Ta page d'accueil, c'est une page de vente. Chaque section a un rôle précis. On les construit une par une.</p>
        </div>

        {brandingPercent < 50 && (
          <div className="rounded-xl bg-rose-pale border border-primary/20 p-4 mb-6">
            <p className="text-sm text-foreground">💡 Plus ton branding est complet, plus les textes générés seront pertinents. <Link to="/branding" className="text-primary font-semibold hover:underline">Compléter mon branding →</Link></p>
          </div>
        )}

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
          {aiLoading === "generate-all" || aiLoading === "storybrand" ? "Génération en cours..." : data.framework === "storybrand" ? "✨ Générer ma page StoryBrand" : "✨ Générer toute ma page d'accueil"}
        </Button>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-ui text-[11px] text-muted-foreground">{completedSteps} / {totalSteps} sections complétées</span>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <button key={i} onClick={() => goStep(i + 1)} className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg transition-all text-xs ${step === i + 1 ? "bg-primary text-primary-foreground" : i < completedSteps ? "bg-rose-pale text-foreground" : "bg-secondary text-muted-foreground"}`}>
                <span className="text-base">{s.icon}</span>
                <span className="font-mono-ui text-[9px] font-semibold hidden sm:block">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-6">
          {step === 1 && <Step1Hook data={data} save={save} callAI={callAI} aiLoading={aiLoading} aiResults={aiResults} copyText={copyText} />}
          {step === 2 && <Step2Problem data={data} save={save} callAI={callAI} aiLoading={aiLoading} aiResults={aiResults} copyText={copyText} />}
          {step === 3 && <Step3Transform data={data} save={save} callAI={callAI} aiLoading={aiLoading} aiResults={aiResults} copyText={copyText} />}
          {step === 4 && <Step4Plan data={data} save={save} callAI={callAI} aiLoading={aiLoading} aiResults={aiResults} copyText={copyText} />}
          {step === 5 && <Step5WhoYouAre data={data} save={save} callAI={callAI} aiLoading={aiLoading} aiResults={aiResults} copyText={copyText} />}
          {step === 6 && <Step6Guarantee data={data} save={save} callAI={callAI} aiLoading={aiLoading} aiResults={aiResults} copyText={copyText} />}
          {step === 7 && <Step7Reassure data={data} save={save} callAI={callAI} aiLoading={aiLoading} aiResults={aiResults} copyText={copyText} />}
          {step === 8 && <Step8Layout data={data} save={save} copyText={copyText} />}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={() => goStep(Math.max(1, step - 1))} disabled={step === 1}>← Précédent</Button>
          <Button onClick={nextStep}>{step === totalSteps ? "Voir le récap →" : "Suivant →"}</Button>
        </div>
      </main>
    </div>
  );
}

/* ─── Shared props ─── */
interface StepProps {
  data: HomepageData;
  save: (u: Partial<HomepageData>) => void;
  callAI: (action: string, params?: any) => Promise<any>;
  aiLoading: string | null;
  aiResults: Record<string, any>;
  copyText: (t: string) => void;
}

/* ─── Helper: AI suggestion chips ─── */
function AISuggestions({ items, onSelect }: { items: string[]; onSelect: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {items.map((item, i) => (
        <button key={i} onClick={() => onSelect(item)} className="text-left text-[13px] px-3 py-2 rounded-xl border border-border bg-card hover:border-primary hover:bg-rose-pale transition-all">
          {item}
        </button>
      ))}
    </div>
  );
}

/* ─── Helper: Collapsible help ─── */
function HelpBlock({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline mb-2">
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground leading-relaxed mb-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ─── STEP 1: Hook ─── */
function Step1Hook({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">🎯 L'accroche qui arrête le scroll</h2>

      {/* A. Title */}
      <div>
        <h3 className="font-display text-base font-bold mb-2">A. Ton titre (hook)</h3>
        <p className="text-sm text-muted-foreground mb-3">Ta visiteuse a 3 secondes. Ton titre doit être clair, court et intriguant.</p>
        <HelpBlock title="💡 Les 5 ingrédients d'un bon titre">
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Court :</strong> max 10-12 mots</li>
            <li><strong>Simple :</strong> des mots que ta grand-mère comprendrait</li>
            <li><strong>Surprenant :</strong> un élément qui pique la curiosité</li>
            <li><strong>Bénéfice client :</strong> le résultat concret, pas tes valeurs</li>
            <li><strong>Engageant :</strong> donne envie d'en savoir plus</li>
          </ul>
        </HelpBlock>
        <Button variant="outline" size="sm" onClick={() => callAI("titles")} disabled={aiLoading === "titles"}>
          <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "titles" ? "Génération..." : "Générer des titres"}
        </Button>
        {Array.isArray(aiResults.titles) && <AISuggestions items={aiResults.titles} onSelect={(v) => save({ hook_title: v })} />}
        <Textarea className="mt-3" placeholder="Ex : Comment remplir ton dressing sans vider la planète" value={data.hook_title} onChange={(e) => save({ hook_title: e.target.value })} />
      </div>

      {/* B. Subtitle */}
      <div>
        <h3 className="font-display text-base font-bold mb-2">B. Ton sous-titre</h3>
        <p className="text-sm text-muted-foreground mb-3">Il précise comment et pour qui tu fais ce que tu promets dans ton titre.</p>
        {data.hook_title && (
          <Button variant="outline" size="sm" onClick={() => callAI("subtitles", { title: data.hook_title })} disabled={aiLoading === "subtitles"}>
            <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "subtitles" ? "Génération..." : "Générer des sous-titres"}
          </Button>
        )}
        {Array.isArray(aiResults.subtitles) && <AISuggestions items={aiResults.subtitles} onSelect={(v) => save({ hook_subtitle: v })} />}
        <Textarea className="mt-3" placeholder="Ex : Créations uniques en argent recyclé, façonnées à la main en France." value={data.hook_subtitle} onChange={(e) => save({ hook_subtitle: e.target.value })} />
      </div>

      {/* C. Image */}
      <div>
        <h3 className="font-display text-base font-bold mb-2">C. Ton image principale</h3>
        <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground mb-3">
          📸 <strong>Conseils pour ton image :</strong>
          <ul className="list-disc pl-4 mt-2 space-y-1">
            <li>Garde ton produit/service au premier plan</li>
            <li>Montre-le dans le monde réel, en train d'être utilisé</li>
            <li>Pas de photo random : elle doit raconter quelque chose</li>
          </ul>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={data.hook_image_done} onCheckedChange={(v) => save({ hook_image_done: !!v })} />
          ✅ J'ai choisi mon image principale
        </label>
      </div>
    </div>
  );
}

/* ─── STEP 2: Problem ─── */
function Step2Problem({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">😩 Montre que tu comprends sa douleur</h2>
      <p className="text-sm text-muted-foreground">Ta visiteuse doit se dire « Oui, c'est exactement moi ! » Exprime mieux qu'elle ce qu'elle ressent.</p>

      {data.framework === "storybrand" && (
        <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground mb-3">
          📖 <strong>StoryBrand — Le problème à 3 niveaux :</strong>
          <ul className="list-disc pl-4 mt-2 space-y-1">
            <li><strong>Externe :</strong> le truc concret (pas assez de client·es)</li>
            <li><strong>Interne :</strong> le ressenti (impression d'être invisible)</li>
            <li><strong>Philosophique :</strong> l'injustice (les projets éthiques ne devraient pas être invisibles)</li>
          </ul>
          <p className="mt-2 italic">Le problème interne est le plus puissant. C'est lui qui crée l'identification.</p>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={() => callAI("problem")} disabled={aiLoading === "problem"}>
        <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "problem" ? "Génération..." : "Générer le bloc problème"}
      </Button>

      {aiResults.problem && typeof aiResults.problem === "object" && (
        <div className="space-y-3 mt-3">
          <div>
            <p className="font-mono-ui text-[11px] font-semibold text-primary mb-1">Version empathique :</p>
            <div className="rounded-xl bg-rose-pale p-3 text-[13px] cursor-pointer hover:ring-2 ring-primary transition-all" onClick={() => save({ problem_block: aiResults.problem.empathique })}>
              {aiResults.problem.empathique}
            </div>
          </div>
          <div>
            <p className="font-mono-ui text-[11px] font-semibold text-primary mb-1">Version directe :</p>
            <div className="rounded-xl bg-rose-pale p-3 text-[13px] cursor-pointer hover:ring-2 ring-primary transition-all" onClick={() => save({ problem_block: aiResults.problem.directe })}>
              {aiResults.problem.directe}
            </div>
          </div>
        </div>
      )}

      <Textarea className="min-h-[150px]" placeholder="Mon bloc problème..." value={data.problem_block} onChange={(e) => save({ problem_block: e.target.value })} />
      {data.problem_block && (
        <Button variant="ghost" size="sm" onClick={() => copyText(data.problem_block)}>
          <Copy className="h-4 w-4 mr-1" /> Copier
        </Button>
      )}
    </div>
  );
}

/* ─── STEP 3: Transformation ─── */
function Step3Transform({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">✨ Montre où tu l'emmènes</h2>

      {data.framework === "storybrand" && (
        <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground mb-3">
          📖 <strong>StoryBrand — Le succès :</strong> la vie après. Vision sensorielle et émotionnelle. Bénéfices émotionnels (fierté, sérénité) + concrets (client·es, système, autonomie).
        </div>
      )}

      {/* Benefits */}
      <div>
        <h3 className="font-display text-base font-bold mb-2">A. Les bénéfices</h3>
        <p className="text-sm text-muted-foreground mb-3">Ta cliente n'achète pas un produit. Elle achète le résultat et la transformation.</p>
        <Button variant="outline" size="sm" onClick={() => callAI("benefits")} disabled={aiLoading === "benefits"}>
          <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "benefits" ? "Génération..." : "Générer le bloc bénéfices"}
        </Button>
        {typeof aiResults.benefits === "string" && (
          <div className="rounded-xl bg-rose-pale p-3 text-[13px] mt-3 cursor-pointer hover:ring-2 ring-primary transition-all" onClick={() => save({ benefits_block: aiResults.benefits })}>
            {aiResults.benefits}
          </div>
        )}
        <Textarea className="mt-3 min-h-[120px]" placeholder="Mon bloc bénéfices..." value={data.benefits_block} onChange={(e) => save({ benefits_block: e.target.value })} />
        {data.benefits_block && <Button variant="ghost" size="sm" onClick={() => copyText(data.benefits_block)}><Copy className="h-4 w-4 mr-1" /> Copier</Button>}
      </div>

      {/* Failure (StoryBrand only) */}
      {data.framework === "storybrand" && (
        <div>
          <h3 className="font-display text-base font-bold mb-2">B. Ce qui se passe si elle ne fait rien (optionnel)</h3>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-[13px] text-foreground mb-3">
            ⚠️ <strong>Attention :</strong> cette section est puissante MAIS dangereuse. Utilise-la comme du sel : une pincée, pas le sac. L'idée c'est de nommer honnêtement ce que ça coûte de ne rien changer. Pas de créer de la peur.
          </div>
          <Textarea className="min-h-[80px] mb-3" placeholder="Qu'est-ce qui se passe si ta cliente ne fait rien ?" value={data.failure_block} onChange={(e) => save({ failure_block: e.target.value })} />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={async () => {
              const result = await callAI("failure-section", { failure_description: data.failure_block || "ne rien changer dans sa communication" });
              if (result?.failure_text) save({ failure_block: result.failure_text });
            }} disabled={aiLoading === "failure-section"}>
              <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "failure-section" ? "Génération..." : "Formuler avec éthique"}
            </Button>
          </div>
          {data.failure_block && <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyText(data.failure_block)}><Copy className="h-4 w-4 mr-1" /> Copier</Button>}
        </div>
      )}

      {/* Offer */}
      <div>
        <h3 className="font-display text-base font-bold mb-2">{data.framework === "storybrand" ? "C" : "B"}. Ton offre</h3>
        <p className="text-sm text-muted-foreground mb-3">Présente concrètement ce que tu vends. Ce qu'il contient, les bénéfices, le prix.</p>
        <Button variant="outline" size="sm" onClick={() => callAI("offer")} disabled={aiLoading === "offer"}>
          <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "offer" ? "Génération..." : "Générer la présentation de mon offre"}
        </Button>
        {typeof aiResults.offer === "string" && (
          <div className="rounded-xl bg-rose-pale p-3 text-[13px] mt-3 cursor-pointer hover:ring-2 ring-primary transition-all" onClick={() => save({ offer_block: aiResults.offer })}>
            {aiResults.offer}
          </div>
        )}
        <Textarea className="mt-3 min-h-[150px]" placeholder="Mon offre..." value={data.offer_block} onChange={(e) => save({ offer_block: e.target.value })} />
        {data.offer_block && <Button variant="ghost" size="sm" onClick={() => copyText(data.offer_block)}><Copy className="h-4 w-4 mr-1" /> Copier</Button>}
      </div>
    </div>
  );
}

/* ─── STEP 4: Plan en 3 étapes ─── */
function Step4Plan({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  const updateStep = (index: number, field: "title" | "description", value: string) => {
    const newSteps = [...data.plan_steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    save({ plan_steps: newSteps });
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">🗺️ Le plan en 3 étapes</h2>
      <p className="text-sm text-muted-foreground">3 étapes simples qui montrent le chemin. Ça réduit la complexité perçue et rassure.</p>

      <Button variant="outline" size="sm" onClick={async () => {
        const result = await callAI("plan-steps", { offer_description: data.offer_block });
        if (result?.steps && Array.isArray(result.steps)) {
          save({ plan_steps: result.steps });
        }
      }} disabled={aiLoading === "plan-steps"}>
        <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "plan-steps" ? "Génération..." : "Suggérer 3 étapes basées sur mon offre"}
      </Button>

      {data.plan_steps.length > 0 ? (
        <div className="space-y-4 mt-4">
          {data.plan_steps.map((s, i) => (
            <div key={i} className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">{s.number}</span>
                <Input className="font-semibold flex-1" value={s.title} onChange={(e) => updateStep(i, "title", e.target.value)} placeholder="Titre de l'étape..." />
              </div>
              <Textarea className="min-h-[60px]" value={s.description} onChange={(e) => updateStep(i, "description", e.target.value)} placeholder="Description..." />
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => copyText(data.plan_steps.map(s => `${s.number}. ${s.title}\n${s.description}`).join("\n\n"))}>
            <Copy className="h-4 w-4 mr-1" /> Copier le plan
          </Button>
        </div>
      ) : (
        <div className="space-y-3 mt-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="rounded-xl border border-dashed border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-muted-foreground font-bold text-sm">{n}</span>
                <Input className="flex-1" placeholder={`Titre de l'étape ${n}...`} onChange={(e) => {
                  const steps = data.plan_steps.length === 3 ? [...data.plan_steps] : [
                    { number: 1, title: "", description: "" },
                    { number: 2, title: "", description: "" },
                    { number: 3, title: "", description: "" },
                  ];
                  steps[n - 1] = { ...steps[n - 1], title: e.target.value };
                  save({ plan_steps: steps });
                }} />
              </div>
              <Textarea className="min-h-[50px]" placeholder="Description..." onChange={(e) => {
                const steps = data.plan_steps.length === 3 ? [...data.plan_steps] : [
                  { number: 1, title: "", description: "" },
                  { number: 2, title: "", description: "" },
                  { number: 3, title: "", description: "" },
                ];
                steps[n - 1] = { ...steps[n - 1], description: e.target.value };
                save({ plan_steps: steps });
              }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── STEP 5: Who you are ─── */
function Step5WhoYouAre({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">👋 Présente-toi et rassure</h2>

      {data.framework === "storybrand" && (
        <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground mb-3">
          📖 <strong>StoryBrand — Le guide :</strong> tu es le guide, pas l'héroïne. Montre d'abord de l'empathie ("Je sais ce que c'est...") puis de l'autorité (parcours, chiffres, références). L'empathie AVANT l'autorité.
        </div>
      )}

      <div>
        <h3 className="font-display text-base font-bold mb-2">A. Ta présentation</h3>
        <p className="text-sm text-muted-foreground mb-3">Elle veut savoir qui est derrière. Lie ton histoire aux bénéfices de ton offre.</p>
        <Button variant="outline" size="sm" onClick={() => callAI("presentation")} disabled={aiLoading === "presentation"}>
          <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "presentation" ? "Génération..." : "Générer ma présentation"}
        </Button>
        {typeof aiResults.presentation === "string" && (
          <div className="rounded-xl bg-rose-pale p-3 text-[13px] mt-3 cursor-pointer hover:ring-2 ring-primary transition-all" onClick={() => save({ presentation_block: aiResults.presentation })}>
            {aiResults.presentation}
          </div>
        )}
        <Textarea className="mt-3 min-h-[150px]" placeholder="Ma présentation..." value={data.presentation_block} onChange={(e) => save({ presentation_block: e.target.value })} />
        {data.presentation_block && <Button variant="ghost" size="sm" onClick={() => copyText(data.presentation_block)}><Copy className="h-4 w-4 mr-1" /> Copier</Button>}
      </div>

      <div>
        <h3 className="font-display text-base font-bold mb-2">B. Preuve sociale</h3>
        <p className="text-sm text-muted-foreground mb-3">87% des Français disent que la preuve sociale influence leur achat.</p>
        <div className="rounded-xl bg-rose-pale p-4 text-[13px] mb-4">
          <strong>Types de preuve sociale :</strong>
          <ul className="list-disc pl-4 mt-2 space-y-1">
            <li>Témoignages clients (citation + prénom + photo)</li>
            <li>Avis notés (étoiles)</li>
            <li>Photos/vidéos d'utilisation</li>
            <li>Chiffres clés (nombre de clients, taux de satisfaction)</li>
            <li>Mentions presse ou partenaires</li>
          </ul>
        </div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={data.social_proof_done} onCheckedChange={(v) => save({ social_proof_done: !!v })} /> J'ai ajouté au moins 2 témoignages sur ma page</label>
        <Link to="/site/temoignages" className="block mt-2 text-sm text-primary font-semibold hover:underline">💬 Récolter et structurer mes témoignages →</Link>
      </div>
    </div>
  );
}

/* ─── STEP 6: Guarantee ─── */
function Step6Guarantee({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">🛡️ Ta garantie</h2>
      <p className="text-sm text-muted-foreground">La garantie réduit le risque perçu. Elle dit "je crois tellement en ce que je fais que je prends le risque à ta place".</p>

      <div className="grid grid-cols-2 gap-2">
        {GUARANTEE_TYPES.map((g) => (
          <button
            key={g.value}
            onClick={() => save({ guarantee_type: g.value })}
            className={`text-left rounded-xl border-2 p-3 transition-all ${data.guarantee_type === g.value ? "border-primary bg-rose-pale" : "border-border hover:border-primary/50 bg-card"}`}
          >
            <span className="text-lg">{g.emoji}</span>
            <p className="font-display text-sm font-bold text-foreground mt-1">{g.label}</p>
          </button>
        ))}
      </div>

      {data.guarantee_type && data.guarantee_type !== "none" && (
        <>
          <div>
            <p className="text-sm font-semibold mb-2">Conditions (si applicables) :</p>
            <Textarea className="min-h-[80px]" placeholder="Si après avoir suivi le programme et appliqué les enseignements, tu n'as pas de résultats en 3 mois..." value={data.guarantee_text} onChange={(e) => save({ guarantee_text: e.target.value })} />
          </div>

          <Button variant="outline" size="sm" onClick={async () => {
            const result = await callAI("guarantee", {
              guarantee_type: data.guarantee_type,
              conditions: data.guarantee_text,
              offer_name: data.offer_block?.slice(0, 100),
            });
            if (result?.body) save({ guarantee_text: `${result.title}\n\n${result.body}${result.micro_note ? `\n\n${result.micro_note}` : ""}` });
          }} disabled={aiLoading === "guarantee"}>
            <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "guarantee" ? "Génération..." : "Formuler la garantie"}
          </Button>

          {data.guarantee_text && <Button variant="ghost" size="sm" onClick={() => copyText(data.guarantee_text)}><Copy className="h-4 w-4 mr-1" /> Copier</Button>}
        </>
      )}

      {data.guarantee_type === "none" && (
        <p className="text-sm text-muted-foreground italic">Pas de garantie spécifique — tu peux passer à l'étape suivante.</p>
      )}
    </div>
  );
}

/* ─── STEP 7: Reassure & Convert ─── */
function Step7Reassure({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  const updateFaqItem = (index: number, field: "question" | "reponse", value: string) => {
    const newFaq = [...data.faq];
    newFaq[index] = { ...newFaq[index], [field]: value };
    save({ faq: newFaq });
  };

  const removeFaqItem = (index: number) => {
    save({ faq: data.faq.filter((_, i) => i !== index) });
  };

  const copyAllFaq = () => {
    const text = data.faq.map((f) => `Q : ${f.question}\nR : ${f.reponse}`).join("\n\n");
    copyText(text);
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">🦋 Lève les derniers freins</h2>

      {/* FAQ */}
      <div>
        <h3 className="font-display text-base font-bold mb-2">A. Ta FAQ</h3>
        <p className="text-sm text-muted-foreground mb-3">Une FAQ qui répond aux objections avant même qu'elles ne soient formulées.</p>
        <Button variant="outline" size="sm" onClick={async () => {
          const result = await callAI("faq");
          if (Array.isArray(result)) save({ faq: result });
        }} disabled={aiLoading === "faq"}>
          <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "faq" ? "Génération..." : "Générer ma FAQ"}
        </Button>

        {data.faq.length > 0 && (
          <div className="space-y-3 mt-4">
            {data.faq.map((item, i) => (
              <div key={i} className="rounded-xl border border-border p-4">
                <Input className="font-semibold mb-2" value={item.question} onChange={(e) => updateFaqItem(i, "question", e.target.value)} placeholder="Question..." />
                <Textarea className="min-h-[80px]" value={item.reponse} onChange={(e) => updateFaqItem(i, "reponse", e.target.value)} placeholder="Réponse..." />
                <button onClick={() => removeFaqItem(i)} className="text-xs text-muted-foreground hover:text-destructive mt-1">🗑️ Supprimer</button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={copyAllFaq}><Copy className="h-4 w-4 mr-1" /> Copier toute la FAQ</Button>
          </div>
        )}
      </div>

      {/* CTA */}
      <div>
        <h3 className="font-display text-base font-bold mb-2">B. Tes CTA (appels à l'action)</h3>
        <p className="text-sm text-muted-foreground mb-3">Les boutons qui guident ta cliente vers l'action finale.</p>

        <p className="text-sm font-semibold mb-2">Quel est ton objectif principal ?</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {CTA_OBJECTIVES.map((obj) => (
            <button key={obj.value} onClick={() => save({ cta_objective: obj.value })} className={`font-mono-ui text-[12px] font-semibold px-3 py-1.5 rounded-pill border-2 transition-colors ${data.cta_objective === obj.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"}`}>
              {obj.label}
            </button>
          ))}
        </div>

        {data.cta_objective && (
          <Button variant="outline" size="sm" onClick={() => callAI("cta", { objective: data.cta_objective })} disabled={aiLoading === "cta"}>
            <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "cta" ? "Génération..." : "Générer mes CTA"}
          </Button>
        )}

        {Array.isArray(aiResults.cta) && <AISuggestions items={aiResults.cta} onSelect={(v) => save({ cta_primary: v })} />}

        <div className="space-y-3 mt-4">
          <div>
            <label className="text-sm font-semibold">Mon CTA principal</label>
            <Input value={data.cta_primary} onChange={(e) => save({ cta_primary: e.target.value })} placeholder="Ex : Découvrir la collection" />
          </div>
          <div>
            <label className="text-sm font-semibold">Mon CTA secondaire (optionnel)</label>
            <Input value={data.cta_secondary} onChange={(e) => save({ cta_secondary: e.target.value })} placeholder="Ex : Réserver un appel découverte" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── STEP 8: Layout ─── */
function Step8Layout({ data, save, copyText }: { data: HomepageData; save: (u: Partial<HomepageData>) => void; copyText: (t: string) => void }) {
  const layoutOrder = data.framework === "storybrand"
    ? [
        { icon: "📖", label: "Hero (désir + guide)" },
        { icon: "😩", label: "Le problème (3 niveaux)" },
        { icon: "👋", label: "Le guide (empathie + autorité)" },
        { icon: "🗺️", label: "Le plan en 3 étapes" },
        { icon: "🔘", label: "CTA direct + transitionnel" },
        { icon: "⚡", label: "Ce qu'elle risque de rater" },
        { icon: "✨", label: "Le succès (la vie après)" },
        { icon: "💬", label: "Preuve sociale" },
        { icon: "💰", label: "Offre / Prix" },
        { icon: "🛡️", label: "Garantie" },
        { icon: "🦋", label: "FAQ" },
        { icon: "🔘", label: "CTA final" },
      ]
    : [
        { icon: "🎯", label: "Hook (titre + sous-titre + image + CTA)" },
        { icon: "😩", label: "Le problème" },
        { icon: "✨", label: "Les bénéfices" },
        { icon: "🗺️", label: "Le plan en 3 étapes" },
        { icon: "💚", label: "Ton offre" },
        { icon: "👋", label: "Qui tu es" },
        { icon: "💬", label: "Preuve sociale" },
        { icon: "🛡️", label: "Garantie" },
        { icon: "🦋", label: "FAQ" },
        { icon: "🔘", label: "CTA final" },
      ];

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">🎨 Le plan visuel de ta page</h2>
      <p className="text-sm text-muted-foreground">Tu sais quoi écrire. Maintenant on voit comment l'agencer.</p>

      <div className="rounded-xl bg-rose-pale p-5 text-[13px] leading-relaxed">
        <p className="font-semibold mb-3">L'ordre recommandé de tes sections{data.framework === "storybrand" ? " (StoryBrand)" : ""} :</p>
        <ol className="space-y-2">
          {layoutOrder.map((item, i) => (
            <li key={i}>{item.icon} <strong>{item.label}</strong></li>
          ))}
        </ol>
      </div>

      <div>
        <label className="text-sm font-semibold block mb-2">Mes notes de mise en forme</label>
        <Textarea className="min-h-[120px]" placeholder="Notes sur la mise en forme de ma page..." value={data.layout_notes} onChange={(e) => save({ layout_notes: e.target.value })} />
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={data.layout_done} onCheckedChange={(v) => save({ layout_done: !!v })} /> Mon titre et sous-titre sont en haut, visibles sans scroller</label>
      </div>
    </div>
  );
}
