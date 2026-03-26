import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useDemoContext } from "@/contexts/DemoContext";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MessageSquare } from "lucide-react";

interface Props {
  section: string;
}

const DEMO_HISTORY: Record<string, { messages: any[]; created_at: string; question_count: number }[]> = {
  story: [{ created_at: new Date().toISOString(), question_count: 6, messages: [
    { role: "assistant", content: "Raconte-moi comment tout a commencé pour toi. C'était quoi le déclic ?" },
    { role: "user", content: "J'ai commencé la photo à 22 ans, un peu par hasard. Je faisais des portraits de mes amies." },
    { role: "assistant", content: "Et à quel moment tu as compris que c'était plus qu'un hobby ?" },
    { role: "user", content: "Le jour où une cliente m'a dit 'c'est la première fois que je me trouve belle en photo'." },
    { role: "assistant", content: "C'est puissant. Et qu'est-ce qui a été le plus dur dans ton parcours ?" },
    { role: "user", content: "2 ans à galérer avec les réseaux, à poster dans le vide sans retour." },
  ]}],
  persona: [{ created_at: new Date().toISOString(), question_count: 5, messages: [
    { role: "assistant", content: "Quand une cliente te contacte, qu'est-ce qui l'a fait passer à l'action ?" },
    { role: "user", content: "En général, elle vient de lancer son activité ou elle fait un pivot." },
    { role: "assistant", content: "Et quand elle repousse, c'est quoi le vrai frein ?" },
    { role: "user", content: "La peur du résultat, clairement." },
    { role: "assistant", content: "Comment tu la rassures aujourd'hui ?" },
    { role: "user", content: "Je lui montre des avant/après de clientes qui avaient la même peur." },
  ]}],
  value_proposition: [{ created_at: new Date().toISOString(), question_count: 4, messages: [
    { role: "assistant", content: "Si tu devais expliquer ce que tu fais à une amie en 30 secondes, tu dirais quoi ?" },
    { role: "user", content: "J'aide les entrepreneures à se sentir bien dans leur image de marque." },
  ]}],
  tone_style: [{ created_at: new Date().toISOString(), question_count: 4, messages: [
    { role: "assistant", content: "Comment tu parlerais à ta cliente idéale si tu la croisais dans un café ?" },
    { role: "user", content: "Comme à une pote. Direct, avec de l'humour et beaucoup de bienveillance." },
  ]}],
  content_strategy: [{ created_at: new Date().toISOString(), question_count: 3, messages: [
    { role: "assistant", content: "De quoi tu pourrais parler pendant des heures sans te lasser ?" },
    { role: "user", content: "La confiance en soi, le personal branding et les coulisses de mon métier." },
  ]}],
};

export default function BrandingCoachingHistory({ section }: Props) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { isDemoMode } = useDemoContext();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemoMode) {
      setSessions(DEMO_HISTORY[section] || []);
      setLoading(false);
      return;
    }
    if (!user) return;
    const fetchSessions = async () => {
      // Try workspace filter first
      let { data } = await (supabase
        .from("branding_coaching_sessions") as any)
        .select("id, messages, created_at, question_count, is_complete")
        .eq(column, value)
        .eq("section", section)
        .order("created_at", { ascending: true });


      setSessions(data || []);
      setLoading(false);
    };
    fetchSessions();
  }, [user?.id, section, isDemoMode, column, value]);

  if (loading) return <p className="text-sm text-muted-foreground py-4">Chargement...</p>;

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8">
        <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Pas encore de session de coaching pour cette section.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sessions.map((session, si) => {
        const msgs = Array.isArray(session.messages) ? session.messages : [];
        const dateStr = session.created_at
          ? format(new Date(session.created_at), "d MMMM yyyy", { locale: fr })
          : "";
        return (
          <div key={session.id || si}>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground font-medium px-2">
                Session {si + 1} · {dateStr} · {session.question_count || msgs.filter((m: any) => m.role === "assistant").length} questions
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-3">
              {msgs.map((msg: any, mi: number) => (
                <div key={mi} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <span className="text-lg shrink-0 mt-0.5">✨</span>
                  )}
                  <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-primary/10 text-foreground"
                      : "bg-muted text-foreground"
                  }`}>
                    {msg.content}
                  </div>
                  {msg.role === "user" && (
                    <span className="text-lg shrink-0 mt-0.5">👤</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
