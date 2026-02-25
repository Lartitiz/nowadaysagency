import { useState, useEffect, useRef } from "react";
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
  onQuickCreate: (dateStr: string, title: string) => void;
  onQuickStatusChange?: (postId: string, newStatus: string) => void;
  onQuickDuplicate?: (post: CalendarPost) => void;
  onQuickDelete?: (postId: string) => void;
  onQuickGenerate?: (post: CalendarPost) => void;
}

/* ── Draggable content card ── */
function DraggableWeekCard({ post, onClick, onQuickStatusChange, onQuickDuplicate, onQuickDelete, onQuickGenerate }: {
  post: CalendarPost; onClick: () => void;
  onQuickStatusChange?: (postId: string, newStatus: string) => void;
  onQuickDuplicate?: (post: CalendarPost) => void;
  onQuickDelete?: (postId: string) => void;
  onQuickGenerate?: (post: CalendarPost) => void;
}) {
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
      <CalendarContentCard post={post} onClick={onClick} variant="detailed"
        onQuickStatusChange={onQuickStatusChange}
        onQuickDuplicate={onQuickDuplicate}
        onQuickDelete={onQuickDelete}
        onQuickGenerate={onQuickGenerate}
      />
    </div>
  );
}

/* ── Droppable day column ── */
function DroppableWeekDay({
  date, dateStr, isToday, posts, onCreatePost, onEditPost, onAddIdea, onQuickCreate,
  onQuickStatusChange, onQuickDuplicate, onQuickDelete, onQuickGenerate, todayRef,
}: {
  date: Date; dateStr: string; isToday: boolean;
  posts: CalendarPost[]; onCreatePost: (dateStr: string) => void; onEditPost: (p: CalendarPost) => void;
  onAddIdea: (dateStr: string) => void; onQuickCreate: (dateStr: string, title: string) => void;
  onQuickStatusChange?: (postId: string, newStatus: string) => void;
  onQuickDuplicate?: (post: CalendarPost) => void;
  onQuickDelete?: (postId: string) => void;
  onQuickGenerate?: (post: CalendarPost) => void;
  todayRef?: React.RefObject<HTMLDivElement>;
}) {
  const [inlineInput, setInlineInput] = useState(false);
  const [inlineValue, setInlineValue] = useState("");
  const { setNodeRef, isOver } = useDroppable({ id: dateStr });
  const dayLabel = date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        if (isToday && todayRef) (todayRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className={cn(
        "flex-1 min-w-0 border-r last:border-r-0 border-border p-2 group relative transition-colors min-h-[200px]",
        isToday && "bg-rose-pale ring-2 ring-primary/20 ring-inset",
        isOver && "bg-primary/10 ring-2 ring-primary/30 ring-inset",
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className={cn("text-xs font-semibold capitalize", isToday ? "text-primary font-bold" : "text-foreground")}>
            {dayLabel}
          </span>
          {isToday && (
            <span className="text-[9px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
              Aujourd'hui
            </span>
          )}
        </div>
        <AddPostMenu dateStr={dateStr} onAddIdea={onAddIdea} />
      </div>

      {/* Today summary */}
      {isToday && posts.length > 0 && (
        <div className="mb-2 p-1.5 rounded-lg bg-primary/5 border border-primary/10">
          {(() => {
            const toPublish = posts.filter(p => p.status === "ready" || p.status === "draft_ready");
            const toDraft = posts.filter(p => p.status === "idea" || p.status === "a_rediger");
            const pubCount = posts.filter(p => p.status === "published").length;
            if (pubCount === posts.length) {
              return <p className="text-[10px] text-[hsl(160_60%_45%)] font-medium">✅ Tout est publié !</p>;
            }
            return (
              <div className="space-y-0.5">
                {toPublish.length > 0 && (
                  <p className="text-[10px] text-primary font-medium">
                    🚀 {toPublish.length} post{toPublish.length > 1 ? "s" : ""} prêt{toPublish.length > 1 ? "s" : ""} à publier
                  </p>
                )}
                {toDraft.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    ✏️ {toDraft.length} à rédiger
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <div className="space-y-1">
        {posts.map((p) => (
          <DraggableWeekCard key={p.id} post={p} onClick={() => onEditPost(p)}
            onQuickStatusChange={onQuickStatusChange}
            onQuickDuplicate={onQuickDuplicate}
            onQuickDelete={onQuickDelete}
            onQuickGenerate={onQuickGenerate}
          />
        ))}
      </div>

      {posts.length === 0 && !inlineInput && (
        <button
          data-droppable-area
          onClick={() => setInlineInput(true)}
          className="w-full h-full min-h-[80px] flex items-center justify-center text-xs text-muted-foreground/40 hover:text-primary/60 hover:bg-primary/5 rounded-lg transition-colors cursor-text"
        >
          + Clic pour ajouter
        </button>
      )}

      {inlineInput && (
        <div className="mt-1">
          <input
            autoFocus
            value={inlineValue}
            onChange={(e) => setInlineValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && inlineValue.trim()) {
                onQuickCreate(dateStr, inlineValue.trim());
                setInlineValue("");
                setInlineInput(false);
              }
              if (e.key === "Escape") {
                setInlineValue("");
                setInlineInput(false);
              }
            }}
            onBlur={() => {
              if (inlineValue.trim()) {
                onQuickCreate(dateStr, inlineValue.trim());
              }
              setInlineValue("");
              setInlineInput(false);
            }}
            placeholder="Titre du post..."
            className="w-full text-xs border border-primary/40 rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60"
          />
        </div>
      )}
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
    <div
      id={isToday ? "today-mobile" : undefined}
      className={`rounded-xl border p-3 ${isToday ? "bg-rose-pale border-primary/30 ring-2 ring-primary/20" : "border-border"}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-bold capitalize ${isToday ? "text-primary" : "text-foreground"}`}>
            {dayLabel}
          </span>
          {isToday && (
            <span className="text-[9px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
              Aujourd'hui
            </span>
          )}
        </div>
        <AddPostMenu dateStr={dateStr} onAddIdea={onAddIdea} />
      </div>

      {/* Today summary mobile */}
      {isToday && posts.length > 0 && (
        <div className="mb-2 p-1.5 rounded-lg bg-primary/5 border border-primary/10">
          {(() => {
            const toPublish = posts.filter(p => p.status === "ready" || p.status === "draft_ready");
            const toDraft = posts.filter(p => p.status === "idea" || p.status === "a_rediger");
            const pubCount = posts.filter(p => p.status === "published").length;
            if (pubCount === posts.length) {
              return <p className="text-[10px] text-[hsl(160_60%_45%)] font-medium">✅ Tout est publié !</p>;
            }
            return (
              <div className="space-y-0.5">
                {toPublish.length > 0 && (
                  <p className="text-[10px] text-primary font-medium">
                    🚀 {toPublish.length} post{toPublish.length > 1 ? "s" : ""} prêt{toPublish.length > 1 ? "s" : ""} à publier
                  </p>
                )}
                {toDraft.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    ✏️ {toDraft.length} à rédiger
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}

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
export function CalendarWeekGrid({ weekDays, postsByDate, todayStr, isMobile, onCreatePost, onEditPost, onMovePost, onAddIdea, onQuickCreate, onQuickStatusChange, onQuickDuplicate, onQuickDelete, onQuickGenerate }: Props) {
  const [moveDialogPost, setMoveDialogPost] = useState<CalendarPost | null>(null);
  const [moveDate, setMoveDate] = useState<Date | undefined>();
  const todayRef = useRef<HTMLDivElement>(null);

  // Scroll to today on mount
  useEffect(() => {
    if (isMobile) {
      const el = document.getElementById("today-mobile");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [todayStr, isMobile]);

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
                onQuickCreate={onQuickCreate}
                onQuickStatusChange={onQuickStatusChange}
                onQuickDuplicate={onQuickDuplicate}
                onQuickDelete={onQuickDelete}
                onQuickGenerate={onQuickGenerate}
                todayRef={dateStr === todayStr ? todayRef : undefined}
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
