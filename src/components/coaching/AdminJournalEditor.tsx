import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Upload, Loader2, Unlock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

interface JournalEntry {
  id: string;
  program_id: string;
  session_id: string | null;
  month_number: number | null;
  date: string | null;
  title: string;
  body: string | null;
  laetitia_note: string | null;
  deliverable_ids: string[];
  status: string;
}

interface SessionData {
  id: string;
  session_number: number;
  title: string | null;
}

interface DeliverableData {
  id: string;
  title: string;
  status: string;
  route: string | null;
  file_url: string | null;
  file_name: string | null;
  unlocked_at: string | null;
  unlocked_by_journal_id: string | null;
}

export default function AdminJournalEditor({ programId, clientName }: { programId: string; clientName: string }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [deliverables, setDeliverables] = useState<DeliverableData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const [jRes, sRes, dRes] = await Promise.all([
      (supabase.from("coaching_journal" as any) as any).select("*").eq("program_id", programId).order("date", { ascending: true, nullsFirst: false }),
      (supabase.from("coaching_sessions" as any) as any).select("id, session_number, title").eq("program_id", programId).order("session_number"),
      (supabase.from("coaching_deliverables" as any) as any).select("*").eq("program_id", programId).order("created_at"),
    ]);
    setEntries((jRes.data || []) as JournalEntry[]);
    setSessions((sRes.data || []) as SessionData[]);
    setDeliverables((dRes.data || []) as DeliverableData[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [programId]);

  const addEntry = async () => {
    const { data } = await (supabase.from("coaching_journal" as any) as any)
      .insert({ program_id: programId, title: "Nouvelle entrée", status: "upcoming", deliverable_ids: [] })
      .select().single();
    if (data) {
      setEntries(prev => [...prev, data as JournalEntry]);
      toast.success("Entrée ajoutée");
    }
  };

  const updateEntry = async (id: string, updates: Partial<JournalEntry>) => {
    await (supabase.from("coaching_journal" as any) as any).update(updates).eq("id", id);
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const deleteEntry = async (id: string) => {
    await (supabase.from("coaching_journal" as any) as any).delete().eq("id", id);
    setEntries(prev => prev.filter(e => e.id !== id));
    toast.success("Entrée supprimée");
  };

  const publishEntry = async (entry: JournalEntry) => {
    // When publishing, unlock the linked deliverables
    const ids = entry.deliverable_ids || [];
    if (ids.length > 0) {
      await (supabase.from("coaching_deliverables" as any) as any)
        .update({
          status: "delivered",
          unlocked_at: new Date().toISOString(),
          unlocked_by_journal_id: entry.id,
          delivered_at: new Date().toISOString(),
          seen_by_client: false,
        })
        .in("id", ids);
      setDeliverables(prev => prev.map(d =>
        ids.includes(d.id) ? { ...d, status: "delivered", unlocked_at: new Date().toISOString(), unlocked_by_journal_id: entry.id } : d
      ));
    }
    await updateEntry(entry.id, { status: "completed" });
    toast.success("Entrée publiée ! La cliente va la voir.");
  };

  // Upload file for a deliverable
  const uploadFile = async (deliverableId: string, file: File) => {
    const path = `${programId}/${deliverableId}/${file.name}`;
    const { error } = await supabase.storage.from("deliverables").upload(path, file, { upsert: true });
    if (error) { toast.error("Erreur upload : " + error.message); return; }
    const { data: urlData } = supabase.storage.from("deliverables").getPublicUrl(path);
    await (supabase.from("coaching_deliverables" as any) as any)
      .update({ file_url: urlData.publicUrl, file_name: file.name }).eq("id", deliverableId);
    setDeliverables(prev => prev.map(d => d.id === deliverableId ? { ...d, file_url: urlData.publicUrl, file_name: file.name } : d));
    toast.success("📎 Fichier uploadé !");
  };

  const unlockDeliverable = async (id: string) => {
    await (supabase.from("coaching_deliverables" as any) as any)
      .update({ status: "delivered", unlocked_at: new Date().toISOString(), delivered_at: new Date().toISOString(), seen_by_client: false })
      .eq("id", id);
    setDeliverables(prev => prev.map(d => d.id === id ? { ...d, status: "delivered", unlocked_at: new Date().toISOString() } : d));
    toast.success("Livrable débloqué !");
  };

  const deleteFile = async (deliverableId: string, fileName: string) => {
    const path = `${programId}/${deliverableId}/${fileName}`;
    await supabase.storage.from("deliverables").remove([path]);
    await (supabase.from("coaching_deliverables" as any) as any)
      .update({ file_url: null, file_name: null }).eq("id", deliverableId);
    setDeliverables(prev => prev.map(d => d.id === deliverableId ? { ...d, file_url: null, file_name: null } : d));
    toast.success("Fichier supprimé");
  };

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />;

  return (
    <div className="space-y-6">
      {/* ── JOURNAL ENTRIES ── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">📖 Journal de bord de {clientName}</p>
          <Button size="sm" variant="outline" className="rounded-full gap-1.5 text-xs" onClick={addEntry}>
            <Plus className="h-3.5 w-3.5" /> Ajouter une entrée
          </Button>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucune entrée. Cliquez sur « Ajouter » après une session.</p>
        ) : (
          <div className="space-y-6">
            {entries.map(entry => (
              <JournalEntryEditor
                key={entry.id}
                entry={entry}
                sessions={sessions}
                deliverables={deliverables}
                onUpdate={updateEntry}
                onDelete={deleteEntry}
                onPublish={publishEntry}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── DELIVERABLES WITH FILES ── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">🎁 Livrables de {clientName}</p>
        <div className="space-y-3">
          {deliverables.map(d => (
            <DeliverableRow
              key={d.id}
              deliverable={d}
              onUpload={uploadFile}
              onDeleteFile={deleteFile}
              onUnlock={unlockDeliverable}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── Single Journal Entry Editor ── */
function JournalEntryEditor({ entry, sessions, deliverables, onUpdate, onDelete, onPublish }: {
  entry: JournalEntry;
  sessions: SessionData[];
  deliverables: DeliverableData[];
  onUpdate: (id: string, u: Partial<JournalEntry>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPublish: (entry: JournalEntry) => Promise<void>;
}) {
  const [title, setTitle] = useState(entry.title);
  const [date, setDate] = useState(entry.date || "");
  const [monthNum, setMonthNum] = useState(entry.month_number?.toString() || "");
  const [sessionId, setSessionId] = useState(entry.session_id || "none");
  const [body, setBody] = useState(entry.body || "");
  const [note, setNote] = useState(entry.laetitia_note || "");
  const [delivIds, setDelivIds] = useState<string[]>(entry.deliverable_ids || []);
  const [saving, setSaving] = useState(false);

  const isPublished = entry.status === "completed";

  const toggleDeliverable = (id: string) => {
    setDelivIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(entry.id, {
      title,
      date: date || null,
      month_number: monthNum ? parseInt(monthNum) : null,
      session_id: sessionId === "none" ? null : sessionId,
      body: body || null,
      laetitia_note: note || null,
      deliverable_ids: delivIds,
    });
    setSaving(false);
    toast.success("Entrée enregistrée 💾");
  };

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${isPublished ? "border-green-300/50 bg-green-50/20" : "border-border"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase">
          {isPublished ? "✅ Publié" : "📝 Brouillon"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs text-muted-foreground">Date</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Mois</Label>
          <Input type="number" min={1} max={12} value={monthNum} onChange={e => setMonthNum(e.target.value)} className="mt-1 h-8 text-xs" placeholder="1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Session liée</Label>
          <Select value={sessionId} onValueChange={v => setSessionId(v)}>
            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucune</SelectItem>
              {sessions.map(s => (
                <SelectItem key={s.id} value={s.id}>Session {s.session_number} · {s.title || "—"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Titre</Label>
        <Input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 h-8 text-sm" />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Texte (visible par la cliente)</Label>
        <VoiceTextarea value={body} onChange={setBody} placeholder="On a posé les fondations de ta com'..." />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Mot perso pour la cliente</Label>
        <VoiceTextarea value={note} onChange={setNote} placeholder="Un mot d'encouragement personnel..." />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Livrables à débloquer avec cette entrée</Label>
        <div className="space-y-1.5">
          {deliverables.map(d => (
            <label key={d.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={delivIds.includes(d.id)}
                onCheckedChange={() => toggleDeliverable(d.id)}
              />
              <span className={`text-xs ${d.status === "delivered" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                {d.status === "delivered" ? "✅" : "☐"} {d.title}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" className="rounded-full text-xs gap-1.5" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          💾 Enregistrer
        </Button>
        {!isPublished && (
          <Button size="sm" variant="outline" className="rounded-full text-xs gap-1.5 border-green-500/50 text-green-700 hover:bg-green-50" onClick={() => { handleSave().then(() => onPublish({ ...entry, deliverable_ids: delivIds })); }}>
            ✅ Publier
          </Button>
        )}
        <Button size="sm" variant="ghost" className="rounded-full text-xs text-destructive hover:bg-destructive/10 ml-auto" onClick={() => onDelete(entry.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ── Deliverable Row (admin) ── */
function DeliverableRow({ deliverable, onUpload, onDeleteFile, onUnlock }: {
  deliverable: DeliverableData;
  onUpload: (id: string, file: File) => Promise<void>;
  onDeleteFile: (id: string, fileName: string) => Promise<void>;
  onUnlock: (id: string) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDelivered = deliverable.status === "delivered";

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${isDelivered ? "border-green-300/50" : "border-border"}`}>
      <div className="flex items-center gap-2">
        <span>{isDelivered ? "✅" : "🔒"}</span>
        <span className="text-sm font-medium text-foreground flex-1">{deliverable.title}</span>
        {deliverable.unlocked_at && (
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(deliverable.unlocked_at), "d MMM", { locale: fr })}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 ml-6">
        {deliverable.file_url ? (
          <div className="flex items-center gap-2 text-xs">
            <span>📎 {deliverable.file_name}</span>
            <a href={deliverable.file_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">📥</a>
            <button onClick={() => onDeleteFile(deliverable.id, deliverable.file_name!)} className="text-destructive hover:underline">🗑️</button>
          </div>
        ) : (
          <>
            <input ref={fileInputRef} type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) onUpload(deliverable.id, e.target.files[0]); }} />
            <Button size="sm" variant="outline" className="rounded-full text-[11px] gap-1 h-7" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3 w-3" /> Uploader un fichier
            </Button>
          </>
        )}

        {deliverable.route && (
          <span className="text-[10px] text-muted-foreground ml-auto">→ {deliverable.route}</span>
        )}
      </div>

      {!isDelivered && (
        <div className="ml-6">
          <Button size="sm" variant="ghost" className="rounded-full text-[11px] gap-1 h-7 text-primary hover:bg-primary/10" onClick={() => onUnlock(deliverable.id)}>
            <Unlock className="h-3 w-3" /> Débloquer maintenant
          </Button>
        </div>
      )}
    </div>
  );
}

/* ── Textarea with voice ── */
function VoiceTextarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { isListening, toggle } = useSpeechRecognition(
    (transcript) => onChange(value ? value + " " + transcript : transcript),
  );

  return (
    <div className="relative mt-1">
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[80px] text-sm pr-10"
      />
      <button
        type="button"
        onClick={toggle}
        className={`absolute right-2 bottom-2 p-1.5 rounded-full transition-all ${
          isListening ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-muted text-muted-foreground hover:bg-secondary"
        }`}
      >
        🎤
      </button>
    </div>
  );
}
