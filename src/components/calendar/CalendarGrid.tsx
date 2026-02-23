import { useState } from "react";
import { GripVertical, CalendarIcon } from "lucide-react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { type CalendarPost } from "@/lib/calendar-constants";
import { CalendarContentCard, CalendarContentCardMini } from "./CalendarContentCard";
import { WeekRecapBar } from "./WeekRecapBar";
import { AddPostMenu } from "./AddPostMenu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
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
}

/* ── Draggable content card (desktop) ── */
function DraggableCard({ post, onClick }: { post: CalendarPost; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: post.id });
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : undefined,
    touchAction: "none",
    cursor: "grab",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CalendarContentCard post={post} onClick={onClick} variant="compact" />
    </div>
  );
}

/* ── Droppable day cell (desktop) ── */
function DroppableDay({
  dateStr, dayNum, inMonth, isToday, posts, onCreatePost, onEditPost, onAddIdea,
}: {
  dateStr: string; dayNum: number; inMonth: boolean; isToday: boolean;
  posts: CalendarPost[]; onCreatePost: (dateStr: string) => void; onEditPost: (p: CalendarPost) => void;
  onAddIdea: (dateStr: string) => void;
}) {
  const isPast = new Date(dateStr + "T00:00:00") < new Date(new Date().toISOString().split("T")[0] + "T00:00:00");
  const { setNodeRef, isOver } = useDroppable({ id: dateStr });
  const maxVisible = 3;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[110px] max-h-[150px] overflow-hidden border-b border-r border-border p-1.5 group relative transition-colors",
        !inMonth && "opacity-40",
        isToday && "bg-rose-pale",
        isOver && "bg-primary/10 ring-2 ring-primary/30 ring-inset",
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={cn("text-xs font-medium", isToday ? "text-primary font-bold" : "text-foreground")}>
          {dayNum}
        </span>
        {inMonth && (
          <AddPostMenu dateStr={dateStr} onAddIdea={onAddIdea} />
        )}
      </div>
      <div className="space-y-0">
        {posts.slice(0, maxVisible).map((p) => (
          <DraggableCard key={p.id} post={p} onClick={() => onEditPost(p)} />
        ))}
        {posts.length > maxVisible && (
          <button
            onClick={() => posts[maxVisible] && onEditPost(posts[maxVisible])}
            className="text-[10px] text-muted-foreground hover:text-primary cursor-pointer px-1"
          >
            +{posts.length - maxVisible} autre{posts.length - maxVisible > 1 ? "s" : ""}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Mobile post card with long-press move ── */
function MobilePostCard({ post, onClick, onMove }: { post: CalendarPost; onClick: () => void; onMove: (post: CalendarPost) => void }) {
  const [pressTimer, setPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

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
      <CalendarContentCard post={post} onClick={onClick} variant="compact" />
    </div>
  );
}

/* ── Main component (no DndContext — parent provides it) ── */
export function CalendarGrid({ calendarDays, postsByDate, todayStr, isMobile, onCreatePost, onEditPost, onMovePost, onAddIdea }: Props) {
  const [moveDialogPost, setMoveDialogPost] = useState<CalendarPost | null>(null);
  const [moveDate, setMoveDate] = useState<Date | undefined>();

  const addIdeaHandler = onAddIdea || onCreatePost;

  const handleMobileMove = (post: CalendarPost) => {
    setMoveDialogPost(post);
    setMoveDate(new Date(post.date + "T00:00:00"));
  };

  const confirmMobileMove = () => {
    if (!moveDialogPost || !moveDate || !onMovePost) return;
    const newDateStr = moveDate.toISOString().split("T")[0];
    if (newDateStr !== moveDialogPost.date) {
      onMovePost(moveDialogPost.id, newDateStr);
    }
    setMoveDialogPost(null);
  };

  /* ── Mobile view ── */
  if (isMobile) {
    return (
      <>
        <div className="space-y-2">
          {calendarDays.filter((d) => d.inMonth).map((d) => {
            const dateStr = d.date.toISOString().split("T")[0];
            const dayPosts = postsByDate[dateStr] || [];
            const isToday = dateStr === todayStr;
            if (dayPosts.length === 0 && !isToday) return null;
            return (
              <div key={dateStr} className={`rounded-xl border p-3 ${isToday ? "bg-rose-pale border-primary/30" : "border-border"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                    {d.date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
                  </span>
                  <AddPostMenu dateStr={dateStr} onAddIdea={addIdeaHandler} />
                </div>
                <div>
                  {dayPosts.slice(0, 1).map((p) => (
                    <MobilePostCard key={p.id} post={p} onClick={() => onEditPost(p)} onMove={handleMobileMove} />
                  ))}
                  {dayPosts.length > 1 && (
                    <button
                      onClick={() => onEditPost(dayPosts[1])}
                      className="text-[11px] text-muted-foreground hover:text-primary mt-0.5"
                    >
                      +{dayPosts.length - 1} autre{dayPosts.length - 1 > 1 ? "s" : ""}
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
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Choisis la nouvelle date pour « {moveDialogPost?.theme} »
            </p>
            <Calendar
              mode="single"
              selected={moveDate}
              onSelect={setMoveDate}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
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
      const dateStr = calendarDays[j].date.toISOString().split("T")[0];
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
                const dateStr = d.date.toISOString().split("T")[0];
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
