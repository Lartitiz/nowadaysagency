// Chantier D (15/10/2026) : aide qui s'ouvre au toucher comme au clic (les
// infobulles au survol ne s'affichent jamais sur téléphone).
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function HelpTip({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Aide : ${label}`}
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground ${className}`}
        >
          ?
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 text-xs leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}
