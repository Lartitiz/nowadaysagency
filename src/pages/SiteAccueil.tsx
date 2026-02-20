import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Sparkles, ChevronDown, ChevronUp, Check } from "lucide-react";
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
}

const EMPTY: HomepageData = {
  hook_title: "", hook_subtitle: "", hook_image_done: false,
  problem_block: "", benefits_block: "", offer_block: "",
  presentation_block: "", social_proof_done: false,
  faq: [], cta_primary: "", cta_secondary: "", cta_objective: "",
  layout_notes: "", layout_done: false, current_step: 1, completed: false,
};

const STEPS = [
  { icon: "🎯", label: "Ton hook" },
  { icon: "😩", label: "Le problème" },
  { icon: "✨", label: "La transformation" },
  { icon: "👋", label: "Qui tu es" },
  { icon: "🦋", label: "Rassure et convertis" },
  { icon: "🎨", label: "Mets en forme" },
];

const CTA_OBJECTIVES = [
  { value: "buy", label: "Acheter en ligne" },
  { value: "boutique", label: "Venir en boutique" },
  { value: "devis", label: "Demander un devis" },
  { value: "call", label: "Réserver un appel" },
  { value: "inscription", label: "S'inscrire" },
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
        setData({ ...EMPTY, ...hp, faq });
        setStep(hp.current_step || 1);
      }
      // Check branding completion
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
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const goStep = (s: number) => {
    setStep(s);
    save({ current_step: s } as any);
  };

  const nextStep = () => {
    const next = Math.min(step + 1, 7);
    if (next === 7) {
      save({ completed: true, current_step: 6 } as any);
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
    data.presentation_block,
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

        {/* Generate all button */}
        <Button onClick={generateAll} disabled={aiLoading === "generate-all"} className="w-full mb-6 h-12 text-base font-bold">
          <Sparkles className="h-5 w-5 mr-2" />
          {aiLoading === "generate-all" ? "Génération en cours..." : "✨ Générer toute ma page d'accueil"}
        </Button>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-ui text-[11px] text-muted-foreground">{completedSteps} / 6 sections complétées</span>
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
          {step === 4 && <Step4WhoYouAre data={data} save={save} callAI={callAI} aiLoading={aiLoading} aiResults={aiResults} copyText={copyText} />}
          {step === 5 && <Step5Reassure data={data} save={save} callAI={callAI} aiLoading={aiLoading} aiResults={aiResults} copyText={copyText} />}
          {step === 6 && <Step6Layout data={data} save={save} copyText={copyText} />}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={() => goStep(Math.max(1, step - 1))} disabled={step === 1}>← Précédent</Button>
          <Button onClick={nextStep}>{step === 6 ? "Voir le récap →" : "Suivant →"}</Button>
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
          <p className="mt-3 font-semibold">Formules qui fonctionnent :</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Montrer le bénéfice : « Simplifiez votre skincare routine »</li>
            <li>Bénéfice + désir : « Ajoute de la couleur à ta vie, pas à ton empreinte carbone »</li>
            <li>Comment + désir : « Comment remplir ton dressing sans vider la planète »</li>
            <li>Citer un problème : « Je pensais avoir tout essayé. Ce n'était pas vrai. »</li>
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
        <HelpBlock title="💡 Un bon sous-titre">
          <ul className="list-disc pl-4 space-y-1">
            <li>1-2 phrases max</li>
            <li>Précise comment tu apportes le bénéfice</li>
            <li>Indique pour qui c'est</li>
            <li>Ajoute une preuve qui rassure</li>
          </ul>
        </HelpBlock>
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

      <HelpBlock title="💡 Structure du bloc problème">
        <ol className="list-decimal pl-4 space-y-1">
          <li><strong>Accroche empathique :</strong> montre que tu comprends sa situation</li>
          <li><strong>Ta mission :</strong> pourquoi tu es là et ce que tu veux changer</li>
          <li><strong>Ta promesse :</strong> amène la solution sans tout dévoiler</li>
        </ol>
        <p className="mt-3 italic">Exemple : « Avant, j'avais des tiroirs pleins de bijoux qui s'oxydent et se démodent vite. C'est pourquoi j'ai décidé de créer des pièces intemporelles et responsables. J'utilise de l'argent recyclé et je travaille chaque bijou à la main. »</p>
      </HelpBlock>

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

      {/* Benefits */}
      <div>
        <h3 className="font-display text-base font-bold mb-2">A. Les bénéfices</h3>
        <p className="text-sm text-muted-foreground mb-3">Ta cliente n'achète pas un produit. Elle achète le résultat et la transformation.</p>
        <HelpBlock title="💡 Structure">
          <ol className="list-decimal pl-4 space-y-1">
            <li><strong>Sa vision :</strong> image concrète de son objectif</li>
            <li><strong>L'objectif incarné :</strong> à quoi ressemble sa vie quand c'est atteint</li>
            <li><strong>Ta promesse :</strong> tu peux l'accompagner</li>
          </ol>
        </HelpBlock>
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

      {/* Offer */}
      <div>
        <h3 className="font-display text-base font-bold mb-2">B. Ton offre</h3>
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

/* ─── STEP 4: Who you are ─── */
function Step4WhoYouAre({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">👋 Présente-toi et rassure</h2>

      {/* Presentation */}
      <div>
        <h3 className="font-display text-base font-bold mb-2">A. Ta présentation</h3>
        <p className="text-sm text-muted-foreground mb-3">Elle veut savoir qui est derrière. Lie ton histoire aux bénéfices de ton offre.</p>
        <HelpBlock title="💡 Structure">
          <ol className="list-decimal pl-4 space-y-1">
            <li><strong>D'où tu viens :</strong> le problème que tu as toi-même rencontré</li>
            <li><strong>Ton déclic :</strong> pourquoi tu as créé ton offre</li>
            <li><strong>Le lien :</strong> le bénéfice qu'elle en retire grâce à ton parcours</li>
          </ol>
        </HelpBlock>
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

      {/* Social proof */}
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
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={data.social_proof_done} onCheckedChange={(v) => save({ social_proof_done: !!v })} /> J'ai ajouté au moins 2 témoignages sur ma page</label>
        </div>
      </div>
    </div>
  );
}

/* ─── STEP 5: Reassure & Convert ─── */
function Step5Reassure({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
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

/* ─── STEP 6: Layout ─── */
function Step6Layout({ data, save, copyText }: { data: HomepageData; save: (u: Partial<HomepageData>) => void; copyText: (t: string) => void }) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">🎨 Le plan visuel de ta page</h2>
      <p className="text-sm text-muted-foreground">Tu sais quoi écrire. Maintenant on voit comment l'agencer.</p>

      <div className="rounded-xl bg-rose-pale p-5 text-[13px] leading-relaxed">
        <p className="font-semibold mb-3">L'ordre recommandé de tes sections :</p>
        <ol className="space-y-2">
          <li>🎯 <strong>Hook</strong> (titre + sous-titre + image + CTA) — visible sans scroller</li>
          <li>😩 <strong>Le problème</strong> — connexion émotionnelle</li>
          <li>✨ <strong>Les bénéfices</strong> — projection positive</li>
          <li>💚 <strong>Ton offre</strong> — ce que tu proposes concrètement</li>
          <li>👋 <strong>Qui tu es</strong> — présentation courte</li>
          <li>💬 <strong>Preuve sociale</strong> — témoignages</li>
          <li>🦋 <strong>FAQ</strong> — lever les derniers freins</li>
          <li>🔘 <strong>CTA final</strong> — dernier appel à l'action</li>
        </ol>
      </div>

      <div className="rounded-xl bg-rose-pale p-4 text-[13px]">
        📌 <strong>Inspire-toi :</strong> Va sur Pinterest et observe des pages d'accueil qui te plaisent. Concentre-toi sur la structure : où est le titre, où sont les photos, où sont les boutons.
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
