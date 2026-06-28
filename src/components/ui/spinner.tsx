import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Spinner unifié de l'app (remplace les spinners CSS « maison » border-2/border-4
 * et les Loader2 inline disparates). Pour une liste, préférer Skeleton/SkeletonCard.
 */
export function Spinner({ className, size = 20 }: { className?: string; size?: number }) {
  return <Loader2 size={size} className={cn("animate-spin text-primary", className)} aria-hidden />;
}

/** Chargement plein-zone : spinner centré + libellé optionnel. */
export function PageLoader({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground", className)}
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      {label && <p className="text-sm">{label}</p>}
      {!label && <span className="sr-only">Chargement…</span>}
    </div>
  );
}
