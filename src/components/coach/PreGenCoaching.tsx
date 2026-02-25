import { useState, useRef, useEffect, useCallback } from "react";
import { Send, SkipForward, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MarkdownText } from "@/components/ui/markdown-text";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface PreGenBrief {
  summary: string;
  answers: Record<string, string>;
  detected_tone?: string;
  detected_angle?: string;
}

interface PreGenCoachingProps {
  generationType: "about-page" | "sales-page" | "content" | "carousel";
  onComplete: (brief: PreGenBrief) => void;
  onSkip: () => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const WELCOME_MESSAGES: Record<string, string> = {
  "about-page": "Avant de rédiger ta page À propos, j'ai quelques questions pour que le texte te ressemble vraiment. C'est rapide, promis. 😊",
  "sales-page": "On va cadrer ta page de vente. 3 questions pour que l'IA tape juste.",
  content: "Avant de créer ton contenu, dis-moi un peu plus sur ce que tu veux transmettre.",
  carousel: "Avant de créer ton carrousel, quelques questions rapides pour cadrer le contenu. 🎯",
};

const BRIEF_MARKER = "[BRIEF_COMPLETE]";

export default function PreGenCoaching({ generationType, onComplete, onSkip }: PreGenCoachingProps) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [briefReady, setBriefReady] = useState(false);
  const [briefSummary, setBriefSummary] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Init welcome message
  useEffect(() => {
    const welcome: ChatMessage = {
      role: "assistant",
      content: WELCOME_MESSAGES[generationType] || WELCOME_MESSAGES.content,
    };
    setMessages([welcome]);
  }, [generationType]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input
  useEffect(() => {
    if (!briefReady && inputRef.current) {
      inputRef.current.focus();
    }
  }, [briefReady, messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("coach-chat", {
        body: {
          messages: updated.map((m) => ({ role: m.role, content: m.content })),
          page_context: `pre-gen-${generationType}`,
          workspace_id: workspaceId,
          mode: "pre-gen",
          generation_type: generationType,
        },
      });

      if (error) throw error;

      const responseText = data?.response || "Désolée, je n'ai pas pu répondre. Réessaie !";
      const assistantMsg: ChatMessage = { role: "assistant", content: responseText };
      const final = [...updated, assistantMsg];
      setMessages(final);

      // Check for brief completion marker
      if (responseText.includes(BRIEF_MARKER)) {
        const cleanedContent = responseText.replace(BRIEF_MARKER, "").trim();
        setBriefSummary(cleanedContent);
        setBriefReady(true);
        // Update last message without marker
        final[final.length - 1] = { role: "assistant", content: cleanedContent };
        setMessages([...final]);
      }
    } catch (e) {
      console.error("pre-gen coaching error:", e);
      const errMsg: ChatMessage = {
        role: "assistant",
        content: "Oups, une erreur est survenue. Réessaie 🙏",
      };
      setMessages([...updated, errMsg]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, workspaceId, generationType]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 100) + "px";
  };

  const handleComplete = () => {
    // Build brief from user answers
    const userAnswers: Record<string, string> = {};
    let qIndex = 0;
    messages.forEach((m) => {
      if (m.role === "user") {
        qIndex++;
        userAnswers[`q${qIndex}`] = m.content;
      }
    });

    onComplete({
      summary: briefSummary,
      answers: userAnswers,
    });
  };

  const handleAdjust = () => {
    setBriefReady(false);
    setAdjusting(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const initials = user?.user_metadata?.first_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U";

  return (
    <div className="rounded-2xl border border-border bg-muted/30 overflow-hidden">
      {/* Messages area */}
      <div ref={scrollRef} className="overflow-y-auto px-4 py-4 space-y-3" style={{ maxHeight: 400 }}>
        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          return (
            <div key={i} className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
              {!isUser && (
                <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">💬</AvatarFallback>
                </Avatar>
              )}
              <div
                className={cn(
                  "rounded-2xl px-3.5 py-2 text-sm max-w-[80%]",
                  isUser
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-card border border-border text-foreground rounded-bl-sm"
                )}
              >
                {isUser ? msg.content : <MarkdownText content={msg.content} className="space-y-1.5" />}
              </div>
              {isUser && (
                <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                  <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-bold">{initials}</AvatarFallback>
                </Avatar>
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-2 justify-start">
            <Avatar className="h-7 w-7 shrink-0 mt-0.5">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">💬</AvatarFallback>
            </Avatar>
            <div className="bg-card border border-border text-foreground rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm">
              <span className="inline-flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>•</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>•</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>•</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Brief ready state */}
      {briefReady && !adjusting && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleComplete} className="gap-1.5 rounded-pill">
              <Check className="h-4 w-4" /> C'est bon, on y va !
            </Button>
            <Button variant="outline" onClick={handleAdjust} className="gap-1.5 rounded-pill">
              <Pencil className="h-4 w-4" /> Ajuster
            </Button>
          </div>
        </div>
      )}

      {/* Input area */}
      {!briefReady && (
        <div className="px-3 py-2 border-t border-border">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
              onKeyDown={handleKeyDown}
              placeholder="Ta réponse..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors max-h-[100px]"
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
        </div>
      )}

      {/* Skip link */}
      <div className="px-4 pb-3 pt-1">
        <button
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          <SkipForward className="h-3 w-3" /> Passer le coaching →
        </button>
      </div>
    </div>
  );
}
