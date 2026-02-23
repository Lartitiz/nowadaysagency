import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice } from "@/components/ui/textarea-with-voice";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, ArrowRight, Copy, RefreshCw, CalendarDays, Sparkles, Check, AlertTriangle, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { AddToCalendarDialog } from "@/components/calendar/AddToCalendarDialog";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";
import { useSearchParams } from "react-router-dom";
import { useFormPersist } from "@/hooks/use-form-persist";
import { DraftRestoredBanner } from "@/components/DraftRestoredBanner";
import MicButton from "@/components/MicButton";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useActivityExamples } from "@/hooks/use-activity-examples";

// ── Types ──
interface CarouselType {
  id: string; emoji: string; label: string; desc: string; difficulty: string; slides: string;
}

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

// ── Constants ──
const CAROUSEL_TYPES: CarouselType[] = [
  { id: "tips", emoji: "💡", label: "Tips / Astuces", desc: "Conseils pratiques", difficulty: "Facile", slides: "5-7" },
  { id: "tutoriel", emoji: "📖", label: "Tutoriel pas-à-pas", desc: "Guide étape par étape", difficulty: "Facile", slides: "8-10" },
  { id: "prise_de_position", emoji: "🔥", label: "Prise de position", desc: "Opinion tranchée", difficulty: "Moyen", slides: "5-8" },
  { id: "mythe_realite", emoji: "❌", label: "Mythe vs Réalité", desc: "Déconstruire des idées reçues", difficulty: "Facile", slides: "6-10" },
  { id: "storytelling", emoji: "📝", label: "Storytelling personnel", desc: "Raconter ton histoire", difficulty: "Moyen", slides: "8-12" },
  { id: "etude_de_cas", emoji: "📊", label: "Étude de cas cliente", desc: "Résultats concrets", difficulty: "Moyen", slides: "8-10" },
  { id: "checklist", emoji: "✅", label: "Checklist sauvegardable", desc: "Liste actionnable", difficulty: "Facile", slides: "6-8" },
  { id: "comparatif", emoji: "⚖️", label: "Comparatif A vs B", desc: "Deux options face à face", difficulty: "Facile", slides: "6-8" },
  { id: "before_after", emoji: "↔️", label: "Before / After", desc: "Transformation visible", difficulty: "Moyen", slides: "6-10" },
  { id: "promo", emoji: "🎁", label: "Promo / Offre", desc: "Présenter une offre", difficulty: "Moyen", slides: "6-8" },
  { id: "coulisses", emoji: "🎬", label: "Coulisses", desc: "Behind the scenes", difficulty: "Facile", slides: "5-10" },
  { id: "photo_dump", emoji: "📸", label: "Photo dump", desc: "Vibes et ambiance", difficulty: "Facile", slides: "5-10" },
];

const OBJECTIVES = [
  { id: "saves", emoji: "💾", label: "Engagement (saves)" },
  { id: "shares", emoji: "🔄", label: "Portée (partages)" },
  { id: "conversion", emoji: "💰", label: "Conversion (DM/clics)" },
  { id: "community", emoji: "💛", label: "Communauté (lien)" },
];

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

// Fallback questions
const DEFAULT_QUESTIONS = [
  { question: "Quel message tu veux faire passer avec ce carrousel ?", placeholder: "Le message principal..." },
  { question: "Tu as un vécu ou un exemple concret à partager ?", placeholder: "Une anecdote, un exemple..." },
  { question: "Qu'est-ce que tu veux que les gens fassent après ?", placeholder: "Le CTA, l'action..." },
];

export default function InstagramCarousel() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
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
  const { isListening, isSupported, toggle, error: micError } = useSpeechRecognition((text) => {
    if (activeMicField) {
      setDeepeningAnswers(prev => ({
        ...prev,
        [activeMicField]: (prev[activeMicField] || "") + (prev[activeMicField] ? " " : "") + text,
      }));
    }
  });

  const handleMic = (field: string) => {
    if (isListening && activeMicField === field) {
      toggle();
      return;
    }
    if (isListening) toggle();
    setActiveMicField(field);
    setTimeout(() => toggle(), 50);
  };

  // Objective mapping from calendar objectifs to carousel objectives
  const OBJECTIF_TO_CAROUSEL: Record<string, string> = {
    visibilite: "shares",
    confiance: "community",
    vente: "conversion",
    credibilite: "saves",
  };

  // Persist form state to sessionStorage
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

  // Load offers for dropdown
  useEffect(() => {
    if (!user) return;
    supabase.from("offers").select("id, name, price_text").eq("user_id", user.id).order("created_at").then(({ data }) => {
      if (data) setOffers(data);
    });
  }, [user?.id]);

  // Pre-fill from calendar post
  useEffect(() => {
    const calId = searchParams.get("calendar_id");
    if (!calId || !user) return;

    const loadCalendarPost = async () => {
      const { data: post } = await supabase
        .from("calendar_posts")
        .select("*")
        .eq("id", calId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!post) return;

      setCalendarPostId(post.id);
      if (post.theme) setSubject(post.theme);

      if (post.objectif && OBJECTIF_TO_CAROUSEL[post.objectif]) {
        setObjective(OBJECTIF_TO_CAROUSEL[post.objectif]);
      }

      const carouselTypeParam = searchParams.get("carousel_type");
      if (carouselTypeParam) {
        setCarouselType(carouselTypeParam);
        setStep(2);
      } else if (post.angle) {
        const ANGLE_MAP: Record<string, string> = {
          "Storytelling": "storytelling",
          "Mythe à déconstruire": "mythe_realite",
          "Coup de gueule": "prise_de_position",
          "Enquête / décryptage": "prise_de_position",
          "Conseil contre-intuitif": "tips",
          "Test grandeur nature": "etude_de_cas",
          "Before / After": "before_after",
          "Histoire cliente": "etude_de_cas",
          "Regard philosophique": "prise_de_position",
          "Surf sur l'actu": "prise_de_position",
        };
        if (ANGLE_MAP[post.angle]) {
          setCarouselType(ANGLE_MAP[post.angle]);
          setStep(2);
        }
      }

      if (!post.theme && post.notes) {
        setSubject(post.notes);
      }
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
        user_id: user.id, carousel_type: carouselType, subject, objective,
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
      const { data: recentPosts } = await supabase.from("calendar_posts")
        .select("theme").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(10);
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

  const handleSkipQuestions = () => {
    // Skip questions and angles, go directly to hooks
    handleGenerateHooks();
  };

  const handleNextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    } else {
      // All questions answered → generate angles
      handleGenerateAngles();
    }
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
      user_id: user.id, date: dateStr, theme: subject || `Carrousel : ${typeObj?.label}`,
      canal: "instagram", format: "carousel", objectif: objective,
      content_draft: slides.map(s => `Slide ${s.slide_number}: ${s.title}\n${s.body || ""}`).join("\n\n"),
      accroche: hookText, status: "ready",
      story_sequence_detail: { type: "carousel", carousel_type: carouselType, slides, caption, quality_check: qualityCheck } as any,
    });
    setShowCalendarDialog(false);
    toast.success("Carrousel ajouté au calendrier !");
  };

  const updateSlide = (index: number, field: "title" | "body", value: string) => {
    const updated = [...slides];
    updated[index] = { ...updated[index], [field]: value, word_count: countWords(`${field === "title" ? value : updated[index].title} ${field === "body" ? value : updated[index].body}`) };
    setSlides(updated);
  };

  const updateCaption = (field: keyof Caption, value: any) => {
    if (!caption) return;
    setCaption({ ...caption, [field]: value });
  };

  const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

  const wordColor = (count: number) => {
    if (count > 50) return "text-red-500";
    if (count > 40) return "text-yellow-600";
    return "text-muted-foreground";
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

  // ═══ STEP 6: SLIDES RESULT + CAPTION ═══
  if (step >= 6 && slides.length > 0) {
    const fullCaptionText = caption ? `${caption.hook}\n\n${caption.body}\n\n${caption.cta}` : "";
    const captionWords = countWords(fullCaptionText);
    const hashtagCount = caption?.hashtags?.length || 0;

    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 animate-fade-in">
          <SubPageHeader parentLabel="Créer" parentTo="/instagram/creer" currentLabel="Carrousel" useFromParam breadcrumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Créer", to: "/instagram/creer" }]} />

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">🎠 Ton carrousel</h1>
              <p className="mt-1 text-sm text-muted-foreground">{typeObj?.emoji} {typeObj?.label} · {slides.length} slides · Objectif : {OBJECTIVES.find(o => o.id === objective)?.label}</p>
              {chosenAngle && (
                <p className="text-xs text-primary mt-0.5">{chosenAngle.emoji} Angle : {chosenAngle.title}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => { setStep(1); setSlides([]); setHooks([]); setCaption(null); setAngles([]); setChosenAngle(null); setDeepeningAnswers({}); setCurrentQuestion(0); }} className="gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> Nouveau
            </Button>
          </div>

          {/* Slides */}
          <div className="space-y-4 mb-8">
            {slides.map((slide, idx) => {
              const wc = countWords(`${slide.title} ${slide.body || ""}`);
              return (
                <div key={idx} className="rounded-2xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${slide.role === "hook" ? "bg-primary/10 text-primary border-primary/20" : slide.role === "cta" ? "bg-green-100 text-green-700 border-green-200" : "bg-accent/50 text-accent-foreground border-accent"}`}>
                        {slide.role === "hook" ? "🎯" : slide.role === "cta" ? "📣" : slide.role === "recap" ? "🔑" : "📌"} SLIDE {slide.slide_number} · {slide.role.toUpperCase()}
                      </span>
                    </div>
                    <span className={`text-xs font-mono ${wordColor(wc)}`}>
                      {wc} mots {wc > 50 ? "🔴" : wc > 40 ? "🟡" : "🟢"}
                    </span>
                  </div>

                  <textarea
                    value={slide.title}
                    onChange={(e) => updateSlide(idx, "title", e.target.value)}
                    className="w-full bg-transparent font-display font-bold text-foreground text-[15px] resize-none border-none outline-none leading-snug"
                    rows={1}
                  />
                  {(slide.body || slide.role !== "hook") && (
                    <textarea
                      value={slide.body || ""}
                      onChange={(e) => updateSlide(idx, "body", e.target.value)}
                      className="w-full bg-transparent text-sm text-muted-foreground resize-none border-none outline-none leading-relaxed"
                      rows={2}
                      placeholder="Texte complémentaire..."
                    />
                  )}

                  {slide.visual_suggestion && (
                    <p className="text-xs text-muted-foreground italic">💡 {slide.visual_suggestion}</p>
                  )}
                  {slide.role === "hook" && wc > 12 && (
                    <p className="text-xs text-red-500">⚠️ Max 12 mots pour le hook. Raccourcis !</p>
                  )}
                  {wc > 50 && (
                    <p className="text-xs text-red-500">🔴 Trop long. Découpe en 2 slides ou raccourcis.</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Caption */}
          {caption && (
            <div className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-3">
              <h2 className="font-display font-bold text-foreground text-base">📝 Caption</h2>
              <textarea
                value={`${caption.hook}\n\n${caption.body}\n\n${caption.cta}`}
                onChange={(e) => {
                  const parts = e.target.value.split("\n\n");
                  updateCaption("hook", parts[0] || "");
                  updateCaption("body", parts.slice(1, -1).join("\n\n") || "");
                  updateCaption("cta", parts[parts.length - 1] || "");
                }}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground resize-vertical min-h-[120px]"
                rows={6}
              />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Mots : {captionWords}</span>
                <span>Hashtags : {hashtagCount}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {caption.hashtags.map((h, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">#{h}</span>
                ))}
              </div>
            </div>
          )}

          {/* Quality check */}
          {qualityCheck && (
            <div className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-foreground text-base">✅ Checklist qualité</h2>
                <span className={`text-sm font-bold px-3 py-1 rounded-full ${qualityCheck.score >= 80 ? "bg-green-100 text-green-700" : qualityCheck.score >= 60 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                  {qualityCheck.score}/100 {qualityCheck.score >= 80 ? "🟢" : qualityCheck.score >= 60 ? "🟡" : "🔴"}
                </span>
              </div>
              <ul className="space-y-1.5 text-sm">
                <QualityItem ok={qualityCheck.hook_ok} label={`Hook slide 1 : ${qualityCheck.hook_word_count} mots (max 12)`} />
                <QualityItem ok={qualityCheck.all_slides_under_50_words} label="Toutes les slides < 50 mots" />
                <QualityItem ok={qualityCheck.single_cta} label="CTA unique en dernière slide" />
                <QualityItem ok={qualityCheck.caption_different_from_hook} label="Caption ≠ hook slide 1" />
                <QualityItem ok={qualityCheck.slide_2_works_as_standalone_hook} label="Slide 2 fonctionne comme hook autonome" />
              </ul>
            </div>
          )}

          {publishingTip && (
            <p className="text-xs text-muted-foreground italic mb-6">💡 {publishingTip}</p>
          )}

          {/* Actions */}
          <div className="rounded-2xl border border-border bg-muted/30 p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleCopyAll} className="rounded-full gap-1.5 text-xs">
                <Copy className="h-3.5 w-3.5" /> Copier tout le texte
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowCalendarDialog(true)} className="rounded-full gap-1.5 text-xs">
                <CalendarDays className="h-3.5 w-3.5" /> Planifier
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowIdeasDialog(true)} className="rounded-full gap-1.5 text-xs">
                💾 Sauvegarder
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setStep(5); setSlides([]); setCaption(null); }} className="rounded-full gap-1.5 text-xs">
                <RefreshCw className="h-3.5 w-3.5" /> Régénérer
              </Button>
            </div>
          </div>

          <AddToCalendarDialog
            open={showCalendarDialog}
            onOpenChange={setShowCalendarDialog}
            onConfirm={handleAddToCalendar}
            contentLabel={`Carrousel : ${subject || typeObj?.label}`}
            contentEmoji="🎠"
          />
          <SaveToIdeasDialog
            open={showIdeasDialog}
            onOpenChange={setShowIdeasDialog}
            contentType="post_instagram"
            subject={subject || typeObj?.label || "Carrousel"}
            contentData={{ slides, caption, qualityCheck }}
            sourceModule="carousel"
            format="carousel"
            objectif={objective}
          />
        </main>
      </div>
    );
  }

  // ═══ STEP 5: HOOKS + STRUCTURE ═══
  if (step === 5) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 animate-fade-in">
          <SubPageHeader parentLabel="Créer" parentTo="/instagram/creer" currentLabel="Carrousel" useFromParam breadcrumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Créer", to: "/instagram/creer" }]} />
          <ProgressBar step={5} total={totalSteps} labels={stepLabels} />

          <h2 className="font-display text-xl font-bold text-foreground mb-1">🎠 Structure & accroche</h2>
          <p className="text-sm text-muted-foreground mb-6">Choisis ton hook et ajuste le nombre de slides.</p>

          {/* Slide count */}
          <div className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Nombre de slides recommandé : {slideCount}</p>
              <span className="text-xs text-muted-foreground">{typeObj?.slides} recommandé</span>
            </div>
            <Slider
              value={[slideCount]}
              onValueChange={([v]) => setSlideCount(v)}
              min={5} max={20} step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5</span><span>20</span>
            </div>
          </div>

          {/* Hook selection */}
          <div className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-4">
            <div>
              <h3 className="font-display font-bold text-sm text-foreground mb-1">🎯 Choisis ton hook (slide 1)</h3>
              <p className="text-xs text-muted-foreground">L'IA te propose 3 accroches. Choisis celle qui te parle ou modifie-la.</p>
            </div>
            <div className="space-y-2">
              {hooks.map((hook) => (
                <button
                  key={hook.id}
                  onClick={() => { setSelectedHook(hook.text); setCustomHook(""); }}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all ${selectedHook === hook.text && !customHook ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-primary">{hook.style}</span>
                    <span className="text-xs text-muted-foreground">{hook.word_count} mots</span>
                  </div>
                  <p className="text-[15px] font-medium text-foreground">"{hook.text}"</p>
                </button>
              ))}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">✏️ Ou écris ton propre hook :</p>
              <TextareaWithVoice
                value={customHook}
                onChange={(e) => { setCustomHook(e.target.value); setSelectedHook(""); }}
                placeholder="Ton accroche personnalisée..."
                rows={1}
                className="min-h-[44px]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep(chosenAngle ? 4 : 2)} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Button>
            <Button onClick={handleGenerateSlides} disabled={!selectedHook && !customHook.trim()} className="rounded-full gap-1.5">
              Générer le carrousel <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // ═══ STEP 4: ANGLES ═══
  if (step === 4) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 animate-fade-in">
          <SubPageHeader parentLabel="Créer" parentTo="/instagram/creer" currentLabel="Carrousel" useFromParam breadcrumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Créer", to: "/instagram/creer" }]} />
          <ProgressBar step={4} total={totalSteps} labels={stepLabels} />

          <h2 className="font-display text-xl font-bold text-foreground mb-1">🎯 Choisis un angle</h2>
          <p className="text-sm text-muted-foreground mb-6">D'après ce que tu m'as dit, voilà 3 façons d'aborder ce sujet :</p>

          <div className="space-y-3 mb-6">
            {angles.map((angle) => (
              <button
                key={angle.id}
                onClick={() => {
                  setChosenAngle(angle);
                  handleGenerateHooks();
                }}
                className="w-full rounded-2xl border-2 border-border bg-card p-5 text-left transition-all hover:border-primary hover:shadow-md group"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{angle.emoji}</span>
                  <div>
                    <p className="font-display font-bold text-foreground group-hover:text-primary transition-colors">{angle.title}</p>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{angle.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => { setStep(3); setCurrentQuestion(0); }} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Button>
            <Button variant="outline" size="sm" onClick={handleGenerateAngles} className="rounded-full gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> Propose-moi d'autres angles
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // ═══ STEP 3: DEEPENING QUESTIONS ═══
  if (step === 3) {
    const q = questions[currentQuestion];
    const fieldKey = `q${currentQuestion + 1}`;
    const currentAnswer = deepeningAnswers[fieldKey] || "";

    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 animate-fade-in">
          <SubPageHeader parentLabel="Créer" parentTo="/instagram/creer" currentLabel="Carrousel" useFromParam breadcrumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Créer", to: "/instagram/creer" }]} />
          <ProgressBar step={3} total={totalSteps} labels={stepLabels} />

          <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                  💬 Avant de rédiger, quelques questions
                </h2>
                <span className="text-xs text-muted-foreground font-mono">{step}/{totalSteps}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {typeObj?.emoji} {typeObj?.label} · Pour que le contenu soit vraiment à toi (pas un truc générique).
              </p>
            </div>

            {/* Question indicator */}
            <div className="flex items-center gap-1.5">
              {questions.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full flex-1 transition-colors ${i <= currentQuestion ? "bg-primary" : "bg-muted"}`} />
              ))}
              <span className="text-xs text-muted-foreground ml-2">Question {currentQuestion + 1}/{questions.length}</span>
            </div>

            {/* Current question */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground leading-relaxed">
                🤔 {q.question}
              </p>
              <div className="relative">
                <TextareaWithVoice
                  value={currentAnswer}
                  onChange={(e) => setDeepeningAnswers(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                  placeholder={q.placeholder}
                  className="min-h-[100px]"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost" size="sm"
                onClick={() => {
                  if (currentQuestion > 0) setCurrentQuestion(prev => prev - 1);
                  else setStep(2);
                }}
                className="gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" /> {currentQuestion > 0 ? "Précédent" : "Retour"}
              </Button>
              <Button onClick={handleNextQuestion} className="rounded-full gap-1.5">
                {currentQuestion < questions.length - 1 ? (
                  <>Suivant <ArrowRight className="h-4 w-4" /></>
                ) : (
                  <>Proposer des angles <Sparkles className="h-4 w-4" /></>
                )}
              </Button>
            </div>

            {/* Skip button */}
            <div className="text-center pt-1">
              <button
                onClick={handleSkipQuestions}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
              >
                <SkipForward className="h-3 w-3" /> Passer les questions, générer directement
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ═══ STEP 2: CONTEXT ═══
  if (step === 2) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 animate-fade-in">
          <SubPageHeader parentLabel="Créer" parentTo="/instagram/creer" currentLabel="Carrousel" useFromParam breadcrumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Créer", to: "/instagram/creer" }]} />
          <ProgressBar step={2} total={totalSteps} labels={stepLabels} />

          <h2 className="font-display text-xl font-bold text-foreground mb-1">🎠 Contexte du carrousel</h2>
          <p className="text-sm text-muted-foreground mb-6">{typeObj?.emoji} {typeObj?.label}</p>

          {/* Objective */}
          <div className="mb-6">
            <p className="text-sm font-semibold text-foreground mb-3">🎯 Tu veux quoi avec ce carrousel ?</p>
            <div className="grid grid-cols-2 gap-2">
              {OBJECTIVES.map((obj) => (
                <button
                  key={obj.id}
                  onClick={() => setObjective(obj.id)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${objective === obj.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                >
                  <span className="text-lg">{obj.emoji}</span>
                  <p className="text-sm font-medium text-foreground mt-1">{obj.label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div className="mb-6">
            <p className="text-sm font-semibold text-foreground mb-2">📝 C'est quoi le sujet ?</p>
            <TextareaWithVoice
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={`Ex : "${activityExamples.post_examples[0]}"`}
              rows={2}
              className="min-h-[60px]"
            />
          </div>

          {/* Offer dropdown */}
          <div className="mb-6">
            <p className="text-sm font-semibold text-foreground mb-2">🎁 Tu veux mentionner une offre ?</p>
            <Select value={selectedOffer} onValueChange={setSelectedOffer}>
              <SelectTrigger className="rounded-[10px]">
                <SelectValue placeholder="Pas d'offre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Pas d'offre</SelectItem>
                {offers.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name} {o.price_text ? `(${o.price_text})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Suggest topics */}
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 mb-6">
            <p className="text-xs text-muted-foreground mb-2">💡 Besoin d'inspiration ?</p>
            <Button variant="outline" size="sm" onClick={handleSuggestTopics} disabled={loadingTopics || !objective} className="rounded-full gap-1.5 text-xs">
              {loadingTopics ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Suggère-moi 5 sujets
            </Button>
            {topics.length > 0 && (
              <div className="mt-3 space-y-2">
                {topics.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => { setSubject(t.subject); setTopics([]); }}
                    className="w-full rounded-xl border border-border bg-card p-3 text-left hover:border-primary transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground">{t.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.why_now}</p>
                    <p className="text-xs text-primary mt-0.5">Angle : {t.angle}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Button>
            <Button onClick={() => { setStep(3); setCurrentQuestion(0); }} disabled={!subject.trim() || !objective} className="rounded-full gap-1.5">
              Suivant <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // ═══ STEP 1: TYPE ═══
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 animate-fade-in">
        <SubPageHeader parentLabel="Créer" parentTo="/instagram/creer" currentLabel="Carrousel" useFromParam breadcrumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Créer", to: "/instagram/creer" }]} />
        <ProgressBar step={1} total={totalSteps} labels={stepLabels} />

        <h2 className="font-display text-xl font-bold text-foreground mb-1">🎠 Quel type de carrousel ?</h2>
        <p className="text-sm text-muted-foreground mb-4">Chaque format a sa structure optimale.</p>

        {draftRestored && (
          <DraftRestoredBanner
            onContinue={() => {}}
            onDiscard={() => {
              clearDraft();
              setStep(1); setCarouselType(""); setObjective(""); setSubject("");
              setSelectedOffer(""); setSlideCount(7);
            }}
          />
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CAROUSEL_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => { setCarouselType(t.id); setStep(2); }}
              className={`rounded-2xl border-2 p-4 text-left transition-all hover:border-primary hover:shadow-md group ${carouselType === t.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}
            >
              <span className="text-2xl block mb-2">{t.emoji}</span>
              <p className="font-display font-bold text-sm text-foreground group-hover:text-primary transition-colors">{t.label}</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{t.desc}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{t.difficulty}</span>
                <span className="text-[10px] text-muted-foreground">{t.slides} slides</span>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

// ── Sub-components ──

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

function QualityItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <Check className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-yellow-600" />}
      <span className={ok ? "text-foreground" : "text-yellow-700"}>{ok ? "✅" : "⚠️"} {label}</span>
    </li>
  );
}
