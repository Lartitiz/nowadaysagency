import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useDemoContext } from "@/contexts/DemoContext";
import { posthog } from "@/lib/posthog";
import { trackMetaEvent } from "@/lib/meta-pixel";
import { clearAppStorage } from "@/lib/storage-cleanup";
import { setFlowUserId } from "@/hooks/use-flow-persistence";
import { resolveOnboardingStatus } from "@/lib/onboarding-status";
import { invalidateUserPlanCache } from "@/hooks/use-user-plan";
import { isSafeRedirectTarget } from "@/lib/safe-redirect";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  adminLoading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isDemoMode } = useDemoContext();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionReadFailed, setSessionReadFailed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  // ID de l'utilisateur pour lequel le rôle admin a été résolu. Sert à DÉRIVER
  // `adminLoading` au rendu (cf. plus bas) plutôt que de le piloter via un effet :
  // un state piloté par effet est toujours en retard d'un rendu sur `user`, ce qui
  // ouvre une fenêtre où `user` est défini mais `adminLoading` encore false → AdminRoute
  // redirige à tort vers /dashboard avant que le rôle soit vérifié.
  const [adminCheckedForUserId, setAdminCheckedForUserId] = useState<string | null>(null);
  const navigate = useNavigate();
  // Declarative routers change navigate on route changes; auth subscribes once.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const lastHiddenAt = useRef<number>(0);

  // In demo mode, skip all Supabase auth and provide a fake user
  useEffect(() => {
    if (!isDemoMode) return;
    setUser({ id: "demo-user", email: "demo@nowadays.fr" } as User);
    setSession(null);
    setLoading(false);
  }, [isDemoMode]);

  async function resolvePostAuthRoute(userId: string): Promise<string> {
    // Inscription fraîche (marqueur posé par SignupForm avant signUp) : route
    // déterministe vers /onboarding, sans lire profiles/user_plan_config — au
    // SIGNED_IN post-signup, la ligne profiles n'existe souvent PAS ENCORE
    // (insert en cours dans SignupForm) → statut "unknown" → /welcome → /dashboard.
    try {
      if (sessionStorage.getItem("lac_fresh_signup")) {
        sessionStorage.removeItem("lac_fresh_signup");
        trackMetaEvent("CompleteRegistration");
        return "/onboarding";
      }
    } catch { /* storage indisponible — résolution normale */ }
    try {
      const status = await resolveOnboardingStatus({
        profileUserId: userId,
        planConfigUserId: userId,
      });
      if (status === "needs") return "/onboarding";

      // Lecture dédiée pour welcome_seen (séparée du statut onboarding)
      const { data: config } = await supabase
        .from("user_plan_config")
        .select("welcome_seen")
        .eq("user_id", userId)
        .maybeSingle();

      if (!config?.welcome_seen) return "/welcome";
      return "/dashboard";
    } catch (err) {
      console.error("Failed to check onboarding status:", err);
      return "/dashboard";
    }
  }

  useEffect(() => {
    if (isDemoMode) return; // Skip Supabase auth entirely in demo mode
    let mounted = true;
    let authRevision = 0;
    const initialRevision = authRevision;

    // 1. Listen to auth state changes FIRST (per Supabase docs)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!mounted) return;

        // The SDK can emit INITIAL_SESSION(null) when its read fails. Only
        // getSession without an error confirms the absence of a session.
        if (!currentSession && event !== "SIGNED_OUT") return;
        const eventRevision = ++authRevision;
        setSessionReadFailed(false);
        setLoading(false);

        // Only update session ref if token actually changed to avoid re-renders
        setSession(prev => {
          if (prev?.access_token === currentSession?.access_token) return prev;
          return currentSession;
        });
        setUser(prev => {
          if (prev?.id === currentSession?.user?.id) return prev;
          return currentSession?.user ?? null;
        });

        // An explicit sign-out is authoritative even during bootstrap.
        if (event === "SIGNED_OUT") {
          posthog.reset();
          navigateRef.current("/login");
          return;
        }
        if (event === "TOKEN_REFRESHED") return;

        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && currentSession?.user) {
          posthog.identify(currentSession.user.id, {
            email: currentSession.user.email,
          });
          const path = window.location.pathname;
          const searchParams = new URLSearchParams(window.location.search);
          const redirectTo = searchParams.get("redirect");

          if (redirectTo && isSafeRedirectTarget(redirectTo) && (path === "/login" || path === "/connexion")) {
            navigateRef.current(redirectTo);
            return;
          }

          if (path === "/" || path === "/login" || path === "/connexion") {
            setTimeout(async () => {
              if (!mounted || authRevision !== eventRevision) return;
              const route = await resolvePostAuthRoute(currentSession.user.id);
              if (!mounted || authRevision !== eventRevision) return;
              navigateRef.current(route);
            }, 0);
          }
        }
      }
    );

    // Keep read failures distinct from a confirmed signed-out session. An
    // auth event delivered while this read is pending always wins.
    async function loadInitialSession(attempt: 1 | 2 = 1): Promise<void> {
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (!mounted || authRevision !== initialRevision) return;
        if (error) throw error;
        setSessionReadFailed(false);

        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        setLoading(false);

        if (initialSession?.user) {
          const path = window.location.pathname;
          const urlParams = new URLSearchParams(window.location.search);
          const redirectTo = urlParams.get("redirect");

          if (redirectTo && isSafeRedirectTarget(redirectTo) && (path === "/login" || path === "/connexion")) {
            navigateRef.current(redirectTo);
            return;
          }

          if (path === "/" || path === "/login" || path === "/connexion") {
            const route = await resolvePostAuthRoute(initialSession.user.id);
            if (!mounted || authRevision !== initialRevision) return;
            navigateRef.current(route);
          }
        }
      } catch (error) {
        if (!mounted || authRevision !== initialRevision) return;
        if (attempt === 1) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          if (!mounted || authRevision !== initialRevision) return;
          return loadInitialSession(2);
        }
        console.error("Failed to get initial session after retry:", error);
        setSessionReadFailed(true);
        setLoading(false);
      }
    }

    loadInitialSession();

    // 3. Silently refresh session when tab becomes visible again (only after 5 min away)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAt.current = Date.now();
        return;
      }
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastHiddenAt.current;
        if (elapsed < 5 * 60 * 1000) return;

        // After 30+ min away: force a server refresh to get a fresh token
        // After 5-30 min: just read the cached session (faster, usually still valid)
        const refreshRevision = authRevision;
        const refreshPromise = elapsed > 30 * 60 * 1000
          ? supabase.auth.refreshSession().then(({ data }) => data.session)
          : supabase.auth.getSession().then(({ data }) => data.session);

        refreshPromise.then((refreshedSession) => {
          if (!mounted || authRevision !== refreshRevision) return;
          if (refreshedSession) {
            setSessionReadFailed(false);
            setSession(refreshedSession);
            setUser(prev => {
              if (prev?.id === refreshedSession.user?.id) return prev;
              return refreshedSession.user;
            });
          }
        }).catch(() => { /* silent: visibility refresh is best-effort */ });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isDemoMode]);

  // Memoize callback functions to prevent context value changes
  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    clearAppStorage();
    invalidateUserPlanCache();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  // Keep the flow-persistence registry in sync with the current user.
  // Scoped backup keys (creer_flow_state_backup:{userId}) require this.
  useEffect(() => {
    setFlowUserId(user?.id && user.id !== "demo-user" ? user.id : null);
  }, [user?.id]);

  // Fetch admin role when user changes
  useEffect(() => {
    if (isDemoMode || !user) {
      setIsAdmin(false);
      setAdminCheckedForUserId(null);
      return;
    }
    // Skip if still on the demo fake user (waiting for real user to restore)
    if (user.id === "demo-user") {
      return;
    }
    const uid = user.id;
    let cancelled = false;
    Promise.resolve(supabase.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle())
      .then(({ data }) => {
        if (cancelled) return;
        setIsAdmin(!!data);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      })
      .finally(() => {
        // Marque le rôle comme RÉSOLU pour cet uid (que ce soit admin ou non) → lève `adminLoading`.
        if (!cancelled) setAdminCheckedForUserId(uid);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, isDemoMode]);

  // `adminLoading` DÉRIVÉ : vrai tant qu'un vrai utilisateur est connecté et que son rôle
  // admin n'a pas encore été résolu. Comme c'est calculé au rendu (pas via un effet), il passe
  // à true dans le MÊME rendu où `user` devient défini → aucune fenêtre de redirection racée.
  const adminLoading =
    !isDemoMode && !!user && user.id !== "demo-user" && adminCheckedForUserId !== user.id;

  // Memoize the context value to prevent unnecessary re-renders of all consumers
  const value = useMemo<AuthContextType>(
    () => ({ user, session, loading, isAdmin, adminLoading, signUp, signIn, signOut }),
    [user, session, loading, isAdmin, adminLoading, signUp, signIn, signOut]
  );

  return (
    <AuthContext.Provider value={value}>
      {sessionReadFailed && !user && !isDemoMode ? (
        <main className="min-h-screen bg-background flex items-center justify-center p-6">
          <div role="alert" className="max-w-md space-y-4 rounded-2xl border bg-card p-6 text-center">
            <h1 className="font-display text-xl text-foreground">Impossible de vérifier ta connexion</h1>
            <p className="text-sm text-muted-foreground">
              Recharge la page pour réessayer. Tes brouillons sont conservés.
            </p>
            <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
              Recharger la page
            </button>
          </div>
        </main>
      ) : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
