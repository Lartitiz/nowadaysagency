import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { toast } from "sonner";
import { Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EditableFieldProps {
  label: string;
  value: string | null | undefined;
  field: string;
  table: string;
  idField?: string;
  recordId?: string;
  onUpdated?: (field: string, value: string) => void;
  onStartCoaching?: () => void;
  multiline?: boolean;
  className?: string;
}

export default function EditableField({
  label, value, field, table, idField, recordId, onUpdated, onStartCoaching, multiline = true, className = "",
}: EditableFieldProps) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (isDemoMode) {
      onUpdated?.(field, editValue);
      setIsEditing(false);
      toast.success("C'est noté !");
      return;
    }
    if (!user) return;
    setIsSaving(true);
    try {
      if (recordId && idField) {
        await (supabase.from(table as any) as any).update({ [field]: editValue, updated_at: new Date().toISOString() }).eq(idField, recordId);
      } else {
        await (supabase.from(table as any) as any).upsert({ user_id: user.id, [field]: editValue, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      }
      onUpdated?.(field, editValue);
      setIsEditing(false);
      toast.success("C'est noté !");
    } catch {
      toast.error("Erreur de sauvegarde");
    }
    setIsSaving(false);
  };

  if (isEditing) {
    return (
      <div className={`mb-6 ${className}`}>
        <label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block font-medium">{label}</label>
        {multiline ? (
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full border border-primary/30 rounded-lg p-3 text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 min-h-[80px] bg-card resize-none"
            autoFocus
          />
        ) : (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full border border-primary/30 rounded-lg p-3 text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 bg-card"
            autoFocus
          />
        )}
        <div className="flex gap-2 mt-2">
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="text-xs rounded-lg">
            {isSaving ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Sauvegarde...</> : "Sauvegarder"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditValue(value || ""); setIsEditing(false); }} className="text-xs text-muted-foreground">
            Annuler
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`mb-6 group ${className}`}>
      <div className="flex justify-between items-start">
        <label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block font-medium">{label}</label>
        <button
          onClick={() => { setEditValue(value || ""); setIsEditing(true); }}
          className="text-muted-foreground/40 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      {value && value.trim() ? (
        <p className="text-foreground text-sm leading-relaxed whitespace-pre-line">{value}</p>
      ) : (
        <p className="text-muted-foreground/50 text-sm italic">
          Pas encore renseigné ·{" "}
          {onStartCoaching ? (
            <button onClick={onStartCoaching} className="text-primary hover:underline">
              Compléter avec le coaching
            </button>
          ) : (
            <button onClick={() => setIsEditing(true)} className="text-primary hover:underline">
              Remplir manuellement
            </button>
          )}
        </p>
      )}
    </div>
  );
}
