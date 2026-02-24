import { useState } from "react";
import { GripVertical, CalendarIcon } from "lucide-react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { type CalendarPost } from "@/lib/calendar-constants";
import { CalendarContentCard } from "./CalendarContentCard";
import { WeekRecapBar } from "./WeekRecapBar";
import { AddPostMenu } from "./AddPostMenu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { cn, toLocalDateStr } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Props {
  weekDays: Date[];
  postsByDate: Record<string, CalendarPost[]>;
  todayStr: string;
  isMobile: boolean;
  onCreatePost: (dateStr: string) => void;
  onEditPost: (post: CalendarPost) => void;
  onMovePost?: (postId: string, newDate: string) => void;
  onAddIdea?: (dateStr: string) => void;
}

/* ── Draggable content card ── */
function DraggableWeekCard({ post, onClick }: { post: CalendarPost; onClick: () => void }) {
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
      <CalendarContentCard post={post} onClick={onClick} variant="detailed" />
    </div>
  );
}

/* ── Droppable day column ── */
function DroppableWeekDay({
  date, dateStr, isToday, posts, onCreatePost, onEditPost, onAddIdea,
}: {
  date: Date; dateStr: string; isToday: boolean;
  posts: CalendarPost[]; onCreatePost: (dateStr: string) => void; onEditPost: (p: CalendarPost) => void;
  onAddIdea: (dateStr: string) => void;
}) {
  const isPast = new Date(dateStr + "T00:00:00") < new Date(toLocalDateStr(new Date()) + "T00:00:00");
  const { setNodeRef, isOver } = useDroppable({ id: dateStr });
  const dayLabel = date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 min-w-0 border-r last:border-r-0 border-border p-2 group relative transition-colors min-h-[200px]",
        isToday && "bg-rose-pale",
        isOver && "bg-primary/10 ring-2 ring-primary/30 ring-inset",
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={cn("text-xs font-semibold capitalize", isToday ? "text-primary font-bold" : "text-foreground")}>
          {dayLabel}
        </span>
        <AddPostMenu dateStr={dateStr} onAddIdea={onAddIdea} />
      </div>
      <div className="space-y-1">
        {posts.map((p) => (
          <DraggableWeekCard key={p.id} post={p} onClick={() => onEditPost(p)} />
        ))}
      </div>
    </div>
  );
}

/* ── Mobile week day ── */
function MobileWeekDay({ date, dateStr, isToday, posts, onCreatePost, onEditPost, onMove, onAddIdea }: {
  date: Date; dateStr: string; isToday: boolean;
  posts: CalendarPost[]; onCreatePost: (dateStr: string) => void; onEditPost: (p: CalendarPost) => void;
  onMove: (post: CalendarPost) => void; onAddIdea: (dateStr: string) => void;
}) {
  const dayLabel = date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
  const [pressTimers, setPressTimers] = useState<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleTouchStart = (post: CalendarPost) => {
    const timer = setTimeout(() => onMove(post), 500);
    setPressTimers((prev) => ({ ...prev, [post.id]: timer }));
  };
  const handleTouchEnd = (postId: string) => {
    if (pressTimers[postId]) clearTimeout(pressTimers[postId]);
    setPressTimers((prev) => { const n = { ...prev }; delete n[postId]; return n; });
  };

  return (
    <div className={`rounded-xl border p-3 ${isToday ? "bg-rose-pale border-primary/30" : "border-border"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-bold capitalize ${isToday ? "text-primary" : "text-foreground"}`}>
          {dayLabel}
        </span>
        <AddPostMenu dateStr={dateStr} onAddIdea={onAddIdea} />
      </div>
      <div className="space-y-1">
        {posts.map((p) => (
          <div
            key={p.id}
            onTouchStart={() => handleTouchStart(p)}
            onTouchEnd={() => handleTouchEnd(p.id)}
            onTouchCancel={() => handleTouchEnd(p.id)}
          >
            <CalendarContentCard post={p} onClick={() => onEditPost(p)} variant="compact" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main (no DndContext — parent provides it) ── */
export function CalendarWeekGrid({ weekDays, postsByDate, todayStr, isMobile, onCreatePost, onEditPost, onMovePost, onAddIdea }: Props) {
  const [moveDialogPost, setMoveDialogPost] = useState<CalendarPost | null>(null);
  const [moveDate, setMoveDate] = useState<Date | undefined>();

  const weekAllPosts = weekDays.flatMap((d) => postsByDate[toLocalDateStr(d)] || []);

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

  const addIdeaHandler = onAddIdea || onCreatePost;

  if (isMobile) {
    return (
      <>
        <div className="space-y-2">
          {weekDays.map((d) => {
            const dateStr = toLocalDateStr(d);
            const dayPosts = postsByDate[dateStr] || [];
            return (
              <MobileWeekDay
                key={dateStr} date={d} dateStr={dateStr}
                isToday={dateStr === todayStr} posts={dayPosts}
                onCreatePost={onCreatePost}
                onEditPost={onEditPost} onMove={handleMobileMove}
                onAddIdea={addIdeaHandler}
              />
            );
          })}
        </div>
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
              mode="single" selected={moveDate} onSelect={setMoveDate}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              className={cn("p-3 pointer-events-auto mx-auto")} locale={fr}
            />
            <button onClick={confirmMobileMove} disabled={!moveDate}
              className="w-full rounded-pill bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-bordeaux transition-colors disabled:opacity-50">
              {moveDate ? `Déplacer au ${format(moveDate, "d MMMM", { locale: fr })}` : "Choisis une date"}
            </button>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="flex">
          {weekDays.map((d) => {
            const dateStr = toLocalDateStr(d);
            const dayPosts = postsByDate[dateStr] || [];
            return (
              <DroppableWeekDay
                key={dateStr} date={d} dateStr={dateStr}
                isToday={dateStr === todayStr} posts={dayPosts}
                onCreatePost={onCreatePost}
                onEditPost={onEditPost}
                onAddIdea={addIdeaHandler}
              />
            );
          })}
        </div>
      </div>

      {weekAllPosts.length > 0 && (
        <WeekRecapBar posts={weekAllPosts} compact={false} />
      )}
    </>
  );
}
