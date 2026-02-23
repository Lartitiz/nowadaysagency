import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, ChevronRight, AlertTriangle, ArrowLeft, GripVertical, Trash2, Pause, Play, Upload, Unlock } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { format, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import {
  FOCUS_TOPICS, FIXED_SESSIONS, DEFAULT_DELIVERABLES,
  getFocusLabel, getFocusIcon, getSessionTypeIcon, getSessionTypeLabel,
} from "@/lib/coaching-constants";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */
interface ProgramWithProfile {
  id: string;
  client_user_id: string;
  current_phase: string;
  current_month: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  whatsapp_link: string | null;
  calendly_link: string | null;
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
  private_notes: string | null;
  program_id: string;
  session_type: string | null;
  focus_topic: string | null;
  focus_label: string | null;
  duration_minutes: number;
}

interface DeliverableData {
  id: string;
  program_id: string;
  title: string;
  type: string | null;
  route: string | null;
  status: string;
  delivered_at: string | null;
  file_url: string | null;
  file_name: string | null;
  assigned_session_id: string | null;
}

interface ActionData {
  id: string;
  program_id: string;
  session_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
}

const ALL_MODULES = ["Branding", "Cible", "Offres", "Ton", "Histoire", "Éditoriale", "Bio", "Calendrier"];
const SESSION_TYPES = [
  { value: "launch", label: "🎯 Lancement" },
  { value: "strategy", label: "📊 Stratégie" },
  { value: "checkpoint", label: "✅ Point" },
  { value: "focus", label: "🔧 Focus" },
];
const DURATION_OPTIONS = [
  { value: 30, label: "30min" },
  { value: 60, label: "1h" },
  { value: 90, label: "1h30" },
  { value: 120, label: "2h" },
];
const STATUS_OPTIONS = [
  { value: "scheduled", label: "🔜 À venir" },
  { value: "confirmed", label: "📅 Planifiée" },
  { value: "completed", label: "✅ Terminée" },
];

function formatDuration(mins: number) {
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */
export default function AdminCoachingPage() {
  const { user } = useAuth();
  const [programs, setPrograms] = useState<ProgramWithProfile[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  const isAdmin = user?.email === "laetitia@nowadaysagency.com";

  const loadData = useCallback(async () => {
    if (!isAdmin) return;
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
  }, [isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  if (selectedProgramId) {
    const program = programs.find(p => p.id === selectedProgramId);
    if (!program) { setSelectedProgramId(null); return null; }
    return (
      <ProgramDetailView
        program={program}
        sessions={sessions.filter(s => s.program_id === selectedProgramId)}
        onBack={() => { setSelectedProgramId(null); loadData(); }}
        onReload={loadData}
      />
    );
  }

  const activePrograms = programs.filter(p => p.status === "active" || p.status === "paused");
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
                <div key={p.id} className="rounded-2xl border border-border bg-card p-5 cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelectedProgramId(p.id)}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-display font-bold text-foreground flex items-center gap-2">
                        {p.client_name || "Cliente"}
                        {p.status === "paused" && <Badge variant="secondary" className="text-[10px]">⏸️ En pause</Badge>}
                      </h3>
                      {p.client_activity && <p className="text-xs text-muted-foreground">{p.client_activity}</p>}
                    </div>
                    <Badge variant="secondary">Mois {p.current_month || 1}/6</Badge>
                  </div>
                  <Progress value={pct} className="h-2 mb-3" />
                  <div className="space-y-1 text-sm text-muted-foreground mb-3">
                    {next ? (
                      <p>📅 Prochaine : {format(new Date(next.scheduled_date!), "d MMM", { locale: fr })} · {next.title}</p>
                    ) : (
                      <p className="text-destructive flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Aucune session planifiée</p>
                    )}
                    <p>📚 Sessions : {stats.done}/{stats.total}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-primary font-semibold">
                    Voir le programme <ChevronRight className="h-3 w-3" />
                  </div>
                </div>
              );
            })}

            {completedPrograms.length > 0 && (
              <div className="mt-8">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Programmes terminés</p>
                {completedPrograms.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 rounded-lg px-2 transition-colors" onClick={() => setSelectedProgramId(p.id)}>
                    <span className="text-sm text-muted-foreground">{p.client_name} · Terminé</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <AddClientDialog open={addOpen} onOpenChange={setAddOpen} coachUserId={user?.id || ""} onCreated={loadData} />
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PROGRAM DETAIL VIEW
   ═══════════════════════════════════════════════════════════ */
function ProgramDetailView({
  program, sessions: initialSessions, onBack, onReload,
}: {
  program: ProgramWithProfile;
  sessions: SessionData[];
  onBack: () => void;
  onReload: () => void;
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [deliverables, setDeliverables] = useState<DeliverableData[]>([]);
  const [actions, setActions] = useState<ActionData[]>([]);
  const [editingSession, setEditingSession] = useState<SessionData | null>(null);
  const [addingSession, setAddingSession] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [savedField, setSavedField] = useState<string | null>(null);

  const showSaved = (field: string) => {
    setSavedField(field);
    setTimeout(() => setSavedField(null), 1200);
  };

  useEffect(() => {
    (async () => {
      const [dRes, aRes] = await Promise.all([
        (supabase.from("coaching_deliverables" as any).select("*").eq("program_id", program.id).order("created_at") as any),
        (supabase.from("coaching_actions" as any).select("*").eq("program_id", program.id).order("created_at") as any),
      ]);
      setDeliverables((dRes.data || []) as DeliverableData[]);
      setActions((aRes.data || []) as ActionData[]);
    })();
  }, [program.id]);

  useEffect(() => { setSessions(initialSessions); }, [initialSessions]);

  const updateProgram = async (field: string, value: any) => {
    await (supabase.from("coaching_programs" as any).update({ [field]: value } as any).eq("id", program.id) as any);
    showSaved(field);
    onReload();
  };

  const updateSession = async (id: string, updates: Record<string, any>) => {
    await (supabase.from("coaching_sessions" as any).update(updates as any).eq("id", id) as any);
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    showSaved("session-" + id);
  };

  const deleteSession = async (id: string) => {
    await (supabase.from("coaching_sessions" as any).delete().eq("id", id) as any);
    setSessions(prev => {
      const remaining = prev.filter(s => s.id !== id);
      remaining.sort((a, b) => a.session_number - b.session_number);
      remaining.forEach((s, i) => {
        s.session_number = i + 1;
        (supabase.from("coaching_sessions" as any).update({ session_number: i + 1 } as any).eq("id", s.id) as any);
      });
      return [...remaining];
    });
    setEditingSession(null);
    toast.success("Session supprimée");
  };

  const addSession = async (data: Partial<SessionData>) => {
    const maxNum = sessions.length > 0 ? Math.max(...sessions.map(s => s.session_number)) : 0;
    const { data: inserted } = await (supabase.from("coaching_sessions" as any).insert({
      program_id: program.id,
      session_number: maxNum + 1,
      phase: data.session_type === "focus" ? "focus" : "strategy",
      title: data.title || "À définir ensemble",
      session_type: data.session_type || "focus",
      focus_topic: data.focus_topic || null,
      duration_minutes: data.duration_minutes || 60,
      status: "scheduled",
      scheduled_date: data.scheduled_date || null,
    } as any).select().single() as any);
    if (inserted) setSessions(prev => [...prev, inserted as SessionData]);
    setAddingSession(false);
    toast.success("Session ajoutée !");
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSessions(prev => {
      const oldIdx = prev.findIndex(s => s.id === active.id);
      const newIdx = prev.findIndex(s => s.id === over.id);
      const reordered = arrayMove(prev, oldIdx, newIdx);
      reordered.forEach((s, i) => {
        s.session_number = i + 1;
        (supabase.from("coaching_sessions" as any).update({ session_number: i + 1 } as any).eq("id", s.id) as any);
      });
      return reordered;
    });
  };

  // Deliverable CRUD
  const addDeliverable = async (assignedSessionId?: string) => {
    const { data: d } = await (supabase.from("coaching_deliverables" as any).insert({
      program_id: program.id,
      title: "Nouveau livrable",
      status: "pending",
      assigned_session_id: assignedSessionId || null,
    } as any).select().single() as any);
    if (d) setDeliverables(prev => [...prev, d as DeliverableData]);
  };
  const updateDeliverable = async (id: string, updates: Record<string, any>) => {
    await (supabase.from("coaching_deliverables" as any).update(updates as any).eq("id", id) as any);
    setDeliverables(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };
  const deleteDeliverable = async (id: string) => {
    await (supabase.from("coaching_deliverables" as any).delete().eq("id", id) as any);
    setDeliverables(prev => prev.filter(d => d.id !== id));
  };

  // Action CRUD
  const addAction = async (sessionId?: string) => {
    const { data: a } = await (supabase.from("coaching_actions" as any).insert({
      program_id: program.id,
      session_id: sessionId || null,
      title: "Nouvelle action",
    } as any).select().single() as any);
    if (a) setActions(prev => [...prev, a as ActionData]);
  };
  const toggleAction = async (id: string, completed: boolean) => {
    const updates = completed ? { completed: true, completed_at: new Date().toISOString() } : { completed: false, completed_at: null };
    await (supabase.from("coaching_actions" as any).update(updates as any).eq("id", id) as any);
    setActions(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };
  const deleteAction = async (id: string) => {
    await (supabase.from("coaching_actions" as any).delete().eq("id", id) as any);
    setActions(prev => prev.filter(a => a.id !== id));
  };

  // File upload
  const uploadFile = async (deliverableId: string, file: File) => {
    const path = `${program.id}/${deliverableId}/${file.name}`;
    const { error } = await supabase.storage.from("deliverables").upload(path, file, { upsert: true });
    if (error) { toast.error("Erreur upload : " + error.message); return; }
    const { data: urlData } = supabase.storage.from("deliverables").getPublicUrl(path);
    await updateDeliverable(deliverableId, { file_url: urlData.publicUrl, file_name: file.name });
    toast.success("📎 Fichier uploadé !");
  };

  const isPaused = program.status === "paused";

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-8">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 animate-fade-in">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Retour aux clientes
        </button>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Programme de {program.client_name}</h1>
            <p className="text-sm text-muted-foreground">Now Pilot · 6 mois · 250€/mois</p>
          </div>
          {isPaused && <Badge variant="secondary" className="text-sm">⏸️ En pause</Badge>}
        </div>

        {/* ── INFOS PROGRAMME ── */}
        <section className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Infos programme</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InlineField label="Début" type="date" value={program.start_date || ""} onSave={v => updateProgram("start_date", v)} saved={savedField === "start_date"} />
            <InlineField label="Fin" type="date" value={program.end_date || ""} onSave={v => updateProgram("end_date", v)} saved={savedField === "end_date"} />
            <InlineField label="Prix" type="number" value={String(program.price_monthly || 250)} suffix="€/mois" onSave={v => updateProgram("price_monthly", parseInt(v))} saved={savedField === "price_monthly"} />
            <InlineField label="Mois actuel" type="number" value={String(program.current_month || 1)} suffix="/ 6" onSave={v => updateProgram("current_month", parseInt(v))} saved={savedField === "current_month"} />
            <div className="col-span-2 flex items-center gap-2">
              <span className="text-muted-foreground text-sm w-20">Statut</span>
              <Select value={program.status} onValueChange={v => updateProgram("status", v)}>
                <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">✅ Actif</SelectItem>
                  <SelectItem value="paused">⏸️ En pause</SelectItem>
                  <SelectItem value="completed">🏁 Terminé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <InlineField label="WhatsApp" value={program.whatsapp_link || ""} onSave={v => updateProgram("whatsapp_link", v)} saved={savedField === "whatsapp_link"} />
            <InlineField label="Calendly" value={program.calendly_link || ""} onSave={v => updateProgram("calendly_link", v)} saved={savedField === "calendly_link"} />
          </div>
        </section>

        {/* ── SESSIONS ── */}
        <section className="rounded-2xl border border-border bg-card p-5 mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Mes sessions ({sessions.length})</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sessions.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {sessions.map(s => (
                  <SortableSessionRow
                    key={s.id}
                    session={s}
                    onEdit={() => setEditingSession(s)}
                    savedField={savedField}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {addingSession ? (
            <AddSessionInline onAdd={addSession} onCancel={() => setAddingSession(false)} />
          ) : (
            <button onClick={() => setAddingSession(true)} className="text-xs text-primary font-semibold hover:underline mt-3">+ Ajouter une session</button>
          )}
        </section>

        {/* ── LIVRABLES ── */}
        <section className="rounded-2xl border border-border bg-card p-5 mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            🎁 Livrables ({deliverables.filter(d => d.status === "delivered").length}/{deliverables.length} débloqués)
          </p>
          <div className="space-y-2">
            {deliverables.map(d => (
              <AdminDeliverableRow
                key={d.id}
                deliverable={d}
                sessions={sessions}
                onUpdate={updateDeliverable}
                onDelete={deleteDeliverable}
                onUpload={uploadFile}
              />
            ))}
          </div>
          <button onClick={() => addDeliverable()} className="text-xs text-primary font-semibold hover:underline mt-2">+ Ajouter un livrable</button>
        </section>

        {/* ── ACTIONS ── */}
        <section className="rounded-2xl border border-border bg-card p-5 mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Actions ({actions.filter(a => !a.completed).length} en cours)</p>
          <div className="space-y-2">
            {actions.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={a.completed} onCheckedChange={c => toggleAction(a.id, !!c)} />
                <span className={`flex-1 ${a.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>{a.title}</span>
                {a.session_id && <span className="text-[10px] text-muted-foreground">S{sessions.find(s => s.id === a.session_id)?.session_number}</span>}
                {a.due_date && <span className="text-xs text-muted-foreground">{format(new Date(a.due_date), "d MMM", { locale: fr })}</span>}
                <button onClick={() => deleteAction(a.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => addAction()} className="text-xs text-primary font-semibold hover:underline mt-2">+ Ajouter une action</button>
        </section>

        {/* ── ZONE DANGER ── */}
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <p className="text-xs font-semibold text-destructive uppercase tracking-wide mb-3">Zone danger</p>
          <div className="flex flex-wrap gap-3">
            {!isPaused ? (
              <Button variant="outline" size="sm" className="rounded-full text-sm gap-2 border-secondary text-secondary-foreground hover:bg-secondary/30" onClick={() => setPauseDialogOpen(true)}>
                <Pause className="h-3.5 w-3.5" /> Mettre en pause
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="rounded-full text-sm gap-2 border-primary text-primary hover:bg-primary/10" onClick={async () => { await updateProgram("status", "active"); toast.success("Programme repris !"); }}>
                <Play className="h-3.5 w-3.5" /> Reprendre
              </Button>
            )}
            <Button variant="outline" size="sm" className="rounded-full text-sm gap-2 border-destructive text-destructive hover:bg-destructive/10" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Supprimer
            </Button>
          </div>
        </section>

        {/* Dialogs */}
        {editingSession && (
          <SessionEditDialog
            session={editingSession}
            sessions={sessions}
            deliverables={deliverables}
            actions={actions}
            onUpdate={(id, u) => { updateSession(id, u); setEditingSession(prev => prev ? { ...prev, ...u } : null); }}
            onDelete={deleteSession}
            onClose={() => setEditingSession(null)}
            onAddAction={addAction}
            onDeleteAction={deleteAction}
            onToggleAction={toggleAction}
            onUpdateDeliverable={updateDeliverable}
            onAddDeliverable={addDeliverable}
            onUploadFile={uploadFile}
          />
        )}
        <PauseDialog open={pauseDialogOpen} clientName={program.client_name || ""} onConfirm={async () => { await updateProgram("status", "paused"); setPauseDialogOpen(false); toast.success("Programme en pause"); }} onCancel={() => setPauseDialogOpen(false)} />
        <DeleteClientDialog
          open={deleteDialogOpen}
          clientName={program.client_name || ""}
          sessionCount={sessions.length}
          deliverableCount={deliverables.length}
          actionCount={actions.length}
          onConfirm={async () => {
            await (supabase.from("coaching_actions" as any).delete().eq("program_id", program.id) as any);
            await (supabase.from("coaching_deliverables" as any).delete().eq("program_id", program.id) as any);
            await (supabase.from("coaching_sessions" as any).delete().eq("program_id", program.id) as any);
            await (supabase.from("coaching_programs" as any).delete().eq("id", program.id) as any);
            await (supabase.from("profiles" as any).update({ current_plan: "outil" } as any).eq("user_id", program.client_user_id) as any);
            toast.success("Programme supprimé.");
            onBack();
          }}
          onCancel={() => setDeleteDialogOpen(false)}
        />
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   INLINE FIELD EDITOR
   ═══════════════════════════════════════════════════════════ */
function InlineField({ label, value, type = "text", suffix, onSave, saved }: {
  label: string; value: string; type?: string; suffix?: string; onSave: (v: string) => void; saved: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-sm w-20 shrink-0">{label}</span>
      <input type={type} className="flex-1 bg-transparent text-foreground text-sm border-none focus:outline-none focus:bg-muted/30 rounded px-1 py-0.5 transition-colors min-w-0" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft !== value) onSave(draft); }} />
      {suffix && <span className="text-xs text-muted-foreground shrink-0">{suffix}</span>}
      {saved && <span className="text-[11px] text-primary animate-fade-in shrink-0">💾</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SORTABLE SESSION ROW
   ═══════════════════════════════════════════════════════════ */
function SortableSessionRow({ session, onEdit, savedField }: {
  session: SessionData; onEdit: () => void; savedField: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: session.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const isCompleted = session.status === "completed";
  const isFixed = session.session_type && ["launch", "strategy", "checkpoint"].includes(session.session_type);
  const icon = isFixed ? getSessionTypeIcon(session.session_type) : getFocusIcon(session.focus_topic);
  const statusIcon = isCompleted ? "✅" : session.scheduled_date ? "📅" : "🔜";

  return (
    <div ref={setNodeRef} style={style} className={`rounded-xl border p-3 flex items-center gap-2 group ${isCompleted ? "border-primary/20 bg-primary/5" : isFixed ? "border-primary/20 bg-rose-pale/30" : "border-border"}`}>
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"><GripVertical className="h-4 w-4" /></button>
      <span className="text-xs text-muted-foreground w-5 text-center">{session.session_number}</span>
      <span>{icon}</span>
      <span className="text-sm font-semibold text-foreground flex-1 truncate">{session.title || "À définir"}</span>
      <span className="text-xs text-muted-foreground">{formatDuration(session.duration_minutes)}</span>
      {session.scheduled_date && <span className="text-xs text-muted-foreground">{format(new Date(session.scheduled_date), "d MMM", { locale: fr })}</span>}
      <span className="text-sm">{statusIcon}</span>
      {savedField === "session-" + session.id && <span className="text-[11px] text-primary animate-fade-in">💾</span>}
      <button onClick={onEdit} className="text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity" title="Modifier">✏️</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SESSION EDIT DIALOG — Full editing with deliverables + actions
   ═══════════════════════════════════════════════════════════ */
function SessionEditDialog({ session, sessions, deliverables, actions, onUpdate, onDelete, onClose, onAddAction, onDeleteAction, onToggleAction, onUpdateDeliverable, onAddDeliverable, onUploadFile }: {
  session: SessionData;
  sessions: SessionData[];
  deliverables: DeliverableData[];
  actions: ActionData[];
  onUpdate: (id: string, u: Record<string, any>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onAddAction: (sessionId?: string) => void;
  onDeleteAction: (id: string) => void;
  onToggleAction: (id: string, completed: boolean) => void;
  onUpdateDeliverable: (id: string, updates: Record<string, any>) => void;
  onAddDeliverable: (sessionId?: string) => void;
  onUploadFile: (deliverableId: string, file: File) => void;
}) {
  const [title, setTitle] = useState(session.title || "");
  const [sessionType, setSessionType] = useState(session.session_type || "focus");
  const [focusTopic, setFocusTopic] = useState(session.focus_topic || "");
  const [duration, setDuration] = useState(session.duration_minutes);
  const [date, setDate] = useState(session.scheduled_date ? session.scheduled_date.substring(0, 10) : "");
  const [time, setTime] = useState(session.scheduled_date && session.scheduled_date.length > 10 ? session.scheduled_date.substring(11, 16) : "");
  const [meetingLink, setMeetingLink] = useState(session.meeting_link || "");
  const [status, setStatus] = useState(session.status);
  const [prepNotes, setPrepNotes] = useState(session.prep_notes || "");
  const [summary, setSummary] = useState(session.summary || "");
  const [laetitiaNote, setLaetitiaNote] = useState(session.laetitia_note || "");
  const [privateNotes, setPrivateNotes] = useState(session.private_notes || "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sessionDeliverables = deliverables.filter(d => d.assigned_session_id === session.id);
  const unassignedDeliverables = deliverables.filter(d => !d.assigned_session_id);
  const sessionActions = actions.filter(a => a.session_id === session.id);

  const handleSave = () => {
    const scheduled = date ? (time ? `${date}T${time}:00` : date) : null;
    onUpdate(session.id, {
      title, session_type: sessionType, focus_topic: focusTopic || null,
      duration_minutes: duration, scheduled_date: scheduled,
      meeting_link: meetingLink || null, status,
      prep_notes: prepNotes || null, summary: summary || null,
      laetitia_note: laetitiaNote || null, private_notes: privateNotes || null,
    });
    toast.success("Session mise à jour !");
    onClose();
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Session {session.session_number} · {session.title || "À définir"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* ── INFOS ── */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Infos</p>
          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {SESSION_TYPES.map(t => (
                <Button key={t.value} type="button" size="sm" variant={sessionType === t.value ? "default" : "outline"} className="rounded-full text-xs" onClick={() => setSessionType(t.value)}>{t.label}</Button>
              ))}
            </div>
          </div>
          {sessionType === "focus" && (
            <div>
              <Label className="text-xs text-muted-foreground">Focus</Label>
              <Select value={focusTopic || "none"} onValueChange={v => { const topic = v === "none" ? "" : v; setFocusTopic(topic); if (topic && topic !== "custom") setTitle(getFocusLabel(topic)); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">💬 À définir</SelectItem>
                  {FOCUS_TOPICS.map(t => (<SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div><Label className="text-xs text-muted-foreground">Titre</Label><Input value={title} onChange={e => setTitle(e.target.value)} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-muted-foreground">Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Heure</Label><Input type="time" value={time} onChange={e => setTime(e.target.value)} className="mt-1" /></div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Durée</Label>
            <div className="flex gap-2 mt-1">
              {DURATION_OPTIONS.map(d => (<Button key={d.value} type="button" size="sm" variant={duration === d.value ? "default" : "outline"} className="rounded-full text-xs" onClick={() => setDuration(d.value)}>{d.label}</Button>))}
            </div>
          </div>
          <div><Label className="text-xs text-muted-foreground">Lien visio</Label><Input value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholder="https://meet.google.com/xxx" className="mt-1" /></div>
          <div>
            <Label className="text-xs text-muted-foreground">Statut</Label>
            <div className="flex gap-2 mt-1">
              {STATUS_OPTIONS.map(s => (<Button key={s.value} type="button" size="sm" variant={status === s.value ? "default" : "outline"} className="rounded-full text-xs" onClick={() => setStatus(s.value)}>{s.label}</Button>))}
            </div>
          </div>

          {/* ── COMPTE-RENDU ── */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">Compte-rendu (visible par la cliente)</p>
          <VoiceTextarea value={summary} onChange={setSummary} placeholder="On a posé les fondations de ta com'..." />

          {/* ── MOT PERSO ── */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mot perso (visible, en italique rose)</p>
          <VoiceTextarea value={laetitiaNote} onChange={setLaetitiaNote} placeholder="Un mot d'encouragement personnel..." />

          {/* ── PRÉPA CLIENTE ── */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prépa cliente (visible avant la session)</p>
          <Textarea value={prepNotes} onChange={e => setPrepNotes(e.target.value)} className="min-h-[60px] text-sm" placeholder="Regarde tes 10 derniers posts..." />

          {/* ── NOTES PRIVÉES ── */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes privées (PAS visible par la cliente)</p>
          <Textarea value={privateNotes} onChange={e => setPrivateNotes(e.target.value)} className="min-h-[60px] text-sm" placeholder="Penser à revoir sa bio..." />

          {/* ── LIVRABLES ── */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">Livrables de cette session</p>
          <div className="space-y-2">
            {sessionDeliverables.map(d => (
              <SessionDeliverableRow key={d.id} deliverable={d} onUpdate={onUpdateDeliverable} onUpload={onUploadFile} />
            ))}
          </div>
          {unassignedDeliverables.length > 0 && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Assigner un livrable existant :</p>
              <div className="space-y-1">
                {unassignedDeliverables.map(d => (
                  <button key={d.id} onClick={() => onUpdateDeliverable(d.id, { assigned_session_id: session.id })} className="text-xs text-primary hover:underline block">
                    + {d.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => onAddDeliverable(session.id)} className="text-xs text-primary font-semibold hover:underline">+ Ajouter un livrable personnalisé</button>

          {/* ── ACTIONS ── */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">Actions pour la cliente</p>
          <div className="space-y-1.5">
            {sessionActions.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={a.completed} onCheckedChange={c => onToggleAction(a.id, !!c)} />
                <span className={`flex-1 ${a.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>{a.title}</span>
                <button onClick={() => onDeleteAction(a.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => onAddAction(session.id)} className="text-xs text-primary font-semibold hover:underline">+ Ajouter une action</button>

          {/* ── SAVE / DELETE ── */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1 rounded-full">💾 Enregistrer</Button>
            {!confirmDelete ? (
              <Button variant="outline" size="sm" className="rounded-full text-xs text-destructive border-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(true)}><Trash2 className="h-3.5 w-3.5" /></Button>
            ) : (
              <Button variant="destructive" size="sm" className="rounded-full text-xs" onClick={() => onDelete(session.id)}>Confirmer</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Session Deliverable Row (in dialog) ── */
function SessionDeliverableRow({ deliverable, onUpdate, onUpload }: {
  deliverable: DeliverableData;
  onUpdate: (id: string, updates: Record<string, any>) => void;
  onUpload: (id: string, file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isDelivered = deliverable.status === "delivered";
  const [editTitle, setEditTitle] = useState(deliverable.title);

  return (
    <div className={`rounded-lg border p-2.5 space-y-1.5 ${isDelivered ? "border-green-300/50" : "border-border"}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm">{isDelivered ? "✅" : "☐"}</span>
        <input
          className="text-sm font-medium text-foreground flex-1 bg-transparent border-none focus:outline-none"
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          onBlur={() => { if (editTitle !== deliverable.title) onUpdate(deliverable.id, { title: editTitle }); }}
        />
        {!isDelivered && (
          <Button size="sm" variant="ghost" className="h-6 text-[11px] text-primary" onClick={() => onUpdate(deliverable.id, { status: "delivered", delivered_at: new Date().toISOString(), seen_by_client: false })}>
            <Unlock className="h-3 w-3 mr-1" /> Débloquer
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2 ml-5 text-xs">
        {deliverable.route && <span className="text-muted-foreground">→ {deliverable.route}</span>}
        {deliverable.file_url ? (
          <span className="text-muted-foreground">📎 {deliverable.file_name}</span>
        ) : (
          <>
            <input ref={fileRef} type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) onUpload(deliverable.id, e.target.files[0]); }} />
            <button onClick={() => fileRef.current?.click()} className="text-primary hover:underline flex items-center gap-1"><Upload className="h-3 w-3" /> Uploader</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Admin Deliverable Row (main list) ── */
function AdminDeliverableRow({ deliverable, sessions, onUpdate, onDelete, onUpload }: {
  deliverable: DeliverableData;
  sessions: SessionData[];
  onUpdate: (id: string, updates: Record<string, any>) => void;
  onDelete: (id: string) => void;
  onUpload: (id: string, file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isDelivered = deliverable.status === "delivered";
  const [editTitle, setEditTitle] = useState(deliverable.title);
  const assignedSession = sessions.find(s => s.id === deliverable.assigned_session_id);

  return (
    <div className={`rounded-lg border p-2.5 flex items-center gap-2 ${isDelivered ? "border-green-300/50" : "border-border"}`}>
      <span className="text-sm">{isDelivered ? "✅" : "🔒"}</span>
      <input className="text-sm font-medium text-foreground flex-1 bg-transparent border-none focus:outline-none min-w-0" value={editTitle} onChange={e => setEditTitle(e.target.value)} onBlur={() => { if (editTitle !== deliverable.title) onUpdate(deliverable.id, { title: editTitle }); }} />
      {assignedSession && <span className="text-[10px] text-muted-foreground shrink-0">S{assignedSession.session_number}</span>}
      <Select value={deliverable.assigned_session_id || "none"} onValueChange={v => onUpdate(deliverable.id, { assigned_session_id: v === "none" ? null : v })}>
        <SelectTrigger className="h-6 text-[10px] w-20 shrink-0"><SelectValue placeholder="Session" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">—</SelectItem>
          {sessions.map(s => (<SelectItem key={s.id} value={s.id}>S{s.session_number}</SelectItem>))}
        </SelectContent>
      </Select>
      {!isDelivered && (
        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-primary shrink-0" onClick={() => onUpdate(deliverable.id, { status: "delivered", delivered_at: new Date().toISOString(), seen_by_client: false })}>
          <Unlock className="h-3 w-3" />
        </Button>
      )}
      {deliverable.file_url ? (
        <span className="text-[10px] text-muted-foreground shrink-0">📎</span>
      ) : (
        <>
          <input ref={fileRef} type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) onUpload(deliverable.id, e.target.files[0]); }} />
          <button onClick={() => fileRef.current?.click()} className="text-muted-foreground hover:text-primary shrink-0"><Upload className="h-3.5 w-3.5" /></button>
        </>
      )}
      {deliverable.status !== "delivered" && (
        <button onClick={() => onDelete(deliverable.id)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ADD SESSION INLINE FORM
   ═══════════════════════════════════════════════════════════ */
function AddSessionInline({ onAdd, onCancel }: { onAdd: (data: Partial<SessionData>) => void; onCancel: () => void }) {
  const [sessionType, setSessionType] = useState("focus");
  const [focusTopic, setFocusTopic] = useState("");
  const [title, setTitle] = useState("À définir ensemble");
  const [duration, setDuration] = useState(60);
  const [date, setDate] = useState("");

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 mt-3 space-y-3">
      <p className="text-sm font-semibold text-foreground">Nouvelle session</p>
      <div>
        <Label className="text-xs text-muted-foreground">Type</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {SESSION_TYPES.map(t => (<Button key={t.value} type="button" size="sm" variant={sessionType === t.value ? "default" : "outline"} className="rounded-full text-xs" onClick={() => setSessionType(t.value)}>{t.label}</Button>))}
        </div>
      </div>
      {sessionType === "focus" && (
        <Select value={focusTopic || "none"} onValueChange={v => { const topic = v === "none" ? "" : v; setFocusTopic(topic); if (topic && topic !== "custom") setTitle(getFocusLabel(topic)); if (!topic) setTitle("À définir ensemble"); }}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Focus…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">💬 À définir</SelectItem>
            {FOCUS_TOPICS.map(t => (<SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>))}
          </SelectContent>
        </Select>
      )}
      <div className="flex gap-2">
        {DURATION_OPTIONS.filter(d => d.value >= 60).map(d => (<Button key={d.value} type="button" size="sm" variant={duration === d.value ? "default" : "outline"} className="rounded-full text-xs" onClick={() => setDuration(d.value)}>{d.label}</Button>))}
      </div>
      <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-xs" />
      <div className="flex gap-2">
        <Button size="sm" className="rounded-full" onClick={() => onAdd({ session_type: sessionType, focus_topic: focusTopic || undefined, title, duration_minutes: duration, scheduled_date: date || undefined })}>Ajouter</Button>
        <Button size="sm" variant="outline" className="rounded-full" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DELETE / PAUSE DIALOGS
   ═══════════════════════════════════════════════════════════ */
function DeleteClientDialog({ open, clientName, sessionCount, deliverableCount, actionCount, onConfirm, onCancel }: {
  open: boolean; clientName: string; sessionCount: number; deliverableCount: number; actionCount: number; onConfirm: () => Promise<void>; onCancel: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>⚠️ Supprimer le programme de {clientName} ?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>Supprime {sessionCount} sessions, {deliverableCount} livrables, {actionCount} actions. Le compte reste intact.</p>
              <div className="pt-2"><Label className="text-xs text-muted-foreground">Tape « SUPPRIMER » :</Label><Input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="SUPPRIMER" className="mt-1" /></div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Annuler</AlertDialogCancel>
          <Button variant="destructive" disabled={confirmText !== "SUPPRIMER" || deleting} onClick={async () => { setDeleting(true); await onConfirm(); setDeleting(false); }}>
            {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Supprimer
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PauseDialog({ open, clientName, onConfirm, onCancel }: { open: boolean; clientName: string; onConfirm: () => Promise<void>; onCancel: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>⏸️ Mettre en pause {clientName} ?</AlertDialogTitle>
          <AlertDialogDescription>Le compteur de mois s'arrête. Le WhatsApp reste actif.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Annuler</AlertDialogCancel>
          <Button onClick={onConfirm}>Mettre en pause</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ═══════════════════════════════════════════════════════════
   ADD CLIENT DIALOG
   ═══════════════════════════════════════════════════════════ */
interface FocusSessionInput { focus_topic: string; focus_label: string; duration: number; date: string; }

function AddClientDialog({ open, onOpenChange, coachUserId, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; coachUserId: string; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [whatsapp, setWhatsapp] = useState("");
  const [creating, setCreating] = useState(false);
  const [session1Date, setSession1Date] = useState("");
  const [session2Date, setSession2Date] = useState("");
  const [session3Date, setSession3Date] = useState("");
  const [focusSessions, setFocusSessions] = useState<FocusSessionInput[]>([
    { focus_topic: "", focus_label: "", duration: 120, date: "" },
    { focus_topic: "", focus_label: "", duration: 120, date: "" },
    { focus_topic: "", focus_label: "", duration: 60, date: "" },
    { focus_topic: "", focus_label: "", duration: 60, date: "" },
  ]);

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
  const addFocusSession = () => setFocusSessions(prev => [...prev, { focus_topic: "", focus_label: "", duration: 60, date: "" }]);
  const removeFocusSession = () => { if (focusSessions.length > 1) setFocusSessions(prev => prev.slice(0, -1)); };
  const totalSessions = 3 + focusSessions.length;
  const totalHours = Math.round((90 + 120 + 60 + focusSessions.reduce((s, f) => s + f.duration, 0)) / 60);
  const endDate = startDate ? (() => { const d = new Date(startDate); d.setMonth(d.getMonth() + 6); return d; })() : null;

  const handleCreate = async () => {
    if (!email.trim()) return toast.error("Email requis");
    setCreating(true);
    const { data: profile } = await (supabase.from("profiles" as any) as any).select("user_id, prenom").ilike("email", email.trim()).maybeSingle();
    if (!profile) { toast.error("Aucun compte trouvé avec « " + email.trim() + " »."); setCreating(false); return; }
    const clientUserId = (profile as any).user_id;
    const clientName = (profile as any).prenom || email.trim();
    const { data: existingProg } = await (supabase.from("coaching_programs" as any) as any).select("id, status").eq("client_user_id", clientUserId).maybeSingle();
    if (existingProg) { toast.info("Un programme existe déjà pour " + clientName + "."); setCreating(false); return; }
    const endDateStr = endDate ? format(endDate, "yyyy-MM-dd") : null;
    const { data: prog, error } = await (supabase.from("coaching_programs" as any).insert({
      client_user_id: clientUserId, coach_user_id: coachUserId, start_date: startDate, end_date: endDateStr,
      whatsapp_link: whatsapp || "https://wa.me/33614133921", formula: "now_pilot", duration_months: 6, price_monthly: 250, total_focus_sessions: focusSessions.length,
    } as any).select().single() as any);
    if (error) { toast.error("Erreur : " + error.message); setCreating(false); return; }

    const fixedSessionsToInsert = FIXED_SESSIONS.map((s, i) => ({
      program_id: prog.id, session_number: s.n, phase: s.phase, title: s.title, session_type: s.type,
      duration_minutes: s.duration, status: "scheduled", scheduled_date: [session1Date, session2Date, session3Date][i] || null,
    }));
    const focusSessionsToInsert = focusSessions.map((f, i) => ({
      program_id: prog.id, session_number: 4 + i, phase: "focus",
      title: f.focus_topic ? getFocusLabel(f.focus_topic) : "À définir ensemble",
      session_type: "focus", focus_topic: f.focus_topic || null,
      focus_label: f.focus_topic === "custom" ? f.focus_label : null,
      duration_minutes: f.duration, status: "scheduled", scheduled_date: f.date || null,
    }));
    await (supabase.from("coaching_sessions" as any).insert([...fixedSessionsToInsert, ...focusSessionsToInsert] as any) as any);

    const delivsToInsert = DEFAULT_DELIVERABLES.map(d => ({ program_id: prog.id, title: d.title, type: d.type, route: d.route, status: "pending" }));
    await (supabase.from("coaching_deliverables" as any).insert(delivsToInsert as any) as any);
    await (supabase.from("profiles" as any).update({ current_plan: "now_pilot" } as any).eq("user_id", clientUserId) as any);

    toast.success("Programme créé pour " + clientName + " ! 🎉");
    setEmail(""); setWhatsapp(""); setCreating(false); onOpenChange(false); onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>🤝 Créer un accompagnement Now Pilot</DialogTitle></DialogHeader>
        <div className="space-y-5 pt-2">
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">La cliente</p>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="lea@photo.com" />
          </section>
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Le programme</p>
            <div className="rounded-xl bg-rose-pale/50 p-3 text-sm text-foreground"><p className="font-semibold">Engagement : 6 mois · 250€/mois · 1 500€ total</p></div>
            <div className="mt-3"><label className="text-sm font-medium text-foreground">Date de début</label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1" /></div>
          </section>
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Les 3 sessions fixes</p>
            <div className="space-y-2">
              {FIXED_SESSIONS.map((s, i) => (
                <div key={s.n} className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div className="flex items-center gap-2"><span>{getSessionTypeIcon(s.type)}</span><p className="text-sm font-semibold text-foreground">Session {s.n} · {s.title} · {s.duration >= 60 ? `${s.duration / 60}h${s.duration % 60 ? "30" : ""}` : `${s.duration}min`}</p></div>
                  <Input type="date" value={[session1Date, session2Date, session3Date][i]} onChange={e => [setSession1Date, setSession2Date, setSession3Date][i](e.target.value)} className="w-40" />
                </div>
              ))}
            </div>
          </section>
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Les {focusSessions.length} sessions focus</p>
            <p className="text-[11px] text-muted-foreground mb-3">💡 Les focus seront décidés lors de l'Atelier Stratégique.</p>
            <div className="space-y-3">
              {focusSessions.map((fs, i) => (
                <div key={i} className="rounded-xl border border-border p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Session {4 + i}</p>
                  <div className="flex gap-2">
                    <Select value={fs.focus_topic || "none"} onValueChange={v => updateFocus(i, "focus_topic", v === "none" ? "" : v)}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Focus…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">💬 À définir</SelectItem>
                        {FOCUS_TOPICS.map(t => (<SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-1">
                      <Button type="button" size="sm" variant={fs.duration === 60 ? "default" : "outline"} className="rounded-full text-xs" onClick={() => updateFocus(i, "duration", 60)}>1h</Button>
                      <Button type="button" size="sm" variant={fs.duration === 120 ? "default" : "outline"} className="rounded-full text-xs" onClick={() => updateFocus(i, "duration", 120)}>2h</Button>
                    </div>
                  </div>
                  {fs.focus_topic === "custom" && <Input value={fs.focus_label} onChange={e => updateFocus(i, "focus_label", e.target.value)} placeholder="Sujet personnalisé…" />}
                  <Input type="date" value={fs.date} onChange={e => updateFocus(i, "date", e.target.value)} />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={addFocusSession} className="text-xs text-primary font-semibold hover:underline">+ Ajouter une session focus</button>
              {focusSessions.length > 1 && <button onClick={removeFocusSession} className="text-xs text-destructive font-semibold hover:underline">🗑️ Supprimer la dernière</button>}
            </div>
          </section>
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">WhatsApp</p>
            <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="https://wa.me/33612345678" />
          </section>
          <div className="rounded-xl bg-rose-pale/50 border border-primary/20 p-4 text-sm space-y-1">
            <p className="font-semibold text-foreground">🤝 Now Pilot · 6 mois · 250€/mois</p>
            <p className="text-muted-foreground">{totalSessions} sessions · ~{totalHours}h</p>
            {startDate && endDate && <p className="text-muted-foreground">{format(new Date(startDate), "d MMM yyyy", { locale: fr })} → {format(endDate, "d MMM yyyy", { locale: fr })}</p>}
          </div>
          <Button onClick={handleCreate} disabled={creating} className="w-full rounded-full">
            {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Créer le programme
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Textarea with voice ── */
function VoiceTextarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { isListening, toggle } = useSpeechRecognition(
    (transcript) => onChange(value ? value + " " + transcript : transcript),
  );
  return (
    <div className="relative">
      <Textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="min-h-[80px] text-sm pr-10" />
      <button type="button" onClick={toggle} className={`absolute right-2 bottom-2 p-1.5 rounded-full transition-all ${isListening ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-muted text-muted-foreground hover:bg-secondary"}`}>🎤</button>
    </div>
  );
}
