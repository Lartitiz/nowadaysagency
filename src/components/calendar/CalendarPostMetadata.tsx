import { format as formatDate } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn, toLocalDateStr } from "@/lib/utils";
import { ChevronDown, CalendarIcon } from "lucide-react";
import { ANGLES, STATUSES, OBJECTIFS } from "@/lib/calendar-constants";

const FORMAT_OPTIONS_BY_CANAL: Record<string, { id: string; emoji: string; label: string }[]> = {
  instagram: [
    { id: "post_carrousel", emoji: "📑", label: "Carrousel" },
    { id: "reel", emoji: "🎬", label: "Reel" },
    { id: "post_photo", emoji: "🖼️", label: "Post" },
    { id: "story_serie", emoji: "📱", label: "Stories" },
    { id: "live", emoji: "🎤", label: "Live" },
  ],
  linkedin: [
    { id: "post_texte", emoji: "📝", label: "Post texte" },
    { id: "post_carrousel", emoji: "📑", label: "Carrousel PDF" },
    { id: "article", emoji: "📰", label: "Article" },
    { id: "sondage", emoji: "📊", label: "Sondage" },
  ],
  pinterest: [
    { id: "epingle", emoji: "📌", label: "Épingle" },
    { id: "epingle_idee", emoji: "💡", label: "Épingle idée" },
  ],
  newsletter: [
    { id: "newsletter_standard", emoji: "✉️", label: "Newsletter" },
  ],
};

interface Props {
  status: string;
  setStatus: (s: string) => void;
  postCanal: string;
  setPostCanal: (c: string) => void;
  format: string | null;
  setFormat: (f: string | null) => void;
  objectif: string | null;
  setObjectif: (o: string | null) => void;
  angle: string | null;
  setAngle: (a: string | null) => void;
  showAdvanced: boolean;
  setShowAdvanced: (v: boolean) => void;
  editingPostId?: string;
  selectedDate: string | null;
  onDateChange?: (postId: string, newDate: string) => void;
}

export function CalendarPostMetadata({
  status, setStatus, postCanal, setPostCanal, format, setFormat,
  objectif, setObjectif, angle, setAngle, showAdvanced, setShowAdvanced,
  editingPostId, selectedDate, onDateChange,
}: Props) {
  return (
    <>
      {/* Statut — toujours visible */}
      <div>
        <label className="text-xs font-semibold mb-1.5 block text-foreground">Statut</label>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button key={s.id} onClick={() => setStatus(s.id)}
              className={`rounded-pill px-2.5 py-1 text-[11px] font-medium border transition-all ${status === s.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date — toujours visible */}
      {editingPostId && selectedDate && (
        <div>
          <label className="text-xs font-semibold mb-1.5 block text-foreground">Date</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-[10px] h-9 text-xs")}>
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {formatDate(new Date(selectedDate + "T00:00:00"), "EEE d MMM yyyy", { locale: fr })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[60]" align="start">
              <Calendar
                mode="single"
                selected={new Date(selectedDate + "T00:00:00")}
                onSelect={(d) => {
                  if (d && onDateChange && editingPostId) {
                    onDateChange(editingPostId, toLocalDateStr(d));
                  }
                }}
                locale={fr}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Résumé Canal + Format — ligne compacte */}
      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        <span className="font-medium">{
          postCanal === "instagram" ? "📸 Instagram" :
          postCanal === "linkedin" ? "💼 LinkedIn" :
          postCanal === "pinterest" ? "📌 Pinterest" :
          postCanal === "newsletter" ? "✉️ Newsletter" :
          postCanal
        }</span>
        {format && (
          <>
            <span className="text-border">·</span>
            <span>{(FORMAT_OPTIONS_BY_CANAL[postCanal] || []).find(f => f.id === format)?.emoji} {(FORMAT_OPTIONS_BY_CANAL[postCanal] || []).find(f => f.id === format)?.label || format}</span>
          </>
        )}
        {objectif && (
          <>
            <span className="text-border">·</span>
            <span>{OBJECTIFS.find(o => o.id === objectif)?.emoji} {OBJECTIFS.find(o => o.id === objectif)?.label || objectif}</span>
          </>
        )}
      </div>

      {/* Canal + Format + Objectif + Angle — replié par défaut */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors py-1">
          <span>⚙️ Modifier canal, format, objectif</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          {/* Canal */}
          <div>
            <label className="text-[11px] font-medium mb-1 block text-muted-foreground">Canal</label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "instagram", emoji: "📸", label: "Instagram" },
                { id: "linkedin", emoji: "💼", label: "LinkedIn" },
                { id: "pinterest", emoji: "📌", label: "Pinterest" },
              ].map((c) => (
                <button key={c.id} onClick={() => setPostCanal(c.id)}
                  className={`rounded-pill px-2.5 py-1 text-[11px] font-medium border transition-all ${postCanal === c.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="text-[11px] font-medium mb-1 block text-muted-foreground">Format</label>
            <div className="flex flex-wrap gap-1.5">
              {(FORMAT_OPTIONS_BY_CANAL[postCanal] || FORMAT_OPTIONS_BY_CANAL.instagram).map((f) => (
                <button key={f.id} onClick={() => setFormat(format === f.id ? null : f.id)}
                  className={`rounded-pill px-2.5 py-1 text-[11px] font-medium border transition-all ${format === f.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                  {f.emoji} {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Objectif */}
          <div>
            <label className="text-[11px] font-medium mb-1 block text-muted-foreground">Objectif</label>
            <div className="flex flex-wrap gap-1">
              {OBJECTIFS.map((o) => (
                <button key={o.id} onClick={() => setObjectif(objectif === o.id ? null : o.id)}
                  className="rounded-pill px-2 py-1 text-[11px] font-medium border transition-all"
                  style={objectif === o.id ? {
                    backgroundColor: `hsl(var(--${o.cssVar}-bg))`,
                    color: `hsl(var(--${o.cssVar}))`,
                    borderColor: `hsl(var(--${o.cssVar}))`
                  } : undefined}>
                  {o.emoji} {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Angle */}
          <div>
            <label className="text-[11px] font-medium mb-1 block text-muted-foreground">Angle</label>
            <div className="flex flex-wrap gap-1">
              {ANGLES.map((a) => (
                <button key={a} onClick={() => setAngle(angle === a ? null : a)}
                  className={`rounded-pill px-2 py-0.5 text-[10px] font-medium border transition-all ${angle === a ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
