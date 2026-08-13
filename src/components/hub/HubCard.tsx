import { memo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

function HubCard({
  to,
  emoji,
  title,
  desc,
  badge,
  tag,
  disabled,
  progressLabel = null,
  onClick,
}: {
  to: string;
  emoji: string;
  title: string;
  desc: string;
  badge?: string;
  tag?: string;
  disabled?: boolean;
  progressLabel?: string | null;
  onClick?: () => void;
}) {
  const displayTag = badge || tag;
  const content = (
    <div className={`relative rounded-2xl border border-border bg-card p-5 transition-all ${disabled ? "opacity-60 cursor-not-allowed" : "hover:border-primary hover:shadow-md group"}`}>
      {displayTag && (
        <span className="absolute top-3 right-3 font-mono-ui text-2xs font-semibold text-muted-foreground bg-rose-pale px-2 py-0.5 rounded-pill">
          {displayTag}
        </span>
      )}
      <span className="text-2xl mb-2 block">{emoji}</span>
      {/* Flèche toujours visible : sans elle, rien n'indique que la card est cliquable */}
      <h3 className="font-body text-base font-bold text-foreground group-hover:text-primary transition-colors flex items-center justify-between gap-2">
        <span>{title}</span>
        {!disabled && (
          <ArrowRight className="h-4 w-4 shrink-0 text-primary/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" aria-hidden="true" />
        )}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{desc}</p>
      {progressLabel && (
        <p className="text-xs text-muted-foreground font-medium mt-1">{progressLabel}</p>
      )}
    </div>
  );

  if (disabled) return content;

  if (onClick) {
    return <button type="button" onClick={onClick} className="text-left w-full">{content}</button>;
  }

  return <Link to={to}>{content}</Link>;
}

export default memo(HubCard);
