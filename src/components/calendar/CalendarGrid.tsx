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
  calendarDays: { date: Date; inMonth: boolean }[];
  postsByDate: Record<string, CalendarPost[]>;
  todayStr: string;
  isMobile: boolean;
  onCreatePost: (dateStr: string) => void;
  onEditPost: (post: CalendarPost) => void;
  onMovePost?: (postId: string, newDate: string) => void;
}

/* ── Draggable post chip (desktop) ── */
function DraggablePostChip({ post, onClick }: { post: CalendarPost; onClick: () => void }) {
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
        className={`flex-1 text-left rounded-md border px-1.5 py-0.5 text-[11px] font-medium flex items-center gap-1 ${statusStyles[post.status] || statusStyles.idea}`}
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${CANAL_COLORS[post.canal] || "bg-muted-foreground"}`} />
        <span className="truncate flex-1">{post.theme}</span>
        <ObjectifBadge objectif={post.objectif} size="sm" />
      </button>
    </div>
  );
}

/* ── Simple post chip (no drag, for mobile & overlay) ── */
function PostChip({ post, onClick }: { post: CalendarPost; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md border px-1.5 py-0.5 text-[11px] font-medium flex items-center gap-1 ${statusStyles[post.status] || statusStyles.idea}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${CANAL_COLORS[post.canal] || "bg-muted-foreground"}`} />
      <span className="truncate flex-1">{post.theme}</span>
      <ObjectifBadge objectif={post.objectif} size="sm" />
    </button>
  );
}

/* ── Droppable day cell (desktop) ── */
function DroppableDay({
  dateStr, dayNum, inMonth, isToday, posts, onCreatePost, onEditPost,
}: {
  dateStr: string; dayNum: number; inMonth: boolean; isToday: boolean;
  posts: CalendarPost[]; onCreatePost: () => void; onEditPost: (p: CalendarPost) => void;
}) {
  const isPast = new Date(dateStr + "T00:00:00") < new Date(new Date().toISOString().split("T")[0] + "T00:00:00");
  const { setNodeRef, isOver } = useDroppable({ id: dateStr, disabled: isPast });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[100px] border-b border-r border-border p-1.5 group relative transition-colors",
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
          <button onClick={onCreatePost}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-0.5">
        {posts.slice(0, 2).map((p) => (
          <DraggablePostChip key={p.id} post={p} onClick={() => onEditPost(p)} />
        ))}
        {posts.length > 2 && (
          <span className="text-[10px] text-muted-foreground">+{posts.length - 2} de plus</span>
        )}
      </div>
    </div>
  );
}

/* ── Mobile post chip with long-press move ── */
function MobilePostChip({ post, onClick, onMove }: { post: CalendarPost; onClick: () => void; onMove: (post: CalendarPost) => void }) {
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
    <button
      onClick={onClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`w-full text-left rounded-md border px-1.5 py-0.5 text-[11px] font-medium flex items-center gap-1 ${statusStyles[post.status] || statusStyles.idea}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${CANAL_COLORS[post.canal] || "bg-muted-foreground"}`} />
      <span className="truncate flex-1">{post.theme}</span>
      <ObjectifBadge objectif={post.objectif} size="sm" />
    </button>
  );
}

/* ── Main component ── */
export function CalendarGrid({ calendarDays, postsByDate, todayStr, isMobile, onCreatePost, onEditPost, onMovePost }: Props) {
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

  /* ── Mobile view ── */
  if (isMobile) {
    return (
      <>
        <div className="space-y-2">
          {calendarDays.filter((d) => d.inMonth).map((d) => {
            const dateStr = d.date.toISOString().split("T")[0];
            const dayPosts = postsByDate[dateStr] || [];
            const isToday = dateStr === todayStr;
            return (
              <div key={dateStr} className={`rounded-xl border p-3 ${isToday ? "bg-rose-pale border-primary/30" : "border-border"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                    {d.date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
                  </span>
                  <button onClick={() => onCreatePost(dateStr)} className="text-muted-foreground hover:text-primary">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-1">
                  {dayPosts.map((p) => (
                    <MobilePostChip key={p.id} post={p} onClick={() => onEditPost(p)} onMove={handleMobileMove} />
                  ))}
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

  /* ── Desktop view with DnD ── */
  return (
    <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-7 border-b border-border">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
            <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>
        {/* Days grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map((d, i) => {
            const dateStr = d.date.toISOString().split("T")[0];
            const dayPosts = postsByDate[dateStr] || [];
            const isToday = dateStr === todayStr;
            return (
              <DroppableDay
                key={i}
                dateStr={dateStr}
                dayNum={d.date.getDate()}
                inMonth={d.inMonth}
                isToday={isToday}
                posts={dayPosts}
                onCreatePost={() => onCreatePost(dateStr)}
                onEditPost={onEditPost}
              />
            );
          })}
        </div>
      </div>

      {/* Drag overlay */}
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
