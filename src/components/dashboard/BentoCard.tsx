import { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

interface BentoCardProps {
  title: string;
  subtitle?: string;
  icon?: string | ReactNode;
  colSpan?: number;
  rowSpan?: number;
  variant?: "default" | "highlight" | "dark" | "accent";
  bgColor?: string;
  borderColor?: string;
  onClick?: () => void;
  children?: ReactNode;
  animationDelay?: number;
}

const variantStyles: Record<string, string> = {
  default:
    "bg-card border border-border text-foreground",
  highlight:
    "bg-gradient-to-br from-rose-pale via-secondary to-[hsl(var(--bento-lavande))] border border-primary/10 text-foreground",
  dark:
    "bg-[hsl(var(--bento-dark))] border-none text-white",
  accent:
    "bg-[hsl(var(--bento-yellow))] border border-accent/30 text-foreground",
};

export default function BentoCard({
  title,
  subtitle,
  icon,
  colSpan = 4,
  rowSpan = 1,
  variant = "default",
  bgColor,
  borderColor,
  onClick,
  children,
  animationDelay = 0,
}: BentoCardProps) {
  const colClass = getColClass(colSpan);
  const rowClass = getRowClass(rowSpan);

  return (
    <div
      data-clickable={onClick ? "true" : undefined}
      onClick={onClick}
      className={`
        rounded-[20px] p-5 sm:p-6
        shadow-[var(--shadow-bento)]
        hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[3px]
        active:translate-y-0 active:shadow-[var(--shadow-bento)]
        transition-all duration-[250ms] ease-out
        opacity-0 animate-reveal-up
        ${onClick ? "cursor-pointer" : ""}
        ${colClass} ${rowClass}
        ${bgColor || variantStyles[variant] || variantStyles.default}
      `}
      style={{
        animationDelay: `${animationDelay}s`,
        animationFillMode: "forwards",
        ...(borderColor ? { borderColor } : {}),
      }}
    >
      {/* Header row */}
      {(icon || title) && !children && (
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2.5">
            {icon && (
              <span className="text-xl leading-none">
                {typeof icon === "string" ? icon : icon}
              </span>
            )}
            <div>
              <h3 className="font-heading text-base sm:text-lg font-bold leading-tight">
                {title}
              </h3>
              {subtitle && (
                <p className={`text-sm mt-1 leading-relaxed ${variant === "dark" ? "text-white/70" : "text-muted-foreground"}`}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {onClick && (
            <ArrowRight className={`h-4 w-4 shrink-0 mt-1 transition-colors ${variant === "dark" ? "text-white/50" : "text-muted-foreground"} group-hover:text-primary`} />
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function getColClass(span: number): string {
  const map: Record<number, string> = {
    3: "col-span-2 sm:col-span-3 lg:col-span-3",
    4: "col-span-4 sm:col-span-3 lg:col-span-4",
    6: "col-span-4 sm:col-span-6 lg:col-span-6",
    8: "col-span-4 sm:col-span-6 lg:col-span-8",
    12: "col-span-4 sm:col-span-6 lg:col-span-12",
  };
  return map[span] || `col-span-4 lg:col-span-${span}`;
}

function getRowClass(span: number): string {
  const map: Record<number, string> = {
    1: "row-span-1",
    2: "row-span-2",
    3: "row-span-3",
  };
  return map[span] || `row-span-${span}`;
}
