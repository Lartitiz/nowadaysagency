import { useState, useEffect, useCallback, useRef } from "react";
import { invokeWithTimeout, type InvokeError } from "@/lib/invoke-with-timeout";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId, useProfileUserId } from "@/hooks/use-workspace-query";
import { useProfile, useBrandProfile } from "@/hooks/use-profile";
import { useQueryClient } from "@tanstack/react-query";
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
import { trackError } from "@/lib/error-tracker";
import { MarkdownText } from "@/components/ui/markdown-text";
import {
  type AIResponse,
  getInvokeErrorMessage,
  parseAIResponseRaw,
  isAIResponseShapeInvalid,
  normalizeAIResponse,
  buildCharterAIResponse,
} from "@/lib/branding-coaching-response";
import {
  saveCharterInsights,
  savePersonaInsights,
  saveStoryInsights,
  saveContentStrategyInsights,
  saveContentSeriesInsights,
  saveDefaultBrandProfileInsights,
} from "@/components/branding/brandingCoachingInsights";
import {
  generateAndSaveFullStory,
  completePersonaSection,
} from "@/components/branding/brandingCoachingCompletion";

type Section = "story" | "persona" | "tone_style" | "content_strategy" | "offers" | "charter" | "content_series";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SECTION_META: Record<Section, { emoji: string; title: string; description: string; duration: string }> = {
  story: { emoji: "📖", title: "Mon histoire", description: "Je vais te poser des questions sur ton parcours, ton déclic, tes galères. Tu me racontes à l'oral ou à l'écrit, et à la fin, ta fiche storytelling sera remplie automatiquement. Tu n'as rien à structurer toute seule.", duration: "~5 min" },
  persona: { emoji: "👩‍💻", title: "Mon·a client·e idéal·e", description: "On va dresser le portrait de ta cliente idéale ensemble. Je te pose les bonnes questions, tu me décris la personne que tu veux aider. Ta fiche persona se remplit au fur et à mesure.", duration: "~5 min" },
  tone_style: { emoji: "🎨", title: "Ma voix & mes combats", description: "Comment tu parles, ce que tu défends, tes limites. Je te guide question par question, et ta fiche ton se construit toute seule.", duration: "~5 min" },
  content_strategy: { emoji: "🍒", title: "Ma ligne éditoriale", description: "On va poser tes piliers de contenu et ton concept créatif. Réponds à mes questions, et ta ligne éditoriale prend forme automatiquement.", duration: "~4 min" },
  offers: { emoji: "🎁", title: "Mes offres", description: "On va formuler tes offres pour qu'elles donnent envie. Je te pose les bonnes questions, ta fiche offres se remplit.", duration: "~5 min" },
  charter: { emoji: "🎨", title: "Ma charte graphique", description: "On va définir ton identité visuelle ensemble : couleurs, typos, style, ambiance. Je te guide pas à pas.", duration: "~4 min" },
  content_series: { emoji: "📺", title: "Mes séries signatures", description: "On va poser 1 à 3 séries éditoriales qui vont structurer ta communication dans la durée. Je pars de tes piliers pour te proposer des séries qui les incarnent.", duration: "~6-8 min" },
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
  personaId?: string;
  focus?: string;
  onComplete?: () => void;
  onBack?: () => void;
  autofillData?: Record<string, any> | null;
  autofillConfidence?: string | null;
}

// Sujets « convictions vécues » : greffés sur la section tone_style, remplis
// uniquement en coaching. Quand on arrive avec ?focus=convictions, on ne repose
// QUE ces 2 sujets (les autres sont marqués couverts), même si la section est
// déjà complète.
const CONVICTION_TOPICS = ["conviction_pairs", "conviction_vecu"];

export default function BrandingCoachingFlow({ section, personaId, focus, onComplete, onBack, autofillData, autofillConfidence }: BrandingCoachingFlowProps) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const profileUserId = useProfileUserId();
  const { data: profileData } = useProfile();
  const { data: brandProfileData } = useBrandProfile();
  const { isDemoMode } = useDemoContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
  const resolvedPersonaIdRef = useRef<string | null>(personaId || null);

  const meta = SECTION_META[section];
  const demoQuestions = isDemoMode ? DEMO_COACHING_DATA[section]?.questions : null;
  const checklist = COACHING_CHECKLISTS[section] || [];

  // Mode « compléter mes convictions » : on ne repose que les 2 questions
  // convictions, même si tone_style est déjà complète.
  const isConvictionFocus = focus === "convictions" && section === "tone_style";

  // Load existing session
  useEffect(() => {
    if (isDemoMode || !user) return;

    const loadSession = async () => {
      let { data } = await (supabase
        .from("branding_coaching_sessions") as any)
        .select("*")
        .eq(column, value)
        .eq("section", section)
        .maybeSingle();

      // Mode focus convictions : on démarre une mini-session fraîche qui ne
      // repose QUE les 2 sujets convictions. On marque tout le reste comme
      // couvert et on ignore l'état « complète » de la section pour ne pas
      // atterrir sur l'écran de fin. Les champs déjà remplis sont préservés
      // (on ne touche qu'à brand_profile en update).
      if (isConvictionFocus) {
        setCoveredTopics(checklist.filter((t) => !CONVICTION_TOPICS.includes(t)));
        setMessages([]);
        setHasExistingSession(false);
        return;
      }

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

      const { data: bp } = await (supabase
        .from("brand_profile") as any)
        .select("positioning, mission, values")
        .eq(column, value)
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
    const { data: auditData } = await (supabase.from("branding_audits") as any)
      .select("score_global, points_forts, points_faibles")
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Extraire seulement les champs utiles du profil (pas les métadonnées)
    const profileCtx = profileData ? {
      prenom: (profileData as any).prenom || (profileData as any).first_name,
      activite: (profileData as any).activite || (profileData as any).activity,
      type_activite: (profileData as any).type_activite || (profileData as any).activity_type,
      canaux: (profileData as any).canaux,
      main_goal: (profileData as any).main_goal,
    } : undefined;

    // Extraire seulement les champs branding utiles (pas id/timestamps/doublons)
    const brandingCtx = brandProfileData ? {
      positioning: (brandProfileData as any).positioning,
      mission: (brandProfileData as any).mission,
      tone_keywords: (brandProfileData as any).tone_keywords,
      values: (brandProfileData as any).values,
      offer: (brandProfileData as any).offer,
    } : undefined;

    // existing_data : uniquement les champs remplis, sans les champs déjà dans branding
    let existingData: Record<string, any> | undefined;
    if (brandProfileData) {
      const { id, user_id, workspace_id, created_at, updated_at, positioning, mission, tone_keywords, ...rest } = brandProfileData as any;
      const filled = Object.fromEntries(
        Object.entries(rest).filter(([_, v]) => v != null && v !== "" && v !== false)
      );
      existingData = Object.keys(filled).length > 0 ? filled : undefined;
    }

    const ctx: any = {
      profile: profileCtx,
      branding: brandingCtx,
      audit: auditData,
      existing_data: existingData,
    };

    // Enrichissement spécifique pour content_series : on a besoin des piliers
    if (section === "content_series") {
      const { data: bs } = await (supabase.from("brand_strategy") as any)
        .select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3, creative_concept")
        .eq(column, value)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (bs) ctx.brand_strategy = bs;
    }

    contextRef.current = ctx;
    return ctx;
  }, [user?.id, profileData, brandProfileData, section, column, value]);

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
        // charterStepRef.current already holds the 1-based number of the question
        // just answered (it's set to nextIndex in handleNext). The edge function and
        // the CHARTER_TOPICS/QUESTIONS mapping below are both 1-based on that number,
        // so it must NOT be incremented again — doing so skipped the "colors" question
        // and shifted every answer onto the next step's interpretation.
        const stepNum = charterStepRef.current;
        const lastUserMsg = [...msgs].reverse().find(m => m.role === "user");
        const answer = lastUserMsg?.content || "Commence la session.";

        const { data, error: fnError } = await invokeWithTimeout("charter-coaching", {
          body: {
            step: stepNum,
            answer,
            charterData: charterDataRef.current || {},
            workspace_id: workspaceId !== user?.id ? workspaceId : undefined,
          },
        }, 120000);

        if (fnError) {
          const err = fnError as InvokeError;
          console.error("[CharterCoaching] Edge function error:", err);
          setError(getInvokeErrorMessage(err));
          return null;
        }

        const parsed = data?.response || data;
        if (!parsed) {
          setError("Réponse vide de l'IA. Réessaie.");
          return null;
        }

        return buildCharterAIResponse(parsed, stepNum);
      }

      const context = await fetchContext();

      // Send ALL messages — no pruning — the prompt's checklist prevents loops
      const simpleMsgs = msgs.map(m => ({ role: m.role, content: m.content }));

      const { data, error: fnError } = await invokeWithTimeout("branding-coaching", {
        body: {
          user_id: profileUserId,
          workspace_id: workspaceId,
          section,
          messages: simpleMsgs,
          context,
          covered_topics: coveredTopicsRef.current,
          autofill_data: autofillData || undefined,
          autofill_confidence: autofillConfidence || undefined,
        },
      // 250s : côté edge, une relance sur troncature peut aller jusqu'à 120s + 120s = 240s
      // (voir branding-coaching/index.ts) — le client doit couper APRÈS, avec marge.
      }, 250000);

      if (fnError) {
        const err = fnError as InvokeError;
        console.error("[BrandingCoaching] Edge function error:", err);
        setError(getInvokeErrorMessage(err));
        return null;
      }

      let parsed: AIResponse;
      try {
        parsed = parseAIResponseRaw(data?.response || data);
      } catch (parseErr) {
        console.error("[BrandingCoaching] JSON parse error:", parseErr, "raw:", data);
        setError("Réponse inattendue de l'IA. Réessaie.");
        toast.error("Réponse inattendue. Réessaie.");
        return null;
      }

      if (isAIResponseShapeInvalid(parsed)) {
        console.error("[BrandingCoaching] Invalid response shape:", parsed);
        setError("Réponse incomplète de l'IA. Réessaie.");
        toast.error("Réponse incomplète. Réessaie.");
        return null;
      }

      return normalizeAIResponse(parsed);
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
  const lastRetryRef = useRef(0);
  const handleRetry = useCallback(async () => {
    const now = Date.now();
    if (now - lastRetryRef.current < 3000) {
      toast.error("Attends quelques secondes avant de réessayer.");
      return;
    }
    lastRetryRef.current = now;

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

    // Save extracted insights on retry too (was missing entirely). Même
    // garde que dans askAI : un échec d'écriture ne doit pas afficher l'écran
    // "complet" (sinon la fiche croit être remplie alors qu'elle ne l'est pas).
    let insightsPersisted = true;
    if (response.extracted_insights && Object.keys(response.extracted_insights).length > 0) {
      try {
        await saveInsights(section, response.extracted_insights);
      } catch (e) {
        console.error("[BrandingCoaching] Failed to save insights on retry:", e);
        insightsPersisted = false;
        toast.error("Tes réponses sont enregistrées dans la conversation mais la fiche n'a pas pu être mise à jour. Clique sur 'Affiner avec l'IA' pour réessayer.");
      }
    }

    if (response.is_complete && insightsPersisted) {
      setFinalSummary(response.final_summary || "");
      setCompletionPct(100);
      setShowConfetti(true);
      setPhase("complete");
      return;
    }
    setCurrentQuestion(response);
  }, [askAI, completionPct, section]);

  const updateCoveredTopics = useCallback((response: AIResponse) => {
    if (response.covered_topic) {
      const topic = response.covered_topic;
      setCoveredTopics(prev => {
        // Exact match
        if (checklist.includes(topic)) {
          return prev.includes(topic) ? prev : [...prev, topic];
        }
        // Fuzzy: find closest match in checklist
        const match = checklist.find(c =>
          topic.toLowerCase().includes(c.toLowerCase()) ||
          c.toLowerCase().includes(topic.toLowerCase())
        );
        if (match) {
          return prev.includes(match) ? prev : [...prev, match];
        }
        // No match found — still add raw topic to avoid re-asking
        return prev.includes(topic) ? prev : [...prev, topic];
      });
    }
  }, [checklist]);

  const saveDemoAnswer = useCallback((q: DemoCoachingQuestion) => {
    setCompletionPct(q.completion_percentage);
  }, []);

  const startingRef = useRef(false);

  const handleStart = useCallback(async () => {
    // Guard against double-start (React strict mode / double mount)
    if (startingRef.current) return;
    startingRef.current = true;

    // Garde démo : content_series n'est pas dispo en démo
    if (section === "content_series" && isDemoMode) {
      startingRef.current = false;
      toast.info("Pas dispo en mode démo, crée un compte");
      onBack?.();
      return;
    }

    setPhase("coaching");

    try {
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
          // Keep questionIndex in sync so the next answer computes the right step
          // (otherwise it stays at 0 and resets charterStepRef on the next answer).
          setQuestionIndex(userMsgs);
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
        const lastMsg = messagesRef.current[messagesRef.current.length - 1];

        // If the last message is already from the assistant, we already have the pending question
        // No need to call the AI again — just restore it as currentQuestion
        if (lastMsg.role === "assistant") {
          setCurrentQuestion({
            question: lastMsg.content,
            question_type: "textarea",
            placeholder: "Ta réponse...",
            is_complete: false,
            completion_percentage: completionPct,
          });
          return;
        }

        // Last message is from user — AI needs to respond
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
    } finally {
      startingRef.current = false;
    }
  }, [isDemoMode, demoQuestions, hasExistingSession, askAI, updateCoveredTopics, section, completionPct]);

  // Mode focus convictions : on lance directement la mini-session dès que les
  // sujets non-convictions ont été marqués couverts par loadSession (pas d'écran
  // d'intro à cliquer — la carte a déjà servi d'intro).
  const focusStartedRef = useRef(false);
  useEffect(() => {
    if (!isConvictionFocus || isDemoMode || !user) return;
    if (focusStartedRef.current || phase !== "intro") return;
    // Attend que loadSession ait seedé les sujets couverts.
    if (coveredTopics.length === 0) return;
    focusStartedRef.current = true;
    handleStart();
  }, [isConvictionFocus, isDemoMode, user, phase, coveredTopics, handleStart]);

  const handleNext = useCallback(async () => {
    if (loading) return;
    const rawAnswer = currentQuestion?.question_type === "select" || currentQuestion?.question_type === "multi_select"
      ? selectedOptions.join(", ")
      : answer;
    const userAnswer = rawAnswer.trim();
    if (!userAnswer) return;

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

    // Circuit-breaker: force completion after too many questions
    const maxQuestions = checklist.length + 5;
    if (nextIndex >= maxQuestions && !response.is_complete) {
      console.warn(`[BrandingCoaching] Circuit-breaker: ${nextIndex} questions reached, forcing completion`);
      response.is_complete = true;
      response.completion_percentage = 100;
      if (!response.final_summary) {
        response.final_summary = "✅ On a fait le tour ! Ta fiche est remplie avec ce qu'on a couvert ensemble.\n\n💡 Tu peux toujours compléter ou modifier les champs directement dans ta fiche.";
      }
    }

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
    const wsId = workspaceId !== user!.id ? workspaceId : undefined;
    const { data: existingSession } = await (supabase.from("branding_coaching_sessions") as any)
      .select("id").eq(column, value).eq("section", section).maybeSingle();

    // Écrire la fiche (insights) AVANT de marquer la session complète : sinon
    // un échec d'écriture laisse une session "complète" mais une fiche à moitié
    // remplie. On ne passe is_complete=true que si la fiche a bien été persistée.
    let insightsPersisted = true;
    if (response.extracted_insights && Object.keys(response.extracted_insights).length > 0) {
      try {
        await saveInsights(section, response.extracted_insights);
      } catch (e) {
        console.error("[BrandingCoaching] Failed to save insights:", e);
        insightsPersisted = false;
        toast.error("Tes réponses sont enregistrées dans la conversation mais la fiche n'a pas pu être mise à jour. Clique sur 'Affiner avec l'IA' pour réessayer.");
      }
    }
    const markComplete = response.is_complete && insightsPersisted;

    const sessionPayload = {
      user_id: user!.id,
      workspace_id: wsId,
      section,
      messages: updatedMessages as any,
      extracted_data: {
        ...response.extracted_insights,
        completion_percentage: realPct,
        final_summary: response.final_summary,
        covered_topics: newCovered,
      },
      question_count: nextIndex,
      is_complete: markComplete,
      completed_at: markComplete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      covered_topics: newCovered as any,
    };

    try {
      if (existingSession?.id) {
        const { error: saveErr } = await (supabase.from("branding_coaching_sessions") as any)
          .update(sessionPayload).eq("id", existingSession.id);
        if (saveErr) console.error("[BrandingCoaching] Save session error:", saveErr);
      } else {
        const { error: saveErr } = await (supabase.from("branding_coaching_sessions") as any)
          .insert(sessionPayload);
        if (saveErr) console.error("[BrandingCoaching] Save session error:", saveErr);
      }
    } catch (e) {
      console.error("[BrandingCoaching] Save session critical error:", e);
    }

    if (response.is_complete) {
      const completionCtx = { column, value, profileUserId, workspaceId };

      // If storytelling, generate full story
      if (section === "story") {
        await generateAndSaveFullStory(updatedMessages, checklist, completionCtx, fetchContext);
      }

      // If persona, fill missing fields + generate pitches
      if (section === "persona") {
        await completePersonaSection(updatedMessages, checklist, completionCtx, resolvedPersonaIdRef.current, fetchContext);
      }

      setFinalSummary(response.final_summary || "");
      setCompletionPct(100);
      setCoveredTopics(checklist);
      setShowConfetti(true);
      setPhase("complete");
      return;
    }

    setCurrentQuestion(response);
  }, [answer, selectedOptions, currentQuestion, isDemoMode, demoQuestions, askAI, section, user?.id, completionPct, saveDemoAnswer, updateCoveredTopics, checklist, loading]);

  // Ne PAS avaler l'erreur ici : elle doit remonter jusqu'à l'appelant
  // (askAI ci-dessus), qui met insightsPersisted=false et affiche le toast
  // d'échec. Un try/catch local qui se contente de console.error ferait
  // croire au caller que l'écriture a réussi alors qu'elle a échoué.
  const saveInsights = async (sec: string, insights: Record<string, any>) => {
    if (!user) return;
    const ctx = { column, value, profileUserId, workspaceId };
    if (sec === "charter") {
      const savedPayload = await saveCharterInsights(insights, ctx);
      if (savedPayload) {
        charterDataRef.current = { ...charterDataRef.current, ...savedPayload };
      }
    } else if (sec === "persona") {
      const targetPersonaId = await savePersonaInsights(insights, ctx, resolvedPersonaIdRef.current);
      if (targetPersonaId) resolvedPersonaIdRef.current = targetPersonaId;
    } else if (sec === "story") {
      await saveStoryInsights(insights, ctx);
    } else if (sec === "content_strategy") {
      await saveContentStrategyInsights(insights, ctx, queryClient);
    } else if (sec === "content_series") {
      await saveContentSeriesInsights(insights, ctx, queryClient);
    } else {
      await saveDefaultBrandProfileInsights(insights, ctx, queryClient);
    }
    // Always invalidate the global branding data cache so BrandingPage/BrandingSectionPage see fresh data
    queryClient.invalidateQueries({ queryKey: ["branding-data"] });
    queryClient.invalidateQueries({ queryKey: ["branding-completion"] });
  };

  const estimatedTotal = checklist.length || 8;
  const estimatedRemaining = Math.max(0, estimatedTotal - coveredTopics.length);
  const timeRemaining = estimatedRemaining <= 1 ? "Presque fini !" : `Encore ~${Math.ceil(estimatedRemaining * 0.5)} min`;

  // Mode focus convictions : on saute l'écran d'intro (auto-démarrage), on
  // affiche juste un loader le temps que la 1ʳᵉ question arrive.
  if (isConvictionFocus && phase === "intro") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="px-4 pt-4 pb-2">
          <button onClick={onBack || (() => navigate("/branding"))} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Encore 2 questions pour rendre tes idées impossibles à copier…</p>
        </div>
      </div>
    );
  }

  // Intro screen
  if (phase === "intro") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <button onClick={onBack || (() => navigate("/branding"))} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>
          {isDemoMode && (
            <button onClick={() => navigate("/dashboard")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Skip → Voir l'outil rempli
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-lg mx-auto text-center">
          <span className="text-5xl mb-6">{meta.emoji}</span>
          <h1 className="font-display text-2xl font-bold text-foreground mb-3">{meta.title}</h1>
          <p className="text-muted-foreground text-base mb-6 leading-relaxed">{meta.description}</p>

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
        <div className="px-4 pt-4 pb-2">
          <button onClick={onBack || (() => navigate("/branding"))} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>
        </div>
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
                   await (supabase
                    .from("branding_coaching_sessions") as any)
                    .delete()
                    .eq(column, value)
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
                  className="rounded-pill min-w-0 sm:min-w-[200px] w-full sm:w-auto"
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
