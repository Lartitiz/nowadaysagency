import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * « Plus d'options » (chantier B, 15/10/2026) : longueur, façon d'aborder le sujet et
 * structure, déjà réglées par défaut. Fermé au départ ; le résumé dit ce qui est choisi.
 */
export default function FormatMoreOptions({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-border bg-card animate-fade-in" data-testid="creer-format-more-options">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-medium text-foreground shrink-0">Plus d'options</span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{summary}</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <div className="space-y-4 border-t border-border px-3 pb-3 pt-3">{children}</div>
    </details>
  );
}
