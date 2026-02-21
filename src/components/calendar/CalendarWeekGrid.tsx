import { useState } from "react";
import { Plus, GripVertical, CalendarIcon } from "lucide-react";
import { DndContext, DragOverlay, closestCenter, type DragStartEvent, type DragEndEvent, useDroppable, useDraggable } from "@dnd-kit/core";
import { statusStyles, CANAL_COLORS, type CalendarPost } from "@/lib/calendar-constants";
import { ObjectifBadge } from "./ObjectifBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
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
}

/* ── Draggable post chip ── */
function DraggableWeekChip({ post, onClick }: { post: CalendarPost; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: post.id });
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-0.5 group/chip">
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab opacity-0 group-hover/chip:opacity-60 transition-opacity shrink-0 touch-none"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </span>
      <button
        onClick={onClick}
        className={`flex-1 text-left rounded-md border px-2 py-1 text-xs font-medium flex items-center gap-1 ${statusStyles[post.status] || statusStyles.idea}`}
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${CANAL_COLORS[post.canal] || "bg-muted-foreground"}`} />
        <span className="truncate flex-1">{post.theme}</span>
        <ObjectifBadge objectif={post.objectif} size="sm" />
      </button>
    </div>
  );
}

/* ── Droppable day column ── */
function DroppableWeekDay({
  date, dateStr, isToday, posts, onCreatePost, onEditPost,
}: {
  date: Date; dateStr: string; isToday: boolean;
  posts: CalendarPost[]; onCreatePost: () => void; onEditPost: (p: CalendarPost) => void;
}) {
  const isPast = new Date(dateStr + "T00:00:00") < new Date(new Date().toISOString().split("T")[0] + "T00:00:00");
  const { setNodeRef, isOver } = useDroppable({ id: dateStr, disabled: isPast });
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
        <button onClick={onCreatePost}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1">
        {posts.map((p) => (
          <DraggableWeekChip key={p.id} post={p} onClick={() => onEditPost(p)} />
        ))}
      </div>
    </div>
  );
}

/* ── Mobile week day ── */
function MobileWeekDay({ date, dateStr, isToday, posts, onCreatePost, onEditPost, onMove }: {
  date: Date; dateStr: string; isToday: boolean;
  posts: CalendarPost[]; onCreatePost: () => void; onEditPost: (p: CalendarPost) => void;
  onMove: (post: CalendarPost) => void;
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
        <button onClick={onCreatePost} className="text-muted-foreground hover:text-primary">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-1">
        {posts.map((p) => (
          <button
            key={p.id}
            onClick={() => onEditPost(p)}
            onTouchStart={() => handleTouchStart(p)}
            onTouchEnd={() => handleTouchEnd(p.id)}
            onTouchCancel={() => handleTouchEnd(p.id)}
            className={`w-full text-left rounded-md border px-1.5 py-0.5 text-[11px] font-medium flex items-center gap-1 ${statusStyles[p.status] || statusStyles.idea}`}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${CANAL_COLORS[p.canal] || "bg-muted-foreground"}`} />
            <span className="truncate flex-1">{p.theme}</span>
            <ObjectifBadge objectif={p.objectif} size="sm" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Main ── */
export function CalendarWeekGrid({ weekDays, postsByDate, todayStr, isMobile, onCreatePost, onEditPost, onMovePost }: Props) {
  const [activePost, setActivePost] = useState<CalendarPost | null>(null);
  const [moveDialogPost, setMoveDialogPost] = useState<CalendarPost | null>(null);
  const [moveDate, setMoveDate] = useState<Date | undefined>();

  const allPosts = Object.values(postsByDate).flat();

  const handleDragStart = (event: DragStartEvent) => {
    const post = allPosts.find((p) => p.id === event.active.id);
    setActivePost(post || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActivePost(null);
    const { active, over } = event;
    if (!over || !onMovePost) return;
    const newDate = over.id as string;
    const postId = active.id as string;
    const currentPost = allPosts.find((p) => p.id === postId);
    if (!currentPost || currentPost.date === newDate) return;
    onMovePost(postId, newDate);
  };

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

  if (isMobile) {
    return (
      <>
        <div className="space-y-2">
          {weekDays.map((d) => {
            const dateStr = d.toISOString().split("T")[0];
            const dayPosts = postsByDate[dateStr] || [];
            return (
              <MobileWeekDay
                key={dateStr} date={d} dateStr={dateStr}
                isToday={dateStr === todayStr} posts={dayPosts}
                onCreatePost={() => onCreatePost(dateStr)}
                onEditPost={onEditPost} onMove={handleMobileMove}
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
    <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="flex">
          {weekDays.map((d) => {
            const dateStr = d.toISOString().split("T")[0];
            const dayPosts = postsByDate[dateStr] || [];
            return (
              <DroppableWeekDay
                key={dateStr} date={d} dateStr={dateStr}
                isToday={dateStr === todayStr} posts={dayPosts}
                onCreatePost={() => onCreatePost(dateStr)}
                onEditPost={onEditPost}
              />
            );
          })}
        </div>
      </div>
      <DragOverlay>
        {activePost ? (
          <div className="bg-card border border-primary/40 rounded-lg px-3 py-2 shadow-lg text-xs font-medium max-w-[180px]">
            <span className="truncate block">{activePost.theme}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
