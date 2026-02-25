import { Link } from "react-router-dom";

export default function HubCard({
  to,
  emoji,
  title,
  desc,
  badge,
  tag,
  disabled,
  progressLabel = null,
}: {
  to: string;
  emoji: string;
  title: string;
  desc: string;
  badge?: string;
  tag?: string;
  disabled?: boolean;
  progressLabel?: string | null;
}) {
  const displayTag = badge || tag;
  const content = (
    <div className={`relative rounded-2xl border border-border bg-card p-5 transition-all ${disabled ? "opacity-60 cursor-not-allowed" : "hover:border-primary hover:shadow-md group"}`}>
      {displayTag && (
        <span className="absolute top-3 right-3 font-mono-ui text-[10px] font-semibold text-muted-foreground bg-rose-pale px-2 py-0.5 rounded-pill">
          {displayTag}
        </span>
      )}
      <span className="text-2xl mb-2 block">{emoji}</span>
      <h3 className="font-display text-base font-bold text-foreground group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{desc}</p>
      {progressLabel && (
        <p className="text-xs text-muted-foreground font-medium mt-1">{progressLabel}</p>
      )}
    </div>
  );

  if (disabled) return content;

  return <Link to={to}>{content}</Link>;
}
