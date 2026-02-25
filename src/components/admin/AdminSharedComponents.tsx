import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";

/* ── Inline Field Editor ── */
export function InlineField({ label, value, type = "text", suffix, onSave, saved }: {
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

/* ── Textarea with voice ── */
export function VoiceTextarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
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

/* ── Dashboard Message Editor ── */
export function DashboardMessageEditor({ value, onSave }: { value: string; onSave: (msg: string) => Promise<void> }) {
  const [msg, setMsg] = useState(value);
  const [saving, setSaving] = useState(false);
  const { isListening, toggle } = useSpeechRecognition(
    (transcript) => setMsg(prev => prev ? prev + " " + transcript : transcript),
  );

  const handleSave = async () => {
    setSaving(true);
    await onSave(msg);
    setSaving(false);
    toast.success("Message dashboard mis à jour ✨");
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          placeholder="Bienvenue dans ton accompagnement ! J'ai hâte de bosser ensemble 🌸"
          className="min-h-[60px] text-sm pr-10"
        />
        <button type="button" onClick={toggle} className={`absolute right-2 bottom-2 p-1.5 rounded-full transition-all ${isListening ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-muted text-muted-foreground hover:bg-secondary"}`}>🎤</button>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="rounded-full text-xs gap-1" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          💾 Sauvegarder
        </Button>
        <span className="text-[10px] text-muted-foreground">Ce message s'affiche sur le dashboard de ta cliente.</span>
      </div>
    </div>
  );
}

/* ── Delete Client Dialog ── */
export function DeleteClientDialog({ open, clientName, sessionCount, deliverableCount, actionCount, onConfirm, onCancel }: {
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

/* ── Pause Dialog ── */
export function PauseDialog({ open, clientName, onConfirm, onCancel }: { open: boolean; clientName: string; onConfirm: () => Promise<void>; onCancel: () => void }) {
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
