import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Sparkles, PenLine, Palette, Target, CalendarDays, Users, Lightbulb, MessageSquare, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/use-profile";
import { useWorkspaceId, useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useUserPhase } from "@/hooks/use-user-phase";
import { useGuideRecommendation } from "@/hooks/use-guide-recommendation";
import { useCoachingFlow, TONE_OPTIONS, shouldActivateCoaching } from "@/hooks/use-coaching-flow";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LayoutGrid } from "lucide-react";
import { useDemoContext } from "@/contexts/DemoContext";
import AppHeader from "@/components/AppHeader";
import SuggestedContents from "@/components/dashboard/SuggestedContents";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { format, isAfter, subHours, startOfWeek as dateFnsStartOfWeek, endOfWeek as dateFnsEndOfWeek } from "date-fns";
import { fr } from "date-fns/locale";

/* ── Types ── */
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: Suggestion[];
  actions?: ActionLink[];
  toneButtons?: boolean; // special flag for tone selection step
  created_at: string;
}

interface Suggestion {
  icon: string;
  label: string;
}

interface ActionLink {
  icon: string;
  label: string;
  route: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

/* ── Icon resolver ── */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  PenLine, Palette, Target, CalendarDays, Users, Lightbulb, Sparkles, BarChart3,
};

function getIcon(name: string, className?: string) {
  const Icon = ICON_MAP[name] ?? Sparkles;
  return <Icon className={className} />;
}

/** Guess icon for a suggestion label */
function guessIconForSuggestion(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("post") || l.includes("écrire") || l.includes("rédiger") || l.includes("carrousel")) return "PenLine";
  if (l.includes("calendrier") || l.includes("planifier") || l.includes("semaine")) return "CalendarDays";
  if (l.includes("branding") || l.includes("charte") || l.includes("ton")) return "Palette";
  if (l.includes("cliente") || l.includes("persona") || l.includes("cible")) return "Target";
  if (l.includes("idée") || l.includes("idees") || l.includes("trouver")) return "Lightbulb";
  if (l.includes("question") || l.includes("aide") || l.includes("com'")) return "Sparkles";
  return "Sparkles";
}

/* ── Typing indicator ── */
function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-start gap-3 mb-3"
      aria-label="L'assistant rédige une réponse"
      role="status"
    >
      <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold" style={{ backgroundColor: "#fb3d80", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        AC
      </div>
      <div className="bg-white rounded-2xl rounded-tl-lg shadow-[0_1px_4px_rgba(0,0,0,0.06)] px-4 py-3">
        <span className="inline-flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "#fb3d80" }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.25 }}
            />
          ))}
        </span>
      </div>
    </motion.div>
  );
}

/* ── Demo responses ── */
const DEMO_WELCOME_SUGGESTIONS: Suggestion[] = [
  { icon: "PenLine", label: "Créer un post Instagram" },
  { icon: "CalendarDays", label: "Planifier ma semaine" },
  { icon: "Palette", label: "Compléter mon branding" },
];

const DEMO_RESPONSES: Record<string, { content: string; actions?: ActionLink[]; suggestions?: Suggestion[] }> = {
  "Créer un post Instagram": {
    content: "Super idée ! Tu as un bon storytelling et ton persona est défini. Je te propose de créer un post qui parle de ton approche de la photographie portraitiste éthique. Ça montrerait ta différence.",
    actions: [{ route: "/creer", label: "Créer le post", icon: "PenLine" }],
    suggestions: [
      { icon: "Lightbulb", label: "Donne-moi des idées de sujets" },
      { icon: "PenLine", label: "Je préfère un carrousel" },
      { icon: "Sparkles", label: "Autre chose" },
    ],
  },
  "Planifier ma semaine": {
    content: "Bonne idée de passer à l'action ! Je vois que ton calendrier est vide pour le moment. On va prévoir 2-3 posts pour la semaine. *(Pas besoin de poster tous les jours, la régularité compte plus que la quantité.)*",
    actions: [{ route: "/calendrier", label: "Ouvrir le calendrier", icon: "CalendarDays" }],
    suggestions: [
      { icon: "CalendarDays", label: "Combien de posts par semaine ?" },
      { icon: "Lightbulb", label: "Aide-moi à trouver des idées" },
      { icon: "Sparkles", label: "Autre chose" },
    ],
  },
};

const DEMO_FALLBACK = {
  content: "En mode démo, je ne peux pas te répondre en temps réel. Mais dans la vraie version, je t'aurais aidée sur ça ! Essaie une des suggestions ci-dessous.",
  suggestions: DEMO_WELCOME_SUGGESTIONS,
};

/* ── Welcome suggestions (real mode) — fallback only ── */
const FALLBACK_WELCOME_SUGGESTIONS: Suggestion[] = [
  { icon: "PenLine", label: "Je veux créer un post" },
  { icon: "Target", label: "Je veux définir ma cible" },
  { icon: "Palette", label: "Je veux travailler mon branding" },
  { icon: "CalendarDays", label: "Je veux planifier ma semaine" },
  { icon: "Lightbulb", label: "J'ai pas d'idées de contenu" },
];

/** Build personalized welcome suggestions from profile data */
function buildWelcomeSuggestions(profile: any, phase: string): Suggestion[] {
  if (!profile) return FALLBACK_WELCOME_SUGGESTIONS;

  const suggestions: Suggestion[] = [];
  const p = profile as any;
  const activity = p.activite || p.type_activite;
  const pillars: string[] = Array.isArray(p.piliers) ? p.piliers : [];

  if (phase === "construction") {
    if (!p.cible) {
      suggestions.push({ icon: "Target", label: "Définir ma cliente idéale" });
    } else if (!p.probleme_principal) {
      suggestions.push({ icon: "Palette", label: "Poser les bases de mon positionnement" });
    } else {
      suggestions.push({ icon: "PenLine", label: "Créer mon premier contenu" });
    }
    return suggestions.slice(0, 1);
  }

  if (phase === "action") {
    suggestions.push({ icon: "CalendarDays", label: "Planifier mes posts de la semaine" });
    if (activity) {
      const pick = [`Créer un post sur mon métier de ${activity}`, `Écrire un post coulisses`][Math.floor(Math.random() * 2)];
      suggestions.push({ icon: "PenLine", label: pick });
    } else {
      suggestions.push({ icon: "PenLine", label: "Je veux créer un post" });
    }
    if (pillars.length > 0) {
      const pillar = pillars[Math.floor(Math.random() * pillars.length)];
      suggestions.push({ icon: "Lightbulb", label: `Trouver des idées sur "${pillar}"` });
    }
    return suggestions.slice(0, 3);
  }

  // pilotage
  suggestions.push({ icon: "CalendarDays", label: "Préparer la semaine prochaine" });
  suggestions.push({ icon: "Lightbulb", label: "Trouver de nouvelles idées de contenu" });
  suggestions.push({ icon: "Target", label: "Analyser ce qui a marché cette semaine" });
  return suggestions.slice(0, 3);
}

/* ── Component ── */
export default function ChatGuidePage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { isDemoMode } = useDemoContext();
  const navigate = useNavigate();
  const workspaceId = useWorkspaceId();
  const { column, value } = useWorkspaceFilter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { phase, speed, isLoading: phaseLoading } = useUserPhase();
  const { recommendation, profileSummary } = useGuideRecommendation();
  const queryClient = useQueryClient();

  // Coaching flow
  const coaching = useCoachingFlow(phaseLoading ? "construction" : phase, profileSummary.brandingTotal);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string>("");
  const [suggestionsVisible, setSuggestionsVisible] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showOldDivider, setShowOldDivider] = useState(false);

  const firstName = isDemoMode ? "Léa" : ((profile as any)?.prenom || "toi");

  // Week posts for pilotage phase
  const { data: weekPostsData } = useQuery({
    queryKey: ["chat-week-posts", column, value, phase],
    queryFn: async () => {
      const now = new Date();
      const weekStart = format(dateFnsStartOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const weekEnd = format(dateFnsEndOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const { data } = await (supabase.from("calendar_posts") as any)
        .select("id, status, date, theme")
        .eq(column, value)
        .gte("date", weekStart)
        .lte("date", weekEnd);
      return data || [];
    },
    enabled: !!user && phase === "pilotage" && !isDemoMode,
    staleTime: 3 * 60 * 1000,
  });

  // Pending posts for action phase
  const { data: pendingPostsData } = useQuery({
    queryKey: ["chat-pending-posts", column, value, phase],
    queryFn: async () => {
      const { data } = await (supabase.from("calendar_posts") as any)
        .select("id, theme, date, status")
        .eq(column, value)
        .in("status", ["idea", "a_rediger"])
        .order("date", { ascending: true })
        .limit(3);
      return data || [];
    },
    enabled: !!user && phase === "action" && !isDemoMode,
    staleTime: 3 * 60 * 1000,
  });

  // No auto-redirect — chat is now the default /dashboard view

  // Speech recognition
  const { isListening, isSupported: micSupported, toggle: toggleMic } = useSpeechRecognition((text) => {
    setInput((prev) => prev + (prev ? " " : "") + text);
  });

  // Cmd/Ctrl+K to focus input & Escape to close drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        textareaRef.current?.focus();
      }
      if (e.key === "Escape" && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drawerOpen]);

  // Track recent suggestions to avoid repetitions
  const recentSuggestionsRef = useRef<string[]>([]);

  // Welcome message — phase-aware
  const welcomeMessage = useMemo<ChatMessage>(() => {
    if (isDemoMode) {
      return {
        id: "welcome",
        role: "assistant",
        content: "Salut Léa ! 👋\n\nTon branding avance bien. Qu'est-ce qu'on crée aujourd'hui ?",
        suggestions: DEMO_WELCOME_SUGGESTIONS,
        created_at: new Date().toISOString(),
      };
    }

    const hour = new Date().getHours();
    let greeting = "Salut";
    if (hour < 12) greeting = "Bonjour";
    else if (hour < 18) greeting = "Hello";
    else greeting = "Bonsoir";

    const effectivePhase = phaseLoading ? "construction" : phase;

    // ─── Coaching mode welcome ───
    if (coaching.isActive && coaching.step === 0 && !coaching.completed) {
      return {
        id: "welcome",
        role: "assistant",
        content: `${greeting} ${firstName} ! 👋\n\nBravo, ton diagnostic est prêt ! Maintenant j'aimerais te connaître un peu mieux pour personnaliser tout ce que l'outil va créer pour toi. Ça prend 5 minutes et ça va TOUT changer.\n\nOn y va ? 💪`,
        suggestions: [{ icon: "Sparkles", label: "C'est parti !" }],
        created_at: new Date().toISOString(),
      };
    }

    if (effectivePhase === "construction") {
      // Single priority suggestion from guide recommendation
      const mainSuggestion: Suggestion = {
        icon: guessIconForSuggestion(recommendation.ctaLabel),
        label: recommendation.ctaLabel.replace(" →", ""),
      };
      recentSuggestionsRef.current = [mainSuggestion.label];

      return {
        id: "welcome",
        role: "assistant",
        content: `${greeting} ${firstName} ! 👋\n\nOn continue à poser les bases de ta com'. Voici ce que je te propose :`,
        suggestions: [mainSuggestion],
        created_at: new Date().toISOString(),
      };
    }

    if (effectivePhase === "action") {
      const suggestions = buildWelcomeSuggestions(profile, "action");
      // Add pending post suggestion if available
      if (pendingPostsData && pendingPostsData.length > 0) {
        const post = pendingPostsData[0];
        const dateStr = post.date ? format(new Date(post.date), "d MMM", { locale: fr }) : "";
        suggestions.unshift({
          icon: "CalendarDays",
          label: `Rédiger le post prévu${dateStr ? ` pour le ${dateStr}` : ""}`,
        });
      }
      const finalSuggestions = suggestions.slice(0, 3);
      recentSuggestionsRef.current = finalSuggestions.map(s => s.label);

      return {
        id: "welcome",
        role: "assistant",
        content: `${greeting} ${firstName} ! 👋\n\nQu'est-ce qu'on crée aujourd'hui ?`,
        suggestions: finalSuggestions,
        created_at: new Date().toISOString(),
      };
    }

    // Pilotage phase
    const weekPosts = weekPostsData || [];
    const planned = weekPosts.length;
    const published = weekPosts.filter((p: any) => p.status === "published").length;
    const late = weekPosts.filter((p: any) => {
      const postDate = new Date(p.date);
      return postDate < new Date() && p.status !== "published";
    }).length;

    let weekContext: string;
    if (planned === 0) {
      weekContext = "Rien de prévu cette semaine. On planifie ?";
    } else if (published === planned) {
      weekContext = "Semaine bouclée, bravo ! On prépare la suivante ?";
    } else if (late > 0) {
      weekContext = `Tu as ${late} post${late > 1 ? "s" : ""} en retard. On s'en occupe ?`;
    } else {
      weekContext = "On continue sur cette lancée ?";
    }

    const pilotSuggestions: Suggestion[] = [
      { icon: "PenLine", label: "Créer mon prochain post" },
      { icon: "CalendarDays", label: "Planifier la semaine prochaine" },
      { icon: "BarChart3", label: "Analyser mes résultats" },
    ];
    recentSuggestionsRef.current = pilotSuggestions.map(s => s.label);

    return {
      id: "welcome",
      role: "assistant",
      content: `${greeting} ${firstName} ! 👋\n\nTa com' roule bien. Cette semaine : ${planned} post${planned > 1 ? "s" : ""} planifié${planned > 1 ? "s" : ""}, ${published} publié${published > 1 ? "s" : ""}. ${weekContext}`,
      suggestions: pilotSuggestions,
      created_at: new Date().toISOString(),
    };
  }, [firstName, isDemoMode, profile, phase, phaseLoading, recommendation, weekPostsData, pendingPostsData, coaching.isActive, coaching.step, coaching.completed]);

  // ─── Coaching question generator ───
  const getCoachingQuestion = useCallback((step: number): ChatMessage => {
    const base = { id: `coaching-q-${step}`, role: "assistant" as const, created_at: new Date().toISOString() };

    switch (step) {
      case 1:
        return {
          ...base,
          content: `Raconte-moi : pourquoi tu fais ce métier ? Qu'est-ce qui t'a donné envie de te lancer ?\n\n*(Pas besoin d'être long·ue, parle comme tu parlerais à une amie.)*`,
        };
      case 2:
        return {
          ...base,
          content: `Super ! Et ta cliente idéale, elle ressemble à quoi ? Qu'est-ce qui la frustre ? Qu'est-ce qu'elle cherche ?`,
        };
      case 3:
        return {
          ...base,
          content: `Quand tu parles de ton travail, tu es plutôt :`,
          toneButtons: true,
        };
      case 4:
        return {
          ...base,
          content: `Et concrètement, c'est quoi TON objectif numéro 1 pour les 3 prochains mois ? Vendre plus ? Te faire connaître ? Lancer un nouveau truc ?`,
        };
      case 5: {
        const newScore = Math.min(100, Math.round(coaching.initialScore + 25));
        return {
          ...base,
          content: `Nickel ${firstName} ! J'ai tout ce qu'il me faut pour te proposer des contenus qui TE ressemblent. 🎉\n\nTon branding est passé de ${coaching.initialScore}% à ~${newScore}%.\n\nTu veux qu'on crée ton premier contenu ensemble, ou tu préfères que je te prépare des idées pour la semaine ?`,
          suggestions: [
            { icon: "PenLine", label: "Créer mon premier contenu" },
            { icon: "Lightbulb", label: "Prépare-moi des idées" },
          ],
        };
      }
      default:
        return { ...base, content: "C'est parti !" };
    }
  }, [firstName, coaching.initialScore]);

  // Load latest conversation (skip in demo)
  useEffect(() => {
    if (!user || isDemoMode) {
      setLoaded(true);
      return;
    }
    (async () => {
      const { data: convs } = await supabase
        .from("chat_guide_conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (convs && convs.length > 0) {
        const conv = convs[0];
        setConversationId(conv.id);

        const { data: msgs } = await supabase
          .from("chat_guide_messages")
          .select("*")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true });

        if (msgs && msgs.length > 0) {
          setMessages(msgs.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            actions: m.actions || undefined,
            created_at: m.created_at,
          })));
          setSuggestionsVisible(false);

          const lastMsgDate = new Date(msgs[msgs.length - 1].created_at);
          if (!isAfter(lastMsgDate, subHours(new Date(), 24))) {
            setShowOldDivider(true);
          }
        }
      } else {
        const newId = crypto.randomUUID();
        setConversationId(newId);
        const convRow: any = { id: newId, user_id: user.id, title: "Nouvelle conversation" };
        if (workspaceId && workspaceId !== user.id) convRow.workspace_id = workspaceId;
        await supabase.from("chat_guide_conversations").insert(convRow);
      }
      setLoaded(true);
    })();
  }, [user, isDemoMode]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  // Save message to DB
  const saveMessage = useCallback(async (msg: Pick<ChatMessage, "role" | "content"> & { actions?: ActionLink[] }) => {
    if (!user || isDemoMode || !conversationId) return;
    const row: any = {
      user_id: user.id,
      conversation_id: conversationId,
      role: msg.role,
      content: msg.content,
      actions: msg.actions || null,
    };
    if (workspaceId && workspaceId !== user.id) row.workspace_id = workspaceId;
    await supabase.from("chat_guide_messages").insert(row);
    await supabase.from("chat_guide_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  }, [user, conversationId, isDemoMode, workspaceId]);

  // Update conversation title
  const updateConversationTitle = useCallback(async (text: string) => {
    if (!user || isDemoMode || !conversationId) return;
    const title = text.length > 50 ? text.slice(0, 50) + "…" : text;
    await supabase.from("chat_guide_conversations").update({ title }).eq("id", conversationId);
  }, [user, conversationId, isDemoMode]);

  // Demo response handler
  const getDemoResponse = useCallback((text: string): { content: string; actions?: ActionLink[]; suggestions?: Suggestion[] } => {
    const normalised = text.trim();
    if (DEMO_RESPONSES[normalised]) return DEMO_RESPONSES[normalised];
    // Fuzzy match
    const lower = normalised.toLowerCase();
    if (lower.includes("post") || lower.includes("instagram") || lower.includes("créer")) return DEMO_RESPONSES["Créer un post Instagram"];
    if (lower.includes("planifier") || lower.includes("semaine") || lower.includes("calendrier")) return DEMO_RESPONSES["Planifier ma semaine"];
    return DEMO_FALLBACK;
  }, []);

  // Send message
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSuggestionsVisible(false);
    setShowOldDivider(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // ─── Coaching mode handling ───
    if (coaching.isActive && !coaching.completed && coaching.step <= 4) {
      // "C'est parti !" triggers step 1
      if (coaching.step === 0) {
        coaching.markStarted();
        coaching.setStep(1);
        setIsTyping(true);
        await new Promise(r => setTimeout(r, 600));
        setIsTyping(false);
        const q = getCoachingQuestion(1);
        setMessages(prev => [...prev, q]);
        await saveMessage({ role: "user", content: userMsg.content });
        await saveMessage({ role: "assistant", content: q.content });
        return;
      }

      // Process the answer for current step, then ask next question
      setIsTyping(true);
      await saveMessage({ role: "user", content: userMsg.content });

      try {
        await coaching.processAnswer(userMsg.content);
      } catch (e) {
        console.warn("Coaching save error (non-blocking):", e);
        coaching.advance();
      }

      // Invalidate branding queries for fresh data
      queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
      queryClient.invalidateQueries({ queryKey: ["persona"] });
      queryClient.invalidateQueries({ queryKey: ["storytelling"] });

      await new Promise(r => setTimeout(r, 500 + Math.random() * 400));
      setIsTyping(false);

      const nextStep = coaching.step; // already advanced by processAnswer
      const q = getCoachingQuestion(nextStep);
      setMessages(prev => [...prev, q]);
      await saveMessage({ role: "assistant", content: q.content });

      // If step 5 (conclusion), mark complete
      if (nextStep >= 5) {
        coaching.markComplete();
        queryClient.invalidateQueries({ queryKey: ["guide-recommendation"] });
      }
      return;
    }

    // Demo mode: mock response
    if (isDemoMode) {
      setIsTyping(true);
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 600));
      setIsTyping(false);

      const demo = getDemoResponse(userMsg.content);
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: demo.content,
        actions: demo.actions,
        suggestions: demo.suggestions,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      return;
    }

    await saveMessage({ role: "user", content: userMsg.content });

    const isFirstUserMsg = messages.filter(m => m.role === "user").length === 0;
    if (isFirstUserMsg) {
      updateConversationTitle(userMsg.content);
    }

    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));

    setIsTyping(true);
    try {
      const { data, error } = await supabase.functions.invoke("chat-guide", {
        body: {
          message: userMsg.content,
          conversationHistory: history,
          workspaceId: workspaceId !== user?.id ? workspaceId : undefined,
        },
      });

      setIsTyping(false);
      if (error) throw error;

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply || "Hmm, je n'ai pas compris. Reformule ?",
        actions: data.actions || [],
        suggestions: data.suggestions ? data.suggestions
          .filter((s: string) => !recentSuggestionsRef.current.includes(s))
          .map((s: string) => ({ icon: guessIconForSuggestion(s), label: s }))
          : undefined,
        created_at: new Date().toISOString(),
      };

      // Track recent suggestions (keep last 5)
      if (data.suggestions) {
        recentSuggestionsRef.current = [
          ...data.suggestions.slice(0, 3),
          ...recentSuggestionsRef.current,
        ].slice(0, 5);
      }

      setMessages((prev) => [...prev, aiMsg]);
      await saveMessage({ role: "assistant", content: aiMsg.content, actions: aiMsg.actions });
    } catch (err) {
      console.error("Chat guide error:", err);
      setIsTyping(false);

      const fallbackMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Je suis un peu dans les choux là... Réessaie dans quelques secondes !",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    }
  }, [saveMessage, messages, workspaceId, user, updateConversationTitle, isDemoMode, getDemoResponse, coaching, getCoachingQuestion, queryClient]);

  // Handle keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  // New conversation
  const startNewConversation = useCallback(async () => {
    const newId = crypto.randomUUID();
    setMessages([]);
    setConversationId(newId);
    setSuggestionsVisible(true);
    setShowOldDivider(false);
    if (!isDemoMode && user) {
      const convRow: any = { id: newId, user_id: user.id, title: "Nouvelle conversation" };
      if (workspaceId && workspaceId !== user.id) convRow.workspace_id = workspaceId;
      await supabase.from("chat_guide_conversations").insert(convRow);
    }
  }, [user, isDemoMode, workspaceId]);

  // Load conversations for drawer
  const loadConversations = useCallback(async () => {
    if (!user || isDemoMode) return;
    const { data } = await supabase
      .from("chat_guide_conversations")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(30);
    if (data) setConversations(data);
  }, [user, isDemoMode]);

  // Load a specific conversation
  const loadConversation = useCallback(async (conv: Conversation) => {
    setConversationId(conv.id);
    setDrawerOpen(false);
    setShowOldDivider(false);

    const { data: msgs } = await supabase
      .from("chat_guide_messages")
      .select("*")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });

    if (msgs && msgs.length > 0) {
      setMessages(msgs.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        actions: m.actions || undefined,
        created_at: m.created_at,
      })));
      setSuggestionsVisible(false);
    } else {
      setMessages([]);
      setSuggestionsVisible(true);
    }
  }, []);

  // All messages including welcome
  const allMessages = useMemo(() => {
    if (showOldDivider && messages.length > 0) {
      return [...messages, { ...welcomeMessage, id: "welcome-new" }];
    }
    return [welcomeMessage, ...messages];
  }, [welcomeMessage, messages, showOldDivider]);

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <AppHeader />

      <div className="flex-1 flex flex-col mx-auto w-full max-w-[720px]">
        {/* ─── Chat header ─── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-semibold flex-shrink-0 bg-primary"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              AC
            </div>
            <span
              className="text-base font-semibold text-foreground"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 16 }}
            >
              Ton Assistant Com'
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {!isDemoMode && (
              <button
                onClick={() => { loadConversations(); setDrawerOpen(true); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                title="Historique des conversations"
                aria-label="Ouvrir l'historique des conversations"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Historique</span>
              </button>
            )}
            <button
              onClick={startNewConversation}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              title="Nouvelle conversation"
              aria-label="Démarrer une nouvelle conversation"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nouveau</span>
            </button>
            <Link
              to="/dashboard/complet"
              className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              <LayoutGrid className="h-3 w-3" />
              <span className="hidden sm:inline">Tableau de bord</span>
            </Link>
          </div>
        </div>

        {/* ─── Messages zone ─── */}
        <div
          className="flex-1 overflow-y-auto px-4 py-5 space-y-3"
          role="log"
          aria-live="polite"
          aria-label="Messages du chat"
        >
          <AnimatePresence mode="popLayout">
            {allMessages.map((msg) => (
              <div key={msg.id}>
                {/* Date divider for old conversations */}
                {showOldDivider && msg.id === "welcome-new" && (
                  <div className="flex items-center gap-3 my-4" aria-hidden="true">
                    <div className="flex-1 h-px bg-border/50" />
                    <span className="text-xs text-muted-foreground" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
                      Aujourd'hui
                    </span>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    "flex gap-3 mb-3",
                    msg.role === "user" ? "justify-end" : "items-start"
                  )}
                  aria-label={`${msg.role === "assistant" ? "Assistant" : "Vous"} : ${msg.content}`}
                >
                  {/* Assistant avatar */}
                  {msg.role === "assistant" && (
                    <div
                      className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold mt-0.5 bg-primary"
                      style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
                      aria-hidden="true"
                    >
                      AC
                    </div>
                  )}

                  <div className={cn("max-w-[85%]", msg.role === "user" ? "ml-auto" : "")}>
                    {/* Bubble */}
                    <div
                      className={cn(
                        "px-4 py-3 whitespace-pre-wrap",
                        msg.role === "user"
                          ? "text-primary-foreground rounded-2xl rounded-tr-lg bg-primary"
                          : "bg-background rounded-2xl rounded-tl-lg shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                      )}
                      style={{
                        fontFamily: "'IBM Plex Sans', sans-serif",
                        fontSize: 15,
                        lineHeight: "1.55",
                      }}
                    >
                      {msg.content}
                    </div>

                    {/* Action links */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {msg.actions.map((action, i) => (
                          <button
                            key={i}
                            onClick={() => {
                               const validRoutes = [
                                "/creer", "/calendrier", "/branding", "/branding/storytelling",
                                "/branding/persona", "/branding/proposition", "/branding/ton",
                                "/branding/strategie", "/branding/charter",
                                "/instagram/profil/bio", "/instagram/carousel", "/instagram/reels",
                                "/instagram/stories", "/instagram/audit", "/instagram/stats",
                                "/instagram/routine", "/instagram/profil",
                                "/linkedin", "/linkedin/post", "/linkedin/audit",
                                "/plan", "/contacts", "/atelier", "/transformer",
                                "/dashboard", "/profil", "/site", "/seo",
                              ];
                              const baseRoute = action.route.split("?")[0];
                              if (validRoutes.includes(baseRoute) || validRoutes.some(r => baseRoute.startsWith(r + "/"))) {
                                navigate(action.route);
                              } else {
                                console.warn("Route inconnue dans le chat:", action.route);
                                navigate("/creer");
                                toast("La page demandée n'existe pas encore, voici les options disponibles.");
                              }
                            }}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-primary/10 text-primary hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
                          >
                            {getIcon(action.icon, "h-4 w-4")}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Tone buttons (coaching step 3) */}
                    {msg.toneButtons && (
                      <div className="flex flex-col gap-2 mt-3">
                        {TONE_OPTIONS.map((tone, i) => (
                          <motion.button
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, delay: i * 0.08 }}
                            onClick={() => sendMessage(`${tone.emoji} ${tone.label}`)}
                            className="flex items-center gap-3 bg-background border border-primary/20 rounded-xl px-4 py-3 text-sm transition-all hover:border-primary/50 hover:shadow-sm hover:-translate-y-0.5 text-left focus:outline-none focus:ring-2 focus:ring-primary/30"
                            style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
                          >
                            <span className="text-lg">{tone.emoji}</span>
                            <span className="text-foreground">{tone.label}</span>
                          </motion.button>
                        ))}
                      </div>
                    )}

                    {/* Suggestions */}
                    {msg.suggestions && (msg.id.startsWith("welcome") ? suggestionsVisible : true) && (
                      <div className="flex flex-nowrap sm:flex-wrap gap-2 mt-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                        {msg.suggestions.map((sug, i) => (
                          <motion.button
                            key={i}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: i * 0.05 }}
                            onClick={() => sendMessage(sug.label)}
                            className="inline-flex items-center gap-2 bg-background border border-primary/30 rounded-xl px-3 py-2.5 text-sm transition-all hover:shadow-sm hover:-translate-y-0.5 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
                          >
                            {getIcon(sug.icon, "h-4 w-4 text-primary")}
                            <span className="text-foreground whitespace-nowrap">{sug.label}</span>
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            ))}
          </AnimatePresence>

          {isTyping && <TypingIndicator />}

          {/* Suggested contents for construction/speed 1 users */}
          {(phase === "construction" || speed === 1) && messages.length === 0 && (
            <SuggestedContents />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ─── Input zone (sticky bottom) ─── */}
        <div className="sticky bottom-0 bg-background border-t border-border/30 px-4 py-3">
          <div className="flex items-end gap-2">
            {micSupported && (
              <button
                onClick={toggleMic}
                className={cn(
                  "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                  isListening
                    ? "bg-destructive/10 text-destructive animate-pulse"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
                title={isListening ? "Arrêter la dictée" : "Dicter (micro)"}
                aria-label={isListening ? "Arrêter la dictée vocale" : "Activer la dictée vocale"}
                aria-pressed={isListening}
              >
                {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
            )}

            <label htmlFor="chat-input" className="sr-only">Message pour l'assistant</label>
            <textarea
              id="chat-input"
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={phase === "construction" ? "Ou dis-moi ce que tu préfères faire..." : phase === "action" ? "Demande-moi n'importe quoi sur ta com'..." : "Une question, une idée, un doute ?"}
              rows={1}
              className="flex-1 resize-none border border-border/50 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all bg-muted/20"
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontSize: 15,
                maxHeight: 120,
                lineHeight: "1.4",
              }}
              aria-label="Message pour l'assistant"
            />

            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              className={cn(
                "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all text-primary-foreground bg-primary",
                input.trim()
                  ? "opacity-100 hover:opacity-90"
                  : "opacity-40 cursor-not-allowed"
              )}
              title="Envoyer"
              aria-label="Envoyer le message"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Conversation history drawer ─── */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="flex items-center justify-between">
            <DrawerTitle style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
              Conversations
            </DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6 space-y-1">
            {conversations.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Aucune conversation</p>
            )}
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv)}
                className={cn(
                  "w-full text-left px-3 py-3 rounded-xl transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30",
                  conv.id === conversationId && "bg-muted/70"
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-sm font-medium text-foreground truncate max-w-[70%]"
                    style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
                  >
                    {conv.title}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {format(new Date(conv.updated_at), "d MMM", { locale: fr })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
