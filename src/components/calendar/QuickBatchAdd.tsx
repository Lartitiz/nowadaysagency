import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { toLocalDateStr } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

interface QuickBatchAddProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStartDate: string;
  defaultCanal: string;
  onPostsAdded: () => void;
}

interface BatchRow {
  id: string;
  theme: string;
  dayIndex: number | null;
  canal: string;
  format: string;
}

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const CANAL_OPTIONS = [
  { id: "instagram", emoji: "📸", label: "Instagram" },
  { id: "linkedin", emoji: "💼", label: "LinkedIn" },
  { id: "newsletter", emoji: "📧", label: "Newsletter" },
  { id: "pinterest", emoji: "📌", label: "Pinterest" },
];

const FORMAT_OPTIONS = [
  { id: "", emoji: "—", label: "Aucun" },
  { id: "post", emoji: "📝", label: "Post" },
  { id: "carousel", emoji: "🎠", label: "Carrousel" },
  { id: "reel", emoji: "🎬", label: "Reel" },
  { id: "story", emoji: "📱", label: "Story" },
];

function makeRow(defaultCanal: string): BatchRow {
  return { id: crypto.randomUUID(), theme: "", dayIndex: null, canal: defaultCanal, format: "" };
}

export function QuickBatchAdd({ open, onOpenChange, weekStartDate, defaultCanal, onPostsAdded }: QuickBatchAddProps) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const { toast } = useToast();
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [saving, setSaving] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset rows when opening
  useEffect(() => {
    if (open) {
      const initial = [makeRow(defaultCanal), makeRow(defaultCanal), makeRow(defaultCanal)];
      setRows(initial);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [open, defaultCanal]);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStartDate + "T00:00:00");
    d.setDate(d.getDate() + i);
    return toLocalDateStr(d);
  });

  const updateRow = (index: number, field: keyof BatchRow, value: any) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (index === rows.length - 1 && rows[index].theme.trim()) {
        // Add new row and focus it
        setRows(prev => [...prev, makeRow(defaultCanal)]);
        setTimeout(() => inputRefs.current[index + 1]?.focus(), 50);
      } else if (index < rows.length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const addRow = () => {
    setRows(prev => [...prev, makeRow(defaultCanal)]);
    setTimeout(() => inputRefs.current[rows.length]?.focus(), 50);
  };

  const filledRows = rows.filter(r => r.theme.trim());

  const handleSubmit = async () => {
    if (!user || filledRows.length === 0) return;
    setSaving(true);

    const today = toLocalDateStr(new Date());
    const inserts = filledRows.map(r => ({
      user_id: user.id,
      ...(workspaceId && workspaceId !== user.id ? { workspace_id: workspaceId } : {}),
      theme: r.theme.trim(),
      date: r.dayIndex !== null ? weekDates[r.dayIndex] : today,
      canal: r.canal,
      format: r.format || null,
      status: "idea",
    }));

    const { error } = await (supabase.from("calendar_posts") as any).insert(inserts);

    if (error) {
      toast({ title: "Erreur", description: "Impossible d'ajouter les posts.", variant: "destructive" });
    } else {
      toast({ title: `${filledRows.length} post${filledRows.length > 1 ? "s" : ""} ajouté${filledRows.length > 1 ? "s" : ""} !` });
      onPostsAdded();
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-lg">📝 Vider ta tête</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Note tes idées et tes posts prévus. Tu pourras les compléter après.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
              {/* Theme input */}
              <Input
                ref={el => { inputRefs.current[index] = el; }}
                placeholder={`Idée #${index + 1}…`}
                value={row.theme}
                onChange={e => updateRow(index, "theme", e.target.value)}
                onKeyDown={e => handleKeyDown(e, index)}
                className="h-9 text-sm"
              />

              <div className="flex items-center gap-3 flex-wrap">
                {/* Day selector */}
                <div className="flex gap-0.5">
                  {DAY_LABELS.map((label, di) => (
                    <button
                      key={di}
                      type="button"
                      onClick={() => updateRow(index, "dayIndex", row.dayIndex === di ? null : di)}
                      className={cn(
                        "text-[11px] font-medium px-1.5 py-0.5 rounded-md transition-colors",
                        row.dayIndex === di
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Canal selector */}
                <div className="flex gap-0.5">
                  {CANAL_OPTIONS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      title={c.label}
                      onClick={() => updateRow(index, "canal", c.id)}
                      className={cn(
                        "text-sm px-1.5 py-0.5 rounded-md transition-colors",
                        row.canal === c.id
                          ? "bg-primary/15 ring-1 ring-primary/40"
                          : "hover:bg-muted/50"
                      )}
                    >
                      {c.emoji}
                    </button>
                  ))}
                </div>

                {/* Format selector */}
                <div className="flex gap-0.5">
                  {FORMAT_OPTIONS.filter(f => f.id).map(f => (
                    <button
                      key={f.id}
                      type="button"
                      title={f.label}
                      onClick={() => updateRow(index, "format", row.format === f.id ? "" : f.id)}
                      className={cn(
                        "text-sm px-1.5 py-0.5 rounded-md transition-colors",
                        row.format === f.id
                          ? "bg-accent ring-1 ring-accent-foreground/20"
                          : "hover:bg-muted/50"
                      )}
                    >
                      {f.emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" /> Ajouter une ligne
        </button>

        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {filledRows.length} post{filledRows.length !== 1 ? "s" : ""} à ajouter
          </span>
          <Button
            onClick={handleSubmit}
            disabled={filledRows.length === 0 || saving}
            size="sm"
          >
            {saving ? "Ajout…" : "Ajouter tout au calendrier"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
