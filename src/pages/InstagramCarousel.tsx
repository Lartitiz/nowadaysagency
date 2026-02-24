import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AddToCalendarDialog } from "@/components/calendar/AddToCalendarDialog";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";
import { useSearchParams } from "react-router-dom";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useActivityExamples } from "@/hooks/use-activity-examples";
import CarouselPreview from "@/components/carousel/CarouselPreview";
import {
  CarouselTypeStep, CarouselContextStep, CarouselQuestionsStep,
  CarouselAnglesStep, CarouselHooksStep,
  CAROUSEL_TYPES, OBJECTIVES,
} from "@/components/carousel/CarouselForm";

// ── Types ──
interface Hook {
  id: string; text: string; word_count: number; style: string;
}

interface Slide {
  slide_number: number; role: string; title: string; body: string; visual_suggestion: string; word_count: number;
}

interface Caption {
  hook: string; body: string; cta: string; hashtags: string[];
}

interface QualityCheck {
  hook_word_count: number; hook_ok: boolean; all_slides_under_50_words: boolean;
  single_cta: boolean; caption_different_from_hook: boolean; slide_2_works_as_standalone_hook: boolean; score: number;
}

interface TopicSuggestion {
  subject: string; why_now: string; angle: string;
}

interface AngleSuggestion {
  id: string; emoji: string; title: string; description: string;
}

// ── Deepening questions per carousel type ──
const DEEPENING_QUESTIONS: Record<string, { question: string; placeholder: string }[]> = {
  prise_de_position: [
    { question: "C'est quoi le truc qui t'énerve ou que tu veux déconstruire sur ce sujet ? Le mythe, l'idée reçue, le cliché que tu veux combattre.", placeholder: "Le mythe, l'idée reçue, le cliché..." },
    { question: "Quelle est TA position ? En une phrase, ce que tu défends vraiment.", placeholder: "Ce que tu défends..." },
    { question: "Tu as un exemple concret, une anecdote ou un vécu qui illustre ta position ?", placeholder: "Une anecdote, un moment client, un vécu..." },
  ],
  tips: [
    { question: "Quel problème concret tu résous avec ces tips ? La galère que ta cible vit au quotidien.", placeholder: "La galère que ta cible vit..." },
    { question: "Quel est LE tip le plus contre-intuitif ou surprenant que tu veux partager ?", placeholder: "Le tip qui surprend..." },
    { question: "Il y a une erreur courante que ta cible fait sur ce sujet ?", placeholder: "L'erreur classique..." },
  ],
  tutoriel: [
    { question: "Quel problème concret tu résous avec ces tips ? La galère que ta cible vit au quotidien.", placeholder: "La galère que ta cible vit..." },
    { question: "Quel est LE tip le plus contre-intuitif ou surprenant que tu veux partager ?", placeholder: "Le tip qui surprend..." },
    { question: "Il y a une erreur courante que ta cible fait sur ce sujet ?", placeholder: "L'erreur classique..." },
  ],
  storytelling: [
    { question: "Raconte-moi le moment déclencheur. Le jour, la scène, ce qui s'est passé.", placeholder: "Le moment, la scène..." },
    { question: "Qu'est-ce que tu as ressenti à ce moment-là ? Et qu'est-ce que ça a changé ensuite ?", placeholder: "Ce que tu as ressenti..." },
    { question: "Quel est le message ou la leçon que tu veux que les gens retiennent de cette histoire ?", placeholder: "La leçon à retenir..." },
  ],
  etude_de_cas: [
    { question: "C'est qui cette cliente ? Son contexte, sa situation de départ (sans la nommer si elle ne veut pas).", placeholder: "Son contexte, sa situation..." },
    { question: "Qu'est-ce que vous avez fait concrètement ensemble ? Les actions clés.", placeholder: "Les actions concrètes..." },
    { question: "Le résultat ? Qu'est-ce qui a changé pour elle ? (concret, pas juste 'elle est contente')", placeholder: "Les résultats concrets..." },
  ],
  mythe_realite: [
    { question: "C'est quoi le mythe que tu veux exploser ? La croyance que tout le monde répète.", placeholder: "Le mythe à déconstruire..." },
    { question: "Pourquoi c'est faux ? Ton argument principal.", placeholder: "Ton argument..." },
    { question: "Quelle est la réalité alternative que tu proposes ?", placeholder: "La réalité que tu défends..." },
  ],
  before_after: [
    { question: "Décris le AVANT : la situation galère, le problème concret, ce que ça fait au quotidien.", placeholder: "La situation avant..." },
    { question: "Décris le APRÈS : ce qui a changé, le résultat concret, le nouveau quotidien.", placeholder: "La situation après..." },
    { question: "Qu'est-ce qui a permis cette transformation ? Le déclic ou l'action clé.", placeholder: "Le déclic..." },
  ],
  checklist: [
    { question: "C'est quoi le thème exact de ta liste ? Pour qui et dans quel contexte ?", placeholder: "Le thème, pour qui..." },
    { question: "Donne-moi 3-4 éléments que tu veux absolument inclure.", placeholder: "Les éléments clés..." },
    { question: "Il y a un élément surprise ou peu connu que tu voudrais ajouter ?", placeholder: "L'élément surprise..." },
  ],
  comparatif: [
    { question: "C'est quoi les 2 options que tu compares ? Et dans quel contexte ?", placeholder: "Option A vs Option B..." },
    { question: "Pour toi, quelle est la meilleure option et pourquoi ?", placeholder: "Ton verdict..." },
    { question: "Il y a un critère que les gens oublient souvent dans cette comparaison ?", placeholder: "Le critère oublié..." },
  ],
  promo: [
    { question: "Quel est le problème n°1 que ton offre résout ?", placeholder: "Le problème principal..." },
    { question: "C'est quoi le résultat concret qu'une cliente peut attendre ?", placeholder: "Le résultat attendu..." },
    { question: "Tu as un témoignage ou un résultat chiffré à partager ?", placeholder: "Témoignage, résultat..." },
  ],
  coulisses: [
    { question: "C'est les coulisses de quoi exactement ?", placeholder: "Les coulisses de..." },
    { question: "Quel aspect surprendrait le plus les gens ?", placeholder: "Ce qui surprendrait..." },
  ],
  photo_dump: [
    { question: "C'est quoi l'ambiance / le moment que tu veux transmettre ?", placeholder: "L'ambiance, le moment..." },
    { question: "Il y a un message derrière ces photos ?", placeholder: "Le message..." },
  ],
};

const DEFAULT_QUESTIONS = [
  { question: "Quel message tu veux faire passer avec ce carrousel ?", placeholder: "Le message principal..." },
  { question: "Tu as un vécu ou un exemple concret à partager ?", placeholder: "Une anecdote, un exemple..." },
  { question: "Qu'est-ce que tu veux que les gens fassent après ?", placeholder: "Le CTA, l'action..." },
];

export default function InstagramCarousel() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const activityExamples = useActivityExamples();

  // Flow: 1=type, 2=context, 3=deepening questions, 4=angles, 5=hooks+structure, 6=slides+caption
  const [step, setStep] = useState(1);
  const [carouselType, setCarouselType] = useState("");
  const [objective, setObjective] = useState("");
  const [subject, setSubject] = useState("");
  const [selectedOffer, setSelectedOffer] = useState("");
  const [slideCount, setSlideCount] = useState(7);
  
  // Deepening questions state
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [deepeningAnswers, setDeepeningAnswers] = useState<Record<string, string>>({});
  const [activeMicField, setActiveMicField] = useState<string | null>(null);
  
  // Angles state
  const [angles, setAngles] = useState<AngleSuggestion[]>([]);
  const [chosenAngle, setChosenAngle] = useState<AngleSuggestion | null>(null);
  
  // Hooks & slides state
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [selectedHook, setSelectedHook] = useState("");
  const [customHook, setCustomHook] = useState("");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [qualityCheck, setQualityCheck] = useState<QualityCheck | null>(null);
  const [publishingTip, setPublishingTip] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topics, setTopics] = useState<TopicSuggestion[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [showIdeasDialog, setShowIdeasDialog] = useState(false);
  const [calendarPostId, setCalendarPostId] = useState<string | null>(null);

  // Speech recognition for deepening questions
  const { isListening, toggle } = useSpeechRecognition((text) => {
    if (activeMicField) {
      setDeepeningAnswers(prev => ({
        ...prev,
        [activeMicField]: (prev[activeMicField] || "") + (prev[activeMicField] ? " " : "") + text,
      }));
    }
  });

  const handleMic = (field: string) => {
    if (isListening && activeMicField === field) { toggle(); return; }
    if (isListening) toggle();
    setActiveMicField(field);
    setTimeout(() => toggle(), 50);
  };

  const OBJECTIF_TO_CAROUSEL: Record<string, string> = {
    visibilite: "shares", confiance: "community", vente: "conversion", credibilite: "saves",
  };

  const { restored: draftRestored, clearDraft } = useFormPersist(
    "carousel-form",
    { step, carouselType, objective, subject, selectedOffer, slideCount },
    (saved) => {
      if (searchParams.get("calendar_id")) return;
      if (saved.carouselType) setCarouselType(saved.carouselType);
      if (saved.objective) setObjective(saved.objective);
      if (saved.subject) setSubject(saved.subject);
      if (saved.selectedOffer) setSelectedOffer(saved.selectedOffer);
      if (saved.slideCount) setSlideCount(saved.slideCount);
      if (saved.step && saved.step > 1 && saved.step < 4) setStep(saved.step);
    }
  );

  useEffect(() => {
    if (!user) return;
    (supabase.from("offers") as any).select("id, name, price_text").eq(column, value).order("created_at").then(({ data }: any) => {
      if (data) setOffers(data);
    });
  }, [user?.id]);

  useEffect(() => {
    const calId = searchParams.get("calendar_id");
    if (!calId || !user) return;
    const loadCalendarPost = async () => {
      const { data: post } = await (supabase.from("calendar_posts") as any).select("*").eq("id", calId).eq(column, value).maybeSingle();
      if (!post) return;
      setCalendarPostId(post.id);
      if (post.theme) setSubject(post.theme);
      if (post.objectif && OBJECTIF_TO_CAROUSEL[post.objectif]) setObjective(OBJECTIF_TO_CAROUSEL[post.objectif]);
      const carouselTypeParam = searchParams.get("carousel_type");
      if (carouselTypeParam) { setCarouselType(carouselTypeParam); setStep(2); }
      else if (post.angle) {
        const ANGLE_MAP: Record<string, string> = {
          "Storytelling": "storytelling", "Mythe à déconstruire": "mythe_realite", "Coup de gueule": "prise_de_position",
          "Enquête / décryptage": "prise_de_position", "Conseil contre-intuitif": "tips", "Test grandeur nature": "etude_de_cas",
          "Before / After": "before_after", "Histoire cliente": "etude_de_cas", "Regard philosophique": "prise_de_position", "Surf sur l'actu": "prise_de_position",
        };
        if (ANGLE_MAP[post.angle]) { setCarouselType(ANGLE_MAP[post.angle]); setStep(2); }
      }
      if (!post.theme && post.notes) setSubject(post.notes);
    };
    loadCalendarPost();
  }, [user?.id, searchParams]);

  const typeObj = CAROUSEL_TYPES.find(t => t.id === carouselType);
  const questions = DEEPENING_QUESTIONS[carouselType] || DEFAULT_QUESTIONS;

  // ── API calls ──
  const handleGenerateAngles = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("carousel-ai", {
        body: { type: "suggest_angles", carousel_type: carouselType, subject, objective, deepening_answers: deepeningAnswers },
      });
      if (error) throw error;
      const raw = data?.content || "";
      const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      setAngles(parsed.angles || []);
      setStep(4);
    } catch (e: any) {
      console.error(e);
      toast.error("Erreur lors de la suggestion d'angles.");
    }
    setLoading(false);
  };

  const handleGenerateHooks = async () => {
    if (!user || !subject.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("carousel-ai", {
        body: {
          type: "hooks", carousel_type: carouselType, subject, objective, slide_count: slideCount,
          deepening_answers: Object.values(deepeningAnswers).some(v => v.trim()) ? deepeningAnswers : undefined,
          chosen_angle: chosenAngle || undefined,
        },
      });
      if (error) throw error;
      const raw = data?.content || "";
      const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      setHooks(parsed.hooks || []);
      setStep(5);
    } catch (e: any) {
      console.error(e);
      toast.error("Erreur lors de la génération des accroches.");
    }
    setLoading(false);
  };

  const handleGenerateSlides = async () => {
    if (!user) return;
    const hookText = customHook.trim() || selectedHook;
    if (!hookText) { toast.error("Choisis ou écris une accroche."); return; }
    setLoading(true);
    try {
      const offerCtx = selectedOffer ? offers.find(o => o.id === selectedOffer) : null;
      const { data, error } = await supabase.functions.invoke("carousel-ai", {
        body: {
          type: "slides", carousel_type: carouselType, subject, objective,
          selected_hook: hookText, slide_count: slideCount,
          selected_offer: offerCtx ? `${offerCtx.name} (${offerCtx.price_text || "gratuit"})` : null,
          deepening_answers: Object.values(deepeningAnswers).some(v => v.trim()) ? deepeningAnswers : undefined,
          chosen_angle: chosenAngle || undefined,
        },
      });
      if (error) throw error;
      const raw = data?.content || "";
      const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      setSlides(parsed.slides || []);
      setCaption(parsed.caption || null);
      setQualityCheck(parsed.quality_check || null);
      setPublishingTip(parsed.publishing_tip || "");

      const insertRes = await supabase.from("generated_carousels" as any).insert({
        user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined, carousel_type: carouselType, subject, objective,
        hook_text: hookText, slide_count: slideCount,
        slides: parsed.slides, caption: `${parsed.caption?.hook}\n\n${parsed.caption?.body}\n\n${parsed.caption?.cta}`,
        hashtags: parsed.caption?.hashtags, quality_score: parsed.quality_check?.score,
        calendar_post_id: calendarPostId || null,
      }).select("id").single();

      if (calendarPostId && insertRes.data) {
        await supabase.from("calendar_posts").update({
          status: "ready",
          generated_content_id: (insertRes.data as any).id,
          generated_content_type: "carousel",
          content_draft: parsed.slides?.map((s: any) => `${s.title}\n${s.body || ""}`).join("\n\n"),
          accroche: hookText,
          updated_at: new Date().toISOString(),
        }).eq("id", calendarPostId);
      }

      setStep(6);
      clearDraft();
    } catch (e: any) {
      console.error(e);
      toast.error("Erreur lors de la génération du carrousel.");
    }
    setLoading(false);
  };

  const handleSuggestTopics = async () => {
    if (!user) return;
    setLoadingTopics(true);
    try {
      const { data: recentPosts } = await (supabase.from("calendar_posts") as any)
        .select("theme").eq(column, value).order("created_at", { ascending: false }).limit(10);
      const recentStr = recentPosts?.map(p => p.theme).join(", ") || "";
      const { data, error } = await supabase.functions.invoke("carousel-ai", {
        body: { type: "suggest_topics", carousel_type: carouselType, objective, recent_posts: recentStr },
      });
      if (error) throw error;
      const raw = data?.content || "";
      const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      setTopics(parsed.topics || []);
    } catch (e: any) {
      console.error(e);
      toast.error("Erreur lors de la suggestion de sujets.");
    }
    setLoadingTopics(false);
  };

  const handleSkipQuestions = () => handleGenerateHooks();

  const handleNextQuestion = () => {
    if (currentQuestion < questions.length - 1) setCurrentQuestion(prev => prev + 1);
    else handleGenerateAngles();
  };

  const handleCopyAll = () => {
    const slidesText = slides.map(s => `--- SLIDE ${s.slide_number} (${s.role}) ---\n${s.title}${s.body ? `\n${s.body}` : ""}`).join("\n\n");
    const captionText = caption ? `--- CAPTION ---\n${caption.hook}\n\n${caption.body}\n\n${caption.cta}\n\n--- HASHTAGS ---\n${caption.hashtags.map(h => `#${h}`).join(" ")}` : "";
    navigator.clipboard.writeText(`${slidesText}\n\n${captionText}`);
    toast.success("Carrousel copié !");
  };

  const handleAddToCalendar = async (dateStr: string) => {
    if (!user || slides.length === 0) return;
    const hookText = customHook.trim() || selectedHook;
    await supabase.from("calendar_posts").insert({
      user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined, date: dateStr, theme: subject || `Carrousel : ${typeObj?.label}`,
      canal: "instagram", format: "carousel", objectif: objective,
      content_draft: slides.map(s => `Slide ${s.slide_number}: ${s.title}\n${s.body || ""}`).join("\n\n"),
      accroche: hookText, status: "ready",
      story_sequence_detail: { type: "carousel", carousel_type: carouselType, slides, caption, quality_check: qualityCheck } as any,
    });
    setShowCalendarDialog(false);
    toast.success("Carrousel ajouté au calendrier !");
  };

  const updateSlide = (index: number, field: "title" | "body", value: string) => {
    const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
    const updated = [...slides];
    updated[index] = { ...updated[index], [field]: value, word_count: countWords(`${field === "title" ? value : updated[index].title} ${field === "body" ? value : updated[index].body}`) };
    setSlides(updated);
  };

  const updateCaption = (field: keyof Caption, value: any) => {
    if (!caption) return;
    setCaption({ ...caption, [field]: value });
  };

  const totalSteps = 6;
  const stepLabels = ["Type", "Contexte", "Questions", "Angle", "Accroche", "Carrousel"];

  // ── Loading state ──
  if (loading) {
    const loadingMessages: Record<number, string> = {
      3: "L'IA analyse tes réponses et propose des angles...",
      4: "L'IA prépare tes accroches...",
      5: "L'IA rédige ton carrousel...",
    };
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-16 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{loadingMessages[step] || "L'IA travaille..."}</p>
          <p className="text-xs text-muted-foreground mt-2">✨ Ça peut prendre quelques secondes.</p>
        </main>
      </div>
    );
  }

  // ═══ STEP 6: RESULT ═══
  if (step >= 6 && slides.length > 0) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 animate-fade-in">
          <SubPageHeader parentLabel="Créer" parentTo="/instagram/creer" currentLabel="Carrousel" useFromParam breadcrumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Créer", to: "/instagram/creer" }]} />

          <CarouselPreview
            slides={slides}
            caption={caption}
            qualityCheck={qualityCheck}
            publishingTip={publishingTip}
            typeLabel={typeObj?.label || ""}
            typeEmoji={typeObj?.emoji || ""}
            objectiveLabel={OBJECTIVES.find(o => o.id === objective)?.label || ""}
            chosenAngle={chosenAngle}
            onUpdateSlide={updateSlide}
            onUpdateCaption={updateCaption}
            onCopyAll={handleCopyAll}
            onPlanifier={() => setShowCalendarDialog(true)}
            onSave={() => setShowIdeasDialog(true)}
            onRegenerate={() => { setStep(5); setSlides([]); setCaption(null); }}
            onNew={() => { setStep(1); setSlides([]); setHooks([]); setCaption(null); setAngles([]); setChosenAngle(null); setDeepeningAnswers({}); setCurrentQuestion(0); }}
          />

          <AddToCalendarDialog open={showCalendarDialog} onOpenChange={setShowCalendarDialog} onConfirm={handleAddToCalendar} contentLabel={`Carrousel : ${subject || typeObj?.label}`} contentEmoji="🎠" />
          <SaveToIdeasDialog open={showIdeasDialog} onOpenChange={setShowIdeasDialog} contentType="post_instagram" subject={subject || typeObj?.label || "Carrousel"} contentData={{ slides, caption, qualityCheck }} sourceModule="carousel" format="carousel" objectif={objective} />
        </main>
      </div>
    );
  }

  // ═══ STEPS 1-5 ═══
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 animate-fade-in">
        <SubPageHeader parentLabel="Créer" parentTo="/instagram/creer" currentLabel="Carrousel" useFromParam breadcrumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Créer", to: "/instagram/creer" }]} />
        <ProgressBar step={step} total={totalSteps} labels={stepLabels} />

        {step === 1 && (
          <CarouselTypeStep
            carouselType={carouselType}
            onSelectType={(id) => { setCarouselType(id); setStep(2); }}
            draftRestored={draftRestored}
            onDiscardDraft={() => { clearDraft(); setStep(1); setCarouselType(""); setObjective(""); setSubject(""); setSelectedOffer(""); setSlideCount(7); }}
          />
        )}

        {step === 2 && (
          <CarouselContextStep
            typeObj={typeObj}
            objective={objective}
            setObjective={setObjective}
            subject={subject}
            setSubject={setSubject}
            selectedOffer={selectedOffer}
            setSelectedOffer={setSelectedOffer}
            offers={offers}
            topics={topics}
            loadingTopics={loadingTopics}
            onSuggestTopics={handleSuggestTopics}
            onBack={() => setStep(1)}
            onNext={() => { setStep(3); setCurrentQuestion(0); }}
            subjectPlaceholder={`Ex : "${activityExamples.post_examples[0]}"`}
          />
        )}

        {step === 3 && (
          <CarouselQuestionsStep
            typeObj={typeObj}
            questions={questions}
            currentQuestion={currentQuestion}
            deepeningAnswers={deepeningAnswers}
            onAnswerChange={(key, value) => setDeepeningAnswers(prev => ({ ...prev, [key]: value }))}
            onPrevQuestion={() => { if (currentQuestion > 0) setCurrentQuestion(prev => prev - 1); else setStep(2); }}
            onNextQuestion={handleNextQuestion}
            onSkip={handleSkipQuestions}
            step={step}
            totalSteps={totalSteps}
          />
        )}

        {step === 4 && (
          <CarouselAnglesStep
            angles={angles}
            onSelectAngle={(angle) => { setChosenAngle(angle); handleGenerateHooks(); }}
            onRefreshAngles={handleGenerateAngles}
            onBack={() => { setStep(3); setCurrentQuestion(0); }}
          />
        )}

        {step === 5 && (
          <CarouselHooksStep
            typeObj={typeObj}
            hooks={hooks}
            selectedHook={selectedHook}
            customHook={customHook}
            slideCount={slideCount}
            onSelectHook={(text) => { setSelectedHook(text); setCustomHook(""); }}
            onCustomHookChange={(v) => { setCustomHook(v); setSelectedHook(""); }}
            onSlideCountChange={setSlideCount}
            onBack={() => setStep(chosenAngle ? 4 : 2)}
            onGenerate={handleGenerateSlides}
            hasAngle={!!chosenAngle}
          />
        )}
      </main>
    </div>
  );
}

// ── Sub-component ──
function ProgressBar({ step, total, labels }: { step: number; total: number; labels: string[] }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {labels.map((s, i) => (
        <div key={s} className="flex items-center gap-1 flex-1">
          <div className={`h-1.5 rounded-full flex-1 transition-colors ${i + 1 <= step ? "bg-primary" : "bg-muted"}`} />
        </div>
      ))}
      <span className="text-xs text-muted-foreground ml-2 shrink-0">{step}/{total}</span>
    </div>
  );
}
