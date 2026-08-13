import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

export default function FormatPill({ emoji, icon: Icon, label, soon, to }: { emoji?: string; icon?: LucideIcon; label: string; soon?: boolean; to?: string }) {
  const classes = `inline-flex items-center gap-1.5 font-mono-ui text-xs font-semibold px-3 py-1.5 rounded-pill ${
    soon ? "text-muted-foreground bg-muted" : "text-primary bg-rose-pale hover:bg-primary/20 transition-colors"
  }`;

  const inner = (
    <>
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" /> : emoji}
      {" "}{label}{soon && <span className="ml-1 font-normal normal-case">(bientôt)</span>}
    </>
  );

  if (to) {
    return (
      <Link to={to} onClick={(e) => e.stopPropagation()} className={classes}>
        {inner}
      </Link>
    );
  }

  return <span className={classes}>{inner}</span>;
}
