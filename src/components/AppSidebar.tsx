import BrandLogo from "@/components/BrandLogo";
import { useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Check, Home, PenLine, CalendarDays, Palette, ClipboardList, Instagram, Briefcase, Globe, Search, Pin, Users, Brain, Settings, Film, GraduationCap, Wrench, CreditCard, HeartHandshake, LogOut,  Plus, Trash2, Image, BarChart3, IdCard,  Sparkles, Lightbulb } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isRouteVisible } from "@/config/feature-flags";
import { useUserPlan } from "@/hooks/use-user-plan";
import { usePendingBrandReview } from "@/hooks/use-pending-brand-review";
import { useDemoContext } from "@/contexts/DemoContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAccountSwitcher } from "@/hooks/use-account-switcher";
import { useMobileNav } from "@/contexts/MobileNavContext";
import { useSession } from "@/contexts/SessionContext";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import AiCreditsCounter from "@/components/AiCreditsCounter";
import NotificationBell from "@/components/NotificationBell";
import { WorkspaceSwitcher } from "@/components/AppHeader";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

interface NavItem {
  label: string;
  path: string;
  icon?: React.ReactNode;
  description?: string;
}

// Les destinations métier restent à plat, regroupées par intention. Les flags
// des hubs sont conservés ; ils ne modifient pas les canaux du créateur.
const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Mon travail",
    items: [
      { label: "Mes idées", path: "/idees", description: "Idées et contenus enregistrés", icon: <Lightbulb size={18} /> },
      { label: "Mes photos", path: "/photos", description: "Bibliothèque et retouches", icon: <Image size={18} /> },
      { label: "Mes statistiques", path: "/instagram/stats", description: "Comprendre ce qui fonctionne", icon: <BarChart3 size={18} /> },
      { label: "Mon identité", path: "/branding", description: "Mon activité, ma voix et mon style", icon: <Palette size={18} /> },
      { label: "Mes offres", path: "/branding/offres", description: "Produits et services", icon: <ClipboardList size={18} /> },
    ],
  },
  {
    label: "Ma présence en ligne",
    items: [
      { label: "Instagram", path: "/instagram", description: "Profil, stratégie et engagement", icon: <Instagram size={18} /> },
      { label: "LinkedIn", path: "/linkedin", description: "Profil et stratégie", icon: <Briefcase size={18} /> },
      { label: "Pinterest", path: "/pinterest", description: "Profil, tableaux et visibilité", icon: <Pin size={18} /> },
      { label: "Améliorer mon site", path: "/site", description: "Textes et audit de mon site", icon: <Globe size={18} /> },
      { label: "SEO", path: "/seo", description: "Outil dédié au référencement", icon: <Search size={18} /> },
    ],
  },
];

// Créer ouvre l’accueil ; la création explicite reste dans son moteur,
// qui arbitre le brouillon existant avant tout nouveau départ.
const MOBILE_NAV = [
  { to: "/dashboard", label: "Créer", icon: Sparkles, matchExact: true },
  { to: "/calendrier", label: "Calendrier", icon: CalendarDays, matchExact: false },
];

export default function AppSidebar() {
  const location = useLocation();
  const { user, isAdmin, signOut } = useAuth();
  const { plan, usage, bonusCredits, loading: planLoading } = useUserPlan();
  const { activateDemo } = useDemoContext();
  const navigate = useNavigate();
  const isBinome = plan === "binome";

  const { pending: brandReviewPending } = usePendingBrandReview();
  const { isActive: sessionActive } = useSession();
  const { open, setOpen } = useMobileNav();
  // Modules désactivés (feature-flags) : mêmes règles que ProtectedRoute, sinon la
  // sidebar affiche des liens morts (clic → redirection dashboard) aux non-admins.
  const visibleSections = NAV_SECTIONS
    .map((section) => ({ ...section, items: section.items.filter((i) => isRouteVisible(i.path, isAdmin)) }))
    .filter((section) => section.items.length > 0);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  // Tous les chemins de navigation, pour la règle "le plus précis l'emporte".
  const navPaths = visibleSections
    .flatMap((s) => s.items)
    .map((i) => i.path)
    .filter((p) => !p.includes("?"));

  const isActive = (path: string) => {
    if (path.includes("?")) return location.pathname + location.search === path;
    if (path === "/dashboard") return location.pathname === "/dashboard";
    const matches = location.pathname === path || location.pathname.startsWith(path + "/");
    if (!matches) return false;
    // "Le chemin le plus précis l'emporte" : sur /instagram/stats, l'entrée
    // "Mes statistiques" (/instagram/stats) doit gagner sur "Instagram"
    // (/instagram), sinon les deux s'allument. On désactive donc un item si un
    // AUTRE item du menu est un préfixe plus long qui matche aussi.
    const moreSpecific = navPaths.some(
      (p) => p !== path && p.length > path.length && (location.pathname === p || location.pathname.startsWith(p + "/")),
    );
    return !moreSpecific;
  };

  const quickNav = MOBILE_NAV;
  const isQuickNavActive = (item: { to: string; matchExact: boolean }) => {
    const base = item.to.split("?")[0];
    return item.matchExact ? location.pathname === base : location.pathname.startsWith(base);
  };

  const firstName = user?.user_metadata?.first_name || user?.user_metadata?.prenom || user?.email?.split("@")[0] || "Utilisateur";
  const initial = firstName.charAt(0).toUpperCase();

  const { activeWorkspace, workspaces, isMultiWorkspace, switchWorkspace, switchingWorkspaceId } = useWorkspace();
  const { savedAccounts, switchToAccount, removeAccount } = useAccountSwitcher();
  const [wsPopoverOpen, setWsPopoverOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  return (
    <>
      {!sessionActive && (
        <header className="sticky top-0 z-40 hidden lg:block border-b border-border bg-card">
          <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-4 px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link to="/dashboard" aria-label="Accueil"><BrandLogo className="h-8" /></Link>
              {isMultiWorkspace && <WorkspaceSwitcher activeWorkspace={activeWorkspace} workspaces={workspaces} switchWorkspace={switchWorkspace} switchingWorkspaceId={switchingWorkspaceId} navigate={navigate} />}
            </div>
            <nav aria-label="Navigation principale" className="flex shrink-0 items-center gap-2">
              {quickNav.map(item => (
                <Link key={item.to} to={item.to} aria-current={isQuickNavActive(item) || (item.to === "/dashboard" && location.pathname.startsWith("/creer")) ? "page" : undefined}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${isQuickNavActive(item) || (item.to === "/dashboard" && location.pathname.startsWith("/creer")) ? "bg-[hsl(var(--bento-dark))] text-white" : "text-bordeaux hover:bg-rose-pale"}`}>
                  {item.label}
                </Link>
              ))}
              <button ref={menuTrigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-bordeaux hover:bg-rose-pale">
                Mon espace <ChevronDown size={16} />
              </button>
            </nav>
            <div className="flex shrink-0 items-center gap-2">
              {planLoading ? <span role="status" className="text-xs text-muted-foreground">Crédits…</span> : <AiCreditsCounter plan={plan} usage={usage} bonusCredits={bonusCredits} />}
              <NotificationBell />
              <button type="button" aria-label="Mon compte" onClick={() => { setOpen(true); setWsPopoverOpen(true); }} className="h-9 w-9 shrink-0 rounded-full border border-border bg-rose-pale text-sm font-semibold text-bordeaux">{initial}</button>
            </div>
          </div>
        </header>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" aria-describedby={undefined} className="flex w-[min(390px,100vw)] flex-col overflow-y-auto p-0 gap-0 lg:top-[88px] lg:bottom-auto lg:right-6 lg:h-auto lg:max-h-[calc(100dvh-112px)] lg:w-[660px] lg:max-w-[660px] lg:rounded-2xl lg:border xl:right-[max(24px,calc((100vw-1152px)/2))]"
          onOpenAutoFocus={() => { previousFocus.current = document.activeElement as HTMLElement; }}
          onCloseAutoFocus={(event) => {
            // Plusieurs déclencheurs (en-tête, mobile) partagent le tiroir.
            // Revenir à celui utilisé, tant qu’il est encore dans la page.
            if (previousFocus.current?.isConnected) { event.preventDefault(); previousFocus.current.focus(); }
          }}>
          <div className="border-b border-border px-5 py-5">
            <SheetTitle className="font-display text-2xl text-bordeaux">Mon espace</SheetTitle>
          </div>

        <nav aria-label="Outils de mon espace" className="px-4 pb-3 sm:px-5">
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-border py-3 text-sm text-bordeaux">
            <Link to="/dashboard" onClick={() => setOpen(false)} className="inline-flex items-center gap-2 py-1 hover:underline"><Home size={16} />Accueil</Link>
            <Link to="/calendrier" onClick={() => setOpen(false)} className="inline-flex items-center gap-2 py-1 hover:underline"><CalendarDays size={16} />Calendrier</Link>
            <Link to={brandReviewPending ? "/branding?from=onboarding&next=creer" : "/creer?new=1"} onClick={() => setOpen(false)} className="inline-flex items-center gap-2 py-1 font-semibold hover:underline">
              {brandReviewPending ? <IdCard size={16} /> : <PenLine size={16} />}{brandReviewPending ? "Valider ma fiche" : "Créer un contenu"}
            </Link>
          </div>
          <div className="grid gap-4 py-4 lg:grid-cols-2 lg:gap-6">
            {visibleSections.map((section) => (
              <section key={section.label} aria-label={section.label}>
                <h2 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</h2>
                {section.items.map((item) => (
                  <Link key={item.path} to={item.path} aria-label={item.label} aria-current={isActive(item.path) ? "page" : undefined} onClick={() => setOpen(false)}
                    className={`flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors ${isActive(item.path) ? "bg-rose-pale text-bordeaux" : "text-foreground hover:bg-rose-pale"}`}>
                    <span className="mt-0.5 shrink-0 text-bordeaux" aria-hidden="true">{item.icon}</span>
                    <span className="min-w-0"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{item.description}</span></span>
                  </Link>
                ))}
              </section>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-3 text-sm text-muted-foreground">
            <Link to="/dashboard/guide" onClick={() => setOpen(false)} className="inline-flex items-center gap-2 py-1 hover:text-bordeaux"><Brain size={16} />Coach IA</Link>
            <Link to="/contacts" onClick={() => setOpen(false)} className="inline-flex items-center gap-2 py-1 hover:text-bordeaux"><Users size={16} />Contacts</Link>
          </div>

          {isAdmin && (
            <details className="mt-3 border-t border-border pt-3">
              <summary className="cursor-pointer text-sm text-muted-foreground">Administration</summary>
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
            </details>
          )}
        </nav>

        {/* Footer */}
        <div className="flex flex-wrap gap-x-2 border-t border-border px-4 py-2">
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

        <Popover open={wsPopoverOpen} onOpenChange={setWsPopoverOpen}>
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
          <PopoverContent side="top" align="start" className="w-72 max-h-[min(480px,70dvh)] overflow-y-auto p-1.5 z-50">
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
                      disabled={switchingWorkspaceId !== null}
                      aria-busy={switchingWorkspaceId === ws.id}
                      onClick={async () => {
                        const ok = await switchWorkspace(ws.id);
                        if (!ok) return;
                        setWsPopoverOpen(false);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors ${
                        ws.id === activeWorkspace?.id ? "bg-muted" : "hover:bg-muted/50"
                      } disabled:cursor-wait disabled:opacity-60`}
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
        </SheetContent>
      </Sheet>

      {/* Mobile bottom tab bar (<md only) — accès rapide, en plus du tiroir
          ci-dessus qui reste la seule porte vers tout le reste. Masquée
          pendant une session guidée (SessionOverlay prend déjà toute la
          largeur du haut), comme c'était le cas quand cette barre vivait
          dans AppHeader. */}
      {!sessionActive && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card shadow-[0_-2px_10px_rgba(0,0,0,0.05)] md:hidden">
          <div className="flex items-center justify-around min-h-14 pb-[env(safe-area-inset-bottom)]">
            {quickNav.map((item) => {
              const active = isQuickNavActive(item) || (item.to === "/dashboard" && location.pathname.startsWith("/creer"));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-1 px-2 text-2xs font-semibold transition-colors ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
                  {item.label}
                </Link>
              );
            })}
            <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-1 px-2 text-2xs font-semibold text-muted-foreground">
              <Users className="h-5 w-5" />Mon espace
            </button>
          </div>
        </nav>
      )}

    </>
  );
}
