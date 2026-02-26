import { useState, useMemo } from "react";
import EmptyState from "@/components/EmptyState";
import { MESSAGES } from "@/lib/messages";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { STATUSES, type CalendarPost } from "@/lib/calendar-constants";
import { CalendarContentCard } from "@/components/calendar/CalendarContentCard";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface CalendarKanbanViewProps {
  posts: CalendarPost[];
  onEditPost: (post: CalendarPost) => void;
  onStatusChange: (postId: string, newStatus: string) => void;
  canalFilter: string;
  categoryFilter: string;
}

const COLUMN_STYLES: Record<string, { bg: string; border: string; headerBg: string }> = {
  idea:      { bg: "bg-muted/30", border: "border-muted", headerBg: "bg-muted" },
  a_rediger: { bg: "bg-blue-50/50", border: "border-blue-200", headerBg: "bg-blue-100" },
  drafting:  { bg: "bg-amber-50/50", border: "border-amber-200", headerBg: "bg-amber-100" },
  ready:     { bg: "bg-green-50/50", border: "border-green-200", headerBg: "bg-green-100" },
  published: { bg: "bg-emerald-50/50", border: "border-emerald-200", headerBg: "bg-emerald-100" },
};

const STATUS_EMOJIS: Record<string, string> = {
  idea: "💡", a_rediger: "📝", drafting: "✏️", ready: "✅", published: "🟢",
};

/** Draggable card wrapper */
function DraggableCard({ post, onEditPost }: { post: CalendarPost; onEditPost: (p: CalendarPost) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: post.id,
    data: { type: "kanban-card", post },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <CalendarContentCard post={post} onClick={() => onEditPost(post)} variant="compact" />
    </div>
  );
}

/** Droppable column */
function KanbanColumn({
  statusId,
  label,
  posts,
  onEditPost,
}: {
  statusId: string;
  label: string;
  posts: CalendarPost[];
  onEditPost: (p: CalendarPost) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `kanban-col-${statusId}` });
  const styles = COLUMN_STYLES[statusId] || COLUMN_STYLES.idea;
  const emoji = STATUS_EMOJIS[statusId] || "📌";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col min-w-[200px] flex-1 rounded-xl border transition-colors",
        styles.bg,
        styles.border,
        isOver && "ring-2 ring-primary/40"
      )}
    >
      <div className={cn("px-3 py-2 rounded-t-xl font-bold text-sm flex items-center justify-between", styles.headerBg)}>
        <span>{emoji} {label}</span>
        <span className="text-xs font-medium text-muted-foreground bg-background/60 rounded-full px-2 py-0.5">
          {posts.length}
        </span>
      </div>
      <ScrollArea className="flex-1 max-h-[60vh]">
        <div className="p-2 space-y-1.5 min-h-[60px]">
          {posts.length === 0 && (
            <EmptyState {...MESSAGES.empty.calendar_empty} />
          )}
          {posts.map((post) => (
            <DraggableCard key={post.id} post={post} onEditPost={onEditPost} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export function CalendarKanbanView({ posts, onEditPost, onStatusChange, canalFilter, categoryFilter }: CalendarKanbanViewProps) {
  const isMobile = useIsMobile();
  const [mobileStatus, setMobileStatus] = useState("idea");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const filteredPosts = useMemo(() => {
    let result = posts;
    if (canalFilter !== "all") result = result.filter((p) => p.canal === canalFilter);
    if (categoryFilter === "visibilite" || categoryFilter === "confiance" || categoryFilter === "vente") {
      result = result.filter((p) => p.category === categoryFilter);
    } else if (categoryFilter === "launch") {
      result = result.filter((p) => !!p.launch_id);
    } else if (categoryFilter === "a_rediger") {
      result = result.filter((p) => p.status === "a_rediger");
    }
    return result;
  }, [posts, canalFilter, categoryFilter]);

  const postsByStatus = useMemo(() => {
    const map: Record<string, CalendarPost[]> = {};
    STATUSES.forEach((s) => { map[s.id] = []; });
    filteredPosts.forEach((p) => {
      const key = map[p.status] ? p.status : "idea";
      map[key].push(p);
    });
    return map;
  }, [filteredPosts]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const overId = over.id as string;
    if (!overId.startsWith("kanban-col-")) return;
    const newStatus = overId.replace("kanban-col-", "");
    const postId = active.id as string;
    const post = filteredPosts.find((p) => p.id === postId);
    if (!post || post.status === newStatus) return;
    onStatusChange(postId, newStatus);
  };

  // Mobile: tabs
  if (isMobile) {
    const currentPosts = postsByStatus[mobileStatus] || [];
    return (
      <div>
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              onClick={() => setMobileStatus(s.id)}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium border transition-all shrink-0",
                mobileStatus === s.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:border-primary/40"
              )}
            >
              {STATUS_EMOJIS[s.id]} {s.label}
              <span className="ml-1 text-[10px] opacity-70">({(postsByStatus[s.id] || []).length})</span>
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          {currentPosts.length === 0 && (
            <EmptyState {...MESSAGES.empty.calendar_empty} />
          )}
          {currentPosts.map((post) => (
            <CalendarContentCard key={post.id} post={post} onClick={() => onEditPost(post)} variant="detailed" />
          ))}
        </div>
      </div>
    );
  }

  // Desktop: columns
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {STATUSES.map((s) => (
          <KanbanColumn
            key={s.id}
            statusId={s.id}
            label={s.label}
            posts={postsByStatus[s.id] || []}
            onEditPost={onEditPost}
          />
        ))}
      </div>
    </DndContext>
  );
}
