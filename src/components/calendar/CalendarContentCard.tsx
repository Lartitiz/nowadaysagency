import { useState, useRef, useCallback } from "react";
import { type CalendarPost } from "@/lib/calendar-constants";
import {
  FORMAT_LABELS,
} from "@/lib/calendar-helpers";
import { ChevronRight, Sparkles, Copy, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

const CANAL_ICONS: Record<string, string> = {
  instagram: "📸",
  linkedin: "💼",
  pinterest: "📌",
  newsletter: "✉️",
  blog: "📝",
};

/** Simplified status → card style mapping */
function getStatusStyle(status: string): { bg: string; borderColor: string; textClass: string } {
  switch (status) {
    case "published":
      return { bg: "#F5F5F5", borderColor: "hsl(var(--muted-foreground))", textClass: "text-muted-foreground opacity-70" };
    case "ready":
    case "draft_ready":
      return { bg: "#F0FFF4", borderColor: "hsl(142, 71%, 45%)", textClass: "text-foreground" };
    case "drafting":
      return { bg: "#FFF9E6", borderColor: "hsl(38, 92%, 50%)", textClass: "text-foreground" };
    default: // idea, a_rediger, planned
      return { bg: "#FFFFFF", borderColor: "hsl(217, 91%, 60%)", textClass: "text-foreground" };
  }
}

/** Compact card for calendar cells — simplified & readable */
export function CalendarContentCard({ post, onClick, variant = "compact", commentCount, onQuickStatusChange, onQuickDuplicate, onQuickDelete, onQuickGenerate }: Props) {
  const isMobile = useIsMobile();
  const statusStyle = getStatusStyle(post.status);
  const canalIcon = CANAL_ICONS[post.canal] || "📌";
  const title = post.theme || "Sans titre";
  const formatKey = (post as any).format_technique || post.format || "";
  const formatLabel = FORMAT_LABELS[formatKey] || "";

  const cardStyle: React.CSSProperties = {
    backgroundColor: statusStyle.bg,
    borderLeftWidth: "3px",
    borderLeftStyle: "solid",
    borderLeftColor: statusStyle.borderColor,
    borderColor: "hsl(var(--border))",
  };

  // Tooltip content (detail on hover)
  const tooltipContent = (
    <div className="space-y-1 max-w-[220px]">
      <p className="font-semibold text-sm">{title}</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{canalIcon} {post.canal}</span>
        {formatLabel && <span>· {formatLabel}</span>}
      </div>
      {post.content_draft && (
        <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
          {post.content_draft.slice(0, 150)}
        </p>
      )}
      {post.angle_suggestion && (
        <p className="text-xs italic text-muted-foreground">"{post.angle_suggestion}"</p>
      )}
    </div>
  );

  if (variant === "detailed") {
    return (
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onClick}
              className={cn(
                "w-full text-left rounded-lg border px-2.5 py-2 transition-shadow hover:shadow-sm cursor-pointer mb-1.5 group/card relative",
                statusStyle.textClass,
              )}
              style={cardStyle}
            >
              {/* Quick actions on hover */}
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

              {/* Canal icon + title (2 lines max) */}
              <div className="flex items-start gap-1.5">
                <span className="text-sm shrink-0 mt-0.5" style={{ fontSize: 14 }}>{canalIcon}</span>
                <p className={cn(
                  "font-medium text-xs leading-snug",
                  post.status === "published" && "line-through",
                )}
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  whiteSpace: 'normal',
                }}>
                  {title}
                </p>
              </div>

              {(commentCount || 0) > 0 && (
                <span className="absolute bottom-1.5 right-1.5 text-[10px] bg-primary/10 text-primary font-semibold px-1.5 py-0.5 rounded-full">
                  💬 {commentCount}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="p-3 bg-card border shadow-lg rounded-xl">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Compact variant (month view)
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "w-full text-left rounded-md border px-1.5 py-1 transition-shadow hover:shadow-sm cursor-pointer mb-0.5 relative",
              statusStyle.textClass,
            )}
            style={cardStyle}
          >
            <div className="flex items-start gap-1">
              <span className="text-xs shrink-0">{canalIcon}</span>
              <p className={cn(
                "font-medium text-[11px] leading-tight",
                post.status === "published" && "line-through",
              )}
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                whiteSpace: 'normal',
              }}>
                {title}
              </p>
            </div>
            {(commentCount || 0) > 0 && (
              <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-primary/10 text-primary font-semibold px-1 py-0 rounded-full leading-tight">
                💬{commentCount}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="p-3 bg-card border shadow-lg rounded-xl">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Mobile-only: ultra-compact emoji-only display */
export function CalendarContentCardMini({ post, onClick }: { post: CalendarPost; onClick: () => void }) {
  const canalIcon = CANAL_ICONS[post.canal] || "📌";
  return <button onClick={onClick} className="text-xs py-0.5">{canalIcon}</button>;
}
