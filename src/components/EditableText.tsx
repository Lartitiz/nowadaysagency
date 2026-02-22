import { useState, useRef, useEffect, useCallback } from "react";
import { Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EditableTextProps {
  value: string;
  onSave: (newValue: string) => Promise<void> | void;
  type?: "input" | "textarea";
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function EditableText({
  value,
  onSave,
  type = "textarea",
  placeholder,
  className = "",
  disabled = false,
}: EditableTextProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.selectionStart = ref.current.value.length;
      if (type === "textarea" && ref.current instanceof HTMLTextAreaElement) {
        autoResize(ref.current);
      }
    }
  }, [editing, type]);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  const handleSave = useCallback(async () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      toast({ title: "Erreur de sauvegarde", description: e?.message || "Réessaie.", variant: "destructive" });
      setDraft(value);
    }
    setSaving(false);
    setEditing(false);
  }, [draft, value, onSave, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setDraft(value); setEditing(false); }
    if (type === "input" && e.key === "Enter") { e.preventDefault(); handleSave(); }
  };

  if (disabled) {
    return <span className={className}>{value || <span className="italic text-muted-foreground">{placeholder || ""}</span>}</span>;
  }

  if (!editing) {
    return (
      <span className="relative inline">
        <span
          onClick={() => setEditing(true)}
          className={`cursor-text rounded px-0.5 -mx-0.5 transition-colors hover:bg-[hsl(270,50%,97%)] ${className}`}
        >
          {value || <span className="italic text-muted-foreground">{placeholder || "Cliquer pour modifier"}</span>}
        </span>
        {saved && (
          <span className="ml-2 text-xs text-primary animate-fade-in">✓ Modifié</span>
        )}
      </span>
    );
  }

  const sharedClasses = `w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:border-primary transition-colors ${className}`;

  return (
    <div className="relative">
      {type === "textarea" ? (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); autoResize(e.target); }}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={sharedClasses}
          disabled={saving}
        />
      ) : (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={sharedClasses}
          disabled={saving}
        />
      )}
      {saving ? (
        <span className="absolute bottom-2 right-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </span>
      ) : (
        <button
          onMouseDown={(e) => { e.preventDefault(); handleSave(); }}
          className="absolute bottom-2 right-2 text-primary hover:text-primary/80 transition-colors"
          aria-label="Valider"
        >
          <Check className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
