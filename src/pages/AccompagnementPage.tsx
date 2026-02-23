import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarDays, Clock, Video, MessageCircle, ChevronDown, ChevronUp, Lock, Download, ExternalLink, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { LAETITIA_WHATSAPP } from "@/lib/constants";
import { getFocusIcon, getSessionTypeIcon } from "@/lib/coaching-constants";
import { toast } from "sonner";

interface Program {
  id: string;
  current_phase: string;
  current_month: number;
  whatsapp_link: string | null;
  calendly_link: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  formula: string | null;
  duration_months: number | null;
  price_monthly: number | null;
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
  session_type: string | null;
  focus_topic: string | null;
  focus_label: string | null;
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
  file_url: string | null;
  file_name: string | null;
  assigned_session_id: string | null;
  seen_by_client: boolean;
}

export default function AccompagnementPage() {
  const { user } = useAuth();
  const [program, setProgram] = useState<Program | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [noProgram, setNoProgram] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prog } = await (supabase.from("coaching_programs" as any) as any)
        .select("*").eq("client_user_id", user.id).eq("status", "active").maybeSingle();

      if (!prog) { setNoProgram(true); setLoading(false); return; }
      setProgram(prog as Program);

      const [sessRes, actRes, delRes] = await Promise.all([
        (supabase.from("coaching_sessions" as any) as any).select("*").eq("program_id", prog.id).order("session_number"),
        (supabase.from("coaching_actions" as any) as any).select("*").eq("program_id", prog.id).order("due_date", { ascending: true, nullsFirst: false }),
        (supabase.from("coaching_deliverables" as any) as any).select("*").eq("program_id", prog.id).order("created_at"),
      ]);

      const sessionsData = (sessRes.data || []) as Session[];
      const deliverablesData = (delRes.data || []) as Deliverable[];

      setSessions(sessionsData);
      setActions((actRes.data || []) as Action[]);
      setDeliverables(deliverablesData);

      // Auto-expand the last completed session
      const completedSessions = sessionsData.filter(s => s.status === "completed");
      if (completedSessions.length > 0) {
        setExpandedSessions(new Set([completedSessions[completedSessions.length - 1].id]));
      }

      // Mark unseen deliverables as seen
      const unseen = deliverablesData.filter(d => d.status === "delivered" && !d.seen_by_client);
      if (unseen.length > 0) {
        unseen.forEach(d => toast("✨ Nouveau livrable débloqué : " + d.title + " !", { duration: 4000 }));
        const ids = unseen.map(d => d.id);
        await (supabase.from("coaching_deliverables" as any) as any)
          .update({ seen_by_client: true }).in("id", ids);
        setDeliverables(prev => prev.map(d => ids.includes(d.id) ? { ...d, seen_by_client: true } : d));
      }

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

  const toggleExpand = (id: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
              <a href={LAETITIA_WHATSAPP} target="_blank" rel="noopener noreferrer">
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
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </div>
    );
  }

  const progressPct = Math.round(((program.current_month || 1) / 6) * 100);

  const DEFAULT_CALENDLY = "https://calendly.com/laetitia-mattioli/atelier-2h";
  const calendlyUrl = program.calendly_link || DEFAULT_CALENDLY;

  const handleBookSession = () => {
    const url = new URL(calendlyUrl);
    const firstName = user?.user_metadata?.prenom || user?.user_metadata?.first_name || "";
    const email = user?.email || "";
    if (firstName) url.searchParams.set("name", firstName);
    if (email) url.searchParams.set("email", email);
    window.open(url.toString(), "_blank");
  };

  // Deliverables recap
  const unlockedDeliverables = deliverables.filter(d => d.status === "delivered");
  const delivProgressPct = deliverables.length > 0 ? Math.round((unlockedDeliverables.length / deliverables.length) * 100) : 0;

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
              <p className="text-sm text-muted-foreground">Programme Now Pilot · 6 mois · Avec Laetitia</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Mois {program.current_month || 1}/6</p>
          <Progress value={progressPct} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-1 text-right">{progressPct}%</p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button onClick={handleBookSession} variant="outline" className="rounded-full gap-2 text-sm">
              <CalendarDays className="h-4 w-4" /> Réserver une session
            </Button>
            <Button asChild variant="outline" className="rounded-full gap-2 text-sm bg-[#25D366] hover:bg-[#1ebe57] text-white border-0">
              <a href={program.whatsapp_link || LAETITIA_WHATSAPP} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp Laetitia
              </a>
            </Button>
          </div>
        </div>

        {/* MON PARCOURS — Unified Timeline */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold text-foreground mb-5">🗓️ Mon parcours</h2>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-border" />

            <div className="space-y-4">
              {sessions.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  expanded={expandedSessions.has(session.id)}
                  onToggle={() => toggleExpand(session.id)}
                  actions={actions.filter(a => a.session_id === session.id)}
                  deliverables={deliverables.filter(d => d.assigned_session_id === session.id)}
                  onToggleAction={toggleAction}
                  onBookSession={handleBookSession}
                />
              ))}
            </div>
          </div>
        </div>

        {/* RÉCAP LIVRABLES */}
        <DeliverablesRecap
          deliverables={deliverables}
          unlockedCount={unlockedDeliverables.length}
          progressPct={delivProgressPct}
        />

        {/* WHATSAPP */}
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

/* ═══════════════════════════════════════════════════════════
   SESSION CARD — 3 states: completed, scheduled, upcoming
   ═══════════════════════════════════════════════════════════ */
function SessionCard({ session, expanded, onToggle, actions, deliverables, onToggleAction, onBookSession }: {
  session: Session;
  expanded: boolean;
  onToggle: () => void;
  actions: Action[];
  deliverables: Deliverable[];
  onToggleAction: (a: Action) => void;
  onBookSession: () => void;
}) {
  const isCompleted = session.status === "completed";
  const isScheduled = session.status === "scheduled" || session.status === "confirmed";
  const hasDate = !!session.scheduled_date;
  const isNext = isScheduled && hasDate;
  const isUpcoming = isScheduled && !hasDate;

  // Determine card style based on state
  const borderClass = isCompleted
    ? "border-l-[3px] border-l-[#2E7D32] border-t border-r border-b border-border"
    : isNext
    ? "border-l-[3px] border-l-primary border-t border-r border-b border-primary/20"
    : "border-l-[3px] border-l-border border-t border-r border-b border-border/50";

  const bgClass = isCompleted ? "bg-card" : isNext ? "bg-card" : "bg-muted/20";
  const opacityClass = isUpcoming ? "opacity-70" : "";

  const icon = getSessionIcon(session);
  const statusIcon = isCompleted ? "✅" : hasDate ? "📅" : "🔜";

  const unlockedDelivs = deliverables.filter(d => d.status === "delivered");
  const lockedDelivs = deliverables.filter(d => d.status !== "delivered");

  return (
    <div className={`relative pl-8`}>
      {/* Timeline dot */}
      <div className={`absolute left-0 top-4 w-[22px] h-[22px] rounded-full ring-2 ring-background flex items-center justify-center text-[11px] ${
        isCompleted ? "bg-[#2E7D32] text-white" : isNext ? "bg-primary text-white" : "bg-border text-muted-foreground"
      }`}>
        {isCompleted ? "✓" : session.session_number}
      </div>

      <div className={`rounded-xl ${borderClass} ${bgClass} ${opacityClass} p-4 transition-all`}>
        {/* Header row */}
        <button
          onClick={isCompleted ? onToggle : undefined}
          className={`w-full text-left flex items-center justify-between ${isCompleted ? "cursor-pointer" : "cursor-default"}`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm">{statusIcon}</span>
            <span className="text-sm">{icon}</span>
            <span className="text-sm font-semibold text-foreground truncate">{session.title || "À définir"}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {session.scheduled_date && (
              <span className="text-xs text-muted-foreground">
                {format(new Date(session.scheduled_date), "d MMM", { locale: fr })}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{formatDuration(session.duration_minutes)}</span>
            {isCompleted && (
              expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {/* COMPLETED — Expanded content */}
        {isCompleted && expanded && (
          <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
            {/* Summary */}
            {session.summary && (
              <p className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">{session.summary}</p>
            )}

            {/* Laetitia's note */}
            {session.laetitia_note && (
              <div className="rounded-xl bg-secondary/50 p-3">
                <p className="text-xs font-semibold text-primary mb-1">💌 Mot de Laetitia :</p>
                <p className="text-sm text-foreground italic whitespace-pre-line">{session.laetitia_note}</p>
              </div>
            )}

            {/* Unlocked deliverables */}
            {unlockedDelivs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">✨ Livrables débloqués :</p>
                <div className="space-y-1.5">
                  {unlockedDelivs.map(d => (
                    <div key={d.id} className="flex items-center justify-between rounded-lg border border-primary/20 bg-card p-2.5">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm font-medium text-foreground">{d.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.route && (
                          <Link to={d.route} className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                            Voir <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                        {d.file_url && (
                          <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                            <Download className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {actions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">📋 À faire :</p>
                <div className="space-y-1.5">
                  {actions.map(a => (
                    <label key={a.id} className="flex items-start gap-2.5 cursor-pointer group">
                      <Checkbox
                        checked={a.completed}
                        onCheckedChange={() => onToggleAction(a)}
                        className="mt-0.5"
                      />
                      <span className={`text-sm ${a.completed ? "line-through text-muted-foreground" : "text-foreground group-hover:text-primary transition-colors"}`}>
                        {a.title}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Modules updated */}
            {session.modules_updated && session.modules_updated.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-muted-foreground mr-1">Modules :</span>
                {session.modules_updated.map(m => <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>)}
              </div>
            )}
          </div>
        )}

        {/* SCHEDULED / NEXT — Show prep + actions + locked deliverables */}
        {isScheduled && (
          <div className="mt-2 space-y-3">
            {/* Focus */}
            {session.focus && <p className="text-xs text-muted-foreground">🎯 {session.focus}</p>}

            {/* Prep notes */}
            {session.prep_notes && (
              <div className="rounded-xl bg-rose-pale p-3">
                <p className="text-xs font-semibold text-primary mb-1">💡 Avant la session :</p>
                <p className="text-sm text-foreground whitespace-pre-line">{session.prep_notes}</p>
              </div>
            )}

            {/* Locked deliverables */}
            {lockedDelivs.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">🔒 Livrables prévus :</p>
                {lockedDelivs.map(d => (
                  <p key={d.id} className="text-xs text-muted-foreground flex items-center gap-1.5 ml-1">
                    <Lock className="h-3 w-3" /> {d.title}
                  </p>
                ))}
              </div>
            )}

            {/* Booking buttons */}
            <div className="flex flex-wrap gap-2">
              {hasDate ? (
                <>
                  {session.meeting_link && (
                    <Button asChild size="sm" className="rounded-full gap-2 text-xs">
                      <a href={session.meeting_link} target="_blank" rel="noopener noreferrer">
                        <Video className="h-3.5 w-3.5" /> Rejoindre l'appel
                      </a>
                    </Button>
                  )}
                  <Button onClick={onBookSession} size="sm" variant="outline" className="rounded-full gap-2 text-xs">
                    <CalendarDays className="h-3.5 w-3.5" /> Modifier le créneau
                  </Button>
                </>
              ) : (
                <Button onClick={onBookSession} size="sm" className="rounded-full gap-2 text-xs">
                  <CalendarDays className="h-3.5 w-3.5" /> Réserver mon créneau
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DELIVERABLES RECAP
   ═══════════════════════════════════════════════════════════ */
function DeliverablesRecap({ deliverables, unlockedCount, progressPct }: {
  deliverables: Deliverable[];
  unlockedCount: number;
  progressPct: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (deliverables.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-lg font-bold text-foreground">
            🎁 Tes livrables · {unlockedCount}/{deliverables.length} débloqués
          </h2>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
        <Progress value={progressPct} className="h-2.5" />
      </button>

      {expanded && (
        <div className="mt-4 space-y-2">
          {deliverables.map(d => {
            const isUnlocked = d.status === "delivered";
            return (
              <div key={d.id} className={`flex items-center justify-between rounded-lg border p-2.5 ${
                isUnlocked ? "border-primary/20 bg-card" : "border-border/50 bg-muted/30 opacity-60"
              }`}>
                <div className="flex items-center gap-2">
                  {isUnlocked ? <Sparkles className="h-3.5 w-3.5 text-primary" /> : <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className={`text-sm ${isUnlocked ? "font-medium text-foreground" : "text-muted-foreground"}`}>{d.title}</span>
                </div>
                {isUnlocked && (
                  <div className="flex items-center gap-2">
                    {d.route && (
                      <Link to={d.route} className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                        Voir <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                    {d.file_url && (
                      <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Download className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Helpers ── */
function getSessionIcon(session: Session): string {
  if (session.session_type && ["launch", "strategy", "checkpoint"].includes(session.session_type)) {
    return getSessionTypeIcon(session.session_type);
  }
  return getFocusIcon(session.focus_topic);
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
}
