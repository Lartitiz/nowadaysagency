import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useDemoContext } from "@/contexts/DemoContext";
import { toast } from "sonner";
import { Pencil, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── helpers ────────────────────────────────────── */

export function parseToArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}
    return value
      .split(/[\n•\-●]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

export function parseToTags(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}
    return value
      .split(/[,;/\n]/)
      .map((s: string) => s.replace(/^["'\-•●\s]+|["'\s]+$/g, "").trim())
      .filter((s: string) => s.length > 0);
  }
  return [];
}

/* ── inline edit logic ──────────────────────────── */

interface EditableWrapperProps {
  value: string;
  field: string;
  table: string;
  multiline?: boolean;
  onUpdated?: (field: string, value: string, oldValue?: string) => void;
  children: (props: { onEdit: () => void }) => React.ReactNode;
}

function EditableWrapper({ value, field, table, multiline = true, onUpdated, children }: EditableWrapperProps) {
  const { user } = useAuth();
  const { column, value: wsValue } = useWorkspaceFilter();
  const { isDemoMode } = useDemoContext();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const oldValue = value || "";
    if (isDemoMode) {
      onUpdated?.(field, editValue, oldValue);
      setIsEditing(false);
      toast.success("C'est noté !");
      return;
    }
    if (!user) return;
    setIsSaving(true);
    try {
      if (table === "storytelling" || table === "persona") {
        const filterQuery = (supabase.from(table as any) as any).select("id").eq(column, wsValue);
        const filteredQuery = table === "storytelling" ? filterQuery.eq("is_primary", true) : filterQuery;
        const { data: existing } = await filteredQuery.maybeSingle();
        if (existing) {
          await (supabase.from(table as any) as any).update({ [field]: editValue, updated_at: new Date().toISOString() }).eq("id", existing.id);
        }
      } else {
        await (supabase.from(table as any) as any).upsert(
          { user_id: user.id, [field]: editValue, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      }
      onUpdated?.(field, editValue, oldValue);
      setIsEditing(false);
      toast.success("C'est noté !");
    } catch {
      toast.error("Erreur de sauvegarde");
    }
    setIsSaving(false);
  };

  if (isEditing) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-card p-5 mb-4">
        <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2 block">{field}</label>
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

  return <>{children({ onEdit: () => { setEditValue(value || ""); setIsEditing(true); } })}</>;
}

/* ── SectionCard ────────────────────────────────── */

interface SectionCardProps {
  label: string;
  value: any;
  type?: "text" | "list" | "tags" | "short";
  field: string;
  table: string;
  multiline?: boolean;
  onUpdated?: (field: string, value: string, oldValue?: string) => void;
  onStartCoaching?: () => void;
}

export function SectionCard({ label, value, type = "text", field, table, multiline, onUpdated, onStartCoaching }: SectionCardProps) {
  const rawValue = typeof value === "string" ? value : "";
  const isEmpty =
    !value ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0);

  return (
    <EditableWrapper value={rawValue} field={field} table={table} multiline={multiline ?? type !== "short"} onUpdated={onUpdated}>
      {({ onEdit }) => (
        <div className="rounded-2xl border border-border bg-card p-5 mb-4 group transition-colors hover:border-primary/20">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</h4>
            {!isEmpty && (
              <button onClick={onEdit} className="text-muted-foreground/30 hover:text-primary transition-colors text-sm opacity-0 group-hover:opacity-100">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {isEmpty ? (
            <p className="text-muted-foreground/50 text-sm italic">
              Pas encore renseigné ·{" "}
              {onStartCoaching ? (
                <button onClick={onStartCoaching} className="text-primary hover:underline">Compléter avec le coaching</button>
              ) : (
                <button onClick={onEdit} className="text-primary hover:underline">Remplir</button>
              )}
            </p>
          ) : type === "list" ? (
            <ul className="space-y-2">
              {(Array.isArray(value) ? value : parseToArray(value)).map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary mt-1 text-xs">●</span>
                  <span className="text-foreground/80 text-sm">{item}</span>
                </li>
              ))}
            </ul>
          ) : type === "tags" ? (
            <div className="flex flex-wrap gap-2">
              {(Array.isArray(value) ? value : parseToTags(value)).map((item: string, i: number) => (
                <span key={i} className="bg-primary/10 text-primary text-xs font-medium px-3 py-1.5 rounded-full">
                  {item}
                </span>
              ))}
            </div>
          ) : type === "short" ? (
            <p className="text-foreground text-sm font-medium">{value}</p>
          ) : (
            <TruncatedText text={String(value)} />
          )}
        </div>
      )}
    </EditableWrapper>
  );
}

/* ── HighlightCard ──────────────────────────────── */

interface HighlightCardProps {
  label: string;
  value: any;
  field: string;
  table: string;
  onUpdated?: (field: string, value: string, oldValue?: string) => void;
}

export function HighlightCard({ label, value, field, table, onUpdated }: HighlightCardProps) {
  const rawValue = typeof value === "string" ? value : "";
  const isEmpty = !value || (typeof value === "string" && !value.trim());

  return (
    <EditableWrapper value={rawValue} field={field} table={table} onUpdated={onUpdated}>
      {({ onEdit }) => (
        <div className="bg-gradient-to-r from-primary/5 to-transparent rounded-2xl p-5 border-l-4 border-primary group mb-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs uppercase tracking-wider text-primary/60 font-medium">💬 {label}</h4>
            {!isEmpty && (
              <button onClick={onEdit} className="text-primary/30 hover:text-primary text-sm opacity-0 group-hover:opacity-100 transition-colors">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {isEmpty ? (
            <p className="text-muted-foreground/50 text-sm italic">
              Pas encore renseigné · <button onClick={onEdit} className="text-primary hover:underline">Remplir</button>
            </p>
          ) : (
            <p className="text-foreground text-base font-medium italic leading-relaxed">"{value}"</p>
          )}
        </div>
      )}
    </EditableWrapper>
  );
}

/* ── TruncatedText ──────────────────────────────── */

function TruncatedText({ text, maxLines = 4 }: { text: string; maxLines?: number }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split("\n");
  const needsTruncation = lines.length > maxLines || text.length > 200;

  if (!needsTruncation || expanded) {
    return (
      <div>
        <p className="text-foreground/80 text-sm leading-relaxed whitespace-pre-line">{text}</p>
        {needsTruncation && (
          <button onClick={() => setExpanded(false)} className="text-primary text-xs mt-2 hover:underline flex items-center gap-1">
            <ChevronUp className="h-3 w-3" /> Réduire
          </button>
        )}
      </div>
    );
  }

  const truncated = text.length > 200 ? text.slice(0, 200) + "…" : lines.slice(0, maxLines).join("\n") + "…";
  return (
    <div>
      <p className="text-foreground/80 text-sm leading-relaxed whitespace-pre-line">{truncated}</p>
      <button onClick={() => setExpanded(true)} className="text-primary text-xs mt-2 hover:underline flex items-center gap-1">
        <ChevronDown className="h-3 w-3" /> Lire la suite
      </button>
    </div>
  );
}
