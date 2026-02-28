import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Send, Mic, MicOff, X, ArrowRight } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserPhase } from "@/hooks/use-user-phase";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/* ── Page context map ── */
const PAGE_CONTEXT: Record<string, string> = {
  "/branding": "son branding global",
  "/branding/persona": "son persona (client·e idéal·e)",
  "/branding/storytelling": "son storytelling de marque",
  "/branding/proposition": "sa proposition de valeur",
  "/branding/ton": "son ton & style de communication",
  "/branding/strategie": "sa stratégie de contenu",
  "/branding/offres": "ses offres",
  "/branding/charter": "sa charte graphique",
  "/branding/coaching": "un coaching branding IA",
  "/branding/simple/story": "son histoire de marque (mode simple)",
  "/branding/simple/persona": "son persona (mode simple)",
  "/branding/simple/proposition": "sa proposition de valeur (mode simple)",
  "/branding/simple/tone": "son ton de marque (mode simple)",
  "/creer": "la création de contenu",
  "/calendrier": "son calendrier éditorial",
  "/idees": "ses idées de contenu",
  "/mon-plan": "son plan de communication",
  "/audit-instagram": "son audit Instagram",
  "/audit-site": "son audit de site web",
  "/canal/instagram": "sa stratégie Instagram",
  "/canal/linkedin": "sa stratégie LinkedIn",
  "/canal/pinterest": "sa stratégie Pinterest",
  "/canal/newsletter": "sa newsletter",
  "/site": "son site web",
  "/accompagnement": "son accompagnement coaching",
  "/profil": "son profil",
};

function getPageContext(pathname: string): string {
  // Exact match first
  if (PAGE_CONTEXT[pathname]) return PAGE_CONTEXT[pathname];
  // Prefix match
  for (const [path, ctx] of Object.entries(PAGE_CONTEXT)) {
    if (pathname.startsWith(path)) return ctx;
  }
  return "l'application";
}

interface MiniMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function FloatingChatButton() {
  const { user } = useAuth();
  const { speed } = useUserPhase();
  const location = useLocation();
  const navigate = useNavigate();
  const workspaceId = useWorkspaceId();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<MiniMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { isListening, isSupported: micSupported, toggle: toggleMic } = useSpeechRecognition((text) => {
    setInput((prev) => prev + (prev ? " " : "") + text);
  });

  // Hide conditions
  const hiddenRoutes = ["/dashboard", "/dashboard/guide", "/onboarding", "/welcome", "/login", "/signup"];
  const isHidden = hiddenRoutes.some(r => location.pathname === r || location.pathname.startsWith(r + "/"));
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const shouldHide = !user || speed < 2 || isHidden || isMobile;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollToBottom, [messages, isTyping, scrollToBottom]);

  const pageContext = getPageContext(location.pathname);

  // Don't render if hidden
  if (shouldHide) return null;

  const sendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;

    const userMsg: MiniMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));

    // Prepend page context to first message
    const contextPrefix = messages.length === 0
      ? `[Contexte : l'utilisatrice est sur la page "${location.pathname}" et travaille sur ${pageContext}]\n\n`
      : "";

    setIsTyping(true);
    try {
      const { data, error } = await supabase.functions.invoke("chat-guide", {
        body: {
          message: contextPrefix + userMsg.content,
          conversationHistory: history,
          workspaceId: workspaceId !== user?.id ? workspaceId : undefined,
        },
      });

      setIsTyping(false);
      if (error) throw error;

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply || "Hmm, je n'ai pas compris. Reformule ?",
        },
      ]);
    } catch {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Je suis un peu dans les choux là... Réessaie !",
        },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-50 flex items-center justify-center transition-all hover:scale-105"
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              backgroundColor: "#fb3d80",
              boxShadow: "0 4px 16px rgba(145, 1, 75, 0.25)",
            }}
            aria-label="Ouvrir l'assistant"
          >
            <MessageCircle className="h-6 w-6 text-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-[400px] max-w-full p-0 flex flex-col"
          style={{ maxWidth: "100vw" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <h2
              className="text-base text-foreground"
              style={{ fontFamily: "'Libre Baskerville', serif" }}
            >
              Ton assistant com'
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  setTimeout(() => navigate("/dashboard"), 100);
                }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                Ouvrir en grand
                <ArrowRight className="h-3 w-3" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted/50 transition-colors"
                aria-label="Fermer"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <p
                  className="text-sm text-muted-foreground"
                  style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
                >
                  Pose-moi une question sur {pageContext} !
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "flex gap-2",
                  msg.role === "user" ? "justify-end" : "items-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div
                    className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-[10px] font-semibold bg-primary"
                    style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
                  >
                    AC
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] px-3 py-2 text-sm whitespace-pre-wrap",
                    msg.role === "user"
                      ? "text-primary-foreground rounded-2xl rounded-tr-lg bg-primary"
                      : "bg-muted/40 rounded-2xl rounded-tl-lg"
                  )}
                  style={{
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    fontSize: 14,
                    lineHeight: "1.5",
                  }}
                >
                  {msg.content}
                </div>
              </motion.div>
            ))}

            {isTyping && (
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-[10px] font-semibold bg-primary">
                  AC
                </div>
                <div className="bg-muted/40 rounded-2xl rounded-tl-lg px-4 py-3">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" />
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0.15s" }} />
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0.3s" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border/30 px-3 py-3">
            <div className="flex items-end gap-2">
              {micSupported && (
                <button
                  onClick={toggleMic}
                  className={cn(
                    "flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors",
                    isListening
                      ? "bg-destructive/10 text-destructive animate-pulse"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground"
                  )}
                  aria-label={isListening ? "Arrêter la dictée" : "Dicter"}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pose ta question..."
                rows={1}
                className="flex-1 resize-none border border-border/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-muted/20"
                style={{
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  fontSize: 14,
                  maxHeight: 80,
                }}
              />

              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isTyping}
                className={cn(
                  "flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all text-primary-foreground",
                  input.trim() && !isTyping
                    ? "bg-primary hover:opacity-90"
                    : "bg-muted text-muted-foreground"
                )}
                aria-label="Envoyer"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
