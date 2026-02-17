import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "react-router-dom";

export default function AppHeader() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const prenom = ""; // Will be passed as prop or fetched

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="font-display text-xl font-bold text-foreground">Now Pilot</span>
          <span className="rounded-pill bg-secondary px-2 py-0.5 text-[10px] font-semibold text-primary">beta</span>
        </div>

        <nav className="hidden sm:flex items-center rounded-pill bg-rose-pale p-1 gap-1">
          <NavTab to="/dashboard" active={location.pathname === "/dashboard"}>Mon atelier</NavTab>
          <NavTab to="/calendrier" active={location.pathname === "/calendrier"}>Mon calendrier</NavTab>
          <NavTab to="/profil" active={location.pathname === "/profil"}>Mon profil</NavTab>
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
              {user?.email?.charAt(0).toUpperCase()}
            </div>
          </div>
          <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Déconnexion
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="sm:hidden flex items-center justify-center pb-2 gap-1">
        <nav className="flex items-center rounded-pill bg-rose-pale p-1 gap-1">
          <NavTab to="/dashboard" active={location.pathname === "/dashboard"}>Mon atelier</NavTab>
          <NavTab to="/calendrier" active={location.pathname === "/calendrier"}>Mon calendrier</NavTab>
          <NavTab to="/profil" active={location.pathname === "/profil"}>Mon profil</NavTab>
        </nav>
      </div>
    </header>
  );
}

function NavTab({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`rounded-pill px-4 py-1.5 text-sm font-medium transition-all ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground hover:bg-secondary"
      }`}
    >
      {children}
    </Link>
  );
}
