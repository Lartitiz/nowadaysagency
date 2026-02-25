import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice } from "@/components/ui/textarea-with-voice";
import { InputWithVoice } from "@/components/ui/input-with-voice";
import { ArrowLeft, Loader2, Check, Sparkles, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { DEMO_COACHING_DATA, type DemoCoachingQuestion } from "@/lib/demo-coaching-data";
import { COACHING_CHECKLISTS, COACHING_LABELS } from "@/lib/coaching-checklists";
import Confetti from "@/components/Confetti";
import { toast } from "sonner";
import { MarkdownText } from "@/components/ui/markdown-text";

type Section = "story" | "persona" | "tone_style" | "content_strategy" | "offers" | "charter";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AIResponse {
  question: string;
  question_type: "text" | "textarea" | "select" | "multi_select";
  options?: string[];
  placeholder?: string;
  covered_topic?: string | null;
  extracted_insights?: Record<string, any>;
  is_complete: boolean;
  completion_percentage: number;
  remaining_topics?: string[];
  final_summary?: string;
}

const SECTION_META: Record<Section, { emoji: string; title: string; description: string; duration: string }> = {
  story: { emoji: "📖", title: "Mon histoire", description: "On va écrire ton histoire ensemble. Je te pose des questions, tu me racontes.", duration: "~5 min" },
  persona: { emoji: "👩‍💻", title: "Mon client·e idéal·e", description: "On va dresser le portrait de ta cliente idéale ensemble.", duration: "~5 min" },
  tone_style: { emoji: "🎨", title: "Ma voix & mes combats", description: "On va définir ta voix. Comment tu parles, ce que tu défends, tes limites.", duration: "~5 min" },
  content_strategy: { emoji: "🍒", title: "Ma ligne éditoriale", description: "On va poser tes piliers de contenu et ta ligne éditoriale.", duration: "~4 min" },
  offers: { emoji: "🎁", title: "Mes offres", description: "On va formuler tes offres de manière désirable.", duration: "~5 min" },
  charter: { emoji: "🎨", title: "Ma charte graphique", description: "On va définir ton identité visuelle : couleurs, typos, style, ambiance.", duration: "~4 min" },
};

const LOADING_PHRASES = [
  "Je réfléchis à ma prochaine question...",
  "Intéressant, laisse-moi creuser...",
  "Ok, j'ai une idée...",
  "Je cherche le bon angle...",
  "Hmm, voyons ce qu'on peut explorer...",
];

function makeMsg(role: "user" | "assistant", content: string): Message {
  return { id: crypto.randomUUID(), role, content };
}

// --- Progress component ---
function CoachingProgress({ section, coveredTopics }: { section: Section; coveredTopics: string[] }) {
  const checklist = COACHING_CHECKLISTS[section] || [];
  const labels = COACHING_LABELS[section] || {};
  const coveredSet = new Set(coveredTopics);
  const pct = checklist.length > 0 ? Math.round((coveredTopics.length / checklist.length) * 100) : 0;

  return (
    <div className="rounded-xl bg-muted/30 border border-border p-4 mb-4">
      <div className="flex justify-between mb-2">
        <span className="text-xs text-muted-foreground">
          {coveredTopics.length}/{checklist.length} sujets couverts
        </span>
        <span className="text-xs text-primary font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 bg-background rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="space-y-1.5">
        {checklist.map((topic, i) => {
          const isCovered = coveredSet.has(topic);
          const isCurrent = !isCovered && i === coveredTopics.length;
          return (
            <div key={topic} className="flex items-center gap-2 text-xs">
              <span>{isCovered ? "✅" : isCurrent ? "🔵" : "⬜"}</span>
              <span className={cn(
                isCovered ? "text-muted-foreground line-through" : isCurrent ? "text-primary font-medium" : "text-muted-foreground/50"
              )}>
                {labels[topic] || topic}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface BrandingCoachingFlowProps {
  section: Section;
  onComplete?: () => void;
  onBack?: () => void;
}

export default function BrandingCoachingFlow({ section, onComplete, onBack }: BrandingCoachingFlowProps) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<"intro" | "coaching" | "complete">("intro");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<AIResponse | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPhrase, setLoadingPhrase] = useState("");
  const [completionPct, setCompletionPct] = useState(5);
  const [finalSummary, setFinalSummary] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [hasExistingSession, setHasExistingSession] = useState(false);
  const [hasPrefilledData, setHasPrefilledData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coveredTopics, setCoveredTopics] = useState<string[]>([]);

  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const questionIndexRef = useRef(questionIndex);
  useEffect(() => { questionIndexRef.current = questionIndex; }, [questionIndex]);
  const coveredTopicsRef = useRef(coveredTopics);
  useEffect(() => { coveredTopicsRef.current = coveredTopics; }, [coveredTopics]);

  const meta = SECTION_META[section];
  const demoQuestions = isDemoMode ? DEMO_COACHING_DATA[section]?.questions : null;
  const checklist = COACHING_CHECKLISTS[section] || [];

  // Load existing session
  useEffect(() => {
    if (isDemoMode || !user) return;

    const loadSession = async () => {
      const { data } = await supabase
        .from("branding_coaching_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("section", section)
        .maybeSingle();

      if (data && data.messages && (data.messages as any[]).length > 0) {
        setHasExistingSession(true);
        const restoredTopics = (data as any).covered_topics || (data.extracted_data as any)?.covered_topics || [];
        setCoveredTopics(restoredTopics);

        if (data.is_complete) {
          setFinalSummary((data.extracted_data as any)?.final_summary || "");
          setCompletionPct(100);
          setCoveredTopics(checklist); // all covered
          setPhase("complete");
        } else {
          const restored = (data.messages as any[]).map((m: any) => ({
            id: m.id || crypto.randomUUID(),
            role: m.role,
            content: m.content,
          }));
          setMessages(restored);
          setQuestionIndex(data.question_count || 0);
          setCompletionPct((data.extracted_data as any)?.completion_percentage || 5);
        }
      }

      const { data: bp } = await supabase
        .from("brand_profile")
        .select("positioning, mission, values")
        .eq("user_id", user.id)
        .maybeSingle();
      if (bp?.positioning || bp?.mission) {
        setHasPrefilledData(true);
      }
    };
    loadSession();
  }, [user?.id, section, isDemoMode]);

  // Fetch context
  const contextRef = useRef<any>(null);
  const fetchContext = useCallback(async () => {
    if (contextRef.current) return contextRef.current;
    if (!user) return {};
    const [profileRes, brandRes, auditRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_profile").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("branding_audits").select("score_global, points_forts, points_faibles").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const ctx = {
      profile: profileRes.data,
      branding: brandRes.data,
      audit: auditRes.data,
      existing_data: brandRes.data || {},
    };
    contextRef.current = ctx;
    return ctx;
  }, [user?.id]);

  // Charter coaching state
  const charterStepRef = useRef(0);
  const charterDataRef = useRef<any>(null);

  const askAI = useCallback(async (msgs: Message[]): Promise<AIResponse | null> => {
    setLoading(true);
    setError(null);
    setLoadingPhrase(LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]);

    try {
      // Charter section uses a different edge function with step-based flow
      if (section === "charter") {
        const stepNum = charterStepRef.current + 1;
        const lastUserMsg = [...msgs].reverse().find(m => m.role === "user");
        const answer = lastUserMsg?.content || "Commence la session.";

        const { data, error: fnError } = await supabase.functions.invoke("charter-coaching", {
          body: {
            step: stepNum,
            answer,
            charterData: charterDataRef.current || {},
          },
        });

        if (fnError) {
          console.error("[CharterCoaching] Edge function error:", fnError);
          setError("L'IA a eu un blanc. Ça arrive 😅");
          toast.error("L'IA a eu un blanc. Réessaie.");
          return null;
        }

        const parsed = data?.response || data;
        if (!parsed) {
          setError("Réponse vide de l'IA. Réessaie.");
          return null;
        }

        // Map charter response to AIResponse format
        const CHARTER_TOPICS = ["mood_place", "colors", "visual_style", "typography", "logo", "visual_donts"];
        const CHARTER_QUESTIONS = [
          "Si ta marque était un lieu, ce serait quoi ?",
          "Quelles couleurs te font vibrer quand tu penses à ta marque ? Pas celles que tu 'devrais' utiliser : celles qui te PARLENT. Décris-les ou donne des codes HEX.",
          "Comment décrirais-tu le style de tes visuels ? Donne-moi 3 mots qui décrivent l'ambiance visuelle que tu veux créer.",
          "Pour les polices de caractères : tu préfères un style plutôt classique et élégant, moderne et clean, ou manuscrit et organique ?",
          "As-tu déjà un logo ? Si oui, décris-le. Si non, pas de panique !",
          "Qu'est-ce que tu DÉTESTES visuellement ? Les trucs qui te font fuir quand tu les vois sur un compte Instagram ?",
        ];
        const coveredTopic = CHARTER_TOPICS[stepNum - 1] || null;
        const isComplete = stepNum >= 6;
        const nextQuestion = !isComplete ? CHARTER_QUESTIONS[stepNum] : "";

        const questionText = isComplete
          ? `${parsed.feedback || ""}\n\n${parsed.suggestion || ""}`
          : `${parsed.feedback || ""}\n\n${parsed.suggestion || ""}\n\n---\n\n${nextQuestion}`;

        return {
          question: questionText.trim(),
          question_type: "textarea" as const,
          placeholder: "Ta réponse...",
          covered_topic: coveredTopic,
          extracted_insights: { ...parsed.extracted, ai_generated_brief: parsed.ai_generated_brief },
          is_complete: isComplete,
          completion_percentage: Math.round((stepNum / 6) * 100),
          remaining_topics: CHARTER_TOPICS.slice(stepNum),
          final_summary: isComplete
            ? `✅ Ta charte graphique est posée !\n\n${parsed.ai_generated_brief || parsed.feedback || ""}`
            : undefined,
        };
      }

      const context = await fetchContext();

      // Send ALL messages — no pruning — the prompt's checklist prevents loops
      const simpleMsgs = msgs.map(m => ({ role: m.role, content: m.content }));

      const { data, error: fnError } = await supabase.functions.invoke("branding-coaching", {
        body: {
          user_id: user!.id,
          section,
          messages: simpleMsgs,
          context,
          covered_topics: coveredTopicsRef.current,
        },
      });

      if (fnError) {
        console.error("[BrandingCoaching] Edge function error:", fnError);
        setError("L'IA a eu un blanc. Ça arrive 😅");
        toast.error("L'IA a eu un blanc. Réessaie.");
        return null;
      }

      let parsed: AIResponse;
      try {
        const raw = data?.response || data;
        if (typeof raw === "string") {
          const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          parsed = JSON.parse(cleaned);
        } else {
          parsed = raw as AIResponse;
        }
      } catch (parseErr) {
        console.error("[BrandingCoaching] JSON parse error:", parseErr, "raw:", data);
        setError("Réponse inattendue de l'IA. Réessaie.");
        toast.error("Réponse inattendue. Réessaie.");
        return null;
      }

      if (!parsed || (!parsed.question && !parsed.is_complete)) {
        console.error("[BrandingCoaching] Invalid response shape:", parsed);
        setError("Réponse incomplète de l'IA. Réessaie.");
        toast.error("Réponse incomplète. Réessaie.");
        return null;
      }

      return parsed;
    } catch (err) {
      console.error("[BrandingCoaching] Unexpected error:", err);
      setError("Quelque chose a coincé. Réessaie.");
      toast.error("Quelque chose a coincé. Réessaie.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [user?.id, section, fetchContext]);

  const lastCallMsgsRef = useRef<Message[]>([]);
  const handleRetry = useCallback(async () => {
    setError(null);
    const response = await askAI(lastCallMsgsRef.current);
    if (!response) return;

    const updatedMessages: Message[] = [
      ...lastCallMsgsRef.current,
      makeMsg("assistant", response.question || response.final_summary || ""),
    ];
    setMessages(updatedMessages);
    updateCoveredTopics(response);
    setCompletionPct(response.completion_percentage || completionPct);

    if (response.is_complete) {
      setFinalSummary(response.final_summary || "");
      setCompletionPct(100);
      setShowConfetti(true);
      setPhase("complete");
      return;
    }
    setCurrentQuestion(response);
  }, [askAI, completionPct]);

  const updateCoveredTopics = useCallback((response: AIResponse) => {
    if (response.covered_topic) {
      setCoveredTopics(prev => {
        if (prev.includes(response.covered_topic!)) return prev;
        return [...prev, response.covered_topic!];
      });
    }
  }, []);

  const saveDemoAnswer = useCallback((q: DemoCoachingQuestion) => {
    setCompletionPct(q.completion_percentage);
  }, []);

  const handleStart = useCallback(async () => {
    setPhase("coaching");

    if (isDemoMode && demoQuestions) {
      const first = demoQuestions[0];
      setCurrentQuestion({
        question: first.question,
        question_type: first.question_type,
        options: first.options,
        placeholder: first.placeholder,
        is_complete: false,
        completion_percentage: first.completion_percentage,
      });
      setAnswer(first.demo_answer);
      setCompletionPct(5);
      return;
    }

    // Charter: show first question directly (step-based, no initial API call)
    if (section === "charter") {
      charterStepRef.current = 0;
      const CHARTER_QUESTIONS = [
        "Si ta marque était un lieu, ce serait quoi ? Un café cosy avec des plantes, une galerie d'art contemporain, un marché artisanal en plein air, un studio de yoga épuré, une boutique vintage colorée, ou autre chose ?",
        "Quelles couleurs te font vibrer quand tu penses à ta marque ? Pas celles que tu 'devrais' utiliser : celles qui te PARLENT. Décris-les (ex : rose vif, vert sauge, jaune moutarde, bleu nuit) ou donne des codes HEX si tu les as.",
        "Comment décrirais-tu le style de tes visuels ? Plutôt minimaliste et épuré ? Coloré et pop ? Artisanal et chaleureux ? Luxe et raffiné ? Donne-moi 3 mots qui décrivent l'ambiance visuelle que tu veux créer.",
        "Pour les polices de caractères : tu préfères un style plutôt classique et élégant (serif type Playfair Display), moderne et clean (sans-serif type Montserrat), ou manuscrit et organique ?",
        "As-tu déjà un logo ? Si oui, décris-le. Si non, pas de panique : on peut travailler sans. L'important c'est d'avoir une identité visuelle cohérente, le logo vient après.",
        "Dernière question : qu'est-ce que tu DÉTESTES visuellement ? Les trucs qui te font fuir quand tu les vois sur un compte Instagram ?",
      ];

      // If resuming existing session, figure out which step we're on
      if (hasExistingSession && messagesRef.current.length > 0) {
        const userMsgs = messagesRef.current.filter(m => m.role === "user").length;
        charterStepRef.current = userMsgs;
        if (userMsgs < CHARTER_QUESTIONS.length) {
          setCurrentQuestion({
            question: CHARTER_QUESTIONS[userMsgs],
            question_type: "textarea",
            placeholder: "Ta réponse...",
            is_complete: false,
            completion_percentage: Math.round((userMsgs / 6) * 100),
          });
          setCompletionPct(Math.round((userMsgs / 6) * 100));
        }
        return;
      }

      setCurrentQuestion({
        question: CHARTER_QUESTIONS[0],
        question_type: "textarea",
        placeholder: "Décris le lieu qui te vient en tête...",
        is_complete: false,
        completion_percentage: 0,
      });
      const initial = [makeMsg("assistant", CHARTER_QUESTIONS[0])];
      setMessages(initial);
      setCompletionPct(0);
      return;
    }

    if (hasExistingSession && messagesRef.current.length > 0) {
      lastCallMsgsRef.current = messagesRef.current;
      const response = await askAI(messagesRef.current);
      if (response) {
        setCurrentQuestion(response);
        updateCoveredTopics(response);
        setCompletionPct(response.completion_percentage || 5);
      }
      return;
    }

    lastCallMsgsRef.current = [];
    const response = await askAI([]);
    if (response) {
      setCurrentQuestion(response);
      const initial = [makeMsg("assistant", response.question)];
      setMessages(initial);
      setCompletionPct(response.completion_percentage || 5);
    }
  }, [isDemoMode, demoQuestions, hasExistingSession, askAI, updateCoveredTopics, section]);

  const handleNext = useCallback(async () => {
    const userAnswer = currentQuestion?.question_type === "select" || currentQuestion?.question_type === "multi_select"
      ? selectedOptions.join(", ")
      : answer;

    if (!userAnswer.trim()) return;

    const nextIndex = questionIndexRef.current + 1;
    setQuestionIndex(nextIndex);
    setAnswer("");
    setSelectedOptions([]);
    setError(null);

    if (isDemoMode && demoQuestions) {
      saveDemoAnswer(demoQuestions[questionIndexRef.current]);

      if (nextIndex >= demoQuestions.length) {
        setFinalSummary(DEMO_COACHING_DATA[section]?.final_summary || "");
        setCompletionPct(100);
        setShowConfetti(true);
        setPhase("complete");
        return;
      }

      setLoading(true);
      setLoadingPhrase(LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]);
      await new Promise(r => setTimeout(r, 500));
      setLoading(false);

      const next = demoQuestions[nextIndex];
      setCurrentQuestion({
        question: next.question,
        question_type: next.question_type,
        options: next.options,
        placeholder: next.placeholder,
        is_complete: false,
        completion_percentage: next.completion_percentage,
      });
      setAnswer(next.demo_answer);
      setCompletionPct(next.completion_percentage);
      return;
    }

    // Real mode
    // For charter, increment the step counter
    if (section === "charter") {
      charterStepRef.current = nextIndex;
    }

    const currentMessages = messagesRef.current;
    const newMessages: Message[] = [
      ...currentMessages,
      makeMsg("user", userAnswer),
    ];
    setMessages(newMessages);
    lastCallMsgsRef.current = newMessages;

    const response = await askAI(newMessages);
    if (!response) return;

    // Update covered topics from AI response
    updateCoveredTopics(response);

    const updatedMessages: Message[] = [
      ...newMessages,
      makeMsg("assistant", response.question || response.final_summary || ""),
    ];
    setMessages(updatedMessages);

    // Compute real completion from covered topics
    const newCovered = response.covered_topic && !coveredTopicsRef.current.includes(response.covered_topic)
      ? [...coveredTopicsRef.current, response.covered_topic]
      : coveredTopicsRef.current;
    const realPct = checklist.length > 0
      ? Math.round((newCovered.length / checklist.length) * 100)
      : response.completion_percentage || completionPct;
    setCompletionPct(realPct);

    // Save session
    supabase.from("branding_coaching_sessions").upsert({
      user_id: user!.id,
      section,
      messages: updatedMessages as any,
      extracted_data: {
        ...response.extracted_insights,
        completion_percentage: realPct,
        final_summary: response.final_summary,
        covered_topics: newCovered,
      },
      question_count: nextIndex,
      is_complete: response.is_complete,
      completed_at: response.is_complete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      covered_topics: newCovered as any,
    } as any, { onConflict: "user_id,section" }).then(({ error: saveErr }) => {
      if (saveErr) console.error("[BrandingCoaching] Save session error:", saveErr);
    });

    // Save extracted insights
    if (response.extracted_insights && Object.keys(response.extracted_insights).length > 0) {
      saveInsights(section, response.extracted_insights);
    }

    if (response.is_complete) {
      // If storytelling, generate full story
      if (section === "story") {
        try {
          const ctx = await fetchContext();
          const { data: storyGenData } = await supabase.functions.invoke("branding-coaching", {
            body: {
              user_id: user!.id,
              section: "story_generate",
              messages: [
                ...updatedMessages,
                { role: "user", content: "Maintenant, écris mon histoire complète en un texte fluide et engageant, à la première personne. Utilise tout ce que je t'ai raconté." }
              ],
              context: ctx,
              covered_topics: checklist,
            },
          });
          const generatedStory = storyGenData?.response?.question || (typeof storyGenData?.response === "string" ? storyGenData.response : "");
          if (typeof generatedStory === "string" && generatedStory.length > 50) {
            const { data: existing } = await (supabase.from("storytelling") as any)
              .select("id")
              .eq("user_id", user!.id)
              .eq("story_type", "fondatrice")
              .limit(1)
              .maybeSingle();
            if (existing?.id) {
              await (supabase.from("storytelling") as any)
                .update({ step_6_full_story: generatedStory, completed: true, updated_at: new Date().toISOString() })
                .eq("id", existing.id);
            }
          }
        } catch (e) {
          console.error("[BrandingCoaching] Error generating full story:", e);
        }
      }

      setFinalSummary(response.final_summary || "");
      setCompletionPct(100);
      setCoveredTopics(checklist);
      setShowConfetti(true);
      setPhase("complete");
      return;
    }

    setCurrentQuestion(response);
  }, [answer, selectedOptions, currentQuestion, isDemoMode, demoQuestions, askAI, section, user?.id, completionPct, saveDemoAnswer, updateCoveredTopics, checklist]);

  const saveInsights = async (sec: string, insights: Record<string, any>) => {
    if (!user) return;
    try {
      if (sec === "charter") {
        // Save charter insights to brand_charter
        const charterPayload: Record<string, any> = {};
        if (insights.mood_keywords) charterPayload.mood_keywords = insights.mood_keywords;
        if (insights.color_primary) charterPayload.color_primary = insights.color_primary;
        if (insights.color_secondary) charterPayload.color_secondary = insights.color_secondary;
        if (insights.color_accent) charterPayload.color_accent = insights.color_accent;
        if (insights.photo_style) charterPayload.photo_style = insights.photo_style;
        if (insights.font_title) charterPayload.font_title = insights.font_title;
        if (insights.font_body) charterPayload.font_body = insights.font_body;
        if (insights.visual_donts) charterPayload.visual_donts = insights.visual_donts;
        if (insights.ai_generated_brief) charterPayload.ai_generated_brief = insights.ai_generated_brief;

        if (Object.keys(charterPayload).length > 0) {
          charterPayload.updated_at = new Date().toISOString();
          // Try update first, then upsert
          const { data: existing } = await (supabase.from("brand_charter") as any)
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (existing?.id) {
            await (supabase.from("brand_charter") as any)
              .update(charterPayload)
              .eq("id", existing.id);
          } else {
            await (supabase.from("brand_charter") as any)
              .insert({ user_id: user.id, ...charterPayload });
          }
          // Update local ref for next step
          charterDataRef.current = { ...charterDataRef.current, ...charterPayload };
        }
      } else if (sec === "persona") {
        await supabase.from("persona").upsert({
          user_id: user.id,
          ...insights,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "user_id" });
      } else if (sec === "story") {
        // Map coaching insights to storytelling columns
        const { data: existing } = await (supabase.from("storytelling") as any)
          .select("id")
          .eq("user_id", user.id)
          .eq("story_type", "fondatrice")
          .limit(1)
          .maybeSingle();

        const storyData: Record<string, any> = {};
        if (insights.story_origin) storyData.step_1_raw = insights.story_origin;
        if (insights.story_turning_point) storyData.step_2_location = insights.story_turning_point;
        if (insights.story_struggles) storyData.step_3_action = insights.story_struggles;
        if (insights.story_unique) storyData.step_4_thoughts = insights.story_unique;
        if (insights.story_vision) storyData.step_5_emotions = insights.story_vision;

        if (existing?.id) {
          await (supabase.from("storytelling") as any)
            .update({ ...storyData, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await (supabase.from("storytelling") as any).insert({
            user_id: user.id,
            ...storyData,
            title: "Mon histoire fondatrice",
            story_type: "fondatrice",
            source: "coaching",
            is_primary: true,
            updated_at: new Date().toISOString(),
          });
        }
      } else {
        await supabase.from("brand_profile").upsert({
          user_id: user.id,
          ...insights,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "user_id" });
      }
    } catch (e) {
      console.error("[BrandingCoaching] Error saving insights:", e);
    }
  };

  const estimatedTotal = checklist.length || 8;
  const estimatedRemaining = Math.max(0, estimatedTotal - coveredTopics.length);
  const timeRemaining = estimatedRemaining <= 1 ? "Presque fini !" : `Encore ~${Math.ceil(estimatedRemaining * 0.5)} min`;

  // Intro screen
  if (phase === "intro") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {isDemoMode && (
          <div className="absolute top-4 right-4">
            <button onClick={() => navigate("/dashboard")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Skip → Voir l'outil rempli
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-lg mx-auto text-center">
          <span className="text-5xl mb-6">{meta.emoji}</span>
          <h1 className="font-display text-2xl font-bold text-foreground mb-3">{meta.title}</h1>
          <p className="text-muted-foreground text-[15px] mb-6 leading-relaxed">{meta.description}</p>

          {hasExistingSession && (
            <p className="text-sm text-primary mb-4">On avait commencé la dernière fois. On reprend ? 🌸</p>
          )}

          {hasPrefilledData && !hasExistingSession && (
            <p className="text-sm text-muted-foreground mb-4">
              ✨ J'ai déjà quelques infos grâce à ce que tu m'as partagé. On va creuser.
            </p>
          )}

          <Button size="lg" className="rounded-pill gap-2" onClick={handleStart} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {hasExistingSession ? "On reprend →" : "C'est parti →"}
          </Button>

          <p className="text-xs text-muted-foreground mt-6">{meta.duration}</p>
        </div>
      </div>
    );
  }

  // Complete screen
  if (phase === "complete") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {showConfetti && <Confetti />}
        <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-lg mx-auto text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 15 }}>
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Check className="h-8 w-8 text-primary" />
            </div>
          </motion.div>

          <h1 className="font-display text-2xl font-bold text-foreground mb-4">✅ Section complète !</h1>

          {finalSummary && (
            <div className="rounded-xl bg-muted/50 border border-border p-5 mb-6 text-left">
              <MarkdownText content={finalSummary} className="text-sm text-foreground leading-relaxed" />
            </div>
          )}

          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-3">
              <Button onClick={() => navigate("/branding")} variant="outline" className="rounded-pill">
                Retour au branding
              </Button>
              {onComplete && (
                <Button onClick={onComplete} className="rounded-pill">
                  Voir ma fiche récap
                </Button>
              )}
            </div>
            <Button
              variant="ghost"
              className="rounded-pill text-muted-foreground mt-2"
              onClick={async () => {
                if (user) {
                  await supabase
                    .from("branding_coaching_sessions")
                    .delete()
                    .eq("user_id", user.id)
                    .eq("section", section);
                }
                setPhase("intro");
                setMessages([]);
                setCurrentQuestion(null);
                setQuestionIndex(0);
                setCompletionPct(5);
                setFinalSummary("");
                setCoveredTopics([]);
                setHasExistingSession(false);
                setShowConfetti(false);
                contextRef.current = null;
              }}
            >
              <RefreshCw className="h-4 w-4 mr-1" /> Recommencer cette section
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-6">Tu pourras revenir creuser à tout moment.</p>
        </div>
      </div>
    );
  }

  // Coaching screen
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onBack || (() => navigate("/branding"))} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>
          <span className="text-xs text-muted-foreground font-mono-ui">
            {coveredTopics.length}/{checklist.length} sujets
          </span>
          {isDemoMode && (
            <button onClick={() => navigate("/dashboard")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Skip →
            </button>
          )}
        </div>
        <Progress value={checklist.length > 0 ? (coveredTopics.length / checklist.length) * 100 : completionPct} className="h-1.5" />
      </div>

      {/* Topic progress checklist */}
      <div className="px-4 mt-2">
        <CoachingProgress section={section} coveredTopics={coveredTopics} />
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground italic">{loadingPhrase}</p>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-4"
            >
              <p className="text-lg">😅</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button onClick={handleRetry} variant="outline" className="rounded-pill gap-2">
                <RefreshCw className="h-4 w-4" /> Réessayer
              </Button>
            </motion.div>
          ) : currentQuestion ? (
            <motion.div
              key={`q-${questionIndex}`}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <MarkdownText content={currentQuestion.question} className="font-display text-lg md:text-xl font-bold text-foreground mb-6 leading-relaxed text-center" />

              {currentQuestion.question_type === "textarea" && (
                <TextareaWithVoice
                  value={answer}
                  onValueChange={setAnswer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={currentQuestion.placeholder}
                  aria-label="Ta réponse au coaching"
                  className="min-h-[120px]"
                />
              )}

              {currentQuestion.question_type === "text" && (
                <InputWithVoice
                  value={answer}
                  onValueChange={setAnswer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={currentQuestion.placeholder}
                  aria-label="Ta réponse au coaching"
                />
              )}

              {currentQuestion.question_type === "select" && currentQuestion.options && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentQuestion.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { setSelectedOptions([opt]); setAnswer(opt); }}
                      className={cn(
                        "rounded-xl border-2 p-4 text-left text-sm transition-all",
                        selectedOptions.includes(opt)
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {currentQuestion.question_type === "multi_select" && currentQuestion.options && (
                <div className="grid grid-cols-2 gap-3">
                  {currentQuestion.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        setSelectedOptions(prev =>
                          prev.includes(opt)
                            ? prev.filter(o => o !== opt)
                            : [...prev, opt]
                        );
                      }}
                      className={cn(
                        "rounded-xl border-2 p-3 text-sm transition-all",
                        selectedOptions.includes(opt)
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      {selectedOptions.includes(opt) && <Check className="h-3 w-3 inline mr-1" />}
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-center">
                <Button
                  size="lg"
                  className="rounded-pill min-w-[200px]"
                  onClick={handleNext}
                  disabled={!answer.trim() && selectedOptions.length === 0}
                >
                  Suivant →
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="pb-6 text-center">
        <p className="text-xs text-muted-foreground">{timeRemaining}</p>
      </div>
    </div>
  );
}
