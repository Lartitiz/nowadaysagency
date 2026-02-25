import { type CalendarPost } from "@/lib/calendar-constants";
import {
  OBJECTIVE_CARD_COLORS,
  STATUS_BORDER_STYLE,
  FORMAT_EMOJIS,
  FORMAT_LABELS,
  TYPE_SHORT_LABELS,
  CATEGORY_LABELS,
} from "@/lib/calendar-helpers";
import { ChevronRight, Sparkles, Copy, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  post: CalendarPost;
  onClick: () => void;
  variant?: "compact" | "detailed";
  onQuickStatusChange?: (postId: string, newStatus: string) => void;
  onQuickDuplicate?: (post: CalendarPost) => void;
  onQuickDelete?: (postId: string) => void;
  onQuickGenerate?: (post: CalendarPost) => void;
}

function isStoriesPost(post: CalendarPost): boolean {
  return !!(post.stories_count || post.stories_sequence_id || post.stories_structure) && post.format !== "reel";
}

function isReelPost(post: CalendarPost): boolean {
  return post.format === "reel";
}

/** Resolve objective key for color mapping */
function getObjectifKey(post: CalendarPost): string {
  if (isStoriesPost(post)) return "stories";
  return post.objectif || post.category || "default";
}

/** Status badge */
function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { icon: string; bg: string; text: string }> = {
    idea: { icon: "💡", bg: "bg-muted", text: "text-muted-foreground" },
    a_rediger: { icon: "📝", bg: "bg-blue-50", text: "text-blue-700" },
    planned: { icon: "📝", bg: "bg-blue-50", text: "text-blue-700" },
    drafting: { icon: "✏️", bg: "bg-amber-50", text: "text-amber-700" },
    draft_ready: { icon: "✅", bg: "bg-green-50", text: "text-green-700" },
    ready: { icon: "✅", bg: "bg-green-50", text: "text-green-700" },
    published: { icon: "🟢", bg: "bg-emerald-50", text: "text-emerald-800" },
  };
  const c = configs[status] || configs.idea;
  return (
    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      {c.icon}
    </span>
  );
}

/** Compact category-colored content card for calendar cells */
export function CalendarContentCard({ post, onClick, variant = "compact", onQuickStatusChange, onQuickDuplicate, onQuickDelete, onQuickGenerate }: Props) {
  const isStories = isStoriesPost(post);
  const isReel = isReelPost(post);

  // Unified color system: 1 color = 1 objective
  const objectifKey = getObjectifKey(post);
  const colors = OBJECTIVE_CARD_COLORS[objectifKey] || OBJECTIVE_CARD_COLORS.default;
  const borderStyle = STATUS_BORDER_STYLE[post.status] || STATUS_BORDER_STYLE.idea;

  const typeLabel = post.content_type ? (TYPE_SHORT_LABELS[post.content_type] || post.content_type) : null;
  const typeEmoji = post.content_type_emoji || "";
  const formatKey = (post as any).format_technique || post.format || "";
  const formatEmoji = FORMAT_EMOJIS[formatKey] || "";
  const formatLabel = FORMAT_LABELS[formatKey] || "";
  const isLaunch = !!post.launch_id;
  const hasTypeInfo = !!typeLabel;

  const cardStyle = {
    backgroundColor: colors.bg,
    borderLeftWidth: "3px",
    borderLeftColor: colors.borderLeft,
    borderLeftStyle: borderStyle.style as any,
    borderColor: `${colors.borderLeft}22`,
  };

  const timingSummary = post.stories_timing
    ? Object.entries(post.stories_timing).map(([k, v]) => {
        const emoji = k === "matin" ? "🌅" : k === "midi" ? "☀️" : "🌙";
        return `${emoji} ${v}`;
      })
    : [];

  if (variant === "detailed") {
    const catInfo = isStories ? { emoji: "📱", label: "Stories" } : CATEGORY_LABELS[objectifKey];

    return (
      <button onClick={onClick}
        className={cn(
          "w-full text-left rounded-lg border px-2.5 py-2 transition-shadow hover:shadow-sm cursor-pointer mb-1.5 group/card relative",
          post.status === "published" && "opacity-70",
        )}
        style={cardStyle}>
        {/* Quick actions — visible au hover */}
        {(onQuickStatusChange || onQuickDuplicate || onQuickDelete || onQuickGenerate) && (
          <div
            className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {onQuickStatusChange && post.status !== "published" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const order = ["idea", "a_rediger", "drafting", "ready", "published"];
                  const currentIdx = order.indexOf(post.status);
                  const nextStatus = order[Math.min(currentIdx + 1, order.length - 1)];
                  onQuickStatusChange(post.id, nextStatus);
                }}
                className="p-1 rounded-md bg-background/90 border border-border/50 hover:bg-primary/10 hover:border-primary/30 text-muted-foreground hover:text-primary transition-colors"
                title="Avancer le statut"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
            {onQuickGenerate && (post.status === "idea" || post.status === "a_rediger") && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickGenerate(post);
                }}
                className="p-1 rounded-md bg-background/90 border border-border/50 hover:bg-primary/10 hover:border-primary/30 text-muted-foreground hover:text-primary transition-colors"
                title="Générer avec l'IA"
              >
                <Sparkles className="h-3 w-3" />
              </button>
            )}
            {onQuickDuplicate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickDuplicate(post);
                }}
                className="p-1 rounded-md bg-background/90 border border-border/50 hover:bg-accent hover:border-border text-muted-foreground hover:text-foreground transition-colors"
                title="Dupliquer"
              >
                <Copy className="h-3 w-3" />
              </button>
            )}
            {onQuickDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickDelete(post.id);
                }}
                className="p-1 rounded-md bg-background/90 border border-border/50 hover:bg-destructive/10 hover:border-destructive/30 text-muted-foreground hover:text-destructive transition-colors"
                title="Supprimer"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        <div className="flex items-center justify-between mb-0.5">
          {isLaunch && <span className="text-[10px]">🚀</span>}
          <StatusBadge status={post.status} />
        </div>
        {isStories ? (
          <>
            <p className={cn("font-medium text-foreground truncate text-xs", post.status === "published" && "line-through")}>
              📱 Stories · {post.stories_structure || post.theme}
            </p>
            <p className="text-muted-foreground truncate text-[10px] mt-0.5">{post.stories_count || "?"} stories · {post.stories_objective || ""}</p>
            {timingSummary.length > 0 && (
              <div className="mt-1 space-y-0">{timingSummary.map((t, i) => (
                <p key={i} className="text-[10px] text-muted-foreground truncate">{t}</p>
              ))}</div>
            )}
          </>
        ) : (
          <>
            <p className={cn("font-medium text-foreground truncate text-xs", post.status === "published" && "line-through")}>
              {hasTypeInfo ? `${typeEmoji} ${typeLabel}` : post.theme}
            </p>
            <p className="text-muted-foreground truncate text-[10px] mt-0.5">
              {formatEmoji && formatLabel ? `${formatEmoji} ${formatLabel}` : ""}
              {catInfo ? ` · ${catInfo.emoji} ${catInfo.label}` : ""}
            </p>
            {post.angle_suggestion && (
              <p className="text-muted-foreground italic truncate text-[10px] mt-0.5">"{post.angle_suggestion}"</p>
            )}
          </>
        )}
        {(post.status === "ready" || post.status === "draft_ready") && (
          <p className="text-[10px] text-primary font-medium mt-1">Voir →</p>
        )}
      </button>
    );
  }

  // Compact variant (month view)
  return (
    <button onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border px-1.5 py-1 transition-shadow hover:shadow-sm cursor-pointer mb-0.5",
        post.status === "published" && "opacity-70",
      )}
      style={cardStyle}>
      <div className="flex items-center justify-between">
        {isLaunch && <span className="text-[9px] leading-none">🚀</span>}
        <StatusBadge status={post.status} />
      </div>
      {isReel ? (
        <p className={cn("font-medium text-foreground truncate text-[11px] leading-tight", post.status === "published" && "line-through")}>
          🎬 {post.theme}
        </p>
      ) : isStories ? (
        <p className={cn("font-medium text-foreground truncate text-[11px] leading-tight", post.status === "published" && "line-through")}>
          📱 {post.stories_count || ""} stories
        </p>
      ) : (
        <>
          <p className={cn("font-medium text-foreground truncate text-[11px] leading-tight", post.status === "published" && "line-through")}>
            {hasTypeInfo ? `${typeEmoji} ${typeLabel}` : post.theme}
          </p>
          {(formatEmoji || !hasTypeInfo) && (
            <p className="text-muted-foreground truncate text-[10px] leading-tight">
              {hasTypeInfo ? `${formatEmoji} ${formatLabel}` : (post.canal ? `📌 ${post.canal}` : "")}
            </p>
          )}
        </>
      )}
    </button>
  );
}

/** Mobile-only: ultra-compact emoji-only display */
export function CalendarContentCardMini({ post, onClick }: { post: CalendarPost; onClick: () => void }) {
  const isStories = isStoriesPost(post);
  if (isStories) return <button onClick={onClick} className="text-xs py-0.5">📱</button>;
  const typeEmoji = post.content_type_emoji || "📌";
  const formatKey = (post as any).format_technique || post.format || "";
  const formatEmoji = FORMAT_EMOJIS[formatKey] || "";
  return <button onClick={onClick} className="text-xs py-0.5">{typeEmoji}{formatEmoji}</button>;
}
