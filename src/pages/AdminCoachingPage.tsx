import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, ChevronRight, AlertTriangle, CalendarDays } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

interface ProgramWithProfile {
  id: string;
  client_user_id: string;
  current_phase: string;
  current_month: number;
  status: string;
  start_date: string | null;
  whatsapp_link: string | null;
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
}

const DEFAULT_SESSIONS = [
  { n: 1, phase: "strategy", title: "Audit + positionnement" },
  { n: 2, phase: "strategy", title: "Cible, offres, ton" },
  { n: 3, phase: "strategy", title: "Ligne éditoriale" },
  { n: 4, phase: "strategy", title: "Calendrier + templates" },
  { n: 5, phase: "strategy", title: "Contenus + mise en place (1)" },
  { n: 6, phase: "strategy", title: "Contenus + mise en place (2)" },
  { n: 7, phase: "binome", title: "Revue mensuelle · Mois 4" },
  { n: 8, phase: "binome", title: "Revue mensuelle · Mois 5" },
  { n: 9, phase: "binome", title: "Bilan + autonomie · Mois 6" },
];

const DEFAULT_DELIVERABLES = [
  "Audit de communication", "Branding complet", "Portrait cible",
  "Offres reformulées", "Ligne éditoriale", "Calendrier 3 mois",
  "Bio optimisée", "10-15 contenus", "Templates Canva", "Plan de com' 6 mois",
];

const ALL_MODULES = ["Branding", "Cible", "Offres", "Ton", "Histoire", "Éditoriale", "Bio", "Calendrier"];

export default function AdminCoachingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [programs, setPrograms] = useState<ProgramWithProfile[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [prepOpen, setPrepOpen] = useState<SessionData | null>(null);
  const [recapOpen, setRecapOpen] = useState<SessionData | null>(null);

  const isAdmin = user?.email === "laetitia@nowadaysagency.com";

  useEffect(() => {
    if (!isAdmin) return;
    loadData();
  }, [user?.id]);

  const loadData = async () => {
    setLoading(true);
    const { data: progs } = await (supabase.from("coaching_programs" as any).select("*").order("created_at", { ascending: false }) as any);
    const programList = (progs || []) as ProgramWithProfile[];

    // Load client profiles
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

    // Load all sessions
    const { data: allSessions } = await (supabase.from("coaching_sessions" as any).select("*").order("session_number") as any);
    setSessions((allSessions || []) as SessionData[]);
    setPrograms(programList);
    setLoading(false);
  };

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const activePrograms = programs.filter(p => p.status === "active");
  const completedPrograms = programs.filter(p => p.status === "completed");

  const getNextSession = (programId: string) => {
    return sessions.find(s => s.program_id === programId && s.status === "scheduled" && s.scheduled_date);
  };

  const getActionStats = (programId: string) => {
    // We'd need actions data too, but for simplicity show session count
    const progSessions = sessions.filter(s => s.program_id === programId);
    const done = progSessions.filter(s => s.status === "completed").length;
    return { done, total: progSessions.length };
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
              const stats = getActionStats(p.id);
              const pct = Math.round((p.current_month / 6) * 100);
              const phaseLabel = p.current_month <= 3 ? "Stratégie" : "Binôme";
              const progSessions = sessions.filter(s => s.program_id === p.id);
              const nextSchedulable = progSessions.find(s => s.status === "scheduled");

              return (
                <div key={p.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-display font-bold text-foreground">{p.client_name || "Cliente"}</h3>
                      {p.client_activity && <p className="text-xs text-muted-foreground">{p.client_activity}</p>}
                    </div>
                    <Badge variant="secondary">{phaseLabel} · Mois {p.current_month}/6</Badge>
                  </div>
                  <Progress value={pct} className="h-2 mb-3" />

                  <div className="space-y-1 text-sm text-muted-foreground mb-3">
                    {next ? (
                      <p>📅 Prochaine session : {format(new Date(next.scheduled_date!), "d MMM", { locale: fr })} · {next.title}</p>
                    ) : (
                      <p className="text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Aucune session planifiée</p>
                    )}
                    <p>📚 Sessions : {stats.done}/{stats.total} complétées</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="rounded-full text-xs gap-1" onClick={() => {/* TODO: coach view */ toast.info("Coach view — bientôt disponible")}}>
                      Voir son espace <ChevronRight className="h-3 w-3" />
                    </Button>
                    {nextSchedulable && (
                      <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={() => setPrepOpen(nextSchedulable)}>
                        📝 Préparer session
                      </Button>
                    )}
                    {progSessions.some(s => s.status === "scheduled") && (
                      <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={() => {
                        const lastScheduled = progSessions.filter(s => s.status === "scheduled")[0];
                        if (lastScheduled) setRecapOpen(lastScheduled);
                      }}>
                        📝 Compte-rendu
                      </Button>
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

        {/* Add Client Dialog */}
        <AddClientDialog open={addOpen} onOpenChange={setAddOpen} coachUserId={user?.id || ""} onCreated={loadData} />

        {/* Prep Session Dialog */}
        {prepOpen && <PrepSessionDialog session={prepOpen} onClose={() => { setPrepOpen(null); loadData(); }} />}

        {/* Recap Session Dialog */}
        {recapOpen && <RecapSessionDialog session={recapOpen} onClose={() => { setRecapOpen(null); loadData(); }} />}
      </main>
    </div>
  );
}

/* ── Add Client Dialog ── */
function AddClientDialog({ open, onOpenChange, coachUserId, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; coachUserId: string; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [whatsapp, setWhatsapp] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!email.trim()) return toast.error("Email requis");
    setCreating(true);

    // Find user by email in profiles (case-insensitive)
    const { data: profile } = await (supabase.from("profiles" as any) as any).select("user_id").ilike("email", email.trim()).maybeSingle();
    if (!profile) {
      toast.error(
        "Aucun compte trouvé avec l'email « " + email.trim() + " ». Vérifie l'orthographe ou demande-lui de créer son compte d'abord."
      );
      setCreating(false);
      return;
    }

    const clientUserId = (profile as any).user_id;
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 6);

    // Create program
    const { data: prog, error } = await (supabase.from("coaching_programs" as any).insert({
      client_user_id: clientUserId,
      coach_user_id: coachUserId,
      start_date: startDate,
      end_date: format(endDate, "yyyy-MM-dd"),
      whatsapp_link: whatsapp || null,
    } as any).select().single() as any);

    if (error) {
      toast.error("Erreur : " + error.message);
      setCreating(false);
      return;
    }

    // Create default sessions
    const sessionsToInsert = DEFAULT_SESSIONS.map(s => ({
      program_id: prog.id,
      session_number: s.n,
      phase: s.phase,
      title: s.title,
      status: "scheduled",
    }));
    await (supabase.from("coaching_sessions" as any).insert(sessionsToInsert as any) as any);

    // Create default deliverables
    const delivsToInsert = DEFAULT_DELIVERABLES.map(d => ({
      program_id: prog.id,
      title: d,
      status: "pending",
    }));
    await (supabase.from("coaching_deliverables" as any).insert(delivsToInsert as any) as any);

    toast.success("Programme créé !");
    setEmail("");
    setWhatsapp("");
    setCreating(false);
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Ajouter une cliente Now Pilot</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium text-foreground">Email de la cliente *</label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="camille@bijoux.com" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Date de début *</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Lien WhatsApp</label>
            <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="https://wa.me/33612345678" />
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

/* ── Prep Session Dialog ── */
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
        <DialogHeader><DialogTitle>📝 Préparer la session {session.session_number} · {session.title}</DialogTitle></DialogHeader>
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
            <textarea className="w-full rounded-xl border-2 border-input bg-card px-4 py-3 text-sm resize-none h-20" value={focus} onChange={e => setFocus(e.target.value)} placeholder="Notes de préparation..." />
          </div>
          <div>
            <label className="text-sm font-medium">Préparation pour la cliente</label>
            <textarea className="w-full rounded-xl border-2 border-input bg-card px-4 py-3 text-sm resize-none h-20" value={prepNotes} onChange={e => setPrepNotes(e.target.value)} placeholder="· Lister 5 sujets passion&#10;· Regarder tes 5 meilleurs posts" />
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

/* ── Recap Session Dialog ── */
function RecapSessionDialog({ session, onClose }: { session: SessionData; onClose: () => void }) {
  const [summary, setSummary] = useState(session.summary || "");
  const [laetitiaNote, setLaetitiaNote] = useState(session.laetitia_note || "");
  const [modules, setModules] = useState<string[]>(session.modules_updated || []);
  const [actionInputs, setActionInputs] = useState<{ title: string; due_date: string }[]>([{ title: "", due_date: "" }]);
  const [saving, setSaving] = useState(false);

  const toggleModule = (m: string) => {
    setModules(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  const handleSave = async () => {
    setSaving(true);
    await (supabase.from("coaching_sessions" as any).update({
      status: "completed",
      summary: summary || null,
      modules_updated: modules,
      laetitia_note: laetitiaNote || null,
    } as any).eq("id", session.id) as any);

    // Create actions
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
        <DialogHeader><DialogTitle>📝 Compte-rendu · Session {session.session_number} · {session.title}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium">Ce qu'on a fait</label>
            <textarea className="w-full rounded-xl border-2 border-input bg-card px-4 py-3 text-sm resize-none h-24" value={summary} onChange={e => setSummary(e.target.value)} placeholder="Résumé de la session..." />
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
                  const copy = [...actionInputs];
                  copy[i].title = e.target.value;
                  setActionInputs(copy);
                }} placeholder="Action" className="flex-1" />
                <Input type="date" value={a.due_date} onChange={e => {
                  const copy = [...actionInputs];
                  copy[i].due_date = e.target.value;
                  setActionInputs(copy);
                }} className="w-36" />
              </div>
            ))}
            <button onClick={() => setActionInputs(prev => [...prev, { title: "", due_date: "" }])} className="text-xs text-primary font-semibold mt-1 hover:underline">+ Ajouter une action</button>
          </div>

          <div>
            <label className="text-sm font-medium">Mon mot pour elle</label>
            <textarea className="w-full rounded-xl border-2 border-input bg-card px-4 py-3 text-sm resize-none h-16" value={laetitiaNote} onChange={e => setLaetitiaNote(e.target.value)} placeholder="Message perso, encouragement..." />
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
