import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useUserPlan } from "@/hooks/use-user-plan";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useBrandCharter } from "@/hooks/use-branding";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useActivityExamples } from "@/hooks/use-activity-examples";
import { toast } from "sonner";
import { Loader2, Download, RefreshCw, Sparkles, Upload, Plus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppHeader from "@/components/AppHeader";
import ContentProgressBar from "@/components/ContentProgressBar";
import CarouselPreview from "@/components/carousel/CarouselPreview";
import ContentActions from "@/components/ContentActions";
import CreditWarning from "@/components/CreditWarning";
import ReturnToOrigin from "@/components/ReturnToOrigin";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import BaseReminder from "@/components/BaseReminder";
import { exportCarouselPptx } from "@/lib/export-carousel-pptx";
import { exportCarouselVisualPptx } from "@/lib/export-carousel-visual-pptx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  CarouselTypeSubjectStep,
  CarouselQuestionsStep,
  CAROUSEL_TYPES,
  OBJECTIVES,
} from "@/components/carousel/CarouselForm";

interface Slide { slide_number: number; role: string; title: string; body: string; visual_suggestion: string; word_count: number; }
interface Caption { hook: string; body: string; cta: string; hashtags: string[]; }
interface QualityCheck { hook_word_count: number; hook_ok: boolean; all_slides_under_50_words: boolean; single_cta: boolean; caption_different_from_hook: boolean; slide_2_works_as_standalone_hook: boolean; score: number; }
interface TopicSuggestion { subject: string; why_now: string; angle: string; }

function parseAIResponse(raw: string): any {
  try {
    if (typeof raw === "object") return raw;
    const clean = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(clean);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch { return {}; } }
    return {};
  }
}

// ── Deepening questions per carousel type (fallback) ──
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
    { question: "C'est quoi le résultat final que la personne va obtenir en suivant ton tuto ?", placeholder: "Le résultat concret..." },
    { question: "Combien d'étapes il y a ? Et quelle est l'étape que les gens ratent le plus souvent ?", placeholder: "L'étape piège..." },
    { question: "Il y a un outil, une astuce ou un raccourci que tu utilises et que les gens ne connaissent pas ?", placeholder: "L'astuce secrète..." },
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
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const activityExamples = useActivityExamples();
  const { data: charterHookData } = useBrandCharter();
  const fromObjectif = searchParams.get("objectif");
  const fromSujet = searchParams.get("sujet") ? decodeURIComponent(searchParams.get("sujet")!) : "";

  // Express mode: pre-filled from chat guide
  const navState = location.state as {
    expressCarousel?: boolean;
    slides?: any[];
    caption?: any;
    qualityCheck?: any;
    publishingTip?: string;
    carouselType?: string;
    subject?: string;
    objective?: string;
  } | null;

  // Simplified flow: 1=type+subject, 2=questions, 3=result, 4=visual
  const [step, setStep] = useState(navState?.expressCarousel ? 3 : 1);
  const [carouselType, setCarouselType] = useState(navState?.carouselType || "");
  const [objective, setObjective] = useState(navState?.objective || "");
  const [subject, setSubject] = useState(navState?.subject || "");
  const [selectedOffer, setSelectedOffer] = useState("");
  const [slideCount, setSlideCount] = useState(7);
  
  // Deepening questions state
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [deepeningAnswers, setDeepeningAnswers] = useState<Record<string, string>>({});
  const [activeMicField, setActiveMicField] = useState<string | null>(null);
  const [dynamicQuestions, setDynamicQuestions] = useState<{ question: string; placeholder: string }[] | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  
  // Result state
  const [chosenAngle, setChosenAngle] = useState<{ emoji: string; title: string; description?: string } | null>(null);
  const [slides, setSlides] = useState<Slide[]>(navState?.slides || []);
  const [caption, setCaption] = useState<Caption | null>(navState?.caption || null);
  const [qualityCheck, setQualityCheck] = useState<QualityCheck | null>(navState?.qualityCheck || null);
  const [publishingTip, setPublishingTip] = useState(navState?.publishingTip || "");
  const [loading, setLoading] = useState(false);
  const { canGenerate, remainingTotal } = useUserPlan();
  const quotaBlocked = !canGenerate("content");
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topics, setTopics] = useState<TopicSuggestion[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [calendarPostId, setCalendarPostId] = useState<string | null>(null);

  // Visual step state
  const [templateStyle, setTemplateStyle] = useState("");
  const [visualSlides, setVisualSlides] = useState<{ slide_number: number; html: string }[]>([]);
  const [visualLoading, setVisualLoading] = useState(false);
  const [charterData, setCharterData] = useState<any>(null);
  const [charterLoaded, setCharterLoaded] = useState(false);
  const [templateUploading, setTemplateUploading] = useState(false);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Speech recognition
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

  const { restored: draftRestored, clearDraft: clearFormDraft } = useFormPersist(
    "carousel-form",
    { step, carouselType, objective, subject, selectedOffer, slideCount },
    (saved) => {
      if (navState?.expressCarousel) return;
      if (searchParams.get("calendar_id") || searchParams.get("sujet")) return;
      if (saved.carouselType) setCarouselType(saved.carouselType);
      if (saved.objective) setObjective(saved.objective);
      if (saved.subject) setSubject(saved.subject);
      if (saved.selectedOffer) setSelectedOffer(saved.selectedOffer);
      if (saved.slideCount) setSlideCount(saved.slideCount);
      // Don't restore beyond step 1 in simplified flow
    }
  );

  // ── Persist generated results to sessionStorage ──
  const GENERATED_KEY = "carousel_generated";
  const generatedRestoredRef = useRef(false);

  useEffect(() => {
    if (generatedRestoredRef.current || navState?.expressCarousel) return;
    generatedRestoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(GENERATED_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.dynamicQuestions) setDynamicQuestions(saved.dynamicQuestions);
      if (saved.deepeningAnswers && Object.keys(saved.deepeningAnswers).length) setDeepeningAnswers(saved.deepeningAnswers);
      if (saved.chosenAngle) setChosenAngle(saved.chosenAngle);
      if (saved.slides?.length) setSlides(saved.slides);
      if (saved.caption) setCaption(saved.caption);
      if (saved.qualityCheck) setQualityCheck(saved.qualityCheck);
      if (saved.publishingTip) setPublishingTip(saved.publishingTip);
      if (saved.currentQuestion != null) setCurrentQuestion(saved.currentQuestion);
      if (saved.templateStyle) setTemplateStyle(saved.templateStyle);
      if (saved.step && saved.step > 1) setStep(saved.step);
    } catch { /* corrupt — ignore */ }
  }, []);

  useEffect(() => {
    if (step <= 1) return;
    try {
      const dataToSave = {
        step, dynamicQuestions, deepeningAnswers, chosenAngle,
        slides, caption, qualityCheck, publishingTip, currentQuestion,
        templateStyle,
        // Don't persist visualSlides — too large for sessionStorage
      };
      sessionStorage.setItem(GENERATED_KEY, JSON.stringify(dataToSave));
    } catch { /* quota — ignore */ }
  }, [step, dynamicQuestions, deepeningAnswers, chosenAngle, slides, caption, qualityCheck, publishingTip, currentQuestion, templateStyle]);

  const clearDraft = () => {
    clearFormDraft();
    sessionStorage.removeItem(GENERATED_KEY);
  };

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
      if (carouselTypeParam) setCarouselType(carouselTypeParam);
      if (!post.theme && post.notes) setSubject(post.notes);
    };
    loadCalendarPost();
  }, [user?.id, searchParams]);

  const typeObj = CAROUSEL_TYPES.find(t => t.id === carouselType);
  
  // Always use dynamic (AI-personalized) questions — static fallback only as last resort with subject injection
  const personalizedFallback = subject.trim() ? [
    { question: `Sur "${subject}", c'est quoi ton point de vue personnel ? Ce que tu as observé, vécu ou appris.`, placeholder: "Ton vécu, ton observation..." },
    { question: `Qu'est-ce que ta cible ne comprend pas ou se trompe sur "${subject}" ?`, placeholder: "L'erreur courante, le malentendu..." },
    { question: `Tu as un exemple concret ou une anecdote sur "${subject}" à partager ?`, placeholder: "Un cas client, une situation vécue..." },
  ] : DEFAULT_QUESTIONS;
  const questions = dynamicQuestions || (loadingQuestions ? [] : personalizedFallback);

  // Pre-fill from URL params
  const fromCarouselType = searchParams.get("carousel_type");
  useEffect(() => {
    if (navState?.expressCarousel) return;
    if (fromObjectif) {
      const objMap: Record<string, string> = { visibilite: "shares", confiance: "community", vente: "conversion", credibilite: "saves" };
      if (objMap[fromObjectif]) setObjective(objMap[fromObjectif]);
    }
    if (fromSujet) setSubject(fromSujet);
    if (fromCarouselType && CAROUSEL_TYPES.some(t => t.id === fromCarouselType)) {
      setCarouselType(fromCarouselType);
    }
  }, [fromObjectif, fromSujet, fromCarouselType]);

  // Simplified step labels
  const CAROUSEL_STEPS = [
    { key: "setup", label: "Type & Sujet" },
    { key: "questions", label: "Questions" },
    { key: "result", label: "Résultat" },
    { key: "visual", label: "Visuel" },
  ];
  const stepKeyMap: Record<number, string> = { 1: "setup", 2: "questions", 3: "result", 4: "visual" };
  const reverseStepKeyMap: Record<string, number> = { setup: 1, questions: 2, result: 3, visual: 4 };
  const currentStepKey = stepKeyMap[step] || "setup";
  const handleStepClick = (key: string) => {
    const target = reverseStepKeyMap[key];
    if (target && target < step) setStep(target);
  };

  // ── Generate carousel (express_full with deepening answers) ──
  const handleGenerateCarousel = async () => {
    if (!user || quotaBlocked) return;
    setLoading(true);
    try {
      const offerCtx = selectedOffer && selectedOffer !== "none" ? offers.find(o => o.id === selectedOffer) : null;
      const { data, error } = await supabase.functions.invoke("carousel-ai", {
        body: {
          type: "express_full",
          carousel_type: carouselType || "tips",
          subject,
          objective: objective || "saves",
          slide_count: slideCount,
          deepening_answers: Object.values(deepeningAnswers).some(v => v.trim()) ? deepeningAnswers : undefined,
          selected_offer: offerCtx ? `${offerCtx.name} (${offerCtx.price_text || "gratuit"})` : undefined,
          workspace_id: workspaceId,
        },
      });
      if (error) throw error;
      const parsed = parseAIResponse(data?.content || "");
      setSlides(parsed.slides || []);
      setCaption(parsed.caption || null);
      setQualityCheck(parsed.quality_check || null);
      setPublishingTip(parsed.publishing_tip || "");
      if (parsed.chosen_angle) setChosenAngle({ emoji: "🎯", ...parsed.chosen_angle });

      // Save to DB
      const hookText = parsed.slides?.[0]?.title || "";
      const insertRes = await supabase.from("generated_carousels" as any).insert({
        user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined, carousel_type: carouselType, subject, objective,
        hook_text: hookText, slide_count: slideCount,
        slides: parsed.slides, caption: `${parsed.caption?.hook}\n\n${parsed.caption?.body}\n\n${parsed.caption?.cta}`,
        hashtags: parsed.caption?.hashtags, quality_score: parsed.quality_check?.score,
        calendar_post_id: calendarPostId || null,
      }).select("id").single();

      if (calendarPostId && insertRes.data) {
        await supabase.from("calendar_posts").update({
          status: "drafting",
          generated_content_id: (insertRes.data as any).id,
          generated_content_type: "carousel",
          content_draft: parsed.slides?.map((s: any) => `${s.title}\n${s.body || ""}`).join("\n\n"),
          accroche: hookText,
          updated_at: new Date().toISOString(),
        }).eq("id", calendarPostId);
      }

      setStep(3);
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
      const recentStr = recentPosts?.map((p: any) => p.theme).join(", ") || "";
      const { data, error } = await supabase.functions.invoke("carousel-ai", {
        body: { type: "suggest_topics", carousel_type: carouselType, objective, recent_posts: recentStr, workspace_id: workspaceId },
      });
      if (error) throw error;
      const parsed = parseAIResponse(data?.content || "");
      setTopics(parsed.topics || []);
    } catch (e: any) {
      console.error(e);
      toast.error("Erreur lors de la suggestion de sujets.");
    }
    setLoadingTopics(false);
  };

  const handleSkipQuestions = () => handleGenerateCarousel();

  const handleNextQuestion = () => {
    if (currentQuestion < questions.length - 1) setCurrentQuestion(prev => prev + 1);
    else handleGenerateCarousel();
  };

  const updateSlide = (index: number, field: "title" | "body", val: string) => {
    const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
    const updated = [...slides];
    updated[index] = { ...updated[index], [field]: val, word_count: countWords(`${field === "title" ? val : updated[index].title} ${field === "body" ? val : updated[index].body}`) };
    setSlides(updated);
  };

  const updateCaption = (field: keyof Caption, val: any) => {
    if (!caption) return;
    setCaption({ ...caption, [field]: val });
  };

  // Load charter data for visual step
  useEffect(() => {
    if (charterLoaded) return;
    if (charterHookData) {
      setCharterData(charterHookData);
      setCharterLoaded(true);
    } else if (charterHookData === null) {
      setCharterLoaded(true);
    }
  }, [charterHookData, charterLoaded]);

  // Upload template directly from carousel page → saves to charter
  const handleInlineTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;
    setTemplateUploading(true);
    try {
      const existing: { url: string; name: string }[] =
        (charterData?.uploaded_templates as any[]) || [];
      if (existing.length + files.length > 20) {
        toast.error("Maximum 20 templates");
        return;
      }
      const newTemplates = [...existing];
      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${user.id}/templates/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage.from("brand-assets").upload(path, file, { cacheControl: '3600', upsert: false });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);
        newTemplates.push({ url: urlData.publicUrl, name: file.name });
      }
      // Save to brand_charter
      const { error: saveError } = await (supabase
        .from("brand_charter") as any)
        .update({ uploaded_templates: newTemplates })
        .eq(column, value);
      if (saveError) throw saveError;
      setCharterData((prev: any) => ({ ...prev, uploaded_templates: newTemplates }));
      queryClient.invalidateQueries({ queryKey: ["brand-charter"] });
      toast.success("Template(s) ajouté(s) !");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erreur lors de l'upload");
    } finally {
      setTemplateUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  // Visual generation handler
  const handleGenerateVisual = async (style: string) => {
    if (!user || slides.length === 0) return;
    setTemplateStyle(style);
    setVisualLoading(true);
    setVisualSlides([]);
    try {
      // If the user selected a charter template, pass its URL for AI analysis
      const charterTemplates: { url: string; name: string }[] =
        (charterData?.uploaded_templates as any[]) || [];
      const isCharterTemplate = style.startsWith("charter_template_");
      let templateReferenceUrls: string[] | undefined;
      let effectiveStyle = style;

      if (isCharterTemplate) {
        const idx = parseInt(style.replace("charter_template_", ""), 10);
        const ref = charterTemplates[idx];
        if (ref) {
          templateReferenceUrls = [ref.url];
          effectiveStyle = "charter_reference";
        }
      }

      const { data, error } = await supabase.functions.invoke("carousel-visual", {
        body: {
          slides: slides.map(s => ({ slide_number: s.slide_number, role: s.role, title: s.title, body: s.body, visual_suggestion: s.visual_suggestion })),
          template_style: effectiveStyle,
          charter: charterData || undefined,
          template_reference_urls: templateReferenceUrls,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      setVisualSlides(data.result?.slides_html || []);
    } catch (err: any) {
      console.error(err);
      toast.error("Erreur lors de la génération des visuels");
    } finally {
      setVisualLoading(false);
    }
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 sm:px-6 py-16 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">L'outil rédige ton carrousel complet...</p>
          <p className="text-xs text-muted-foreground mt-2">✨ Hook, slides, caption : tout arrive d'un coup.</p>
        </main>
      </div>
    );
  }

  // ═══ STEP 4: VISUAL ═══
  if (step === 4 && slides.length > 0) {
    const TEMPLATE_OPTIONS = [
      { id: "clean", label: "Clean", icon: "—", desc: "Épuré, aéré" },
      { id: "bold", label: "Bold", icon: "B", desc: "Impact fort" },
      { id: "gradient", label: "Dégradé", icon: "◐", desc: "Fond dégradé" },
      { id: "quote", label: "Citation", icon: "❝", desc: "Style citation" },
      { id: "numbered", label: "Numéroté", icon: "1.", desc: "Éducatif" },
      { id: "split", label: "Split", icon: "▌", desc: "2 colonnes" },
      { id: "photo", label: "Photo", icon: "🖼", desc: "Fond image" },
      { id: "story", label: "Story", icon: "📖", desc: "Intime" },
    ];

    // Templates uploadés dans la charte graphique
    const charterTemplates: { url: string; name: string }[] =
      (charterData?.uploaded_templates as any[]) || [];
    const hasCharterTemplates = charterTemplates.length > 0;

    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 animate-fade-in">
          <ReturnToOrigin />
          <ContentProgressBar steps={CAROUSEL_STEPS} currentStep={currentStepKey} onStepClick={handleStepClick} />

          <h1 className="font-display text-2xl font-bold text-foreground mb-2">✨ Visuel du carrousel</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {hasCharterTemplates
              ? "Choisis un de tes templates ou un style prédéfini."
              : "Choisis un style de template pour générer les visuels de tes slides."}
          </p>

          {charterLoaded && !charterData && (
            <div className="rounded-xl border border-border bg-amber-50 dark:bg-amber-950/20 p-4 mb-6">
              <p className="text-sm text-foreground">Tu n'as pas encore de charte graphique. L'outil va utiliser des couleurs par défaut.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Pour des visuels vraiment à ton image,{" "}
                <a href="/branding/charter" className="text-primary hover:underline">remplis ta charte graphique</a>.
              </p>
            </div>
          )}

          {visualLoading && (
            <div className="text-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">L'outil dessine ton carrousel...</p>
              <p className="text-xs text-muted-foreground mt-2">✨ Ça peut prendre 15-30 secondes.</p>
            </div>
          )}

          {!visualLoading && visualSlides.length === 0 && (
            <div className="space-y-6 mb-6">
              {/* Hidden file input for inline upload */}
              <input
                ref={templateInputRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                className="hidden"
                onChange={handleInlineTemplateUpload}
                disabled={templateUploading}
              />

              {/* Mes templates (from charter) */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  📐 Mes templates
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {charterTemplates.map((t, idx) => {
                    const isPdf = t.name?.toLowerCase().endsWith('.pdf') || t.url?.toLowerCase().includes('.pdf');
                    return (
                      <button
                        key={idx}
                        onClick={() => handleGenerateVisual(`charter_template_${idx}`)}
                        className="group rounded-xl border-2 border-primary/30 hover:border-primary bg-card overflow-hidden transition-all hover:shadow-lg"
                      >
                        <div className="relative aspect-[4/5] overflow-hidden">
                          {isPdf ? (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-muted/40 gap-2">
                              <svg className="h-10 w-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              <span className="text-[10px] text-muted-foreground font-medium">PDF</span>
                            </div>
                          ) : (
                            <img
                              src={t.url}
                              alt={t.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="text-[10px] text-muted-foreground p-2 truncate text-center">{t.name}</p>
                      </button>
                    );
                  })}

                  {/* Add template button */}
                  {charterTemplates.length < 20 && (
                    <button
                      onClick={() => templateInputRef.current?.click()}
                      disabled={templateUploading}
                      className="rounded-xl border-2 border-dashed border-border hover:border-primary/40 bg-card flex flex-col items-center justify-center aspect-[4/5] transition-all hover:shadow-md gap-2"
                    >
                      {templateUploading ? (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      ) : (
                        <Plus className="h-6 w-6 text-muted-foreground" />
                      )}
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {templateUploading ? "Upload..." : "Ajouter"}
                      </span>
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 italic">
                  L'IA analysera ton template et reproduira son style sur tes slides.
                  </p>
                </div>

              {/* Styles prédéfinis */}
              <div>
                {hasCharterTemplates && (
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Ou un style prédéfini
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {TEMPLATE_OPTIONS.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleGenerateVisual(t.id)}
                      className="rounded-xl border-2 border-border hover:border-primary/60 bg-card p-4 text-center transition-all hover:shadow-md"
                    >
                      <div className="text-2xl mb-1">{t.icon}</div>
                      <p className="text-sm font-semibold text-foreground">{t.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          {!visualLoading && visualSlides.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Aperçu ({visualSlides.length} slides)</p>
                <div className="flex gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="text-xs gap-1.5">
                        <Download className="h-3.5 w-3.5" /> Exporter <ChevronDown className="h-3 w-3 ml-0.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={async () => {
                        toast.info("Export visuels en cours (capture des slides)…");
                        try {
                          await exportCarouselVisualPptx(visualSlides, subject || "carrousel-visuels");
                          toast.success("PPTX visuels téléchargé !");
                        } catch (err: any) {
                          console.error("Visual PPTX export error:", err);
                          toast.error("Erreur : " + (err?.message || "inconnue"));
                        }
                      }}>
                        Visuels (images fidèles)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        toast.info("Export éditable en cours…");
                        try {
                          await exportCarouselPptx(slides, subject || "carrousel", visualSlides, charterHookData);
                          toast.success("PPTX éditable téléchargé !");
                        } catch (err: any) {
                          console.error("PPTX export error:", err);
                          toast.error("Erreur : " + (err?.message || "inconnue"));
                        }
                      }}>
                        Éditable (PowerPoint)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="outline" size="sm" onClick={() => setVisualSlides([])} className="text-xs gap-1.5">
                    Changer de style
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleGenerateVisual(templateStyle)} className="text-xs gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" /> Régénérer
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                {visualSlides.map((vs, idx) => (
                  <div key={idx} className="rounded-xl border border-border overflow-hidden bg-card inline-block w-full max-w-[380px] mx-auto">
                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
                      <span className="text-xs font-medium text-muted-foreground">Slide {vs.slide_number}</span>
                    </div>
                    <div className="relative overflow-hidden" style={{ width: "378px", height: "472px" }}>
                      <div style={{ transform: "scale(0.35)", transformOrigin: "top left", width: "1080px", height: "1350px", position: "absolute", top: 0, left: 0 }}>
                        <iframe
                          srcDoc={vs.html}
                          title={`Slide ${vs.slide_number}`}
                          width="1080"
                          height="1350"
                          style={{ border: "none", pointerEvents: "none" }}
                          sandbox="allow-same-origin allow-scripts"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <ContentActions
                content={slides.map(s => `--- SLIDE ${s.slide_number} (${s.role}) ---\n${s.title}${s.body ? `\n${s.body}` : ""}`).join("\n\n") + (caption ? `\n\n--- CAPTION ---\n${caption.hook}\n\n${caption.body}\n\n${caption.cta}\n\n${caption.hashtags.map(h => `#${h}`).join(" ")}` : "")}
                canal="instagram"
                format="carousel"
                theme={subject || typeObj?.label || "Carrousel"}
                objectif={objective}
                calendarPostId={calendarPostId || undefined}
                onRegenerate={() => handleGenerateVisual(templateStyle)}
                regenerateLabel="Régénérer le visuel"
                calendarData={{
                  storySequenceDetail: {
                    type: "carousel", carousel_type: carouselType, slides, caption, quality_check: qualityCheck,
                    ...(visualSlides.length > 0 ? { visual_html: visualSlides.map(vs => ({ slide_number: vs.slide_number, html: vs.html })), template_style: templateStyle } : {}),
                  },
                  accroche: slides[0]?.title || "",
                }}
                ideasData={{ slides, caption, qualityCheck, ...(visualSlides.length > 0 ? { visual_html: visualSlides.map(vs => ({ slide_number: vs.slide_number, html: vs.html })), template_style: templateStyle } : {}) }}
                ideasContentType="post_instagram"
                className="mt-4"
              />
              <Button size="sm" variant="outline" onClick={() => { setStep(3); setVisualSlides([]); }} className="rounded-full gap-1.5 text-xs mt-2">
                ← Modifier le texte
              </Button>
            </div>
          )}

          {!visualLoading && visualSlides.length === 0 && (
            <Button variant="ghost" size="sm" onClick={() => setStep(3)} className="text-xs text-muted-foreground mt-4">
              ← Retour au texte
            </Button>
          )}
        </main>
      </div>
    );
  }

  // ═══ STEP 3: RESULT ═══
  if (step >= 3 && slides.length > 0) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 animate-fade-in">
          <ReturnToOrigin />
          <ContentProgressBar steps={CAROUSEL_STEPS} currentStep={currentStepKey} onStepClick={handleStepClick} />

          {chosenAngle && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 mb-4">
              <p className="text-xs text-muted-foreground">Angle choisi par l'IA</p>
              <p className="text-sm font-medium text-foreground">{chosenAngle.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{chosenAngle.description}</p>
            </div>
          )}

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
            onRegenerate={() => { setSlides([]); setCaption(null); handleGenerateCarousel(); }}
            onNew={() => { setStep(1); setSlides([]); setCaption(null); setChosenAngle(null); setDeepeningAnswers({}); setCurrentQuestion(0); setVisualSlides([]); setTemplateStyle(""); }}
          />

          <ContentActions
            content={slides.map(s => `--- SLIDE ${s.slide_number} (${s.role}) ---\n${s.title}${s.body ? `\n${s.body}` : ""}`).join("\n\n") + (caption ? `\n\n--- CAPTION ---\n${caption.hook}\n\n${caption.body}\n\n${caption.cta}\n\n${caption.hashtags.map(h => `#${h}`).join(" ")}` : "")}
            canal="instagram"
            format="carousel"
            theme={subject || typeObj?.label || "Carrousel"}
            objectif={objective}
            calendarPostId={calendarPostId || undefined}
            onRegenerate={() => { setSlides([]); setCaption(null); handleGenerateCarousel(); }}
            regenerateLabel="Régénérer le texte"
            calendarData={{
              storySequenceDetail: { type: "carousel", carousel_type: carouselType, slides, caption, quality_check: qualityCheck },
              accroche: slides[0]?.title || "",
            }}
            ideasData={{ slides, caption, qualityCheck }}
            ideasContentType="post_instagram"
            className="mt-4"
          />

          {caption && (
            <div className="mt-6">
              <RedFlagsChecker
                content={`${caption.hook}\n\n${caption.body}\n\n${caption.cta}`}
                onFix={(fixed) => {
                  const parts = fixed.split("\n\n");
                  setCaption({
                    ...caption,
                    hook: parts[0] || "",
                    body: parts.slice(1, -1).join("\n\n") || "",
                    cta: parts[parts.length - 1] || "",
                  });
                }}
              />
            </div>
          )}

          <div className="mt-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-5 text-center">
            <p className="text-sm font-medium text-foreground mb-2">Ton texte est prêt ? Passe aux visuels !</p>
            <Button onClick={() => { setStep(4); setVisualSlides([]); }} className="gap-2">
              <Sparkles className="h-4 w-4" /> Générer le visuel
            </Button>
          </div>

          <AiGeneratedMention />
          <BaseReminder variant="atelier" />
        </main>
      </div>
    );
  }

  // ═══ STEPS 1-2 ═══
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4 animate-fade-in">
        <ReturnToOrigin />
        <ContentProgressBar steps={CAROUSEL_STEPS} currentStep={currentStepKey} onStepClick={handleStepClick} />
        <CreditWarning remaining={remainingTotal()} className="mb-4" />

        {step === 1 && (
          <CarouselTypeSubjectStep
            carouselType={carouselType}
            onSelectType={setCarouselType}
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
            onNext={() => { 
              setStep(2); 
              setCurrentQuestion(0);
              setDynamicQuestions(null);
              if (subject.trim()) {
                setLoadingQuestions(true);
                const fetchDynamicQuestions = async (attempt = 1) => {
                  try {
                    const { data, error } = await supabase.functions.invoke("carousel-ai", {
                      body: { type: "deepening_questions", carousel_type: carouselType, subject, objective, workspace_id: workspaceId },
                    });
                    if (!error && data?.content) {
                      const parsed = typeof data.content === "string" ? JSON.parse(data.content) : data.content;
                      if (parsed.questions?.length >= 2) {
                        setDynamicQuestions(parsed.questions);
                        return;
                      }
                    }
                    if (attempt < 2) return fetchDynamicQuestions(2);
                  } catch (e) {
                    console.warn("Failed to load dynamic questions (attempt " + attempt + ")", e);
                    if (attempt < 2) return fetchDynamicQuestions(2);
                  }
                };
                fetchDynamicQuestions().finally(() => setLoadingQuestions(false));
              }
            }}
            subjectPlaceholder={`Ex : "${activityExamples.post_examples[0]}"`}
            draftRestored={draftRestored}
            onDiscardDraft={() => { clearDraft(); setStep(1); setCarouselType(""); setObjective(""); setSubject(""); setSelectedOffer(""); setSlideCount(7); }}
          />
        )}

        {step === 2 && (
          <CarouselQuestionsStep
            typeObj={typeObj}
            questions={questions}
            currentQuestion={currentQuestion}
            deepeningAnswers={deepeningAnswers}
            onAnswerChange={(key, val) => setDeepeningAnswers(prev => ({ ...prev, [key]: val }))}
            onPrevQuestion={() => { if (currentQuestion > 0) setCurrentQuestion(prev => prev - 1); else setStep(1); }}
            onNextQuestion={handleNextQuestion}
            onSkip={handleSkipQuestions}
            loadingQuestions={loadingQuestions}
          />
        )}
      </main>
    </div>
  );
}
