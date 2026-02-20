import { Plus } from "lucide-react";
import { statusStyles, type CalendarPost } from "@/lib/calendar-constants";
import { ObjectifBadge } from "./ObjectifBadge";

interface Props {
  calendarDays: { date: Date; inMonth: boolean }[];
  postsByDate: Record<string, CalendarPost[]>;
  todayStr: string;
  isMobile: boolean;
  onCreatePost: (dateStr: string) => void;
  onEditPost: (post: CalendarPost) => void;
}

function PostChip({ post, onClick }: { post: CalendarPost; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md border px-1.5 py-0.5 text-[11px] font-medium flex items-center gap-1 ${statusStyles[post.status] || statusStyles.idea}`}
    >
      <span className="truncate flex-1">{post.theme}</span>
      <ObjectifBadge objectif={post.objectif} size="sm" />
    </button>
  );
}

export function CalendarGrid({ calendarDays, postsByDate, todayStr, isMobile, onCreatePost, onEditPost }: Props) {
  if (isMobile) {
    return (
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
                  <PostChip key={p.id} post={p} onClick={() => onEditPost(p)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
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
      {/* Days grid */}
      <div className="grid grid-cols-7">
        {calendarDays.map((d, i) => {
          const dateStr = d.date.toISOString().split("T")[0];
          const dayPosts = postsByDate[dateStr] || [];
          const isToday = dateStr === todayStr;
          return (
            <div key={i}
              className={`min-h-[100px] border-b border-r border-border p-1.5 group relative ${!d.inMonth ? "opacity-40" : ""} ${isToday ? "bg-rose-pale" : ""}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${isToday ? "text-primary font-bold" : "text-foreground"}`}>
                  {d.date.getDate()}
                </span>
                {d.inMonth && (
                  <button onClick={() => onCreatePost(dateStr)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                {dayPosts.slice(0, 2).map((p) => (
                  <PostChip key={p.id} post={p} onClick={() => onEditPost(p)} />
                ))}
                {dayPosts.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">+{dayPosts.length - 2} de plus</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
