import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreditWarningProps {
  remaining: number;
  className?: string;
}

export default function CreditWarning({ remaining, className }: CreditWarningProps) {
  if (remaining > 3) return null;

  return (
    <div className={cn("flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2", className)}>
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        {remaining <= 0
          ? "Vous avez atteint votre limite de générations."
          : `Il vous reste ${remaining} génération${remaining > 1 ? "s" : ""}.`}
      </span>
    </div>
  );
}
