import { ArrowRight } from "lucide-react";

interface SpaceBentoCardProps {
  title: string;
  subtitle: string;
  icon: string;
  gradient: string;
  badge?: string;
  onClick: () => void;
  animationDelay?: number;
}

export default function SpaceBentoCard({
  title,
  subtitle,
  icon,
  gradient,
  badge,
  onClick,
  animationDelay = 0,
}: SpaceBentoCardProps) {
  return (
    <div
      data-clickable="true"
      onClick={onClick}
      className={`
        group relative col-span-2 sm:col-span-3 lg:col-span-3
        row-span-2
        rounded-[20px] p-5
        bg-gradient-to-br ${gradient}
        border border-border/50
        shadow-[var(--shadow-bento)]
        hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[3px]
        active:translate-y-0 active:shadow-[var(--shadow-bento)]
        transition-all duration-[250ms] ease-out
        cursor-pointer
        opacity-0 animate-reveal-up
        overflow-hidden
      `}
      style={{
        animationDelay: `${animationDelay}s`,
        animationFillMode: "forwards",
      }}
    >
      {badge && (
        <span className="absolute top-3 right-3 text-[10px] font-mono-ui font-semibold text-muted-foreground bg-card/80 backdrop-blur-sm px-2 py-0.5 rounded-md">
          {badge}
        </span>
      )}

      <span className="text-3xl block mb-3">{icon}</span>

      <h3 className="font-heading text-base font-bold text-foreground mb-1 leading-tight">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {subtitle}
      </p>

      <div className="absolute bottom-4 right-4">
        <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors duration-200" />
      </div>
    </div>
  );
}
