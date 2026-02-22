import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "react-router-dom";
import { Home, ClipboardList, User, Settings, Menu, X, Lightbulb } from "lucide-react";
import { useState } from "react";
import NotificationBell from "@/components/NotificationBell";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Accueil", icon: Home },
  { to: "/idees", label: "Mes idées", icon: Lightbulb },
  { to: "/mon-plan", label: "Mon plan", icon: ClipboardList },
  { to: "/profil", label: "Profil", icon: User },
  { to: "/parametres", label: "Paramètres", icon: Settings },
];

export default function AppHeader() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-6 max-md:px-4">
        {/* Logo → Hub */}
        <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
          <span className="font-display text-xl font-bold text-bordeaux">L'Assistant Com'</span>
          <span className="font-mono-ui text-[10px] font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-md">beta</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1 rounded-pill bg-rose-pale p-1">
          {NAV_ITEMS.map((item) => (
            <NavTab
              key={item.to}
              to={item.to}
              active={item.to === "/dashboard" ? location.pathname === "/dashboard" : location.pathname.startsWith(item.to)}
              icon={item.icon}
            >
              {item.label}
            </NavTab>
          ))}
        </nav>

        {/* Desktop user */}
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <NotificationBell />
          <div className="h-[34px] w-[34px] rounded-full bg-gradient-to-br from-primary to-rose-medium flex items-center justify-center text-primary-foreground text-sm font-bold">
            {user?.email?.charAt(0).toUpperCase()}
          </div>
          <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Déconnexion
          </button>
        </div>

        {/* Mobile burger + bell */}
        <div className="lg:hidden flex items-center gap-1">
          <NotificationBell />
          <button
            className="p-2 text-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-card animate-fade-in">
          <nav className="flex flex-col p-3 gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                  (item.to === "/dashboard" ? location.pathname === "/dashboard" : location.pathname.startsWith(item.to))
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            <span className="my-1 h-px bg-border" />
            <button
              onClick={() => { signOut(); setMobileOpen(false); }}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-all"
            >
              Déconnexion
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}

function NavTab({ to, active, icon: Icon, children }: { to: string; active: boolean; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-semibold transition-all duration-[250ms] whitespace-nowrap ${
        active
          ? "bg-card text-bordeaux shadow-[0_2px_8px_rgba(145,1,75,0.1)]"
          : "text-muted-foreground hover:bg-secondary"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </Link>
  );
}
