import { useState, useRef, useCallback, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, ChevronDown, Check, Home, PenLine, CalendarDays, Palette, ClipboardList, Instagram, Briefcase, Globe, Search, Pin, Users, Brain, Settings, Film, GraduationCap, Wrench, CreditCard, HeartHandshake, LogOut, Menu, X, Plus, Trash2, Image } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isRouteVisible } from "@/config/feature-flags";
import { useUserPlan } from "@/hooks/use-user-plan";
import { useDemoContext } from "@/contexts/DemoContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAccountSwitcher } from "@/hooks/use-account-switcher";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { loadFlowState, loadPhotos } from "@/hooks/use-flow-persistence";
import { toast } from "sonner";

interface NavItem {
  label: string;
  path: string;
  icon?: React.ReactNode;
  children?: { label: string; path: string }[];
  freshStart?: boolean;
}

// Navigation à plat : une entrée = une destination. Le calendrier regroupe ses
// onglets (Calendrier · Idées · Stratégie) dans un seul écran ; chaque réseau
// ouvre son hub, qui sert de carte du réseau (pas de sous-liste dans le menu).
const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "CRÉER ET PLANIFIER",
    items: [
      { label: "Créer un contenu", path: "/creer", icon: <PenLine size={16} />, freshStart: true },
      { label: "Mon calendrier", path: "/calendrier", icon: <CalendarDays size={16} /> },
    ],
  },
  {
    label: "MA MARQUE",
    items: [
      { label: "Mon identité", path: "/branding", icon: <Palette size={16} /> },
      { label: "Mes offres", path: "/branding/offres", icon: <ClipboardList size={16} /> },
    ],
  },
  {
    label: "MES RÉSEAUX",
    items: [
      { label: "Instagram", path: "/instagram", icon: <Instagram size={16} /> },
      { label: "LinkedIn", path: "/linkedin", icon: <Briefcase size={16} /> },
      { label: "Pinterest", path: "/pinterest", icon: <Pin size={16} /> },
      { label: "Site web", path: "/site", icon: <Globe size={16} /> },
      { label: "SEO", path: "/seo", icon: <Search size={16} /> },
    ],
  },
  {
    label: "RESSOURCES",
    items: [
      { label: "Photos", path: "/photos", icon: <Image size={16} /> },
      { label: "Contacts", path: "/contacts", icon: <Users size={16} /> },
      { label: "Coach IA", path: "/dashboard/guide", icon: <Brain size={16} /> },
    ],
  },
];

export default function AppSidebar() {
  const location = useLocation();
  const { user, isAdmin, signOut } = useAuth();
  const { plan } = useUserPlan();
  const { activateDemo } = useDemoContext();
  const navigate = useNavigate();
  const planLabel = plan === "binome" ? "Binôme ✨" : plan === "outil" ? "Outil · 39€/mois" : "Gratuit";
  const isBinome = plan === "binome";

  const [open, setOpen] = useState(false);
  const [openSubs, setOpenSubs] = useState<Record<string, boolean>>({});
  // Modules désactivés (feature-flags) : mêmes règles que ProtectedRoute, sinon la
  // sidebar affiche des liens morts (clic → redirection dashboard) aux non-admins.
  const visibleSections = NAV_SECTIONS
    .map((section) => ({ ...section, items: section.items.filter((i) => isRouteVisible(i.path, isAdmin)) }))
    .filter((section) => section.items.length > 0);
  // Garde anti-perte : "Nouveau contenu" (fresh start) efface le flux + les
  // photos en cours. Si un travail est en cours, on confirme avant de vider.
  const [freshStartTarget, setFreshStartTarget] = useState<string | null>(null);
  const freshStartPhotoCount = useRef(0);
  const handleFreshStartNav = useCallback(
    (e: React.MouseEvent, targetPath: string) => {
      const fs = loadFlowState();
      const photos = loadPhotos();
      const hasWork = (!!fs && !!fs.step && fs.step !== "idea") || photos.length > 0;
      if (hasWork) {
        e.preventDefault();
        freshStartPhotoCount.current = photos.length;
        setFreshStartTarget(targetPath);
        return;
      }
      setOpen(false);
    },
    [],
  );
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsPopoverRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const startCloseTimer = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      if (!wsPopoverRef.current) setOpen(false);
    }, 350);
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

  const { activeWorkspace, workspaces, isMultiWorkspace, switchWorkspace } = useWorkspace();
  const { savedAccounts, switchToAccount, removeAccount } = useAccountSwitcher();
  const [wsPopoverOpen, setWsPopoverOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  return (
    <>
      {/* Desktop: Hover trigger zone — invisible 48px strip on left */}
      <div
        className="fixed top-0 left-0 h-full w-12 z-[300] hidden lg:flex lg:flex-col lg:items-center"
        onMouseEnter={handleMouseEnterTrigger}
        onMouseLeave={handleMouseLeaveTrigger}
        style={{ pointerEvents: open ? "none" : "auto" }}
      >
        {/* Logo "N" button with menu hint — always visible on desktop */}
        <Tooltip delayDuration={800}>
          <TooltipTrigger asChild>
            <div
              className="absolute top-[14px] left-[14px] flex items-center gap-1 cursor-pointer select-none group"
              style={{ pointerEvents: "auto" }}
            >
              <div className="w-8 h-8 rounded-[9px] bg-bordeaux flex items-center justify-center shadow-none transition-transform duration-200 group-hover:scale-105">
                <span className="text-white font-bold text-sm leading-none">N</span>
              </div>
              <ChevronRight
                size={12}
                className="text-muted-foreground opacity-40 group-hover:opacity-80 transition-all duration-200"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            Menu
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Mobile: Hamburger button — visible only below lg when menu is closed */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed top-[14px] left-[14px] z-[300] flex lg:hidden items-center justify-center w-9 h-9 rounded-[9px] bg-bordeaux cursor-pointer"
          aria-label="Ouvrir le menu"
        >
          <Menu size={18} className="text-white" />
        </button>
      )}

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
        className={`fixed top-0 left-0 h-full w-[260px] z-[301] bg-card border-r border-border flex-col overflow-y-auto ${
          open ? "flex" : "hidden lg:flex"
        }`}
        style={{
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onMouseEnter={handleMouseEnterPanel}
        onMouseLeave={handleMouseLeavePanel}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[9px] bg-bordeaux flex items-center justify-center shrink-0 shadow-none">
              <span className="text-white font-bold text-sm leading-none">N</span>
            </div>
            <span className="font-display text-base text-bordeaux">Nowadays</span>
          </div>
          {/* Close button — visible on mobile */}
          <button
            onClick={() => setOpen(false)}
            className="flex lg:hidden items-center justify-center w-7 h-7 rounded-md hover:bg-rose-pale transition-colors"
            aria-label="Fermer le menu"
          >
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 px-2 space-y-1">
          {/* Accueil */}
          <Link
            to="/dashboard"
            onClick={() => setOpen(false)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors ${
              isActive("/dashboard") ? "bg-rose-pale text-primary font-semibold" : "text-foreground hover:bg-rose-pale"
            }`}
          >
            <Home size={16} />
            Accueil
          </Link>

          {visibleSections.map((section) => (
            <div key={section.label} className="pt-3">
              <div className="font-mono-ui text-2xs text-muted-foreground uppercase tracking-wider px-3 pb-1.5">
                {section.label}
              </div>
              {section.items.map((item) => (
                <div key={item.path}>
                  {item.children ? (
                    <>
                      <button
                        onClick={() => toggleSub(item.path)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors ${
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
                              onClick={() => setOpen(false)}
                              className={`block px-2.5 py-1.5 rounded-md text-sm transition-colors ${
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
                      to={item.path + (item.freshStart ? "?new=1" : "")}
                      onClick={(e) =>
                        item.freshStart
                          ? handleFreshStartNav(e, item.path + "?new=1")
                          : setOpen(false)
                      }
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors ${
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

          {isAdmin && (
            <div className="pt-3">
              <div className="font-mono-ui text-2xs text-muted-foreground uppercase tracking-wider px-3 pb-1.5">
                ADMIN
              </div>
              <button
                onClick={() => { activateDemo(); navigate("/dashboard"); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body text-foreground hover:bg-rose-pale transition-colors text-left"
              >
                <Film size={16} />
                🎬 Mode démo
              </button>
              <Link to="/admin/coaching" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body text-foreground hover:bg-rose-pale transition-colors">
                <GraduationCap size={16} />
                🎓 Mes client·es
              </Link>
              <Link to="/admin/audit" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body text-foreground hover:bg-rose-pale transition-colors">
                <Wrench size={16} />
                🔧 Audit app
              </Link>
              <Link to="/admin/tools" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body text-foreground hover:bg-rose-pale transition-colors">
                <Wrench size={16} />
                🛠️ Outils admin
              </Link>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-border px-2 py-2 space-y-0.5">
          <Link
            to="/parametres"
            onClick={() => setOpen(false)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors ${
              isActive("/parametres") ? "bg-rose-pale text-primary font-semibold" : "text-foreground hover:bg-rose-pale"
            }`}
          >
            <Settings size={16} />
            Paramètres
          </Link>
          {isBinome && (
            <Link to="/accompagnement" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body text-foreground hover:bg-rose-pale transition-colors">
              <HeartHandshake size={16} />
              Mon accompagnement
            </Link>
          )}
          <Link to="/abonnement" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body text-foreground hover:bg-rose-pale transition-colors">
            <CreditCard size={16} />
            Mon abonnement
          </Link>
        </div>

        <Popover open={wsPopoverOpen} onOpenChange={(v) => { setWsPopoverOpen(v); wsPopoverRef.current = v; }}>
          <PopoverTrigger asChild>
            <button className="w-full border-t border-border px-4 py-3 flex items-center gap-2.5 hover:bg-muted/50 transition-colors cursor-pointer text-left">
              <div className="w-8 h-8 rounded-lg bg-bordeaux flex items-center justify-center text-white font-semibold text-sm shrink-0">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground truncate">{firstName}</div>
                <div className="text-2xs text-muted-foreground truncate">{user?.email}</div>
              </div>
              <ChevronDown size={14} className="text-muted-foreground shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-72 p-1.5 z-[400]">
            {/* Current account */}
            <div className="text-2xs font-medium text-muted-foreground px-2 py-1.5 uppercase tracking-wider">Compte actif</div>
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-md bg-muted">
              <div className="w-7 h-7 rounded-md bg-bordeaux flex items-center justify-center text-white font-semibold text-xs shrink-0">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground truncate">{firstName}</div>
                <div className="text-2xs text-muted-foreground truncate">{user?.email}</div>
              </div>
              <Check size={14} className="text-primary shrink-0" />
            </div>

            {/* Other saved accounts */}
            {savedAccounts.filter(a => a.userId !== user?.id).length > 0 && (
              <>
                <div className="text-2xs font-medium text-muted-foreground px-2 py-1.5 mt-1 uppercase tracking-wider">Autres comptes</div>
                {savedAccounts.filter(a => a.userId !== user?.id).map((account) => (
                  <div key={account.userId} className="flex items-center gap-1">
                    <button
                      disabled={switching}
                      onClick={async () => {
                        setSwitching(true);
                        try {
                          await switchToAccount(account);
                        } catch (e: any) {
                          toast.error(e.message || "Impossible de basculer sur ce compte");
                          setSwitching(false);
                        }
                      }}
                      className="flex-1 flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
                    >
                      <div className="w-7 h-7 rounded-md bg-bordeaux/60 flex items-center justify-center text-white font-semibold text-xs shrink-0">
                        {account.firstName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground truncate">{account.firstName}</div>
                        <div className="text-2xs text-muted-foreground truncate">{account.email}</div>
                      </div>
                    </button>
                    <button
                      onClick={() => removeAccount(account.userId)}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      title="Retirer ce compte"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </>
            )}

            {/* Workspace switcher if multi-workspace */}
            {isMultiWorkspace && (
              <>
                <div className="border-t border-border mt-1.5 pt-1.5">
                  <div className="text-2xs font-medium text-muted-foreground px-2 py-1.5 uppercase tracking-wider">Mes espaces</div>
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={async () => { await switchWorkspace(ws.id); setWsPopoverOpen(false); setOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors ${
                        ws.id === activeWorkspace?.id ? "bg-muted" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-accent-foreground font-semibold text-xs shrink-0">
                        {ws.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground truncate">{ws.name}</div>
                      </div>
                      {ws.id === activeWorkspace?.id && <Check size={14} className="text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Add account + Sign out */}
            <div className="border-t border-border mt-1.5 pt-1.5 space-y-0.5">
              <button
                onClick={() => {
                  setWsPopoverOpen(false);
                  setOpen(false);
                  navigate("/login?add_account=true");
                }}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                <Plus size={14} className="shrink-0" />
                Ajouter un compte
              </button>
              <button
                onClick={() => signOut()}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut size={14} className="shrink-0" />
                Déconnexion
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <AlertDialog
        open={freshStartTarget !== null}
        onOpenChange={(o) => { if (!o) setFreshStartTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Repartir de zéro ?</AlertDialogTitle>
            <AlertDialogDescription>
              {freshStartPhotoCount.current > 0 ? (
                <>
                  Tu as un contenu en cours avec{" "}
                  <strong>
                    {freshStartPhotoCount.current} photo
                    {freshStartPhotoCount.current > 1 ? "s" : ""}
                  </strong>
                  . « Nouveau contenu » efface le travail en cours et retire les
                  photos. Cette action est irréversible.
                </>
              ) : (
                <>
                  Tu as un contenu en cours. « Nouveau contenu » efface le
                  travail en cours et repart d'une page blanche. Cette action est
                  irréversible.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel
              onClick={() => {
                // "Garder mon contenu" : revenir au flux en cours (sans ?new=1,
                // donc sans effacer), pour le reprendre là où il en était.
                const resumePath = freshStartTarget?.split("?")[0] || "/creer";
                setFreshStartTarget(null);
                setOpen(false);
                navigate(resumePath);
              }}
            >
              Garder mon contenu
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = freshStartTarget || "/creer?new=1";
                setFreshStartTarget(null);
                setOpen(false);
                navigate(target);
              }}
            >
              Repartir de zéro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
