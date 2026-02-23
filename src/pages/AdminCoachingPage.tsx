import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, ChevronRight, AlertTriangle, CalendarDays } from "lucide-react";
import { Navigate } from "react-router-dom";
import { format, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import {
  FOCUS_TOPICS, FIXED_SESSIONS, DEFAULT_DELIVERABLES,
  getFocusLabel, getFocusIcon, getSessionTypeIcon,
} from "@/lib/coaching-constants";

interface ProgramWithProfile {
  id: string;
  client_user_id: string;
  current_phase: string;
  current_month: number;
  status: string;
  start_date: string | null;
  whatsapp_link: string | null;
  formula: string | null;
  duration_months: number | null;
  price_monthly: number | null;
  total_focus_sessions: number | null;
  client_name?: string;
  client_email?: string;
  client_activity?: string;
}

interface SessionData {
  id: string;
  session_number: number;
  phase: string;
  title: string | null;
  focus: string | null;
  scheduled_date: string | null;
  status: string;
  meeting_link: string | null;
  prep_notes: string | null;
  summary: string | null;
  modules_updated: string[] | null;
  laetitia_note: string | null;
  program_id: string;
  session_type: string | null;
  focus_topic: string | null;
  focus_label: string | null;
  duration_minutes: number;
}

const ALL_MODULES = ["Branding", "Cible", "Offres", "Ton", "Histoire", "Éditoriale", "Bio", "Calendrier"];

export default function AdminCoachingPage() {
  const { user } = useAuth();
  const [programs, setPrograms] = useState<ProgramWithProfile[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [prepOpen, setPrepOpen] = useState<SessionData | null>(null);
  const [recapOpen, setRecapOpen] = useState<SessionData | null>(null);
  const [detailProgramId, setDetailProgramId] = useState<string | null>(null);

  const isAdmin = user?.email === "laetitia@nowadaysagency.com";

  useEffect(() => {
    if (!isAdmin) return;
    loadData();
  }, [user?.id]);

  const loadData = async () => {
    setLoading(true);
    const { data: progs } = await (supabase.from("coaching_programs" as any).select("*").order("created_at", { ascending: false }) as any);
    const programList = (progs || []) as ProgramWithProfile[];

    const clientIds = programList.map(p => p.client_user_id);
    if (clientIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("user_id, prenom, email, activite").in("user_id", clientIds);
      if (profiles) {
        programList.forEach(p => {
          const prof = profiles.find((pr: any) => pr.user_id === p.client_user_id);
          if (prof) {
            p.client_name = (prof as any).prenom || (prof as any).email;
            p.client_email = (prof as any).email;
            p.client_activity = (prof as any).activite;
          }
        });
      }
    }

    const { data: allSessions } = await (supabase.from("coaching_sessions" as any).select("*").order("session_number") as any);
    setSessions((allSessions || []) as SessionData[]);
    setPrograms(programList);
    setLoading(false);
  };

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const activePrograms = programs.filter(p => p.status === "active");
  const completedPrograms = programs.filter(p => p.status === "completed");

  const getNextSession = (programId: string) => sessions.find(s => s.program_id === programId && s.status === "scheduled" && s.scheduled_date);
  const getSessionStats = (programId: string) => {
    const ps = sessions.filter(s => s.program_id === programId);
    return { done: ps.filter(s => s.status === "completed").length, total: ps.length };
  };

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-8">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">🎓 Mes clientes Now Pilot</h1>
            <p className="text-sm text-muted-foreground mt-1">Actives : {activePrograms.length}</p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="rounded-full gap-2"><Plus className="h-4 w-4" /> Ajouter une cliente</Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-4">
            {activePrograms.map(p => {
              const next = getNextSession(p.id);
              const stats = getSessionStats(p.id);
              const pct = Math.round(((p.current_month || 1) / 6) * 100);

              return (
                <div key={p.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-display font-bold text-foreground">{p.client_name || "Cliente"}</h3>
                      {p.client_activity && <p className="text-xs text-muted-foreground">{p.client_activity}</p>}
                    </div>
                    <Badge variant="secondary">Mois {p.current_month || 1}/6</Badge>
                  </div>
                  <Progress value={pct} className="h-2 mb-3" />

                  <div className="space-y-1 text-sm text-muted-foreground mb-3">
                    {next ? (
                      <p>📅 Prochaine : {format(new Date(next.scheduled_date!), "d MMM", { locale: fr })} · {next.title}</p>
                    ) : (
                      <p className="text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Aucune session planifiée</p>
                    )}
                    <p>📚 Sessions : {stats.done}/{stats.total}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="rounded-full text-xs gap-1" onClick={() => setDetailProgramId(p.id)}>
                      Voir le programme <ChevronRight className="h-3 w-3" />
                    </Button>
                    {sessions.filter(s => s.program_id === p.id && s.status === "scheduled").length > 0 && (
                      <>
                        <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={() => {
                          const ns = sessions.find(s => s.program_id === p.id && s.status === "scheduled");
                          if (ns) setPrepOpen(ns);
                        }}>📝 Préparer session</Button>
                        <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={() => {
                          const ns = sessions.find(s => s.program_id === p.id && s.status === "scheduled");
                          if (ns) setRecapOpen(ns);
                        }}>📝 Compte-rendu</Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {completedPrograms.length > 0 && (
              <div className="mt-8">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Programmes terminés</p>
                {completedPrograms.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">{p.client_name} · Terminé</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <AddClientDialog open={addOpen} onOpenChange={setAddOpen} coachUserId={user?.id || ""} onCreated={loadData} />
        {prepOpen && <PrepSessionDialog session={prepOpen} onClose={() => { setPrepOpen(null); loadData(); }} />}
        {recapOpen && <RecapSessionDialog session={recapOpen} onClose={() => { setRecapOpen(null); loadData(); }} />}
        {detailProgramId && (
          <ProgramDetailDialog
            program={programs.find(p => p.id === detailProgramId)!}
            sessions={sessions.filter(s => s.program_id === detailProgramId)}
            onClose={() => { setDetailProgramId(null); loadData(); }}
          />
        )}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ADD CLIENT DIALOG — Rich creation form
   ═══════════════════════════════════════════════════════════ */
interface FocusSessionInput {
  focus_topic: string;
  focus_label: string;
  duration: number;
  date: string;
}

function AddClientDialog({ open, onOpenChange, coachUserId, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; coachUserId: string; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [whatsapp, setWhatsapp] = useState("");
  const [creating, setCreating] = useState(false);

  // Fixed session dates
  const [session1Date, setSession1Date] = useState("");
  const [session2Date, setSession2Date] = useState("");
  const [session3Date, setSession3Date] = useState("");

  // Focus sessions (4 by default)
  const [focusSessions, setFocusSessions] = useState<FocusSessionInput[]>([
    { focus_topic: "", focus_label: "", duration: 120, date: "" },
    { focus_topic: "", focus_label: "", duration: 120, date: "" },
    { focus_topic: "", focus_label: "", duration: 60, date: "" },
    { focus_topic: "", focus_label: "", duration: 60, date: "" },
  ]);

  // Auto-fill dates when start date changes
  useEffect(() => {
    if (!startDate) return;
    const start = new Date(startDate);
    setSession1Date(format(start, "yyyy-MM-dd"));
    setSession2Date(format(addDays(start, 21), "yyyy-MM-dd"));
    setSession3Date(format(addDays(start, 28), "yyyy-MM-dd"));
  }, [startDate]);

  const updateFocus = (idx: number, field: keyof FocusSessionInput, value: string | number) => {
    setFocusSessions(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const addFocusSession = () => {
    setFocusSessions(prev => [...prev, { focus_topic: "", focus_label: "", duration: 60, date: "" }]);
  };

  const removeFocusSession = () => {
    if (focusSessions.length > 1) setFocusSessions(prev => prev.slice(0, -1));
  };

  const totalSessions = 3 + focusSessions.length;
  const totalHours = Math.round((90 + 120 + 60 + focusSessions.reduce((s, f) => s + f.duration, 0)) / 60);

  const endDate = startDate ? (() => { const d = new Date(startDate); d.setMonth(d.getMonth() + 6); return d; })() : null;

  const handleCreate = async () => {
    if (!email.trim()) return toast.error("Email requis");
    setCreating(true);

    const { data: profile } = await (supabase.from("profiles" as any) as any).select("user_id, prenom").ilike("email", email.trim()).maybeSingle();
    if (!profile) {
      toast.error("Aucun compte trouvé avec « " + email.trim() + " ».");
      setCreating(false);
      return;
    }

    const clientUserId = (profile as any).user_id;
    const clientName = (profile as any).prenom || email.trim();

    const { data: existingProg } = await (supabase.from("coaching_programs" as any) as any).select("id, status").eq("client_user_id", clientUserId).maybeSingle();
    if (existingProg) {
      toast.info("Un programme existe déjà pour " + clientName + ".");
      setCreating(false);
      return;
    }

    const endDateStr = endDate ? format(endDate, "yyyy-MM-dd") : null;

    const { data: prog, error } = await (supabase.from("coaching_programs" as any).insert({
      client_user_id: clientUserId,
      coach_user_id: coachUserId,
      start_date: startDate,
      end_date: endDateStr,
      whatsapp_link: whatsapp || "https://wa.me/33614133921",
      formula: "now_pilot",
      duration_months: 6,
      price_monthly: 250,
      total_focus_sessions: focusSessions.length,
    } as any).select().single() as any);

    if (error) {
      toast.error("Erreur : " + error.message);
      setCreating(false);
      return;
    }

    // Create 3 fixed sessions
    const fixedSessionsToInsert = FIXED_SESSIONS.map((s, i) => ({
      program_id: prog.id,
      session_number: s.n,
      phase: s.phase,
      title: s.title,
      session_type: s.type,
      duration_minutes: s.duration,
      status: "scheduled",
      scheduled_date: [session1Date, session2Date, session3Date][i] || null,
    }));

    // Create focus sessions
    const focusSessionsToInsert = focusSessions.map((f, i) => ({
      program_id: prog.id,
      session_number: 4 + i,
      phase: "focus",
      title: f.focus_topic ? getFocusLabel(f.focus_topic) : "À définir ensemble",
      session_type: "focus",
      focus_topic: f.focus_topic || null,
      focus_label: f.focus_topic === "custom" ? f.focus_label : null,
      duration_minutes: f.duration,
      status: "scheduled",
      scheduled_date: f.date || null,
    }));

    await (supabase.from("coaching_sessions" as any).insert([...fixedSessionsToInsert, ...focusSessionsToInsert] as any) as any);

    // Create deliverables
    const delivsToInsert = DEFAULT_DELIVERABLES.map(d => ({
      program_id: prog.id,
      title: d.title,
      type: d.type,
      route: d.route,
      status: "pending",
    }));
    await (supabase.from("coaching_deliverables" as any).insert(delivsToInsert as any) as any);

    // Update client plan
    await (supabase.from("profiles" as any).update({ current_plan: "now_pilot" } as any).eq("user_id", clientUserId) as any);

    toast.success("Programme créé pour " + clientName + " ! 🎉");
    setEmail("");
    setWhatsapp("");
    setCreating(false);
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>🤝 Créer un accompagnement Now Pilot</DialogTitle></DialogHeader>
        <div className="space-y-5 pt-2">
          {/* Client */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">La cliente</p>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="lea@photo.com" />
          </section>

          {/* Programme */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Le programme</p>
            <div className="rounded-xl bg-rose-pale/50 p-3 text-sm text-foreground">
              <p className="font-semibold">Engagement : 6 mois · 250€/mois · 1 500€ total</p>
            </div>
            <div className="mt-3">
              <label className="text-sm font-medium text-foreground">Date de début</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1" />
            </div>
          </section>

          {/* 3 Fixed sessions */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Les 3 sessions fixes</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <span>🎯</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Session 1 · Atelier de lancement · 1h30</p>
                  </div>
                </div>
                <Input type="date" value={session1Date} onChange={e => setSession1Date(e.target.value)} className="w-40" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <span>📊</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Session 2 · Atelier Stratégique · 2h</p>
                    <p className="text-[11px] text-muted-foreground">Auto : +2-3 sem.</p>
                  </div>
                </div>
                <Input type="date" value={session2Date} onChange={e => setSession2Date(e.target.value)} className="w-40" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <span>✅</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Session 3 · Point d'étape · 1h</p>
                    <p className="text-[11px] text-muted-foreground">Auto : +1 sem.</p>
                  </div>
                </div>
                <Input type="date" value={session3Date} onChange={e => setSession3Date(e.target.value)} className="w-40" />
              </div>
            </div>
          </section>

          {/* Focus sessions */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Les {focusSessions.length} sessions focus</p>
            <p className="text-[11px] text-muted-foreground mb-3">💡 Les focus seront décidés lors de l'Atelier Stratégique. Tu peux les pré-remplir ou les laisser vides.</p>
            <div className="space-y-3">
              {focusSessions.map((fs, i) => (
                <div key={i} className="rounded-xl border border-border p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Session {4 + i}</p>
                  <div className="flex gap-2">
                    <Select value={fs.focus_topic || "none"} onValueChange={v => updateFocus(i, "focus_topic", v === "none" ? "" : v)}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Focus…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">💬 À définir</SelectItem>
                        {FOCUS_TOPICS.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-1">
                      <Button type="button" size="sm" variant={fs.duration === 60 ? "default" : "outline"} className="rounded-full text-xs" onClick={() => updateFocus(i, "duration", 60)}>1h</Button>
                      <Button type="button" size="sm" variant={fs.duration === 120 ? "default" : "outline"} className="rounded-full text-xs" onClick={() => updateFocus(i, "duration", 120)}>2h</Button>
                    </div>
                  </div>
                  {fs.focus_topic === "custom" && (
                    <Input value={fs.focus_label} onChange={e => updateFocus(i, "focus_label", e.target.value)} placeholder="Sujet personnalisé…" />
                  )}
                  <Input type="date" value={fs.date} onChange={e => updateFocus(i, "date", e.target.value)} />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={addFocusSession} className="text-xs text-primary font-semibold hover:underline">+ Ajouter une session focus</button>
              {focusSessions.length > 1 && (
                <button onClick={removeFocusSession} className="text-xs text-destructive font-semibold hover:underline">🗑️ Supprimer la dernière</button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Les focus peuvent être modifiés à tout moment.</p>
          </section>

          {/* WhatsApp */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">WhatsApp</p>
            <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="https://wa.me/33612345678" />
          </section>

          {/* Recap */}
          <div className="rounded-xl bg-rose-pale/50 border border-primary/20 p-4 text-sm space-y-1">
            <p className="font-semibold text-foreground">🤝 Now Pilot · 6 mois · 250€/mois</p>
            <p className="text-muted-foreground">{totalSessions} sessions · ~{totalHours}h d'accompagnement</p>
            <p className="text-muted-foreground">+ WhatsApp illimité + Outil IA (300 crédits/mois)</p>
            {startDate && endDate && (
              <p className="text-muted-foreground">Début : {format(new Date(startDate), "d MMMM yyyy", { locale: fr })} → Fin : {format(endDate, "d MMMM yyyy", { locale: fr })}</p>
            )}
          </div>

          <Button onClick={handleCreate} disabled={creating} className="w-full rounded-full">
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Créer le programme
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════
   PROGRAM DETAIL DIALOG — Inline editing
   ═══════════════════════════════════════════════════════════ */
function ProgramDetailDialog({ program, sessions, onClose }: { program: ProgramWithProfile; sessions: SessionData[]; onClose: () => void }) {
  const fixedSessions = sessions.filter(s => s.session_type && ["launch", "strategy", "checkpoint"].includes(s.session_type));
  const focusSessions = sessions.filter(s => !s.session_type || s.session_type === "focus");

  const updateSession = async (id: string, updates: Record<string, any>) => {
    await (supabase.from("coaching_sessions" as any).update(updates as any).eq("id", id) as any);
    toast.success("Session mise à jour !");
  };

  const addFocusSession = async () => {
    const maxNum = Math.max(...sessions.map(s => s.session_number), 0);
    await (supabase.from("coaching_sessions" as any).insert({
      program_id: program.id,
      session_number: maxNum + 1,
      phase: "focus",
      title: "À définir ensemble",
      session_type: "focus",
      duration_minutes: 60,
      status: "scheduled",
    } as any) as any);
    toast.success("Session focus ajoutée !");
    onClose();
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Programme de {program.client_name} · 6 mois</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Fixed sessions */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sessions fondations</p>
            <div className="space-y-2">
              {fixedSessions.map(s => (
                <SessionEditRow key={s.id} session={s} onUpdate={updateSession} showFocusPicker={false} />
              ))}
            </div>
          </div>

          {/* Focus sessions */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sessions focus</p>
            <div className="space-y-2">
              {focusSessions.map(s => (
                <SessionEditRow key={s.id} session={s} onUpdate={updateSession} showFocusPicker />
              ))}
            </div>
            <button onClick={addFocusSession} className="text-xs text-primary font-semibold hover:underline mt-2">+ Ajouter une session focus</button>
          </div>

          {/* Settings */}
          <div className="rounded-xl border border-border p-4 space-y-2 text-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Paramètres</p>
            <p className="text-muted-foreground">Formule : Now Pilot · 6 mois</p>
            <p className="text-muted-foreground">Prix : 250€/mois</p>
            {program.whatsapp_link && <p className="text-muted-foreground">WhatsApp : <a href={program.whatsapp_link} target="_blank" className="text-primary hover:underline">{program.whatsapp_link}</a></p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SessionEditRow({ session, onUpdate, showFocusPicker }: { session: SessionData; onUpdate: (id: string, u: Record<string, any>) => Promise<void>; showFocusPicker: boolean }) {
  const isCompleted = session.status === "completed";
  const icon = session.session_type && ["launch", "strategy", "checkpoint"].includes(session.session_type)
    ? getSessionTypeIcon(session.session_type)
    : getFocusIcon(session.focus_topic);

  return (
    <div className={`rounded-xl border p-3 ${isCompleted ? "border-[#2E7D32]/30 bg-[#E8F5E9]/20" : "border-border"}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span>{isCompleted ? "✅" : icon}</span>
        <span className="text-sm font-semibold text-foreground">{session.title || "À définir"}</span>
        <span className="text-xs text-muted-foreground">· {session.duration_minutes}min</span>
        {session.scheduled_date && <span className="text-xs text-muted-foreground">· {format(new Date(session.scheduled_date), "d MMM yyyy", { locale: fr })}</span>}
      </div>
      {showFocusPicker && !isCompleted && (
        <div className="flex gap-2 mt-2 flex-wrap">
          <Select
            value={session.focus_topic || "none"}
            onValueChange={v => {
              const topic = v === "none" ? null : v;
              const label = topic ? getFocusLabel(topic) : "À définir ensemble";
              onUpdate(session.id, { focus_topic: topic, title: label });
            }}
          >
            <SelectTrigger className="h-8 text-xs w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">💬 À définir</SelectItem>
              {FOCUS_TOPICS.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" className="h-8 text-xs w-40" defaultValue={session.scheduled_date ? format(new Date(session.scheduled_date), "yyyy-MM-dd") : ""} onBlur={e => {
            if (e.target.value) onUpdate(session.id, { scheduled_date: e.target.value });
          }} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PREP & RECAP DIALOGS (kept from before)
   ═══════════════════════════════════════════════════════════ */
function PrepSessionDialog({ session, onClose }: { session: SessionData; onClose: () => void }) {
  const [meetingLink, setMeetingLink] = useState(session.meeting_link || "");
  const [focus, setFocus] = useState(session.focus || "");
  const [prepNotes, setPrepNotes] = useState(session.prep_notes || "");
  const [scheduledDate, setScheduledDate] = useState(session.scheduled_date ? format(new Date(session.scheduled_date), "yyyy-MM-dd'T'HH:mm") : "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await (supabase.from("coaching_sessions" as any).update({
      meeting_link: meetingLink || null,
      focus: focus || null,
      prep_notes: prepNotes || null,
      scheduled_date: scheduledDate || null,
    } as any).eq("id", session.id) as any);
    toast.success("Session préparée !");
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>📝 Préparer · {getSessionTypeIcon(session.session_type)} {session.title}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium">Date et heure</label>
            <Input type="datetime-local" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Lien visio</label>
            <Input value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholder="https://meet.google.com/xxx" />
          </div>
          <div>
            <label className="text-sm font-medium">Ce que je veux aborder</label>
            <textarea className="w-full rounded-xl border-2 border-input bg-card px-4 py-3 text-sm resize-none h-20" value={focus} onChange={e => setFocus(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Préparation pour la cliente</label>
            <textarea className="w-full rounded-xl border-2 border-input bg-card px-4 py-3 text-sm resize-none h-20" value={prepNotes} onChange={e => setPrepNotes(e.target.value)} placeholder="· Lister 5 sujets passion" />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full rounded-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            💾 Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecapSessionDialog({ session, onClose }: { session: SessionData; onClose: () => void }) {
  const [summary, setSummary] = useState(session.summary || "");
  const [laetitiaNote, setLaetitiaNote] = useState(session.laetitia_note || "");
  const [modules, setModules] = useState<string[]>(session.modules_updated || []);
  const [actionInputs, setActionInputs] = useState<{ title: string; due_date: string }[]>([{ title: "", due_date: "" }]);
  const [saving, setSaving] = useState(false);

  const toggleModule = (m: string) => setModules(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

  const handleSave = async () => {
    setSaving(true);
    await (supabase.from("coaching_sessions" as any).update({
      status: "completed",
      summary: summary || null,
      modules_updated: modules,
      laetitia_note: laetitiaNote || null,
    } as any).eq("id", session.id) as any);

    const validActions = actionInputs.filter(a => a.title.trim());
    if (validActions.length > 0) {
      await (supabase.from("coaching_actions" as any) as any).insert(
        validActions.map(a => ({
          program_id: session.program_id,
          session_id: session.id,
          title: a.title.trim(),
          due_date: a.due_date || null,
        }))
      );
    }

    toast.success("Session complétée !");
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>📝 Compte-rendu · {getSessionTypeIcon(session.session_type)} {session.title}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium">Ce qu'on a fait</label>
            <textarea className="w-full rounded-xl border-2 border-input bg-card px-4 py-3 text-sm resize-none h-24" value={summary} onChange={e => setSummary(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Modules mis à jour</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ALL_MODULES.map(m => (
                <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox checked={modules.includes(m)} onCheckedChange={() => toggleModule(m)} />
                  <span className="text-sm">{m}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Actions pour la cliente</label>
            {actionInputs.map((a, i) => (
              <div key={i} className="flex gap-2 mt-1">
                <Input value={a.title} onChange={e => {
                  const copy = [...actionInputs]; copy[i].title = e.target.value; setActionInputs(copy);
                }} placeholder="Action" className="flex-1" />
                <Input type="date" value={a.due_date} onChange={e => {
                  const copy = [...actionInputs]; copy[i].due_date = e.target.value; setActionInputs(copy);
                }} className="w-36" />
              </div>
            ))}
            <button onClick={() => setActionInputs(prev => [...prev, { title: "", due_date: "" }])} className="text-xs text-primary font-semibold mt-1 hover:underline">+ Ajouter une action</button>
          </div>
          <div>
            <label className="text-sm font-medium">Mon mot pour elle</label>
            <textarea className="w-full rounded-xl border-2 border-input bg-card px-4 py-3 text-sm resize-none h-16" value={laetitiaNote} onChange={e => setLaetitiaNote(e.target.value)} />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full rounded-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            💾 Enregistrer et marquer complétée
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
