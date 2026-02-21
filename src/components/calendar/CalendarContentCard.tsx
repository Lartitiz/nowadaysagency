import { type CalendarPost } from "@/lib/calendar-constants";
import {
  CATEGORY_CARD_COLORS,
  FORMAT_EMOJIS,
  FORMAT_LABELS,
  TYPE_SHORT_LABELS,
  CATEGORY_LABELS,
} from "@/lib/calendar-helpers";

interface Props {
  post: CalendarPost;
  onClick: () => void;
  variant?: "compact" | "detailed";
}

/** Compact category-colored content card for calendar cells */
export function CalendarContentCard({ post, onClick, variant = "compact" }: Props) {
  const cat = post.category || (post.objectif === "vente" ? "vente" : post.objectif === "visibilite" ? "visibilite" : "confiance");
  const colors = CATEGORY_CARD_COLORS[cat] || CATEGORY_CARD_COLORS.confiance;

  const typeLabel = post.content_type ? (TYPE_SHORT_LABELS[post.content_type] || post.content_type) : null;
  const typeEmoji = post.content_type_emoji || "";
  const formatKey = (post as any).format_technique || (post as any).format || "";
  const formatEmoji = FORMAT_EMOJIS[formatKey] || "";
  const formatLabel = FORMAT_LABELS[formatKey] || "";

  const statusClass =
    post.status === "a_rediger"
      ? "border-dashed opacity-80"
      : post.status === "published"
        ? "opacity-50"
        : "";

  const isLaunch = !!post.launch_id;

  // If no content_type info, fall back to theme display
  const hasTypeInfo = !!typeLabel;

  if (variant === "detailed") {
    const catInfo = CATEGORY_LABELS[cat];
    return (
      <button
        onClick={onClick}
        className={`w-full text-left rounded-lg border px-2.5 py-2 transition-shadow hover:shadow-sm cursor-pointer mb-1.5 ${statusClass}`}
        style={{
          backgroundColor: colors.bg,
          borderLeftWidth: "3px",
          borderLeftColor: colors.borderLeft,
          borderColor: `${colors.borderLeft}33`,
          borderLeftStyle: post.status === "a_rediger" ? "dashed" : "solid",
        }}
      >
        {isLaunch && <span className="float-right text-[10px]">🚀</span>}

        <p className="font-medium text-foreground truncate text-xs">
          {hasTypeInfo ? `${typeEmoji} ${typeLabel}` : post.theme}
        </p>

        <p className="text-muted-foreground truncate text-[10px] mt-0.5">
          {formatEmoji && formatLabel ? `${formatEmoji} ${formatLabel}` : ""}
          {catInfo ? ` · ${catInfo.emoji} ${catInfo.label}` : ""}
        </p>

        {post.angle_suggestion && (
          <p className="text-muted-foreground italic truncate text-[10px] mt-0.5">
            "{post.angle_suggestion}"
          </p>
        )}

        <div className="flex items-center justify-end mt-1">
          {post.status === "a_rediger" && <span className="text-[10px] text-muted-foreground">📝</span>}
          {post.status === "drafting" && <span className="text-[10px] text-muted-foreground">✏️</span>}
          {post.status === "ready" && <span className="text-[10px] text-muted-foreground">✅</span>}
        </div>
      </button>
    );
  }

  // Compact variant (month view)
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md border px-1.5 py-1 transition-shadow hover:shadow-sm cursor-pointer mb-0.5 ${statusClass}`}
      style={{
        backgroundColor: colors.bg,
        borderLeftWidth: "3px",
        borderLeftColor: colors.borderLeft,
        borderColor: `${colors.borderLeft}22`,
        borderLeftStyle: post.status === "a_rediger" ? "dashed" : "solid",
      }}
    >
      {isLaunch && <span className="float-right text-[9px] leading-none">🚀</span>}

      <p className="font-medium text-foreground truncate text-[11px] leading-tight">
        {hasTypeInfo ? `${typeEmoji} ${typeLabel}` : post.theme}
      </p>

      {(formatEmoji || !hasTypeInfo) && (
        <p className="text-muted-foreground truncate text-[10px] leading-tight">
          {hasTypeInfo
            ? `${formatEmoji} ${formatLabel}`
            : (post.canal ? `📌 ${post.canal}` : "")}
        </p>
      )}
    </button>
  );
}

/** Mobile-only: ultra-compact emoji-only display */
export function CalendarContentCardMini({ post, onClick }: { post: CalendarPost; onClick: () => void }) {
  const typeEmoji = post.content_type_emoji || "📌";
  const formatKey = (post as any).format_technique || (post as any).format || "";
  const formatEmoji = FORMAT_EMOJIS[formatKey] || "";

  return (
    <button
      onClick={onClick}
      className="text-xs py-0.5"
    >
      {typeEmoji}{formatEmoji && formatEmoji}
    </button>
  );
}
