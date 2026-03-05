import { useState, useRef, useCallback, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home, PenLine, CalendarDays, MessageCircle, Palette, ClipboardList, Instagram, Briefcase, Globe, Search, Pin, Users, BarChart3, Brain, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserPlan } from "@/hooks/use-user-plan";

interface NavItem {
  label: string;
  path: string;
  icon?: React.ReactNode;
  children?: { label: string; path: string }[];
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "CRÉER",
    items: [
      { label: "Nouveau contenu", path: "/creer", icon: <PenLine size={16} /> },
      { label: "Calendrier", path: "/calendrier", icon: <CalendarDays size={16} /> },
      { label: "Routine engagement", path: "/instagram/routine", icon: <MessageCircle size={16} /> },
    ],
  },
  {
    label: "MA MARQUE",
    items: [
      { label: "Branding", path: "/branding", icon: <Palette size={16} /> },
      { label: "Mes offres", path: "/branding/offres", icon: <ClipboardList size={16} /> },
    ],
  },
  {
    label: "MES ESPACES",
    items: [
      {
        label: "Instagram", path: "/instagram", icon: <Instagram size={16} />,
        children: [
          { label: "Profil", path: "/instagram/profil" },
          { label: "Audit", path: "/instagram/audit" },
          { label: "Stats", path: "/instagram/stats" },
          { label: "Bio", path: "/instagram/profil/bio" },
          { label: "Highlights", path: "/instagram/profil/stories" },
          { label: "Rythme", path: "/instagram/rythme" },
        ],
      },
      {
        label: "LinkedIn", path: "/linkedin", icon: <Briefcase size={16} />,
        children: [
          { label: "Profil", path: "/linkedin/profil" },
          { label: "Audit", path: "/linkedin/audit" },
          { label: "Posts", path: "/linkedin/post" },
          { label: "Engagement", path: "/linkedin/engagement" },
          { label: "Crosspost", path: "/linkedin/crosspost" },
        ],
      },
      {
        label: "Site web", path: "/site", icon: <Globe size={16} />,
        children: [
          { label: "Accueil", path: "/site/accueil" },
          { label: "À propos", path: "/site/a-propos" },
          { label: "Audit", path: "/site/audit" },
          { label: "Témoignages", path: "/site/temoignages" },
        ],
      },
      { label: "SEO", path: "/seo", icon: <Search size={16} /> },
      {
        label: "Pinterest", path: "/pinterest", icon: <Pin size={16} />,
        children: [
          { label: "Compte", path: "/pinterest/compte" },
          { label: "Épingles", path: "/pinterest/epingles" },
          { label: "Mots-clés", path: "/pinterest/mots-cles" },
          { label: "Tableaux", path: "/pinterest/tableaux" },
        ],
      },
    ],
  },
  {
    label: "OUTILS",
    items: [
      { label: "Contacts", path: "/contacts", icon: <Users size={16} /> },
      { label: "Mon plan", path: "/calendrier?tab=strategie", icon: <BarChart3 size={16} /> },
      { label: "Coach IA", path: "/dashboard/guide", icon: <Brain size={16} /> },
    ],
  },
];

export default function AppSidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const { plan } = useUserPlan();
  const planLabel = plan === "now_pilot" ? "Binôme · Illimité ✨" : plan === "outil" ? "Outil · 39€/mois" : "Gratuit";

  const [open, setOpen] = useState(false);
  const [openSubs, setOpenSubs] = useState<Record<string, boolean>>({});
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const startCloseTimer = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 350);
  }, [clearCloseTimer]);

  const handleMouseEnterTrigger = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const handleMouseLeaveTrigger = useCallback(() => {
    startCloseTimer();
  }, [startCloseTimer]);

  const handleMouseEnterPanel = useCallback(() => {
    clearCloseTimer();
  }, [clearCloseTimer]);

  const handleMouseLeavePanel = useCallback(() => {
    startCloseTimer();
  }, [startCloseTimer]);

  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  const isActive = (path: string) => {
    if (path.includes("?")) return location.pathname + location.search === path;
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const toggleSub = (key: string) => {
    setOpenSubs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const firstName = user?.user_metadata?.first_name || user?.user_metadata?.prenom || user?.email?.split("@")[0] || "Utilisateur";
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <>
      {/* Hover trigger zone — invisible 48px strip on left */}
      <div
        className="fixed top-0 left-0 h-full w-12 z-[300]"
        onMouseEnter={handleMouseEnterTrigger}
        onMouseLeave={handleMouseLeaveTrigger}
        style={{ pointerEvents: open ? "none" : "auto" }}
      >
        {/* Logo "N" button — always visible */}
        <div
          className="absolute top-[14px] left-[14px] w-8 h-8 rounded-[9px] bg-gradient-to-br from-bordeaux to-raspberry flex items-center justify-center cursor-pointer select-none"
          style={{ pointerEvents: "auto" }}
        >
          <span className="text-white font-bold text-sm leading-none">N</span>
        </div>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[299] bg-black/[0.08] backdrop-blur-[2px]"
          onMouseEnter={startCloseTimer}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <div
        ref={panelRef}
        className="fixed top-0 left-0 h-full w-[260px] z-[301] bg-card border-r border-border flex flex-col overflow-y-auto"
        style={{
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onMouseEnter={handleMouseEnterPanel}
        onMouseLeave={handleMouseLeavePanel}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border">
          <div className="w-8 h-8 rounded-[9px] bg-gradient-to-br from-bordeaux to-raspberry flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm leading-none">N</span>
          </div>
          <span className="font-display text-[15px] text-bordeaux">Nowadays</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 px-2 space-y-1">
          {/* Accueil */}
          <Link
            to="/dashboard"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-body transition-colors ${
              isActive("/dashboard") ? "bg-rose-pale text-primary font-semibold" : "text-foreground hover:bg-rose-pale"
            }`}
          >
            <Home size={16} />
            Accueil
          </Link>

          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="pt-3">
              <div className="font-mono-ui text-[9.5px] text-muted-foreground uppercase tracking-wider px-3 pb-1.5">
                {section.label}
              </div>
              {section.items.map((item) => (
                <div key={item.path}>
                  {item.children ? (
                    <>
                      <button
                        onClick={() => toggleSub(item.path)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-body transition-colors ${
                          isActive(item.path) ? "bg-rose-pale text-primary font-semibold" : "text-foreground hover:bg-rose-pale"
                        }`}
                      >
                        {item.icon}
                        <span className="flex-1 text-left">{item.label}</span>
                        <ChevronRight
                          size={14}
                          className="text-muted-foreground transition-transform duration-200"
                          style={{ transform: openSubs[item.path] ? "rotate(90deg)" : "rotate(0deg)" }}
                        />
                      </button>
                      {openSubs[item.path] && (
                        <div className="ml-[34px] space-y-0.5 py-0.5">
                          {item.children.map((child) => (
                            <Link
                              key={child.path}
                              to={child.path}
                              className={`block px-2.5 py-1.5 rounded-md text-[12.5px] transition-colors ${
                                isActive(child.path) ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      to={item.path}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-body transition-colors ${
                        isActive(item.path) ? "bg-rose-pale text-primary font-semibold" : "text-foreground hover:bg-rose-pale"
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-border px-2 py-2">
          <Link
            to="/parametres"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-body transition-colors ${
              isActive("/parametres") ? "bg-rose-pale text-primary font-semibold" : "text-foreground hover:bg-rose-pale"
            }`}
          >
            <Settings size={16} />
            Paramètres
          </Link>
        </div>

        <div className="border-t border-border px-4 py-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-bordeaux to-raspberry flex items-center justify-center text-white font-semibold text-sm shrink-0">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-foreground truncate">{firstName}</div>
            <div className="text-[11px] text-muted-foreground truncate">{planLabel || "Plan gratuit"}</div>
          </div>
        </div>
      </div>
    </>
  );
}
