import { AlertTriangle, Info } from "lucide-react";
import { Link } from "react-router-dom";

interface CreditWarningProps {
  remaining: number;
  className?: string;
}

export default function CreditWarning({ remaining, className = "" }: CreditWarningProps) {
  if (remaining > 3) return null;

  if (remaining <= 0) {
    return (
      <div className={`flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm ${className}`}>
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div>
          <span className="text-destructive font-medium">Tes crédits IA sont épuisés ce mois-ci.</span>{" "}
          <span className="text-muted-foreground">Ils reviennent le 1er du mois.</span>{" "}
          <Link to="/pricing" className="text-primary underline underline-offset-2 hover:text-primary/80">Voir les offres</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm ${className}`}>
      <Info className="h-4 w-4 text-amber-600 shrink-0" />
      <span className="text-muted-foreground">
        Il te reste <strong className="text-foreground">{remaining}</strong> crédit{remaining > 1 ? "s" : ""} IA ce mois.
      </span>
    </div>
  );
}
