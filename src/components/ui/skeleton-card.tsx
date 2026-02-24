import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  variant?: "small" | "medium" | "large";
  className?: string;
}

export function SkeletonCard({ variant = "medium", className }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "rounded-[20px] bg-card border border-border p-5 shadow-[var(--shadow-bento)] animate-pulse",
        variant === "small" && "col-span-4 sm:col-span-3 lg:col-span-3 row-span-1",
        variant === "medium" && "col-span-4 sm:col-span-6 lg:col-span-6 row-span-2",
        variant === "large" && "col-span-4 sm:col-span-6 lg:col-span-12 row-span-2",
        className
      )}
    >
      {/* Title */}
      <div className="h-4 w-2/5 rounded-md bg-muted mb-4" />

      {/* Text lines */}
      <div className="space-y-2.5 mb-5">
        <div className="h-3 w-full rounded-md bg-muted" />
        <div className="h-3 w-4/5 rounded-md bg-muted" />
        {variant !== "small" && <div className="h-3 w-3/5 rounded-md bg-muted" />}
      </div>

      {/* Button placeholder */}
      <div className="h-8 w-24 rounded-xl bg-muted" />
    </div>
  );
}
