import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, ArrowRight, Plus, Sparkles, PenLine, Palette, Target, CalendarDays, Users, Lightbulb, MessageSquare, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/use-profile";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { supabase } from "@/integrations/supabase/client";
import { DashboardViewToggle, getDashboardPreference } from "@/components/dashboard/DashboardViewToggle";
import { useDemoContext } from "@/contexts/DemoContext";
import AppHeader from "@/components/AppHeader";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { format, isAfter, subHours } from "date-fns";
import { fr } from "date-fns/locale";

/* ── Types ── */
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: Suggestion[];
  actions?: ActionLink[];
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
  PenLine, Palette, Target, CalendarDays, Users, Lightbulb, Sparkles,
};

function getIcon(name: string, className?: string) {
  const Icon = ICON_MAP[name] ?? Sparkles;
  return <Icon className={className} />;
}

/* ── Typing indicator ── */
function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-start gap-3 mb-3"
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

/* ── Welcome suggestions ── */
const WELCOME_SUGGESTIONS: Suggestion[] = [
  { icon: "PenLine", label: "Je veux créer un post" },
  { icon: "Target", label: "Je veux définir ma cible" },
  { icon: "Palette", label: "Je veux travailler mon branding" },
  { icon: "CalendarDays", label: "Je veux planifier ma semaine" },
  { icon: "Lightbulb", label: "J'ai pas d'idées de contenu" },
];

/* ── Component ── */
export default function ChatGuidePage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { isDemoMode } = useDemoContext();
  const navigate = useNavigate();
  const workspaceId = useWorkspaceId();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string>("");
  const [suggestionsVisible, setSuggestionsVisible] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showOldDivider, setShowOldDivider] = useState(false);

  const firstName = (profile as any)?.prenom || "toi";

  // Redirect if preference is complete dashboard
  useEffect(() => {
    if (!isDemoMode && getDashboardPreference() === "complete") {
      navigate("/dashboard/complet", { replace: true });
    }
  }, [isDemoMode, navigate]);

  // Speech recognition
  const { isListening, isSupported: micSupported, toggle: toggleMic } = useSpeechRecognition((text) => {
    setInput((prev) => prev + (prev ? " " : "") + text);
  });

  // Welcome message
  const welcomeMessage = useMemo<ChatMessage>(() => {
    const hour = new Date().getHours();
    let greeting = "Salut";
    if (hour < 12) greeting = "Bonjour";
    else if (hour < 18) greeting = "Hello";
    else greeting = "Bonsoir";

    return {
      id: "welcome",
      role: "assistant",
      content: `${greeting} ${firstName} ! 👋\n\nJe suis ton Assistant Com'. Dis-moi ce que tu veux faire aujourd'hui, ou choisis une suggestion ci-dessous.`,
      suggestions: WELCOME_SUGGESTIONS,
      created_at: new Date().toISOString(),
    };
  }, [firstName]);

  // Load latest conversation
  useEffect(() => {
    if (!user) return;
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

          // Check if conversation is older than 24h
          const lastMsgDate = new Date(msgs[msgs.length - 1].created_at);
          if (!isAfter(lastMsgDate, subHours(new Date(), 24))) {
            setShowOldDivider(true);
          }
        }
      } else {
        // No conversation yet, create one
        const newId = crypto.randomUUID();
        setConversationId(newId);
        if (!isDemoMode) {
          const convRow: any = { id: newId, user_id: user.id, title: "Nouvelle conversation" };
          if (workspaceId && workspaceId !== user.id) convRow.workspace_id = workspaceId;
          await supabase.from("chat_guide_conversations").insert(convRow);
        }
      }
      setLoaded(true);
    })();
  }, [user]);

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
    // Update conversation updated_at
    await supabase.from("chat_guide_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  }, [user, conversationId, isDemoMode, workspaceId]);

  // Update conversation title from first user message
  const updateConversationTitle = useCallback(async (text: string) => {
    if (!user || isDemoMode || !conversationId) return;
    const title = text.length > 50 ? text.slice(0, 50) + "…" : text;
    await supabase.from("chat_guide_conversations").update({ title }).eq("id", conversationId);
  }, [user, conversationId, isDemoMode]);

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

    await saveMessage({ role: "user", content: userMsg.content });

    // Update title if first user message in conversation
    const isFirstUserMsg = messages.filter(m => m.role === "user").length === 0;
    if (isFirstUserMsg) {
      updateConversationTitle(userMsg.content);
    }

    // Build conversation history (last 10 messages)
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
        suggestions: data.suggestions ? data.suggestions.map((s: string) => ({ icon: "Sparkles", label: s })) : undefined,
        created_at: new Date().toISOString(),
      };

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
  }, [saveMessage, messages, workspaceId, user, updateConversationTitle]);

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
    if (!user) return;
    const { data } = await supabase
      .from("chat_guide_conversations")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(30);
    if (data) setConversations(data);
  }, [user]);

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
    const result: ChatMessage[] = [];
    // If old divider, show old messages, then divider, then welcome
    if (showOldDivider && messages.length > 0) {
      return [...messages, { ...welcomeMessage, id: "welcome-new" }];
    }
    return [welcomeMessage, ...messages];
  }, [welcomeMessage, messages, showOldDivider]);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#FAFAFA" }}>
      <AppHeader />

      <div className="flex-1 flex flex-col mx-auto w-full" style={{ maxWidth: 720 }}>
        {/* ─── Chat header ─── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
              style={{ backgroundColor: "#fb3d80", fontFamily: "'IBM Plex Sans', sans-serif" }}
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => { loadConversations(); setDrawerOpen(true); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              title="Historique"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Historique</span>
            </button>
            <button
              onClick={startNewConversation}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              title="Nouvelle conversation"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nouveau</span>
            </button>
            <DashboardViewToggle current="guide" />
            <Link
              to="/dashboard/complet"
              className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              Voir tous les outils
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* ─── Messages zone ─── */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
          <AnimatePresence mode="popLayout">
            {allMessages.map((msg, idx) => (
              <div key={msg.id}>
                {/* Date divider for old conversations */}
                {showOldDivider && msg.id === "welcome-new" && (
                  <div className="flex items-center gap-3 my-4">
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
                >
                  {/* Assistant avatar */}
                  {msg.role === "assistant" && (
                    <div
                      className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold mt-0.5"
                      style={{ backgroundColor: "#fb3d80", fontFamily: "'IBM Plex Sans', sans-serif" }}
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
                          ? "text-white rounded-2xl rounded-tr-lg"
                          : "bg-white rounded-2xl rounded-tl-lg shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                      )}
                      style={{
                        fontFamily: "'IBM Plex Sans', sans-serif",
                        fontSize: 15,
                        lineHeight: "1.55",
                        ...(msg.role === "user" ? { backgroundColor: "#fb3d80" } : {}),
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
                            onClick={() => navigate(action.route)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
                            style={{
                              backgroundColor: "rgba(251, 61, 128, 0.1)",
                              color: "#fb3d80",
                              fontFamily: "'IBM Plex Sans', sans-serif",
                            }}
                          >
                            {getIcon(action.icon, "h-4 w-4")}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Suggestions */}
                    {msg.suggestions && suggestionsVisible && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {msg.suggestions.map((sug, i) => (
                          <button
                            key={i}
                            onClick={() => sendMessage(sug.label)}
                            className="inline-flex items-center gap-2 bg-white border rounded-xl px-3 py-2.5 text-sm transition-all hover:shadow-sm hover:-translate-y-0.5"
                            style={{
                              borderColor: "#ffa7c6",
                              fontFamily: "'IBM Plex Sans', sans-serif",
                            }}
                          >
                            {getIcon(sug.icon, "h-4 w-4 text-primary")}
                            <span className="text-foreground">{sug.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            ))}
          </AnimatePresence>

          {isTyping && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* ─── Input zone (sticky bottom) ─── */}
        <div className="sticky bottom-0 bg-white border-t border-border/30 px-4 py-3">
          <div className="flex items-end gap-2">
            {micSupported && (
              <button
                onClick={toggleMic}
                className={cn(
                  "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                  isListening
                    ? "bg-red-100 text-red-500"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
                title={isListening ? "Arrêter la dictée" : "Dicter"}
              >
                {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Dis-moi ce que tu veux faire..."
              rows={1}
              className="flex-1 resize-none border border-border/50 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all bg-muted/20"
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontSize: 15,
                maxHeight: 120,
                lineHeight: "1.4",
              }}
            />

            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              className={cn(
                "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all text-white",
                input.trim()
                  ? "opacity-100 hover:opacity-90"
                  : "opacity-40 cursor-not-allowed"
              )}
              style={{ backgroundColor: "#fb3d80" }}
              title="Envoyer"
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
                  "w-full text-left px-3 py-3 rounded-xl transition-colors hover:bg-muted/50",
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
