import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "react-router-dom";
import { Home, Instagram, Lightbulb, CalendarDays, ClipboardList, User, Search, ExternalLink, Menu, X } from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Tableau de bord", icon: Home },
  { to: "/instagram", label: "Instagram", icon: Instagram },
  { to: "/atelier", label: "Atelier d'idées", icon: Lightbulb },
  { to: "/calendrier", label: "Calendrier", icon: CalendarDays },
  { to: "/plan", label: "Mon plan", icon: ClipboardList },
  { to: "/profil", label: "Profil", icon: User },
];

export default function AppHeader() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link to="/dashboard" className="font-display text-xl font-bold text-bordeaux shrink-0">
          L'Assistant Com'
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1 rounded-pill bg-rose-pale p-1">
          {NAV_ITEMS.map((item) => (
            <NavTab key={item.to} to={item.to} active={location.pathname.startsWith(item.to)} icon={item.icon}>
              {item.label}
            </NavTab>
          ))}
          {/* SEO external link — visually separated */}
          <span className="mx-1 h-6 w-px bg-border" />
          <a
            href="https://referencement-seo.lovable.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-pill px-3 py-1.5 text-sm font-medium text-foreground hover:bg-secondary transition-all"
          >
            <Search className="h-3.5 w-3.5" />
            SEO
            <ExternalLink className="h-3 w-3 opacity-50" />
          </a>
        </nav>

        {/* Desktop user */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            {user?.email?.charAt(0).toUpperCase()}
          </div>
          <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Déconnexion
          </button>
        </div>

        {/* Mobile burger */}
        <button
          className="lg:hidden p-2 text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
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
                  location.pathname.startsWith(item.to)
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            <span className="my-1 h-px bg-border" />
            <a
              href="https://referencement-seo.lovable.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary transition-all"
            >
              <Search className="h-4 w-4" />
              SEO
              <ExternalLink className="h-3 w-3 opacity-50 ml-auto" />
            </a>
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
      className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-medium transition-all whitespace-nowrap ${
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-foreground hover:bg-secondary"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </Link>
  );
}
