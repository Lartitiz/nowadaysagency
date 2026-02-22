import { Link } from "react-router-dom";
import { Video, Bell, ArrowRight } from "lucide-react";
import UpgradeGate from "@/components/UpgradeGate";

export default function LivesWidget() {
  return (
    <UpgradeGate feature="lives">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🎥</span>
          <h3 className="font-display text-lg font-bold text-foreground">Prochains lives</h3>
        </div>

        <div className="text-sm text-muted-foreground leading-relaxed mb-4">
          <p>Pas de live programmé pour l'instant. Reste connectée ! 🔜</p>
        </div>

        <Link
          to="/lives"
          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Voir tous les lives et replays <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </UpgradeGate>
  );
}
