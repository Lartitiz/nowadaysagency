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
      className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-white/80 p-0.5"
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
    >
      <button
        onClick={() => toggle("guide")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all ${
          current === "guide"
            ? "bg-[#fb3d80]/10 text-[#fb3d80] font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Compass className="h-3.5 w-3.5" />
        Vue guidée
      </button>
      <button
        onClick={() => toggle("complete")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all ${
          current === "complete"
            ? "bg-[#fb3d80]/10 text-[#fb3d80] font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Vue complète
      </button>
    </div>
  );
}
