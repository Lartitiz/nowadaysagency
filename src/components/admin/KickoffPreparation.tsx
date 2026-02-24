import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { format, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import {
  FOCUS_TOPICS, FIXED_SESSIONS, DEFAULT_DELIVERABLES,
  getFocusLabel, getSessionTypeIcon,
} from "@/lib/coaching-constants";

interface FocusSessionInput { focus_topic: string; focus_label: string; duration: number; date: string; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  coachUserId: string;
  onCreated: () => void;
}

export default function KickoffPreparation({ open, onOpenChange, coachUserId, onCreated }: Props) {
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
