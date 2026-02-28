import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, ClipboardList, Sparkles, CalendarDays, Users, User, Palette, CreditCard, Settings, HelpCircle, LogOut, Film, GraduationCap, Handshake, HeartHandshake, Search, ChevronDown, Check, Plus, Compass, MessageCircle, LayoutGrid, Wrench } from "lucide-react";

import { useDemoContext } from "@/contexts/DemoContext";
import { toast } from "sonner";
import { useUserPlan } from "@/hooks/use-user-plan";
import { useUserPhase, incrementFullToolsClicks } from "@/hooks/use-user-phase";
import { Progress } from "@/components/ui/progress";
import NotificationBell from "@/components/NotificationBell";
import AiCreditsCounter from "@/components/AiCreditsCounter";
import { useSession } from "@/contexts/SessionContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ─── Phase-aware nav items ─── */

const NAV_CONSTRUCTION = [
  { to: "/dashboard", label: "Mon Assistant", icon: MessageCircle, matchExact: true, matchPaths: ["/dashboard", "/dashboard/guide"] },
  { to: "/branding", label: "Ma marque", icon: Palette, matchExact: false },
  { to: "/creer", label: "Créer", icon: Sparkles, matchExact: false },
];

const NAV_ACTION = [
  { to: "/dashboard", label: "Mon Assistant", icon: MessageCircle, matchExact: true, matchPaths: ["/dashboard", "/dashboard/guide"] },
  { to: "/creer", label: "Créer", icon: Sparkles, matchExact: false },
  { to: "/calendrier", label: "Calendrier", icon: CalendarDays, matchExact: false },
  { to: "/branding", label: "Ma marque", icon: Palette, matchExact: false },
];

const NAV_PILOTAGE = [
  { to: "/dashboard", label: "Mon Assistant", icon: MessageCircle, matchExact: true, matchPaths: ["/dashboard", "/dashboard/guide"] },
  { to: "/creer", label: "Créer", icon: Sparkles, matchExact: false },
  { to: "/calendrier", label: "Calendrier", icon: CalendarDays, matchExact: false },
  { to: "/branding", label: "Ma marque", icon: Palette, matchExact: false },
  { to: "/mon-plan", label: "Mon plan", icon: ClipboardList, matchExact: false },
];

const ACCOMPAGNEMENT_ITEM = { to: "/accompagnement", label: "Accompagnement", icon: HeartHandshake, matchExact: false };

function getPhaseDesktopNav(phase: string, isPilot: boolean) {
  let items;
  if (phase === "construction") items = [...NAV_CONSTRUCTION];
  else if (phase === "action") items = [...NAV_ACTION];
  else items = [...NAV_PILOTAGE];
  if (isPilot) items.push(ACCOMPAGNEMENT_ITEM);
  return items;
}

const MOBILE_CONSTRUCTION = [
  { to: "/dashboard", label: "Assistant", icon: MessageCircle, matchExact: true, matchPaths: ["/dashboard", "/dashboard/guide"] },
  { to: "/branding", label: "Ma marque", icon: Palette, matchExact: false },
  { to: "/creer", label: "Créer", icon: Sparkles, matchExact: false },
];

const MOBILE_ACTION = [
  { to: "/dashboard", label: "Assistant", icon: MessageCircle, matchExact: true, matchPaths: ["/dashboard", "/dashboard/guide"] },
  { to: "/creer", label: "Créer", icon: Sparkles, matchExact: false },
  { to: "/calendrier", label: "Calendrier", icon: CalendarDays, matchExact: false },
  { to: "/branding", label: "Marque", icon: Palette, matchExact: false },
];

const MOBILE_PILOTAGE = [
  { to: "/dashboard", label: "Assistant", icon: MessageCircle, matchExact: true, matchPaths: ["/dashboard", "/dashboard/guide"] },
  { to: "/creer", label: "Créer", icon: Sparkles, matchExact: false },
  { to: "/calendrier", label: "Calendrier", icon: CalendarDays, matchExact: false },
  { to: "/branding", label: "Marque", icon: Palette, matchExact: false },
  { to: "/mon-plan", label: "Mon plan", icon: ClipboardList, matchExact: false },
];

function getPhaseMobileNav(phase: string, isPilot: boolean) {
  let items;
  if (phase === "construction") items = [...MOBILE_CONSTRUCTION];
  else if (phase === "action") items = [...MOBILE_ACTION];
  else items = [...MOBILE_PILOTAGE];
  if (isPilot) items.push({ to: "/accompagnement", label: "Accom.", icon: HeartHandshake, matchExact: false });
  return items;
}

export default function AppHeader() {
  const { isActive: sessionActive } = useSession();
  if (sessionActive) return null;
  return <AppHeaderInner />;
}

function AppHeaderInner() {
  const { activeWorkspace, workspaces, isMultiWorkspace, switchWorkspace, activeRole } = useWorkspace();
  const { user, signOut, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { plan, usage, isPilot, isPaid } = useUserPlan();
  const { phase, isLoading: phaseLoading } = useUserPhase();
  const { activateDemo } = useDemoContext();
  const handleDemoClick = () => { activateDemo(); navigate("/onboarding"); };
  const [hasCoaching, setHasCoaching] = useState(false);
  const [coachingMonth, setCoachingMonth] = useState<number | null>(null);
  const [coachingPhase, setCoachingPhase] = useState<string | null>(null);

  const handleAllToolsClick = useCallback(() => {
    const clicks = incrementFullToolsClicks();
    if (clicks === 1) {
      toast("Tu trouveras ici tous les outils avancés de l'Assistant Com'.", { duration: 4000 });
    }
    navigate("/dashboard/complet?from=guide");
  }, [navigate]);

  // Check if user has an active coaching program
  useEffect(() => {
    if (!user) return;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      (supabase.from("coaching_programs" as any) as any)
        .select("id, current_month, current_phase")
        .eq("client_user_id", user.id)
        .eq("status", "active")
        .maybeSingle()
        .then(({ data }: any) => {
          if (data) {
            setHasCoaching(true);
            setCoachingMonth(data.current_month);
            setCoachingPhase(data.current_phase);
          }
        });
    });
  }, [user?.id]);

  // Use "construction" as default during loading (fewer items = less confusion)
  const effectivePhase = phaseLoading ? "construction" : phase;
  const showAllToolsLink = effectivePhase !== "pilotage";

  const desktopNav = getPhaseDesktopNav(effectivePhase, isPilot);
  const mobileNav = getPhaseMobileNav(effectivePhase, isPilot);

  const isActive = (item: { to: string; matchExact: boolean }) =>
    item.matchExact ? location.pathname === item.to : location.pathname.startsWith(item.to);

  const planLabel = plan === "now_pilot" ? "🤝 Binôme de com" : plan === "studio" ? "Binôme de com" : plan === "outil" ? "Outil (39€)" : "Gratuit";
  const planBadge = plan === "now_pilot" ? "🤝 Binôme" : plan === "outil" || plan === "studio" ? "Pro" : null;
  const totalUsed = usage.total?.used ?? 0;
  const totalLimit = usage.total?.limit ?? 100;
  const totalPercent = totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0;
  const firstName = user?.user_metadata?.first_name || user?.email?.split("@")[0] || "Toi";
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Aller au contenu principal
      </a>
      {/* ─── Desktop header (lg+) : logo + icons+text nav + bell+avatar ─── */}
      <header className="sticky top-0 z-40 border-b border-border bg-card hidden lg:block">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-6">
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
              <span className="font-display text-sm font-bold text-foreground">L'Assistant Com'</span>
              <span className="font-mono-ui text-[10px] font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-md">beta</span>
            </Link>
            {isMultiWorkspace && <WorkspaceSwitcher activeWorkspace={activeWorkspace} workspaces={workspaces} switchWorkspace={switchWorkspace} navigate={navigate} />}
          </div>

          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-1 rounded-pill bg-rose-pale p-1 flex-nowrap overflow-hidden">
              {desktopNav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                    isActive(item)
                      ? "bg-card text-primary shadow-[0_2px_8px_hsl(338_96%_61%/0.1)]"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              ))}
            </nav>
            {showAllToolsLink && (
              <button
                onClick={handleAllToolsClick}
                className="font-mono-ui text-[12px] text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
              >
                Tous les outils →
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <AiCreditsCounter plan={plan} usage={usage} />
            <NotificationBell />
            <AvatarMenu
              initial={initial}
              firstName={firstName}
              planLabel={planLabel}
              planBadge={planBadge}
              totalUsed={totalUsed}
              totalLimit={totalLimit}
              totalPercent={totalPercent}
              signOut={signOut}
              navigate={navigate}
              isAdmin={isAdmin}
              hasCoaching={hasCoaching || isPilot}
              isPilot={isPilot}
              canMultiClient={isPaid || isPilot || isAdmin}
              coachingMonth={coachingMonth}
              coachingPhase={coachingPhase}
              onDemoClick={handleDemoClick}
            />
          </div>
        </div>
      </header>

      {/* ─── Tablet header (md–lg) : logo + icon-only nav + bell+avatar ─── */}
      <header className="sticky top-0 z-40 border-b border-border bg-card hidden md:block lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
              <span className="font-display text-sm font-bold text-foreground">L'Assistant Com'</span>
              <span className="font-mono-ui text-[10px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-md">beta</span>
            </Link>
            {isMultiWorkspace && <WorkspaceSwitcher activeWorkspace={activeWorkspace} workspaces={workspaces} switchWorkspace={switchWorkspace} navigate={navigate} />}
          </div>

          <div className="flex items-center gap-1.5">
            <nav className="flex items-center gap-1 rounded-pill bg-rose-pale p-1 flex-nowrap overflow-hidden">
              {desktopNav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center justify-center rounded-pill w-9 h-9 transition-all duration-200 ${
                    isActive(item)
                      ? "bg-card text-primary shadow-[0_2px_8px_hsl(338_96%_61%/0.1)]"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                  title={item.label}
                >
                  <item.icon className="h-4 w-4" />
                </Link>
              ))}
            </nav>
            {showAllToolsLink && (
              <button
                onClick={handleAllToolsClick}
                className="font-mono-ui text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                title="Voir tous les outils"
              >
                +
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <AiCreditsCounter plan={plan} usage={usage} />
            <NotificationBell />
            <AvatarMenu
              initial={initial}
              firstName={firstName}
              planLabel={planLabel}
              planBadge={planBadge}
              totalUsed={totalUsed}
              totalLimit={totalLimit}
              totalPercent={totalPercent}
              signOut={signOut}
              navigate={navigate}
              isAdmin={isAdmin}
              hasCoaching={hasCoaching || isPilot}
              isPilot={isPilot}
              canMultiClient={isPaid || isPilot || isAdmin}
              coachingMonth={coachingMonth}
              coachingPhase={coachingPhase}
              onDemoClick={handleDemoClick}
            />
          </div>
        </div>
      </header>

      {/* ─── Mobile top bar (<md) : logo + bell+avatar only ─── */}
      <header className="sticky top-0 z-40 border-b border-border bg-card md:hidden">
        <div className="flex h-12 items-center justify-between px-4">
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
              <span className="font-display text-sm font-bold text-foreground">L'Assistant Com'</span>
              <span className="font-mono-ui text-[10px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-md">beta</span>
            </Link>
            {isMultiWorkspace && <WorkspaceSwitcher activeWorkspace={activeWorkspace} workspaces={workspaces} switchWorkspace={switchWorkspace} navigate={navigate} />}
          </div>
          <div className="flex items-center gap-2">
            <AiCreditsCounter plan={plan} usage={usage} />
            <NotificationBell />
            <AvatarMenu
              initial={initial}
              firstName={firstName}
              planLabel={planLabel}
              planBadge={planBadge}
              totalUsed={totalUsed}
              totalLimit={totalLimit}
              totalPercent={totalPercent}
              signOut={signOut}
              navigate={navigate}
              isAdmin={isAdmin}
              hasCoaching={hasCoaching || isPilot}
              isPilot={isPilot}
              canMultiClient={isPaid || isPilot || isAdmin}
              coachingMonth={coachingMonth}
              coachingPhase={coachingPhase}
              onDemoClick={handleDemoClick}
            />
          </div>
        </div>
      </header>

      {/* ─── Mobile bottom tab bar (<md only) ─── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card shadow-[0_-2px_10px_rgba(0,0,0,0.05)] md:hidden">
        <div className="flex items-center justify-around h-14">
          {mobileNav.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-0.5 py-1 px-2 text-[10px] font-semibold transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <item.icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
                {item.label}
              </Link>
            );
          })}
          {showAllToolsLink && (
            <button
              onClick={handleAllToolsClick}
              className="flex flex-col items-center gap-0.5 py-1 px-2 text-[10px] font-semibold text-muted-foreground"
            >
              <LayoutGrid className="h-5 w-5" />
              Plus
            </button>
          )}
        </div>
      </nav>

      {/* ─── Client workspace banner ─── */}
      {activeRole === "manager" && activeWorkspace && (
        <div className="sticky top-12 md:top-14 z-30 border-b border-primary/30 bg-rose-pale">
          <div className="mx-auto max-w-[1100px] flex items-center justify-between px-4 sm:px-6 py-2">
            <span className="text-sm font-bold text-foreground">
              👁️ Tu es dans l'espace de {activeWorkspace.name}
            </span>
            <button
              onClick={() => {
                const ownerWs = workspaces[0];
                if (ownerWs) {
                  switchWorkspace(ownerWs.id);
                  navigate("/dashboard");
                }
              }}
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Revenir à mon espace
            </button>
          </div>
        </div>
      )}

    </>
  );
}

/* ─── Avatar dropdown menu (right side) ─── */
interface AvatarMenuProps {
  initial: string;
  firstName: string;
  planLabel: string;
  planBadge: string | null;
  totalUsed: number;
  totalLimit: number;
  totalPercent: number;
  signOut: () => void;
  navigate: (path: string) => void;
  isAdmin: boolean;
  hasCoaching?: boolean;
  isPilot?: boolean;
  canMultiClient?: boolean;
  coachingMonth?: number | null;
  coachingPhase?: string | null;
  onDemoClick: () => void;
}

function AvatarMenu({ initial, firstName, planLabel, planBadge, totalUsed, totalLimit, totalPercent, signOut, navigate, isAdmin, hasCoaching, isPilot, canMultiClient, coachingMonth, coachingPhase, onDemoClick }: AvatarMenuProps) {
  const remaining = totalLimit - totalUsed;
  const isLow = remaining <= 10 && totalLimit > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 justify-center h-9 rounded-full bg-primary text-primary-foreground text-sm font-bold focus:outline-none hover:opacity-90 transition-opacity shrink-0 px-3"
          aria-label="Menu utilisateur"
        >
          {initial}
          {planBadge && (
            <span className="text-[10px] font-semibold bg-primary-foreground/20 px-1.5 py-0.5 rounded-md">
              {planBadge}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 bg-card border border-border shadow-lg z-50">
        {/* User info */}
        <div className="px-3 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Salut {firstName} 👋</p>
            {planBadge && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${isPilot ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                {planBadge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Plan : {planLabel}</p>
          {isPilot && coachingMonth && (
            <p className="text-xs text-muted-foreground">Phase : {coachingPhase === "strategy" ? "Stratégie" : "Binôme"} · Mois {coachingMonth}/6</p>
          )}
          <button
            onClick={() => navigate("/abonnement")}
            className="w-full mt-2 group/credits"
          >
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span className="flex items-center gap-1">⚡ Crédits IA</span>
              <span className={`font-mono-ui font-semibold ${isLow ? "text-destructive" : totalPercent >= 70 ? "text-orange-500" : ""}`}>
                {remaining}/{totalLimit}
              </span>
            </div>
            <Progress value={totalPercent} className="h-1.5" />
            {isLow && (
              <p className="text-[10px] text-destructive mt-0.5 text-left">Crédits presque épuisés</p>
            )}
          </button>
        </div>
        <DropdownMenuSeparator />
        {(hasCoaching || isPilot) && (
          <>
            <DropdownMenuItem onClick={() => navigate("/accompagnement")} className="gap-2 cursor-pointer">
              <Handshake className="h-4 w-4" /> 🤝 Mon accompagnement
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {canMultiClient && (
          <DropdownMenuItem onClick={() => navigate("/admin/coaching")} className="gap-2 cursor-pointer">
            <Users className="h-4 w-4" /> 👥 Mes client·es
          </DropdownMenuItem>
        )}
        {canMultiClient && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={() => navigate("/profil")} className="gap-2 cursor-pointer">
          <User className="h-4 w-4" /> Mon profil
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/branding")} className="gap-2 cursor-pointer">
          <Palette className="h-4 w-4" /> Mon identité
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/dashboard/complet")} className="gap-2 cursor-pointer">
          <LayoutGrid className="h-4 w-4" /> Tableau de bord complet
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/abonnement")} className="gap-2 cursor-pointer">
          <CreditCard className="h-4 w-4" /> Mon abonnement
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/parametres")} className="gap-2 cursor-pointer">
          <Settings className="h-4 w-4" /> Paramètres
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDemoClick} className="gap-2 cursor-pointer">
              <Film className="h-4 w-4" /> 🎬 Mode démo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/admin/coaching")} className="gap-2 cursor-pointer">
              <GraduationCap className="h-4 w-4" /> 🎓 Mes clientes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/admin/audit")} className="gap-2 cursor-pointer">
              <Search className="h-4 w-4" /> 🔧 Audit app
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/admin/tools")} className="gap-2 cursor-pointer">
              <Wrench className="h-4 w-4" /> 🛠️ Outils admin
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.open("mailto:laetitia@nowadaysagency.com", "_blank")} className="gap-2 cursor-pointer">
          <HelpCircle className="h-4 w-4" /> Aide & support
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" /> Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Workspace switcher (only shown when multi-workspace) ─── */
function WorkspaceSwitcher({
  activeWorkspace,
  workspaces,
  switchWorkspace,
  navigate,
}: {
  activeWorkspace: { id: string; name: string } | null;
  workspaces: { id: string; name: string }[];
  switchWorkspace: (id: string) => void;
  navigate: (path: string) => void;
}) {
  const displayName = activeWorkspace?.name
    ? activeWorkspace.name.length > 20
      ? activeWorkspace.name.slice(0, 20) + "…"
      : activeWorkspace.name
    : "Workspace";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary focus:outline-none">
          <span className="font-medium truncate max-w-[120px]">{displayName}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 bg-card border border-border shadow-lg z-50">
        {workspaces.map((ws) => (
          <DropdownMenuItem
            key={ws.id}
            onClick={async () => {
              if (ws.id !== activeWorkspace?.id) {
                await switchWorkspace(ws.id);
                if (window.location.pathname === "/dashboard") {
                  window.location.reload();
                } else {
                  navigate("/dashboard");
                }
              }
            }}
            className="gap-2 cursor-pointer"
          >
            {ws.id === activeWorkspace?.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            {ws.id !== activeWorkspace?.id && <span className="w-3.5 shrink-0" />}
            <span className="truncate">{ws.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/admin/coaching")} className="gap-2 cursor-pointer">
          <Plus className="h-3.5 w-3.5 shrink-0" />
          Nouveau client
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
