import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { RotateCcw, ArrowRight, ArrowLeft, Eye, HelpCircle } from "lucide-react";

// ── Page options for page-by-page mode ──
const PAGE_OPTIONS = [
  { id: "accueil", label: "Page d'accueil" },
  { id: "a-propos", label: "Page À propos" },
  { id: "offres", label: "Page Offres / Services" },
  { id: "contact", label: "Page Contact" },
  { id: "produits", label: "Page Produits" },
];

// ── Shared types ──
type AnswerValue = "oui" | "non" | "pas_sure" | null;

interface AuditQuestion {
  id: string;
  text: string;
  tooltip: string;
}

interface AuditSection {
  id: string;
  emoji: string;
  title: string;
  questions: AuditQuestion[];
}

// ── Global audit questionnaire ──
const GLOBAL_SECTIONS: AuditSection[] = [
  {
    id: "clarte", emoji: "🎯", title: "Clarté du message",
    questions: [
      { id: "q1", text: "Ton titre principal décrit un bénéfice concret pour ta cliente idéale ?", tooltip: "Un bon titre dit ce que ta cliente va obtenir, pas ce que tu fais. 'Communique sans te trahir' > 'Agence de communication'." },
      { id: "q2", text: "On comprend ce que tu fais + pour qui en moins de 10 secondes ?", tooltip: "Demande à une amie de regarder ta page 10 secondes et de te dire ce qu'elle a retenu." },
      { id: "q3", text: "Ta page explique en quoi tu es différente des autres ?", tooltip: "Ce qui te rend unique n'est pas ton CV mais ta façon de faire et ta vision." },
      { id: "q4", text: "Ton visuel et tes textes racontent la même histoire ?", tooltip: "Si ton texte est chaleureux mais tes visuels sont froids et corporate, il y a un décalage." },
    ],
  },
  {
    id: "copywriting", emoji: "💬", title: "Copywriting",
    questions: [
      { id: "q5", text: "Tes titres parlent de ce que ta cliente va obtenir (pas de ce que tu fais) ?", tooltip: "'Reprends confiance dans ta com' fonctionne mieux que 'Coaching en communication digitale'." },
      { id: "q6", text: "Tu as un bouton d'action visible sans scroller ?", tooltip: "Si ta visiteuse doit scroller pour trouver le bouton, tu perds 40% de conversions." },
      { id: "q7", text: "Le ton de tes textes correspond à ta cible ?", tooltip: "Parle comme ta cliente parle. Si elle dit 'j'en ai marre', ne dis pas 'lassitude professionnelle'." },
      { id: "q8", text: "Tu as du micro-texte rassurant sous tes boutons (genre 'Sans engagement', 'Réponse en 24h') ?", tooltip: "Un petit texte sous le bouton réduit l'anxiété et augmente le taux de clic de 10 à 20%." },
    ],
  },
  {
    id: "parcours", emoji: "🗺️", title: "Parcours utilisateur·ice",
    questions: [
      { id: "q9", text: "Ton menu a moins de 6 éléments ?", tooltip: "Plus de 6 éléments = ta visiteuse ne sait plus où cliquer. Simplifie." },
      { id: "q10", text: "Ta visiteuse peut passer à l'action en 3 clics max ?", tooltip: "Chaque clic supplémentaire fait perdre environ 20% des visiteuses." },
      { id: "q11", text: "Chaque page a UN objectif principal clair ?", tooltip: "Une page = un objectif. Si ta page veut tout faire, elle ne fait rien." },
      { id: "q12", text: "Tes pages ont toutes le même style et le même ton ?", tooltip: "L'incohérence visuelle ou tonale crée de la méfiance inconsciente." },
    ],
  },
  {
    id: "confiance", emoji: "🛡️", title: "Confiance",
    questions: [
      { id: "q13", text: "Tu as au moins un témoignage visible sur ta page d'accueil ?", tooltip: "Les témoignages sont le levier n°1 de conversion. Même un seul fait la différence." },
      { id: "q14", text: "On sait combien ça coûte OU comment ça se passe avant de te contacter ?", tooltip: "L'opacité sur le prix ou le process est le frein n°1 à la prise de contact." },
      { id: "q15", text: "Tu as une page À propos avec ta photo et ton histoire ?", tooltip: "Les gens achètent à des humains. Ta photo et ton histoire créent du lien." },
    ],
  },
  {
    id: "mobile", emoji: "📱", title: "Mobile",
    questions: [
      { id: "q16", text: "Ton site s'affiche bien sur mobile ?", tooltip: "60 à 80% de tes visiteuses viennent d'Instagram, donc du mobile." },
      { id: "q17", text: "Ton site charge en moins de 3 secondes ?", tooltip: "Au-delà de 3 secondes, 53% des visiteuses quittent la page." },
      { id: "q18", text: "Tes boutons sont assez grands pour être cliqués au pouce ?", tooltip: "Un bouton trop petit sur mobile = frustration = abandon." },
    ],
  },
  {
    id: "visuel", emoji: "🎨", title: "Hiérarchie visuelle",
    questions: [
      { id: "q19", text: "Tes textes sont bien lisibles (bon contraste, pas de gris clair sur blanc) ?", tooltip: "Si on doit plisser les yeux pour lire, on ne lira pas. Contraste minimum recommandé : 4.5:1." },
      { id: "q20", text: "Tes sections sont bien espacées (pas de mur de texte) ?", tooltip: "Le blanc (espace vide) n'est pas du gaspillage, c'est de la respiration visuelle." },
    ],
  },
];

// ── Page-by-page questionnaire data ──
const PAGE_QUESTIONS: Record<string, AuditQuestion[]> = {
  accueil: [
    { id: "acc_q1", text: "Ton titre principal décrit un bénéfice concret pour ta cliente idéale ?", tooltip: "Un bon titre dit ce que ta cliente va obtenir, pas ce que tu fais. 'Communique sans te trahir' > 'Agence de communication'." },
    { id: "acc_q2", text: "On comprend ce que tu fais + pour qui en moins de 10 secondes ?", tooltip: "Demande à une amie de regarder ta page 10 secondes et de te dire ce qu'elle a retenu." },
    { id: "acc_q3", text: "Ta page explique en quoi tu es différente des autres ?", tooltip: "Ce qui te rend unique n'est pas ton CV mais ta façon de faire et ta vision." },
    { id: "acc_q4", text: "Ton visuel et tes textes racontent la même histoire ?", tooltip: "Si ton texte est chaleureux mais tes visuels sont froids et corporate, il y a un décalage." },
    { id: "acc_q5", text: "Tes titres parlent de ce que ta cliente va obtenir (pas de ce que tu fais) ?", tooltip: "'Reprends confiance dans ta com' fonctionne mieux que 'Coaching en communication digitale'." },
    { id: "acc_q6", text: "Tu as un bouton d'action visible sans scroller ?", tooltip: "Si ta visiteuse doit scroller pour trouver le bouton, tu perds 40% de conversions." },
    { id: "acc_q7", text: "Le ton de tes textes correspond à ta cible ?", tooltip: "Parle comme ta cliente parle. Si elle dit 'j'en ai marre', ne dis pas 'lassitude professionnelle'." },
    { id: "acc_q8", text: "Tu as du micro-texte rassurant sous tes boutons (genre 'Sans engagement', 'Réponse en 24h') ?", tooltip: "Un petit texte sous le bouton réduit l'anxiété et augmente le taux de clic de 10 à 20%." },
    { id: "acc_q9", text: "Tu as une section qui présente tes offres ou services ?", tooltip: "Ta visiteuse doit voir ce que tu proposes sans avoir à chercher dans le menu." },
    { id: "acc_q10", text: "Tu as un deuxième CTA plus bas dans la page (pas juste en haut) ?", tooltip: "Ta visiteuse qui scrolle a besoin d'un rappel à l'action en bas de page aussi." },
    { id: "acc_q11", text: "Ta page fait moins de 10 scrolls sur mobile ?", tooltip: "Une page trop longue fatigue. Garde l'essentiel, coupe le superflu." },
  ],
  "a-propos": [
    { id: "ap_q1", text: "Ta page commence par ta cliente (pas par toi) ?", tooltip: "Commence par le problème de ta cliente, pas par 'Je m'appelle…'. Elle veut savoir que tu la comprends." },
    { id: "ap_q2", text: "Tu racontes ton histoire en moins de 300 mots ?", tooltip: "Ton histoire doit être percutante, pas exhaustive. Garde les moments clés." },
    { id: "ap_q3", text: "Tu mentionnes tes valeurs de façon concrète (pas juste 'authenticité, bienveillance') ?", tooltip: "Au lieu de 'bienveillance', montre comment elle se traduit : 'Je ne te donnerai jamais de conseil que je n'appliquerais pas moi-même'." },
    { id: "ap_q4", text: "Tu as un CTA en fin de page (prendre contact, découvrir les offres) ?", tooltip: "Ta visiteuse vient de lire ton histoire, elle est connectée. Ne la laisse pas partir sans direction." },
    { id: "ap_q5", text: "Tu as ta photo sur cette page ?", tooltip: "Les gens achètent à des humains. Pas besoin d'une photo pro, une photo authentique suffit." },
  ],
  offres: [
    { id: "off_q1", text: "Chaque offre a une page dédiée (pas tout mélangé) ?", tooltip: "Une page = une offre = une décision. Mélanger crée de la confusion." },
    { id: "off_q2", text: "Tu montres les bénéfices AVANT les caractéristiques ?", tooltip: "Ta cliente veut savoir ce qu'elle va obtenir, pas le nombre de modules ou d'heures." },
    { id: "off_q3", text: "Le prix est visible (ou au moins le processus pour l'obtenir) ?", tooltip: "L'opacité sur le prix est le frein n°1. Si tu ne veux pas afficher le prix, explique le processus." },
    { id: "off_q4", text: "Tu as des témoignages sur cette page ?", tooltip: "Un témoignage spécifique à l'offre est 3x plus convaincant qu'un témoignage générique." },
    { id: "off_q5", text: "Le CTA est clair et visible ?", tooltip: "Un seul bouton d'action par offre, bien visible, avec un texte d'action concret." },
    { id: "off_q6", text: "Tu as une section FAQ sur cette page ?", tooltip: "La FAQ lève les dernières objections. 3-5 questions suffisent." },
  ],
  contact: [
    { id: "ct_q1", text: "Le formulaire a 4 champs max ?", tooltip: "Chaque champ supplémentaire réduit le taux de complétion de 10%. Nom, email, message suffisent." },
    { id: "ct_q2", text: "Tu proposes au moins 2 façons de te contacter ?", tooltip: "Formulaire + email, ou formulaire + DM Instagram. Certaines préfèrent un canal à l'autre." },
    { id: "ct_q3", text: "Tu indiques un délai de réponse ?", tooltip: "'Je te réponds sous 48h' réduit l'anxiété et montre ton professionnalisme." },
    { id: "ct_q4", text: "Tu as un texte rassurant avant le formulaire ?", tooltip: "Un petit paragraphe du genre 'Pas de spam, juste une conversation pour voir si on est faites pour travailler ensemble'." },
  ],
  produits: [
    { id: "pr_q1", text: "Chaque produit a une photo de qualité ?", tooltip: "Une bonne photo vaut mille mots. Lumière naturelle, fond neutre, produit en situation." },
    { id: "pr_q2", text: "Les descriptions parlent du bénéfice client (pas juste les caractéristiques) ?", tooltip: "'Te permet de…' plutôt que 'Contient…'. Le bénéfice d'abord, la technique ensuite." },
    { id: "pr_q3", text: "Le bouton d'achat est visible sans scroller ?", tooltip: "Le bouton d'achat doit être visible dès l'arrivée sur la fiche produit." },
    { id: "pr_q4", text: "Tu montres des avis clients sur les produits ?", tooltip: "Les avis augmentent la conversion de 20 à 30%. Même 2-3 avis font la différence." },
    { id: "pr_q5", text: "Tu proposes des produits complémentaires ?", tooltip: "'Les clientes qui ont acheté ceci ont aussi aimé…' augmente le panier moyen." },
  ],
};

const PAGE_LABELS: Record<string, { emoji: string; title: string }> = {
  accueil: { emoji: "🏠", title: "Page d'accueil" },
  "a-propos": { emoji: "👋", title: "Page À propos" },
  offres: { emoji: "🎁", title: "Page Offres / Services" },
  contact: { emoji: "💬", title: "Page Contact" },
  produits: { emoji: "🛍️", title: "Page Produits" },
};

const ANSWER_OPTIONS: { value: AnswerValue; label: string }[] = [
  { value: "oui", label: "Oui ✅" },
  { value: "non", label: "Non ❌" },
  { value: "pas_sure", label: "Pas sûr·e 🤷" },
];

// ── Types ──
type AuditData = {
  id: string;
  audit_mode: string | null;
  answers: Record<string, unknown>;
  completed: boolean;
  score_global: number;
  scores: Record<string, unknown>;
  diagnostic: string | null;
  recommendations: unknown[];
  current_page: string | null;
};

// ── Component ──
const SiteAuditPage = () => {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();

  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<AuditData | null>(null);
  const [step, setStep] = useState<"choose" | "pick-pages" | "questionnaire" | "results">("choose");
  const [selectedPages, setSelectedPages] = useState<string[]>(["accueil"]);
  const [otherPage, setOtherPage] = useState("");
  const [includeOther, setIncludeOther] = useState(false);
  const [saving, setSaving] = useState(false);

  // Global questionnaire state
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});

  // Page-by-page state
  const [pbpPages, setPbpPages] = useState<string[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [pbpAnswers, setPbpAnswers] = useState<Record<string, Record<string, AnswerValue>>>({});

  const loadAudit = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await (supabase.from("website_audit") as any)
      .select("*")
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setExisting(data);
      if (data.audit_mode === "global" && data.answers && typeof data.answers === "object" && !data.answers.accueil) {
        setAnswers(data.answers as Record<string, AnswerValue>);
      }
      if (data.audit_mode === "page_by_page" && data.answers && typeof data.answers === "object") {
        setPbpAnswers(data.answers as Record<string, Record<string, AnswerValue>>);
        // Reconstruct selected pages from answers keys or current_page
        const storedPages = Object.keys(data.answers).filter(k => typeof data.answers[k] === "object");
        if (storedPages.length > 0) setPbpPages(storedPages);
      }
    } else {
      setExisting(null);
    }
    setLoading(false);
  };

  useEffect(() => { loadAudit(); }, [user?.id]);

  const hasStarted = existing && (
    existing.completed ||
    (existing.answers && Object.keys(existing.answers).length > 0) ||
    existing.audit_mode
  );

  // ── Save helpers ──
  const saveGlobalAnswersToDb = useCallback(async (newAnswers: Record<string, AnswerValue>) => {
    if (!existing?.id) return;
    await (supabase.from("website_audit") as any)
      .update({ answers: newAnswers })
      .eq("id", existing.id);
  }, [existing?.id]);

  const savePbpAnswersToDb = useCallback(async (newAnswers: Record<string, Record<string, AnswerValue>>) => {
    if (!existing?.id) return;
    await (supabase.from("website_audit") as any)
      .update({ answers: newAnswers })
      .eq("id", existing.id);
  }, [existing?.id]);

  const upsertAudit = async (mode: string, pages?: string[]) => {
    if (!user) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      user_id: user.id,
      workspace_id: workspaceId !== user.id ? workspaceId : null,
      audit_mode: mode,
      answers: {},
      scores: {},
      score_global: 0,
      diagnostic: null,
      recommendations: [],
      completed: false,
      current_page: mode === "page_by_page" && pages?.length ? pages[0] : null,
    };

    if (existing?.id) {
      await (supabase.from("website_audit") as any).update(payload).eq("id", existing.id);
    } else {
      await (supabase.from("website_audit") as any).insert(payload).select("id").single();
    }

    setAnswers({});
    setPbpAnswers({});
    setCurrentSection(0);
    setCurrentPageIdx(0);
    if (mode === "page_by_page" && pages) setPbpPages(pages);
    await loadAudit();
    setSaving(false);
    setStep("questionnaire");
  };

  const handleGlobal = () => upsertAudit("global");

  const handlePageByPage = () => {
    const allPages = [...selectedPages];
    if (includeOther && otherPage.trim()) allPages.push(otherPage.trim());
    if (allPages.length === 0) { toast.error("Sélectionne au moins une page"); return; }
    upsertAudit("page_by_page", allPages);
  };

  const handleReset = async () => {
    if (!existing?.id) return;
    setSaving(true);
    await (supabase.from("website_audit") as any).delete().eq("id", existing.id);
    setExisting(null);
    setAnswers({});
    setPbpAnswers({});
    setCurrentSection(0);
    setCurrentPageIdx(0);
    setStep("choose");
    setSaving(false);
    toast.success("Audit réinitialisé");
  };

  const togglePage = (id: string) => {
    setSelectedPages(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  // ── Global questionnaire navigation ──
  const section = GLOBAL_SECTIONS[currentSection];
  const totalSections = GLOBAL_SECTIONS.length;
  const sectionComplete = section?.questions.every(q => answers[q.id] != null) ?? false;

  const handleGlobalAnswer = (qId: string, val: AnswerValue) => {
    setAnswers(prev => ({ ...prev, [qId]: val }));
  };

  const goNextGlobalSection = async () => {
    await saveGlobalAnswersToDb(answers);
    if (currentSection < totalSections - 1) {
      setCurrentSection(prev => prev + 1);
    } else {
      setStep("results");
    }
  };

  const goPrevGlobalSection = () => {
    if (currentSection > 0) setCurrentSection(prev => prev - 1);
    else setStep("choose");
  };

  // ── Page-by-page navigation ──
  const currentPbpPageId = pbpPages[currentPageIdx] ?? "";
  const currentPbpQuestions = PAGE_QUESTIONS[currentPbpPageId] ?? [];
  const currentPbpLabel = PAGE_LABELS[currentPbpPageId] ?? { emoji: "📄", title: currentPbpPageId };
  const currentPbpPageAnswers = pbpAnswers[currentPbpPageId] ?? {};
  const pbpPageComplete = currentPbpQuestions.length > 0 && currentPbpQuestions.every(q => currentPbpPageAnswers[q.id] != null);

  const handlePbpAnswer = (qId: string, val: AnswerValue) => {
    setPbpAnswers(prev => ({
      ...prev,
      [currentPbpPageId]: { ...(prev[currentPbpPageId] ?? {}), [qId]: val },
    }));
  };

  const goNextPbpPage = async () => {
    await savePbpAnswersToDb(pbpAnswers);
    if (currentPageIdx < pbpPages.length - 1) {
      setCurrentPageIdx(prev => prev + 1);
    } else {
      setStep("results");
    }
  };

  const goPrevPbpPage = () => {
    if (currentPageIdx > 0) setCurrentPageIdx(prev => prev - 1);
    else setStep("choose");
  };

  const goToPbpPage = async (idx: number) => {
    await savePbpAnswersToDb(pbpAnswers);
    setCurrentPageIdx(idx);
  };

  // ── Shared question renderer ──
  const renderQuestions = (
    questions: AuditQuestion[],
    currentAnswers: Record<string, AnswerValue>,
    onAnswer: (qId: string, val: AnswerValue) => void,
  ) => (
    <div className="space-y-5">
      {questions.map((q) => (
        <div key={q.id} className="space-y-2.5">
          <div className="flex items-start gap-2">
            <p className="text-sm font-medium text-foreground leading-snug flex-1">{q.text}</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="shrink-0 mt-0.5 text-muted-foreground hover:text-primary transition-colors">
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {q.tooltip}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-wrap gap-2">
            {ANSWER_OPTIONS.map(opt => {
              const isSelected = currentAnswers[q.id] === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onAnswer(q.id, opt.value)}
                  className={`font-mono-ui text-[12px] font-semibold px-4 py-2 rounded-pill border-2 transition-colors ${
                    isSelected
                      ? "border-primary bg-rose-pale text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  // ── Render ──
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-3xl mx-auto px-4 py-8 space-y-6">
        <SubPageHeader parentLabel="Mon Site Web" parentTo="/site" currentLabel="Audit de conversion" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">🔍 Audit de conversion</h1>
          <p className="text-muted-foreground">
            Diagnostique ton site page par page ou en global, et découvre ce qui bloque tes visiteuses.
          </p>
        </div>

        {/* ── Existing audit banner ── */}
        {hasStarted && step === "choose" && (
          <div className="rounded-2xl border border-primary bg-rose-pale p-6 space-y-4">
            <p className="font-display text-base font-bold text-foreground">
              {existing?.completed ? "✅ Tu as déjà un audit terminé !" : "📝 Tu as un audit en cours."}
            </p>
            <p className="text-sm text-muted-foreground">
              {existing?.completed
                ? `Score global : ${existing.score_global}/100. Tu peux consulter tes résultats ou recommencer.`
                : "Tu peux reprendre là où tu en étais ou recommencer de zéro."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setStep(existing?.completed ? "results" : "questionnaire")} className="gap-2 rounded-pill">
                <Eye className="h-4 w-4" />
                {existing?.completed ? "Voir mon dernier audit" : "Reprendre l'audit"}
              </Button>
              <Button variant="outline" onClick={handleReset} disabled={saving} className="gap-2 rounded-pill">
                <RotateCcw className="h-4 w-4" />
                Refaire un audit
              </Button>
            </div>
          </div>
        )}

        {/* ── Mode selection ── */}
        {!hasStarted && step === "choose" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button onClick={handleGlobal} disabled={saving} className="group relative rounded-2xl border bg-card p-6 text-left transition-all hover:border-primary hover:shadow-md cursor-pointer">
              <span className="text-2xl mb-3 block">🌐</span>
              <h3 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition-colors">Audit global</h3>
              <p className="mt-1 text-sm text-muted-foreground">Un diagnostic rapide de tout ton site en 5 minutes. Idéal pour un premier état des lieux.</p>
              <span className="mt-3 inline-block font-mono-ui text-[10px] font-semibold px-2.5 py-0.5 rounded-pill text-primary bg-rose-pale">~5 min</span>
            </button>
            <button onClick={() => setStep("pick-pages")} disabled={saving} className="group relative rounded-2xl border bg-card p-6 text-left transition-all hover:border-primary hover:shadow-md cursor-pointer">
              <span className="text-2xl mb-3 block">📄</span>
              <h3 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition-colors">Audit page par page</h3>
              <p className="mt-1 text-sm text-muted-foreground">Un diagnostic détaillé, page par page. Plus long mais plus précis.</p>
              <span className="mt-3 inline-block font-mono-ui text-[10px] font-semibold px-2.5 py-0.5 rounded-pill text-primary bg-rose-pale">~15 min</span>
            </button>
          </div>
        )}

        {/* ── Page picker ── */}
        {step === "pick-pages" && (
          <div className="rounded-2xl border bg-card p-6 space-y-5">
            <div>
              <h3 className="font-display text-lg font-bold text-foreground mb-1">Quelles pages veux-tu auditer ?</h3>
              <p className="text-sm text-muted-foreground">Sélectionne les pages de ton site à analyser.</p>
            </div>
            <div className="space-y-3">
              {PAGE_OPTIONS.map(opt => (
                <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
                  <Checkbox checked={selectedPages.includes(opt.id)} onCheckedChange={() => togglePage(opt.id)} />
                  <span className="text-sm text-foreground group-hover:text-primary transition-colors">{opt.label}</span>
                </label>
              ))}
              <label className="flex items-center gap-3 cursor-pointer group">
                <Checkbox checked={includeOther} onCheckedChange={(v) => setIncludeOther(!!v)} />
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">Autre</span>
              </label>
              {includeOther && (
                <Input placeholder="Ex : Blog, Portfolio, Landing page…" value={otherPage} onChange={(e) => setOtherPage(e.target.value)} className="max-w-sm" />
              )}
            </div>
            <div className="flex gap-3">
              <Button onClick={handlePageByPage} disabled={saving || (selectedPages.length === 0 && !(includeOther && otherPage.trim()))} className="gap-2 rounded-pill">
                Commencer l'audit <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => setStep("choose")} className="rounded-pill">Retour</Button>
            </div>
          </div>
        )}

        {/* ── Global questionnaire ── */}
        {step === "questionnaire" && existing?.audit_mode === "global" && section && (
          <TooltipProvider delayDuration={200}>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono-ui font-semibold">Section {currentSection + 1}/{totalSections}</span>
                  <span>{section.emoji} {section.title}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${((currentSection + 1) / totalSections) * 100}%` }} />
                </div>
              </div>
              <div className="rounded-2xl border bg-card p-6 space-y-6">
                <h3 className="font-display text-lg font-bold text-foreground">{section.emoji} {section.title}</h3>
                {renderQuestions(section.questions, answers, handleGlobalAnswer)}
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={goPrevGlobalSection} className="gap-2 rounded-pill">
                  <ArrowLeft className="h-4 w-4" />
                  {currentSection === 0 ? "Retour" : "Précédent"}
                </Button>
                <Button onClick={goNextGlobalSection} disabled={!sectionComplete} className="gap-2 rounded-pill">
                  {currentSection === totalSections - 1 ? "Voir mon diagnostic" : "Suivant"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TooltipProvider>
        )}

        {/* ── Page-by-page questionnaire ── */}
        {step === "questionnaire" && existing?.audit_mode === "page_by_page" && pbpPages.length > 0 && (
          <TooltipProvider delayDuration={200}>
            <div className="space-y-6">
              {/* Page tabs */}
              <div className="flex flex-wrap gap-2">
                {pbpPages.map((pageId, idx) => {
                  const label = PAGE_LABELS[pageId] ?? { emoji: "📄", title: pageId };
                  const pageAnswers = pbpAnswers[pageId] ?? {};
                  const pageQuestions = PAGE_QUESTIONS[pageId] ?? [];
                  const isDone = pageQuestions.length > 0 && pageQuestions.every(q => pageAnswers[q.id] != null);
                  const isCurrent = idx === currentPageIdx;
                  return (
                    <button
                      key={pageId}
                      onClick={() => goToPbpPage(idx)}
                      className={`font-mono-ui text-[12px] font-semibold px-4 py-2 rounded-pill border-2 transition-colors ${
                        isCurrent
                          ? "border-primary bg-rose-pale text-primary"
                          : isDone
                            ? "border-primary/30 bg-rose-pale/50 text-primary/70"
                            : "border-border bg-card text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {label.emoji} {label.title} {isDone && !isCurrent ? "✓" : ""}
                    </button>
                  );
                })}
              </div>

              {/* Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono-ui font-semibold">Page {currentPageIdx + 1}/{pbpPages.length}</span>
                  <span>{currentPbpLabel.emoji} {currentPbpLabel.title}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${((currentPageIdx + 1) / pbpPages.length) * 100}%` }} />
                </div>
              </div>

              {/* Questions */}
              {currentPbpQuestions.length > 0 ? (
                <div className="rounded-2xl border bg-card p-6 space-y-6">
                  <h3 className="font-display text-lg font-bold text-foreground">
                    {currentPbpLabel.emoji} {currentPbpLabel.title}
                  </h3>
                  {renderQuestions(currentPbpQuestions, currentPbpPageAnswers, handlePbpAnswer)}
                </div>
              ) : (
                <div className="rounded-2xl border bg-card p-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Pas de questionnaire spécifique pour "{currentPbpPageId}". Tu peux passer à la page suivante.
                  </p>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between">
                <Button variant="outline" onClick={goPrevPbpPage} className="gap-2 rounded-pill">
                  <ArrowLeft className="h-4 w-4" />
                  {currentPageIdx === 0 ? "Retour" : "Précédent"}
                </Button>
                <Button
                  onClick={goNextPbpPage}
                  disabled={currentPbpQuestions.length > 0 && !pbpPageComplete}
                  className="gap-2 rounded-pill"
                >
                  {currentPageIdx === pbpPages.length - 1 ? "Voir mon diagnostic complet" : "Page suivante"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TooltipProvider>
        )}

        {/* ── Results placeholder ── */}
        {step === "results" && (
          <div className="rounded-2xl border bg-card p-6 text-center space-y-3">
            <p className="text-lg font-display font-bold text-foreground">📊 Résultats de ton audit</p>
            <p className="text-sm text-muted-foreground">Tes résultats détaillés seront affichés ici.</p>
            <Button variant="outline" onClick={() => setStep("choose")} className="rounded-pill">Retour</Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default SiteAuditPage;
