import { useState, useRef, useCallback, useMemo } from "react";
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

import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  post: CalendarPost;
  onClick: () => void;
  variant?: "compact" | "detailed";
  commentCount?: number;
  onQuickStatusChange?: (postId: string, newStatus: string) => void;
  onQuickDuplicate?: (post: CalendarPost) => void;
  onQuickDelete?: (postId: string) => void;
  onQuickGenerate?: (post: CalendarPost) => void;
  ownerUsername?: string;
  ownerDisplayName?: string;
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
export function CalendarContentCard({ post, onClick, variant = "compact", commentCount, onQuickStatusChange, onQuickDuplicate, onQuickDelete, onQuickGenerate, ownerUsername, ownerDisplayName }: Props) {
  const isMobile = useIsMobile();
  const isStories = isStoriesPost(post);
  const isReel = isReelPost(post);
  const hasPreview = !!post.content_draft && !isMobile;

  // Hover preview state
  const [showPreview, setShowPreview] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>();
  const onMouseEnter = useCallback(() => {
    if (!hasPreview) return;
    hoverTimeout.current = setTimeout(() => setShowPreview(true), 300);
  }, [hasPreview]);
  const onMouseLeave = useCallback(() => {
    clearTimeout(hoverTimeout.current);
    setShowPreview(false);
  }, []);


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

  // Status dot colors for detailed variant
  const STATUS_DOT_COLORS: Record<string, string> = {
    idea: "hsl(220, 9%, 76%)",
    a_rediger: "hsl(217, 91%, 60%)",
    planned: "hsl(217, 91%, 60%)",
    drafting: "hsl(38, 92%, 50%)",
    draft_ready: "hsl(338, 96%, 61%)",
    ready: "hsl(338, 96%, 61%)",
    published: "hsl(142, 71%, 45%)",
  };

  const CANAL_SHORT: Record<string, string> = {
    instagram: "IG",
    linkedin: "LI",
    pinterest: "PI",
  };

  const OBJECTIF_EMOJIS: Record<string, string> = {
    visibilite: "👀",
    confiance: "🤝",
    vente: "💰",
    credibilite: "🏆",
  };

  if (variant === "detailed") {
    const dotColor = STATUS_DOT_COLORS[post.status] || STATUS_DOT_COLORS.idea;
    const canalShort = CANAL_SHORT[post.canal] || post.canal?.toUpperCase()?.slice(0, 2) || "";
    const objEmoji = OBJECTIF_EMOJIS[post.objectif || post.category || ""] || "";

    return (
      <div className="relative" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
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

        {/* Post top: status dot left, canal label right */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 rounded-full" style={{ width: 7, height: 7, backgroundColor: dotColor }} />
            {isLaunch && <span className="text-[10px]">🚀</span>}
          </div>
          {canalShort && (
            <span
              className="text-muted-foreground uppercase"
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 600, letterSpacing: "0.04em" }}
            >
              {canalShort}
            </span>
          )}
        </div>

        {isStories ? (
          <>
            <p className={cn("font-medium text-foreground truncate text-xs", post.status === "published" && "line-through")}>
              📱 Stories · {post.stories_structure || post.theme}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9px] px-1.5 py-px rounded-full text-muted-foreground" style={{ background: "rgba(0,0,0,0.04)" }}>
                📱 Stories
              </span>
              <span className="text-[10px] text-muted-foreground">{post.stories_count || "?"} stories · {post.stories_objective || ""}</span>
            </div>
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
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {(formatEmoji || formatLabel) && (
                <span className="text-[9px] px-1.5 py-px rounded-full text-muted-foreground" style={{ background: "rgba(0,0,0,0.04)" }}>
                  {formatEmoji} {formatLabel}
                </span>
               )}
              {objEmoji && <span className="text-[10px]">{objEmoji}</span>}
              {(post as any).media_urls?.length > 0 && (
                <span className="text-[10px] opacity-60" title={`${(post as any).media_urls.length} visuel(s)`}>📸</span>
              )}
            </div>
            {post.content_draft && !post.angle_suggestion && (
              <p className="text-muted-foreground truncate text-[10px] mt-0.5 line-clamp-2" style={{ WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal' }}>
                {post.content_draft.split("\n").slice(0, 2).join(" ")}
              </p>
            )}
            {post.angle_suggestion && (
              <p className="text-muted-foreground italic truncate text-[10px] mt-0.5">"{post.angle_suggestion}"</p>
            )}
          </>
        )}
        {(post.status === "ready" || post.status === "draft_ready") && (
          <p className="text-[10px] text-primary font-medium mt-1">Voir →</p>
        )}
        {(commentCount || 0) > 0 && (
          <span className="absolute bottom-1.5 right-1.5 text-[10px] bg-primary/10 text-primary font-semibold px-1.5 py-0.5 rounded-full">
            💬 {commentCount}
          </span>
        )}
      </button>

      {/* Hover preview — simple text preview */}
      {showPreview && hasPreview && (
        <div className="absolute left-full top-0 ml-2 z-50 pointer-events-none animate-in fade-in-0 zoom-in-95 duration-150" style={{ width: 260 }}>
          <div className="rounded-xl border border-border shadow-lg bg-card overflow-hidden p-3" style={{ maxHeight: 200 }}>
            <p className="text-[10px] uppercase mb-1 text-muted-foreground" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              {post.canal} · {FORMAT_LABELS[post.format || ""] || "post"}
            </p>
            <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-6">{post.content_draft}</p>
          </div>
        </div>
      )}
      </div>
    );
  }

  // Compact variant (month view)
  return (
    <button onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border px-1.5 py-1 transition-shadow hover:shadow-sm cursor-pointer mb-0.5 relative",
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
      {(commentCount || 0) > 0 && (
        <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-primary/10 text-primary font-semibold px-1 py-0 rounded-full leading-tight">
          💬{commentCount}
        </span>
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
