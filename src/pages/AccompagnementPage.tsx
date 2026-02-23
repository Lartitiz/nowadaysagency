import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarDays, Clock, Video, ExternalLink, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Program {
  id: string;
  current_phase: string;
  current_month: number;
  whatsapp_link: string | null;
  calendly_link: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

interface Session {
  id: string;
  session_number: number;
  phase: string;
  title: string | null;
  focus: string | null;
  scheduled_date: string | null;
  duration_minutes: number;
  meeting_link: string | null;
  status: string;
  prep_notes: string | null;
  summary: string | null;
  modules_updated: string[] | null;
  laetitia_note: string | null;
}

interface Action {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  session_id: string | null;
}

interface Deliverable {
  id: string;
  title: string;
  type: string | null;
  status: string;
  delivered_at: string | null;
  route: string | null;
}

export default function AccompagnementPage() {
  const { user } = useAuth();
  const [program, setProgram] = useState<Program | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [noProgram, setNoProgram] = useState(false);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prog } = await (supabase
        .from("coaching_programs" as any) as any)
        .select("*")
        .eq("client_user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!prog) {
        setNoProgram(true);
        setLoading(false);
        return;
      }
      setProgram(prog as Program);

      const [sessRes, actRes, delRes] = await Promise.all([
        (supabase.from("coaching_sessions" as any) as any).select("*").eq("program_id", prog.id).order("session_number"),
        (supabase.from("coaching_actions" as any) as any).select("*").eq("program_id", prog.id).order("due_date", { ascending: true, nullsFirst: false }),
        (supabase.from("coaching_deliverables" as any) as any).select("*").eq("program_id", prog.id).order("created_at"),
      ]);

      setSessions((sessRes.data || []) as Session[]);
      setActions((actRes.data || []) as Action[]);
      setDeliverables((delRes.data || []) as Deliverable[]);
      setLoading(false);
    })();
  }, [user?.id]);

  const toggleAction = async (action: Action) => {
    const newCompleted = !action.completed;
    await (supabase.from("coaching_actions" as any) as any).update({
      completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
    }).eq("id", action.id);
    setActions(prev => prev.map(a => a.id === action.id ? { ...a, completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null } : a));
  };

  if (noProgram) {
    return (
      <div className="min-h-screen bg-background pb-20 lg:pb-8">
        <AppHeader />
        <main className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
          <div className="rounded-2xl border border-primary/20 bg-card p-6 text-center space-y-4">
            <span className="text-4xl">🤝</span>
            <h1 className="font-display text-xl font-bold text-foreground">Mon accompagnement</h1>
            <p className="text-sm text-muted-foreground">Programme Now Pilot · Avec Laetitia</p>
            <p className="text-sm text-muted-foreground">Cette section est en cours de mise en place. Laetitia te contactera pour planifier ta première session.</p>
            <Button asChild className="rounded-full gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white">
              <a href="https://wa.me/33612345678" target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" /> Contacter Laetitia sur WhatsApp
              </a>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (loading || !program) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const progressPct = Math.round((program.current_month / 6) * 100);
  const phaseLabel = program.current_month <= 3 ? "🔧 Stratégie" : "🤝 Binôme";
  const nextSession = sessions.find(s => s.status === "scheduled" && s.scheduled_date);
  const strategySessions = sessions.filter(s => s.phase === "strategy");
  const binomeSessions = sessions.filter(s => s.phase === "binome");
  const pendingActions = actions.filter(a => !a.completed);
  const recentDone = actions.filter(a => a.completed && a.completed_at && new Date(a.completed_at) > new Date(Date.now() - 7 * 86400000));

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-8">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 animate-fade-in space-y-6">

        {/* HEADER */}
        <div className="rounded-2xl border border-primary/20 bg-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">🤝</span>
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">Mon accompagnement</h1>
              <p className="text-sm text-muted-foreground">Programme Now Pilot · Avec Laetitia</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Phase : {phaseLabel} · Mois {program.current_month}/6</p>
          <Progress value={progressPct} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-1 text-right">{progressPct}%</p>
        </div>

        {/* PROCHAINE SESSION */}
        <div className="rounded-2xl border-2 border-primary/30 bg-card p-6">
          <h2 className="font-display text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" /> Prochaine session
          </h2>
          {nextSession ? (
            <div className="space-y-2">
              <p className="font-semibold text-foreground">{nextSession.title}</p>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                {nextSession.scheduled_date && (
                  <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {format(new Date(nextSession.scheduled_date), "EEEE d MMMM · HH'h'mm", { locale: fr })}</span>
                )}
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {nextSession.duration_minutes} min</span>
              </div>
              {nextSession.focus && <p className="text-sm text-muted-foreground">🎯 {nextSession.focus}</p>}
              {nextSession.prep_notes && (
                <div className="rounded-xl bg-rose-pale p-3 mt-2">
                  <p className="text-xs font-semibold text-primary mb-1">💡 Avant la session, pense à :</p>
                  <p className="text-sm text-foreground whitespace-pre-line">{nextSession.prep_notes}</p>
                </div>
              )}
              {nextSession.meeting_link && (
                <Button asChild className="mt-2 rounded-full gap-2">
                  <a href={nextSession.meeting_link} target="_blank" rel="noopener noreferrer">
                    <Video className="h-4 w-4" /> Rejoindre l'appel
                  </a>
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Pas de session programmée pour le moment. Laetitia te recontactera bientôt.</p>
          )}
        </div>

        {/* MES SESSIONS */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold text-foreground mb-4">📚 Mes sessions</h2>

          {strategySessions.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">🔧 Phase Stratégie (mois 1-3)</p>
              <div className="space-y-2">
                {strategySessions.map(s => (
                  <SessionRow key={s.id} session={s} expanded={expandedSession === s.id} onToggle={() => setExpandedSession(expandedSession === s.id ? null : s.id)} actions={actions.filter(a => a.session_id === s.id)} />
                ))}
              </div>
            </div>
          )}

          {binomeSessions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">🤝 Phase Binôme (mois 4-6)</p>
              <div className="space-y-2">
                {binomeSessions.map(s => (
                  <SessionRow key={s.id} session={s} expanded={expandedSession === s.id} onToggle={() => setExpandedSession(expandedSession === s.id ? null : s.id)} actions={actions.filter(a => a.session_id === s.id)} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ACTIONS EN COURS */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold text-foreground mb-3">📋 Mes actions</h2>
          {pendingActions.length === 0 && recentDone.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune action pour le moment.</p>
          ) : (
            <div className="space-y-2">
              {pendingActions.map(a => (
                <label key={a.id} className="flex items-start gap-3 cursor-pointer group">
                  <Checkbox checked={false} onCheckedChange={() => toggleAction(a)} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{a.title}</p>
                    {a.due_date && <p className="text-xs text-muted-foreground">Deadline : {format(new Date(a.due_date), "d MMM", { locale: fr })}</p>}
                  </div>
                </label>
              ))}
              {recentDone.map(a => (
                <label key={a.id} className="flex items-start gap-3 cursor-pointer opacity-60">
                  <Checkbox checked onCheckedChange={() => toggleAction(a)} className="mt-0.5" />
                  <div>
                    <p className="text-sm line-through text-muted-foreground">{a.title}</p>
                    {a.completed_at && <p className="text-xs text-muted-foreground">Fait le {format(new Date(a.completed_at), "d MMM", { locale: fr })}</p>}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* LIVRABLES */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold text-foreground mb-3">📦 Mes livrables</h2>
          <div className="space-y-2">
            {deliverables.map(d => (
              <div key={d.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{d.status === "delivered" ? "✅" : "🔜"}</span>
                  <p className="text-sm font-medium text-foreground">{d.title}</p>
                  {d.delivered_at && <span className="text-xs text-muted-foreground">· {format(new Date(d.delivered_at), "d MMM", { locale: fr })}</span>}
                </div>
                {d.status === "delivered" && d.route && (
                  <Link to={d.route} className="text-xs text-primary font-semibold hover:underline">Voir →</Link>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CONTACTER LAETITIA */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold text-foreground mb-3">💬 Contacter Laetitia</h2>
          {program.whatsapp_link ? (
            <div>
              <Button asChild className="rounded-full gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white">
                <a href={program.whatsapp_link} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              </Button>
              <p className="text-xs text-muted-foreground mt-2">Réponse sous 24-48h · Lun-ven</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Pas de lien WhatsApp configuré. Contacte <a href="mailto:laetitia@nowadaysagency.com" className="text-primary hover:underline">laetitia@nowadaysagency.com</a></p>
          )}
        </div>
      </main>
    </div>
  );
}

/* ── Session Row ── */
function SessionRow({ session, expanded, onToggle, actions }: { session: Session; expanded: boolean; onToggle: () => void; actions: Action[] }) {
  const isCompleted = session.status === "completed";
  const hasDate = !!session.scheduled_date;

  return (
    <div className={`rounded-xl border p-3 transition-all ${isCompleted ? "border-[#2E7D32]/30 bg-[#E8F5E9]/30" : hasDate ? "border-border" : "border-border/50 opacity-60"}`}>
      <button onClick={isCompleted ? onToggle : undefined} className="w-full text-left flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{isCompleted ? "✅" : hasDate ? "📅" : "🔒"}</span>
          <span className="text-sm font-semibold text-foreground">Session {session.session_number}</span>
          {session.scheduled_date && <span className="text-xs text-muted-foreground">· {format(new Date(session.scheduled_date), "d MMM", { locale: fr })}</span>}
          {session.title && <span className="text-xs text-muted-foreground">· {session.title}</span>}
        </div>
        {isCompleted && (expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />)}
      </button>
      {!isCompleted && session.focus && <p className="text-xs text-muted-foreground mt-1 ml-7">{session.focus}</p>}
      {isCompleted && expanded && (
        <div className="mt-3 ml-7 space-y-2 border-t border-border/50 pt-3">
          {session.summary && <p className="text-sm text-foreground whitespace-pre-line">{session.summary}</p>}
          {session.modules_updated && session.modules_updated.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-1">Modules :</span>
              {session.modules_updated.map(m => <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>)}
            </div>
          )}
          {session.laetitia_note && (
            <p className="text-sm italic text-muted-foreground">💬 {session.laetitia_note}</p>
          )}
          {actions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Actions données :</p>
              {actions.map(a => (
                <p key={a.id} className="text-xs text-foreground">• {a.title} {a.completed ? "✅" : ""}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
