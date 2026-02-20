import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Trash2, ChevronDown } from "lucide-react";
import { getGuide } from "@/lib/production-guides";
import { ANGLES, STATUSES, OBJECTIFS, type CalendarPost } from "@/lib/calendar-constants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPost: CalendarPost | null;
  selectedDate: string | null;
  defaultCanal: string;
  onSave: (data: { theme: string; angle: string | null; status: string; notes: string; canal: string; objectif: string | null }) => void;
  onDelete: () => void;
}

export function CalendarPostDialog({ open, onOpenChange, editingPost, selectedDate, defaultCanal, onSave, onDelete }: Props) {
  const [theme, setTheme] = useState("");
  const [angle, setAngle] = useState<string | null>(null);
  const [status, setStatus] = useState("idea");
  const [notes, setNotes] = useState("");
  const [postCanal, setPostCanal] = useState("instagram");
  const [objectif, setObjectif] = useState<string | null>(null);

  useEffect(() => {
    if (editingPost) {
      setTheme(editingPost.theme);
      setAngle(editingPost.angle);
      setStatus(editingPost.status);
      setNotes(editingPost.notes || "");
      setObjectif(editingPost.objectif || null);
      setPostCanal(editingPost.canal || "instagram");
    } else {
      setTheme("");
      setAngle(null);
      setStatus("idea");
      setNotes("");
      setObjectif(null);
      setPostCanal(defaultCanal !== "all" ? defaultCanal : "instagram");
    }
  }, [editingPost, open, defaultCanal]);

  const guide = angle ? getGuide(angle) : null;

  const handleSave = () => {
    if (!theme.trim()) return;
    onSave({ theme, angle, status, notes, canal: postCanal, objectif });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {editingPost ? "Modifier le post" : "Ajouter un post"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Thème / sujet</label>
            <Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="De quoi parle ce post ?" className="rounded-[10px] h-11" />
          </div>

          {/* Objectif selector */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Objectif</label>
            <div className="flex flex-wrap gap-1.5">
              {OBJECTIFS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setObjectif(objectif === o.id ? null : o.id)}
                  className="rounded-pill px-3 py-1 text-xs font-medium border transition-all"
                  style={
                    objectif === o.id
                      ? { backgroundColor: `hsl(var(--${o.cssVar}-bg))`, color: `hsl(var(--${o.cssVar}))`, borderColor: `hsl(var(--${o.cssVar}))` }
                      : undefined
                  }
                >
                  {o.emoji} {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Angle</label>
            <div className="flex flex-wrap gap-1.5">
              {ANGLES.map((a) => (
                <button key={a} onClick={() => setAngle(angle === a ? null : a)}
                  className={`rounded-pill px-3 py-1 text-xs font-medium border transition-all ${angle === a ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Statut</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button key={s.id} onClick={() => setStatus(s.id)}
                  className={`rounded-pill px-3 py-1 text-xs font-medium border transition-all ${status === s.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Notes (optionnel)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Idées, brouillon, remarques..." className="rounded-[10px] min-h-[60px]" />
          </div>

          {/* Production guide */}
          {guide ? (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors w-full">
                <span>📝 Comment produire ce post</span>
                <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <ol className="space-y-3 text-[13px] leading-relaxed text-foreground">
                  {guide.map((step, i) => (
                    <li key={i}>
                      <span className="font-semibold text-primary">{step.label}</span>
                      <p className="mt-0.5 text-muted-foreground">{step.detail}</p>
                    </li>
                  ))}
                </ol>
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <p className="text-xs italic text-muted-foreground">Choisis un angle pour débloquer le guide de production</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={!theme.trim()} className="flex-1 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux">
              Enregistrer
            </Button>
            {editingPost && (
              <Button variant="outline" size="icon" onClick={onDelete} className="rounded-full text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
