import { useNavigate, useLocation } from "react-router-dom";
import { Compass, LayoutGrid } from "lucide-react";

const LS_KEY = "dashboard_view_preference";

export type DashboardView = "guide" | "complete";

export function getDashboardPreference(): DashboardView {
  const stored = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
  return stored === "complete" ? "complete" : "guide";
}

export function setDashboardPreference(view: DashboardView) {
  localStorage.setItem(LS_KEY, view);
}

export function DashboardViewToggle({ current }: { current: DashboardView }) {
  const navigate = useNavigate();

  const toggle = (view: DashboardView) => {
    setDashboardPreference(view);
    navigate(view === "guide" ? "/dashboard" : "/dashboard/complet", { replace: true });
  };

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-card/80 p-0.5"
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      role="tablist"
      aria-label="Mode d'affichage du dashboard"
    >
      <button
        onClick={() => toggle("guide")}
        role="tab"
        aria-selected={current === "guide"}
        aria-label="Vue guidée"
        className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
          current === "guide"
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Compass className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Vue guidée</span>
      </button>
      <button
        onClick={() => toggle("complete")}
        role="tab"
        aria-selected={current === "complete"}
        aria-label="Vue complète"
        className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
          current === "complete"
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Vue complète</span>
      </button>
    </div>
  );
}
