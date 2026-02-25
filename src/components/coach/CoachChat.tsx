import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Trash2 } from "lucide-react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { MarkdownText } from "@/components/ui/markdown-text";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUserPlan } from "@/hooks/use-user-plan";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "coach_chat_history";
const SEEN_KEY = "coach_seen";
const TOOLTIP_KEY = "coach_tooltip_shown";
const MAX_MESSAGES = 50;

const PAGE_CONTEXT_MAP: Record<string, string> = {
  "/calendrier": "calendrier-editorial",
  "/contenu": "generateur-contenu",
  "/branding": "branding",
  "/branding/charte": "charte-graphique",
  "/branding/storytelling": "branding-storytelling",
  "/branding/proposition": "proposition-valeur",
  "/branding/persona": "persona-cible",
  "/branding/strategie": "strategie-contenu",
  "/branding/ton": "ton-et-voix",
  "/site": "site-web",
  "/site/accueil": "page-de-vente",
  "/site/optimiser": "optimiseur-page-vente",
  "/site/audit": "audit-site",
  "/seo": "seo",
  "/instagram": "instagram",
  "/instagram/audit": "audit-instagram",
  "/instagram/engagement": "engagement-instagram",
  "/linkedin": "linkedin",
  "/dashboard": "tableau-de-bord",
};

const SUGGESTION_CHIPS = [
  { emoji: "💡", label: "Idée de post pour cette semaine" },
  { emoji: "🔍", label: "Qu'est-ce que je devrais améliorer en priorité ?" },
  { emoji: "✍️", label: "Aide-moi à formuler mon offre" },
  { emoji: "😩", label: "Je sais pas quoi poster" },
];

function getPageContext(pathname: string): string {
  if (PAGE_CONTEXT_MAP[pathname]) return PAGE_CONTEXT_MAP[pathname];
  for (const [prefix, ctx] of Object.entries(PAGE_CONTEXT_MAP)) {
    if (pathname.startsWith(prefix + "/")) return ctx;
  }
  return "navigation-generale";
}

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return parsed.slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessage[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
}

export default function CoachChat() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { plan, usage, refresh: refreshPlan } = useUserPlan();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Quota logic
  const contentUsage = usage?.content;
  const dailyLimit = plan === "free" ? 10 : plan === "outil" ? 50 : plan === "pro" ? 50 : 999;
  const used = contentUsage?.used ?? 0;
  const remaining = Math.max(0, dailyLimit - used);
  const quotaReached = remaining <= 0 && plan !== "now_pilot" && plan !== "studio";

  // Delayed entrance (500ms)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(t);
  }, []);

  // First-visit tooltip
  useEffect(() => {
    if (visible && !localStorage.getItem(TOOLTIP_KEY)) {
      setShowTooltip(true);
      const t = setTimeout(() => {
        setShowTooltip(false);
        localStorage.setItem(TOOLTIP_KEY, "1");
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [visible]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Welcome message
  useEffect(() => {
    if (open && messages.length === 0) {
      const prenom = user?.user_metadata?.first_name || user?.user_metadata?.prenom || "";
      const greeting = prenom ? `Salut ${prenom} ! 👋` : "Salut ! 👋";
      const welcome: ChatMessage = {
        role: "assistant",
        content: `${greeting} Je suis ton coach com'. Pose-moi une question sur ta com', ton contenu, ton branding, ou dis-moi sur quoi tu bloques. Je suis là pour t'aider à avancer.`,
      };
      setMessages([welcome]);
      saveHistory([welcome]);
    }
  }, [open, messages.length, user]);

  // Focus input when opening
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading || quotaReached) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    saveHistory(updated);
    setInput("");
    setLoading(true);

    try {
      const pageContext = getPageContext(location.pathname);
      const { data, error } = await supabase.functions.invoke("coach-chat", {
        body: {
          messages: updated.map((m) => ({ role: m.role, content: m.content })),
          page_context: pageContext,
          workspace_id: activeWorkspace?.id,
        },
      });

      if (error) throw error;

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data?.response || "Désolée, je n'ai pas pu répondre. Réessaie !",
      };
      const final = [...updated, assistantMsg];
      setMessages(final);
      saveHistory(final);
      refreshPlan();
    } catch (e) {
      console.error("coach-chat error:", e);
      const errMsg: ChatMessage = {
        role: "assistant",
        content: "Oups, une erreur est survenue. Réessaie dans quelques instants 🙏",
      };
      const final = [...updated, errMsg];
      setMessages(final);
      saveHistory(final);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, quotaReached, location.pathname, activeWorkspace?.id, refreshPlan]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const resetChat = () => {
    setMessages([]);
    saveHistory([]);
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  if (!user || !visible) return null;

  const showSuggestions = messages.length <= 1 && !loading;

  const chatContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground text-[15px]">💬 Coach Com'</span>
          {dailyLimit < 999 && (
            <span className="text-xs text-muted-foreground">
              {used}/{dailyLimit}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={resetChat}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Nouvelle conversation"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {!isMobile && (
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <ChatBubble key={i} message={msg} onNavigate={(path) => { navigate(path); setOpen(false); }} />
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted text-foreground rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm max-w-[85%]">
              <span className="inline-flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>•</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>•</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>•</span>
              </span>
            </div>
          </div>
        )}

        {/* Suggestions */}
        {showSuggestions && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGGESTION_CHIPS.map((chip) => (
              <button
                key={chip.label}
                onClick={() => sendMessage(`${chip.emoji} ${chip.label}`)}
                className="text-xs bg-rose-pale text-primary rounded-full px-3 py-1.5 hover:bg-rose-soft transition-colors text-left"
                disabled={quotaReached}
              >
                {chip.emoji} {chip.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input / Quota limit */}
      <div className="px-3 py-2 border-t border-border shrink-0">
        {quotaReached ? (
          <div className="text-center py-2 space-y-2">
            <p className="text-xs text-muted-foreground">
              Tu as utilisé tes {dailyLimit} messages du jour. Passe en Pro pour 50 messages/jour 🚀
            </p>
            <Button size="sm" variant="outline" asChild>
              <Link to="/pricing">Voir les plans</Link>
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
              onKeyDown={handleKeyDown}
              placeholder="Pose ta question..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors max-h-[120px]"
              disabled={loading}
            />
            <Button
              size="icon"
              className="shrink-0 h-9 w-9 rounded-xl"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  const floatingButton = (
    <div className="relative">
      <button
        onClick={() => { setOpen(true); setShowTooltip(false); }}
        className={cn(
          "h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-cta flex items-center justify-center hover:-translate-y-px hover:shadow-strong transition-all",
          !localStorage.getItem(SEEN_KEY) && "animate-bounce"
        )}
      >
        <MessageCircle className="h-6 w-6" />
        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-accent border-2 border-background" />
      </button>
      {showTooltip && (
        <div className="absolute bottom-full right-0 mb-2 w-56 bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs text-foreground animate-fade-in">
          Besoin d'aide ? Ton coach com' est là 💬
          <div className="absolute bottom-0 right-5 translate-y-1/2 rotate-45 w-2 h-2 bg-card border-r border-b border-border" />
        </div>
      )}
    </div>
  );

  // Mobile: Sheet from bottom
  if (isMobile) {
    return (
      <>
        {!open && (
          <div className="fixed bottom-20 right-4 z-50">
            {floatingButton}
          </div>
        )}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="h-[85vh] p-0 rounded-t-2xl [&>button:last-child]:hidden">
            <span className="sr-only">Coach Com'</span>
            {chatContent}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Desktop: floating panel
  return (
    <>
      {!open && (
        <div className="fixed bottom-6 right-6 z-50">
          {floatingButton}
        </div>
      )}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] h-[520px] rounded-2xl shadow-xl border border-border bg-background overflow-hidden flex flex-col">
          {chatContent}
        </div>
      )}
    </>
  );
}

/* ── Chat bubble ── */
function ChatBubble({ message, onNavigate }: { message: ChatMessage; onNavigate: (path: string) => void }) {
  const isUser = message.role === "user";
  const content = message.content;

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "rounded-2xl px-4 py-2.5 text-sm max-w-[85%] whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        )}
      >
        {isUser ? content : <CoachMarkdown content={content} onNavigate={onNavigate} />}
      </div>
    </div>
  );
}

/* ── Markdown with clickable internal links ── */
function CoachMarkdown({ content, onNavigate }: { content: string; onNavigate: (path: string) => void }) {
  const parts = content.split(/(\/[a-z][a-z0-9\-\/]*)/g);

  if (parts.length === 1) {
    return <MarkdownText content={content} className="space-y-1.5" />;
  }

  return (
    <span>
      {parts.map((part, i) => {
        if (/^\/[a-z][a-z0-9\-\/]*$/.test(part)) {
          return (
            <button
              key={i}
              onClick={() => onNavigate(part)}
              className="text-primary underline underline-offset-2 hover:text-primary/80 font-medium"
            >
              {part}
            </button>
          );
        }
        return <MarkdownText key={i} content={part} className="inline space-y-1.5" />;
      })}
    </span>
  );
}
