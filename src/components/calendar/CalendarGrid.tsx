import { useState, useCallback } from "react";
import { GripVertical, CalendarIcon } from "lucide-react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { type CalendarPost } from "@/lib/calendar-constants";
import { CalendarContentCard, CalendarContentCardMini } from "./CalendarContentCard";
import { WeekRecapBar } from "./WeekRecapBar";
import { AddPostMenu } from "./AddPostMenu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { cn, toLocalDateStr } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Props {
  calendarDays: { date: Date; inMonth: boolean }[];
  postsByDate: Record<string, CalendarPost[]>;
  todayStr: string;
  isMobile: boolean;
  onCreatePost: (dateStr: string) => void;
  onEditPost: (post: CalendarPost) => void;
  onMovePost?: (postId: string, newDate: string) => void;
  onAddIdea?: (dateStr: string) => void;
  onImport?: (dateStr: string, files?: File[]) => void;
  seriesNameById?: Record<string, string>;
}

/* ── Draggable content card (desktop) ── */
// onSelect (stable depuis le parent) + useCallback → onClick stable pour la feuille
// mémoïsée CalendarContentCard. (Avant : closure inline `() => onEditPost(p)` dans
// le map = nouvelle réf à chaque render → memo inopérant.)
function DraggableCard({ post, onSelect, seriesNameById }: { post: CalendarPost; onSelect: (post: CalendarPost) => void; seriesNameById?: Record<string, string> }) {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({ id: post.id });
  const handleClick = useCallback(() => onSelect(post), [onSelect, post]);
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : undefined,
    touchAction: "none",
    cursor: "grab",
  };

  // a11y : on NE spread PAS `attributes` (role="button" + tabIndex de dnd-kit) sur ce
  // wrapper, car il contient le <button> cliquable de la carte → nested-interactive.
  // Le calendrier n'a pas de KeyboardSensor (CalendarDndWrapper = PointerSensor seul),
  // donc ces attributs clavier ne servaient pas ; le drag pointeur (listeners) est intact
  // et la carte reste focusable/activable via son propre <button>.
  return (
    <div ref={setNodeRef} style={style} {...listeners}>
      <CalendarContentCard post={post} onClick={handleClick} variant="compact" seriesNameById={seriesNameById} />
    </div>
  );
}

/* ── Droppable day cell (desktop) ── */
function DroppableDay({
  dateStr, dayNum, inMonth, isToday, posts, onCreatePost, onEditPost, onAddIdea, onImport, seriesNameById,
}: {
  dateStr: string; dayNum: number; inMonth: boolean; isToday: boolean;
  posts: CalendarPost[]; onCreatePost: (dateStr: string) => void; onEditPost: (p: CalendarPost) => void;
  onAddIdea: (dateStr: string) => void;
  onImport?: (dateStr: string, files?: File[]) => void;
  seriesNameById?: Record<string, string>;
}) {
  const isPast = new Date(dateStr + "T00:00:00") < new Date(toLocalDateStr(new Date()) + "T00:00:00");
  const { setNodeRef, isOver } = useDroppable({ id: dateStr });
  const maxVisible = 3;
  const [expanded, setExpanded] = useState(false);
  const [fileOver, setFileOver] = useState(false);

  // Drop natif d'un fichier (image/PDF) depuis le bureau → ouvre l'import pré-rempli.
  const fileDnd = onImport ? {
    onDragOver: (e: React.DragEvent) => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setFileOver(true); } },
    onDragLeave: () => setFileOver(false),
    onDrop: (e: React.DragEvent) => {
      if (e.dataTransfer.files?.length) { e.preventDefault(); setFileOver(false); onImport(dateStr, Array.from(e.dataTransfer.files)); }
    },
  } : {};

  return (
    <div
      ref={setNodeRef}
      {...fileDnd}
      className={cn(
        "min-h-[110px] border-b border-r border-border p-1.5 group relative transition-colors",
        !expanded && "max-h-[150px] overflow-hidden",
        !inMonth && "opacity-65",
        isToday && "bg-rose-pale",
        isOver && "bg-primary/10 ring-2 ring-primary/30 ring-inset",
        fileOver && "bg-primary/10 ring-2 ring-primary/50 ring-inset",
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={cn("text-xs font-medium", isToday ? "text-primary-text font-bold" : "text-foreground")}>
          {dayNum}
        </span>
        {inMonth && (
          <AddPostMenu dateStr={dateStr} onAddIdea={onAddIdea} onImport={onImport} />
        )}
      </div>
      <div className="space-y-0">
        {posts.slice(0, expanded ? posts.length : maxVisible).map((p) => (
          <DraggableCard key={p.id} post={p} onSelect={onEditPost} seriesNameById={seriesNameById} />
        ))}
        {posts.length > maxVisible && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-2xs text-muted-foreground hover:text-primary cursor-pointer px-1"
          >
            {expanded ? "Réduire" : `+${posts.length - maxVisible} autre${posts.length - maxVisible > 1 ? "s" : ""}`}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Mobile post card with long-press move ── */
function MobilePostCard({ post, onSelect, onMove, seriesNameById }: { post: CalendarPost; onSelect: (post: CalendarPost) => void; onMove: (post: CalendarPost) => void; seriesNameById?: Record<string, string> }) {
  const [pressTimer, setPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleClick = useCallback(() => onSelect(post), [onSelect, post]);

  const handleTouchStart = () => {
    const timer = setTimeout(() => onMove(post), 500);
    setPressTimer(timer);
  };
  const handleTouchEnd = () => {
    if (pressTimer) clearTimeout(pressTimer);
    setPressTimer(null);
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <CalendarContentCard post={post} onClick={handleClick} variant="compact" seriesNameById={seriesNameById} />
    </div>
  );
}

/* ── Main component (no DndContext — parent provides it) ── */
export function CalendarGrid({ calendarDays, postsByDate, todayStr, isMobile, onCreatePost, onEditPost, onMovePost, onAddIdea, onImport, seriesNameById }: Props) {
  const [moveDialogPost, setMoveDialogPost] = useState<CalendarPost | null>(null);
  const [moveDate, setMoveDate] = useState<Date | undefined>();
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const addIdeaHandler = onAddIdea || onCreatePost;

  const handleMobileMove = (post: CalendarPost) => {
    setMoveDialogPost(post);
    setMoveDate(new Date(post.date + "T00:00:00"));
  };

  const confirmMobileMove = () => {
    if (!moveDialogPost || !moveDate || !onMovePost) return;
    const newDateStr = toLocalDateStr(moveDate);
    if (newDateStr !== moveDialogPost.date) {
      onMovePost(moveDialogPost.id, newDateStr);
    }
    setMoveDialogPost(null);
  };

  /* ── Mobile view ── */
  if (isMobile) {
    // Agenda mobile : on n'affiche que les jours AVEC contenu (+ aujourd'hui).
    // Mois vide → ça se réduisait à la seule carte « aujourd'hui » sans aucune
    // indication. On ajoute un état vide qui guide vers la création.
    const monthHasPosts = calendarDays.some(
      (d) => d.inMonth && (postsByDate[toLocalDateStr(d.date)] || []).length > 0,
    );
    return (
      <>
        <div className="space-y-2">
          {!monthHasPosts && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <CalendarIcon className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Rien de prévu ce mois-ci. Touche <span className="font-semibold text-foreground">＋</span> sur un jour pour planifier ton premier contenu 🌸
              </p>
            </div>
          )}
          {calendarDays.filter((d) => d.inMonth).map((d) => {
             const dateStr = toLocalDateStr(d.date);
            const dayPosts = postsByDate[dateStr] || [];
            const isToday = dateStr === todayStr;
            if (dayPosts.length === 0 && !isToday) return null;
            return (
              <div key={dateStr} className={`rounded-xl border p-3 ${isToday ? "bg-rose-pale border-primary/30" : "border-border"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-bold ${isToday ? "text-primary-text" : "text-foreground"}`}>
                    {d.date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
                    {/* Sans ce label, la carte du jour vide flotte sans explication */}
                    {isToday && <span className="ml-1.5 text-2xs font-semibold uppercase tracking-wide">· Aujourd'hui</span>}
                  </span>
                  <AddPostMenu dateStr={dateStr} onAddIdea={addIdeaHandler} onImport={onImport} />
                </div>
                <div>
                  {isToday && dayPosts.length === 0 && (
                    <p className="text-xs text-muted-foreground">Rien de prévu aujourd'hui — touche ＋ pour ajouter un contenu.</p>
                  )}
                  {(expandedDays.has(dateStr) ? dayPosts : dayPosts.slice(0, 1)).map((p) => (
                    <MobilePostCard key={p.id} post={p} onSelect={onEditPost} onMove={handleMobileMove} seriesNameById={seriesNameById} />
                  ))}
                  {dayPosts.length > 1 && !expandedDays.has(dateStr) && (
                    <button
                      onClick={() => setExpandedDays(prev => new Set(prev).add(dateStr))}
                      className="mt-1 w-full rounded-lg border border-dashed border-border py-1.5 text-xs font-medium text-primary text-center"
                    >
                      Voir les {dayPosts.length - 1} autre{dayPosts.length - 1 > 1 ? "s" : ""} contenu{dayPosts.length - 1 > 1 ? "s" : ""} ↓
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile move date picker dialog */}
        <Dialog open={!!moveDialogPost} onOpenChange={(open) => { if (!open) setMoveDialogPost(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" /> Déplacer le contenu
              </DialogTitle>
              <DialogDescription className="sr-only">Choisir une nouvelle date pour ce contenu</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Choisis la nouvelle date pour « {moveDialogPost?.theme} »
            </p>
            <Calendar
              mode="single"
              selected={moveDate}
              onSelect={setMoveDate}
              className={cn("p-3 pointer-events-auto mx-auto")}
              locale={fr}
            />
            <button
              onClick={confirmMobileMove}
              disabled={!moveDate}
              className="w-full rounded-pill bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-bordeaux transition-colors disabled:opacity-50"
            >
              {moveDate ? `Déplacer au ${format(moveDate, "d MMMM", { locale: fr })}` : "Choisis une date"}
            </button>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  /* ── Desktop view (Droppable only, no DndContext) ── */
  const weekRows: CalendarPost[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    const weekPosts: CalendarPost[] = [];
    for (let j = i; j < i + 7 && j < calendarDays.length; j++) {
      // Ne compter que les jours du mois affiché (pas les cases grisées des mois voisins),
      // sinon le récap de la 1ʳᵉ/dernière semaine gonfle le total.
      if (!calendarDays[j].inMonth) continue;
      const dateStr = toLocalDateStr(calendarDays[j].date);
      weekPosts.push(...(postsByDate[dateStr] || []));
    }
    weekRows.push(weekPosts);
  }

  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-7 border-b border-border">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
          <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>
      {/* Days grid with week recaps */}
      {Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, weekIdx) => {
        const weekSlice = calendarDays.slice(weekIdx * 7, weekIdx * 7 + 7);
        return (
          <div key={weekIdx}>
            <div className="grid grid-cols-7">
              {weekSlice.map((d, i) => {
                const dateStr = toLocalDateStr(d.date);
                const dayPosts = postsByDate[dateStr] || [];
                const isToday = dateStr === todayStr;
                return (
                  <DroppableDay
                    key={weekIdx * 7 + i}
                    dateStr={dateStr}
                    dayNum={d.date.getDate()}
                    inMonth={d.inMonth}
                    isToday={isToday}
                    posts={dayPosts}
                    onCreatePost={onCreatePost}
                    onEditPost={onEditPost}
                    onAddIdea={addIdeaHandler}
                    onImport={onImport}
                    seriesNameById={seriesNameById}
                  />
                );
              })}
            </div>
            {weekRows[weekIdx] && weekRows[weekIdx].length > 0 && (
              <div className="border-b border-border bg-muted/30 px-2">
                <WeekRecapBar posts={weekRows[weekIdx]} compact />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
