import { Link } from "react-router-dom";

export default function FormatPill({ emoji, label, soon, to }: { emoji: string; label: string; soon?: boolean; to?: string }) {
  const classes = `inline-flex items-center gap-1.5 font-mono-ui text-xs font-semibold px-3 py-1.5 rounded-pill ${
    soon ? "text-muted-foreground bg-muted" : "text-primary bg-rose-pale hover:bg-primary/20 transition-colors"
  }`;

  if (to) {
    return (
      <Link to={to} onClick={(e) => e.stopPropagation()} className={classes}>
        {emoji} {label}{soon && " 🔜"}
      </Link>
    );
  }

  return (
    <span className={classes}>
      {emoji} {label}{soon && " 🔜"}
    </span>
  );
}
