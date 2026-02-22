import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";

export default function ServicesWidget() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">✨</span>
        <h3 className="font-display text-lg font-bold text-foreground">Besoin d'un coup de pouce ?</h3>
      </div>

      <ul className="space-y-2 text-sm text-foreground mb-4">
        <li className="flex items-center gap-2">
          <span>🎯</span>
          <span>Coaching individuel · <span className="font-semibold">150€</span></span>
        </li>
        <li className="flex items-center gap-2">
          <span>🔍</span>
          <span>Audit personnalisé · <span className="font-semibold">200€</span></span>
        </li>
        <li className="flex items-center gap-2">
          <span>🏡</span>
          <span>Weekend Bourgogne · <span className="font-semibold">450€</span></span>
        </li>
      </ul>

      <Link
        to="/services"
        className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        Voir les services <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
