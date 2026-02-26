import { useState, useRef, useEffect, useCallback } from "react";
import { X, Minus, Send, Loader2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useUserPlan } from "@/hooks/use-user-plan";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: ActionResult[] | null;
  pending_actions?: any[] | null;
}

interface ActionResult {
  action: string;
  success: boolean;
  field?: string;
  error?: string;
}

const SUGGESTIONS: Record<string, string[]> = {
  "/dashboard": [
    "📊 Comment améliorer ma visibilité cette semaine ?",
    "🎯 Quel type de contenu prioriser en ce moment ?",
  ],
  "/branding": [
    "✏️ Reformuler mon positionnement",
    "🎯 Est-ce que ma cible est bien définie ?",
  ],
  "/calendrier": [
    "📅 Planifie 3 posts pour la semaine prochaine",
    "⚖️ Mon calendrier est-il bien équilibré ?",
  ],
  "/instagram": [
    "📝 Analyse ma bio et propose des améliorations",
    "🔍 Qu'est-ce que je pourrais améliorer sur mon profil ?",
  ],
  "/creer": [
    "🤔 Quel format choisir pour mon prochain contenu ?",
    "💡 Aide-moi à trouver un angle original",
  ],
  "/linkedin": [
    "💼 Comment optimiser ma présence LinkedIn ?",
    "📊 Quel type de post fonctionne le mieux sur LinkedIn ?",
  ],
};

function getSuggestions(pathname: string): string[] {
  for (const [prefix, items] of Object.entries(SUGGESTIONS)) {
    if (pathname.startsWith(prefix)) return items;
  }
  return ["🤔 Par où commencer avec ma com' ?", "💡 Aide-moi à définir ma priorité"];
}

const WELCOME_DEFAULT = `Hey ! Je suis ton GPS com'. Je connais ton branding, tes offres et ta cible.\n\nJe peux t'aider à :\n· Répondre à tes questions stratégiques\n· Modifier ton branding ou tes offres\n· Planifier des posts dans ton calendrier\n· Analyser et améliorer ta com'\n\nPour créer du contenu, je te redirigerai vers les outils dédiés (c'est là que la magie opère ✨).`;

const WELCOME_PILOT = `Hey ! Accompagnement Binôme 🤝\nPose-moi une question ou dis-moi ce que tu veux changer.\n\nPour les questions stratégiques, écris à Laetitia sur WhatsApp.\n\nExemples :\n· "Reformule ma bio"\n· "Planifie 3 posts pour la semaine"\n· "Analyse mes stats de la semaine"`;

function renderAssistantMessage(content: string, navigate: ReturnType<typeof useNavigate>) {
  const parts = content.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const linkMatch = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const [, text, route] = linkMatch;
      return (
        <button
          key={i}
          onClick={() => navigate(route)}
          className="inline-flex items-center gap-1 text-primary font-medium hover:underline"
        >
          {text} →
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function isConfirmation(msg: string): boolean {
  const lower = msg.toLowerCase().trim();
  return ["oui", "yes", "ok", "go", "vas-y", "confirme", "c'est bon", "fais-le", "supprime", "valide", "d'accord", "ouais"]
    .some((w) => lower.includes(w));
}

export default function AssistantPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { isPilot } = useUserPlan();
  const workspaceId = useWorkspaceId();

  const welcomeMsg = isPilot ? WELCOME_PILOT : WELCOME_DEFAULT;

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: welcomeMsg },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [pendingActions, setPendingActions] = useState<any[] | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      const userMsg: ChatMessage = { role: "user", content: text.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      try {
        const body: any = {
          message: text.trim(),
          conversation_history: messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content })),
          workspace_id: workspaceId !== user?.id ? workspaceId : undefined,
        };

        // If pending actions and this is a confirmation
        if (pendingActions && isConfirmation(text)) {
          body.confirmed_actions = pendingActions;
          setPendingActions(null);
        }

        const { data, error } = await supabase.functions.invoke("assistant-chat", { body });

        if (error) throw error;

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: data.message || "Hmm, je n'ai pas compris. Reformule ?",
          actions: data.results || null,
          pending_actions: data.pending_actions || null,
        };

        if (data.pending_actions) {
          setPendingActions(data.pending_actions);
        }

        if (data.remaining !== undefined) {
          setRemaining(data.remaining);
        }

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: any) {
        console.error("Assistant error:", err);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Oups, une erreur est survenue. Réessaie dans un instant." },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, pendingActions, workspaceId, user?.id]
  );

  const handleUndo = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("assistant-chat", {
        body: { undo: true, workspace_id: workspaceId !== user?.id ? workspaceId : undefined },
      });
      if (error) throw error;
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      toast.success("Action annulée");
    } catch {
      toast.error("Erreur lors de l'annulation");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const suggestions = getSuggestions(location.pathname);

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className={cn(
          "fixed z-50 rounded-full w-14 h-14 flex items-center justify-center",
          "bg-primary text-primary-foreground shadow-lg",
          "hover:scale-105 transition-transform duration-200",
          "bottom-5 right-5 md:bottom-6 md:right-6 max-md:bottom-20"
        )}
      >
        <span className="text-xl">✨</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col bg-card border border-border shadow-2xl overflow-hidden",
        isMobile
          ? "inset-0 rounded-none"
          : "bottom-6 right-6 w-[400px] h-[600px] rounded-2xl"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-rose-pale border-b border-border">
        <span className="font-heading font-semibold text-foreground text-sm flex items-center gap-2">
          ✨ Ton assistant com'
        </span>
        <div className="flex items-center gap-1">
          {remaining !== null && (
            <span className="text-xs text-muted-foreground mr-2">💡 {remaining} crédits</span>
          )}
          <button onClick={() => setMinimized(true)} className="p-1.5 hover:bg-secondary rounded-md" aria-label="Minimiser">
            <Minus className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-md" aria-label="Fermer">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                msg.role === "user"
                  ? "bg-rose-pale text-foreground"
                  : "bg-muted text-foreground"
              )}
            >
              {msg.role === "assistant"
                ? renderAssistantMessage(msg.content, navigate)
                : msg.content}

              {/* Action results */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-2.5 border border-border bg-secondary/30 rounded-lg p-2.5 text-xs space-y-1">
                  <div className="font-semibold text-foreground">⚡ Actions effectuées</div>
                  {msg.actions.map((a, j) => (
                    <div key={j} className={a.success ? "text-foreground" : "text-destructive"}>
                      {a.success ? "✅" : "❌"} {a.action}
                      {a.field ? ` → ${a.field}` : ""}
                      {a.error ? ` (${a.error})` : ""}
                    </div>
                  ))}
                  <button
                    onClick={handleUndo}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
                  >
                    <Undo2 className="w-3 h-3" /> Annuler
                  </button>
                </div>
              )}

              {/* Pending confirmation */}
              {msg.pending_actions && msg.pending_actions.length > 0 && (
                <div className="mt-2.5 border border-accent bg-accent/20 rounded-lg p-2.5 text-xs">
                  <div className="font-semibold text-foreground">⚠️ Confirmation requise</div>
                  <p className="text-muted-foreground mt-1">Réponds "oui" pour confirmer.</p>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-3.5 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Réflexion en cours...
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {messages.length <= 2 && (
        <div className="px-4 pb-1 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="text-xs px-3 py-1.5 rounded-full bg-rose-pale text-primary hover:bg-rose-soft transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-3 border-t border-border flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Écris ton message..."
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-xl border border-input bg-muted/50 px-3 py-2.5 text-sm",
            "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary",
            "max-h-24"
          )}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className={cn(
            "rounded-full w-9 h-9 flex items-center justify-center shrink-0",
            "bg-primary text-primary-foreground disabled:opacity-40",
            "hover:bg-bordeaux transition-colors"
          )}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
