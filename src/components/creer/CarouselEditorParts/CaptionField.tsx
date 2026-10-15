// Chantier D (15/10/2026) : légende de la publication, repliée sous l'éditeur
// (un clic l'ouvre) pour que la page reste courte. Le début reste visible.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

export function CaptionField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const preview = value.replace(/\s+/g, " ").trim();
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
      >
        <span className="min-w-0">
          <span className="font-medium">Légende de la publication</span>
          {!open && (
            <span className="block truncate text-xs text-muted-foreground">
              {preview || "Le texte qui accompagne ton carrousel sur Instagram"}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
          {open ? "Replier" : "Modifier la légende"}
          <ChevronDown size={14} className={open ? "rotate-180" : ""} aria-hidden="true" />
        </span>
      </button>
      <div hidden={!open} className="px-3 pb-3">
        <Textarea aria-label="Légende du carrousel" rows={6} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
