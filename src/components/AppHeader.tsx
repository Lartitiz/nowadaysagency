import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, ClipboardList, Sparkles, CalendarDays, Users, User, Palette, CreditCard, Settings, HelpCircle, LogOut, Film, GraduationCap, Handshake } from "lucide-react";
import DemoFormDialog from "@/components/demo/DemoFormDialog";
import { useUserPlan } from "@/hooks/use-user-plan";
import { Progress } from "@/components/ui/progress";
import NotificationBell from "@/components/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Accueil", icon: Home, matchExact: true },
  { to: "/instagram/creer", label: "Créer", icon: Sparkles, matchExact: false },
  { to: "/calendrier", label: "Calendrier", icon: CalendarDays, matchExact: false },
  { to: "/mon-plan", label: "Mon plan", icon: ClipboardList, matchExact: false },
  { to: "/contacts", label: "Contacts", icon: Users, matchExact: false },
];

export default function AppHeader() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { plan, usage } = useUserPlan();
  const [demoOpen, setDemoOpen] = useState(false);
  const [hasCoaching, setHasCoaching] = useState(false);
  const isAdmin = user?.email === "laetitia@nowadaysagency.com";

  // Check if user has an active coaching program
  useEffect(() => {
    if (!user) return;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      (supabase.from("coaching_programs" as any) as any)
        .select("id")
        .eq("client_user_id", user.id)
        .eq("status", "active")
        .maybeSingle()
        .then(({ data }: any) => { if (data) setHasCoaching(true); });
    });
  }, [user?.id]);

  const isActive = (item: typeof NAV_ITEMS[0]) =>
    item.matchExact ? location.pathname === item.to : location.pathname.startsWith(item.to);

  const planLabel = plan === "studio" ? "Now Studio" : plan === "outil" ? "Outil (39€)" : "Gratuit";
  const totalUsed = usage.total?.used ?? 0;
  const totalLimit = usage.total?.limit ?? 100;
  const totalPercent = totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0;
  const firstName = user?.user_metadata?.first_name || user?.email?.split("@")[0] || "Toi";
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <>
      {/* ─── Desktop header (lg+) : logo + icons+text nav + bell+avatar ─── */}
      <header className="sticky top-0 z-40 border-b border-border bg-card hidden lg:block">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-6">
          <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
            <span className="font-display text-sm font-bold text-foreground">L'Assistant Com'</span>
            <span className="font-mono-ui text-[10px] font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-md">beta</span>
          </Link>

          <nav className="flex items-center gap-1 rounded-pill bg-rose-pale p-1 flex-nowrap overflow-hidden">
            {NAV_ITEMS.map((item) => (
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

          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell />
            <AvatarMenu
              initial={initial}
              firstName={firstName}
              planLabel={planLabel}
              totalUsed={totalUsed}
              totalLimit={totalLimit}
              totalPercent={totalPercent}
              signOut={signOut}
              navigate={navigate}
              isAdmin={isAdmin}
              hasCoaching={hasCoaching}
              onDemoClick={() => setDemoOpen(true)}
            />
          </div>
        </div>
      </header>

      {/* ─── Tablet header (md–lg) : logo + icon-only nav + bell+avatar ─── */}
      <header className="sticky top-0 z-40 border-b border-border bg-card hidden md:block lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
            <span className="font-display text-sm font-bold text-foreground">L'Assistant Com'</span>
            <span className="font-mono-ui text-[10px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-md">beta</span>
          </Link>

          <nav className="flex items-center gap-1 rounded-pill bg-rose-pale p-1 flex-nowrap overflow-hidden">
            {NAV_ITEMS.map((item) => (
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

          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell />
            <AvatarMenu
              initial={initial}
              firstName={firstName}
              planLabel={planLabel}
              totalUsed={totalUsed}
              totalLimit={totalLimit}
              totalPercent={totalPercent}
              signOut={signOut}
              navigate={navigate}
              isAdmin={isAdmin}
              hasCoaching={hasCoaching}
              onDemoClick={() => setDemoOpen(true)}
            />
          </div>
        </div>
      </header>

      {/* ─── Mobile top bar (<md) : logo + bell+avatar only ─── */}
      <header className="sticky top-0 z-40 border-b border-border bg-card md:hidden">
        <div className="flex h-12 items-center justify-between px-4">
          <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
            <span className="font-display text-sm font-bold text-foreground">L'Assistant Com'</span>
            <span className="font-mono-ui text-[10px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-md">beta</span>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <AvatarMenu
              initial={initial}
              firstName={firstName}
              planLabel={planLabel}
              totalUsed={totalUsed}
              totalLimit={totalLimit}
              totalPercent={totalPercent}
              signOut={signOut}
              navigate={navigate}
              isAdmin={isAdmin}
              hasCoaching={hasCoaching}
              onDemoClick={() => setDemoOpen(true)}
            />
          </div>
        </div>
      </header>

      {/* ─── Mobile bottom tab bar (<md only) ─── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card shadow-[0_-2px_10px_rgba(0,0,0,0.05)] md:hidden">
        <div className="flex items-center justify-around h-14">
          {NAV_ITEMS.map((item) => {
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
        </div>
      </nav>

      {/* Demo dialog (admin only) */}
      {isAdmin && <DemoFormDialog open={demoOpen} onOpenChange={setDemoOpen} />}
    </>
  );
}

/* ─── Avatar dropdown menu (right side) ─── */
interface AvatarMenuProps {
  initial: string;
  firstName: string;
  planLabel: string;
  totalUsed: number;
  totalLimit: number;
  totalPercent: number;
  signOut: () => void;
  navigate: (path: string) => void;
  isAdmin: boolean;
  hasCoaching?: boolean;
  onDemoClick: () => void;
}

function AvatarMenu({ initial, firstName, planLabel, totalUsed, totalLimit, totalPercent, signOut, navigate, isAdmin, hasCoaching, onDemoClick }: AvatarMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground text-sm font-bold focus:outline-none hover:opacity-90 transition-opacity shrink-0"
          aria-label="Menu utilisateur"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 bg-card border border-border shadow-lg z-50">
        {/* User info */}
        <div className="px-3 py-3">
          <p className="text-sm font-semibold text-foreground">Salut {firstName} 👋</p>
          <p className="text-xs text-muted-foreground mt-0.5">Plan : {planLabel}</p>
          <button
            onClick={() => navigate("/abonnement")}
            className="w-full mt-2 group/credits"
          >
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span className="flex items-center gap-1">⚡ Crédits IA</span>
              <span className={`font-mono-ui font-semibold ${totalPercent >= 90 ? "text-destructive" : totalPercent >= 70 ? "text-orange-500" : ""}`}>
                {totalLimit - totalUsed}/{totalLimit}
              </span>
            </div>
            <Progress value={totalPercent} className="h-1.5" />
            {totalPercent >= 90 && (
              <p className="text-[10px] text-destructive mt-0.5 text-left">Crédits presque épuisés</p>
            )}
          </button>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/profil")} className="gap-2 cursor-pointer">
          <User className="h-4 w-4" /> Mon profil
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/branding")} className="gap-2 cursor-pointer">
          <Palette className="h-4 w-4" /> Mon branding
        </DropdownMenuItem>
        {hasCoaching && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/accompagnement")} className="gap-2 cursor-pointer">
              <Handshake className="h-4 w-4" /> 🤝 Mon accompagnement
            </DropdownMenuItem>
          </>
        )}
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
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.open("mailto:hello@nowadays.com", "_blank")} className="gap-2 cursor-pointer">
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
