import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useDemoContext } from "@/contexts/DemoContext";
import { posthog } from "@/lib/posthog";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
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
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const lastHiddenAt = useRef<number>(0);

  // In demo mode, skip all Supabase auth and provide a fake user
  useEffect(() => {
    if (!isDemoMode) return;
    setUser({ id: "demo-user", email: "demo@nowadays.fr" } as User);
    setSession(null);
    setLoading(false);
  }, [isDemoMode]);

  async function resolvePostAuthRoute(userId: string): Promise<string> {
    const [{ data: profile }, { data: config }] = await Promise.all([
      supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_plan_config")
        .select("onboarding_completed, welcome_seen")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    const onboardingDone = profile?.onboarding_completed && config?.onboarding_completed;
    if (!onboardingDone) return "/onboarding";
    if (!config?.welcome_seen) return "/welcome";
    return "/dashboard";
  }

  useEffect(() => {
    if (isDemoMode) return; // Skip Supabase auth entirely in demo mode
    let mounted = true;
    let initialSessionHandled = false;

    // 1. Listen to auth state changes FIRST (per Supabase docs)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!mounted) return;

        // Silent token refresh: update session only, no navigation
        if (event === 'TOKEN_REFRESHED') {
          if (currentSession) {
            setSession(currentSession);
          }
          return;
        }

        // Only update session ref if token actually changed to avoid re-renders
        setSession(prev => {
          if (prev?.access_token === currentSession?.access_token) return prev;
          return currentSession;
        });
        setUser(prev => {
          if (prev?.id === currentSession?.user?.id) return prev;
          return currentSession?.user ?? null;
        });

        // Only set loading false on INITIAL_SESSION or if initial load already done
        if (event === 'INITIAL_SESSION' || initialSessionHandled) {
          setLoading(false);
        }

        // Skip redirect logic until initial session is resolved
        if (!initialSessionHandled) return;

        if (event === "SIGNED_IN" && currentSession?.user) {
          posthog.identify(currentSession.user.id, {
            email: currentSession.user.email,
          });
          const path = window.location.pathname;
          const searchParams = new URLSearchParams(window.location.search);
          const redirectTo = searchParams.get("redirect");

          // Security: only allow redirects to /invite/ paths
          if (redirectTo && redirectTo.startsWith("/invite/") && (path === "/login" || path === "/connexion")) {
            navigate(redirectTo);
            return;
          }

          if (path === "/" || path === "/login" || path === "/connexion") {
            setTimeout(async () => {
              if (!mounted) return;
              const route = await resolvePostAuthRoute(currentSession.user.id);
              if (!mounted) return;
              navigate(route);
            }, 0);
          }
        }

        // Only redirect on explicit sign out, NOT on token refresh failures
        if (event === "SIGNED_OUT") {
          posthog.reset();
          navigate("/login");
        }
      }
    );

    // 2. Get initial session
    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (!mounted) return;

      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setLoading(false);

      if (initialSession?.user) {
        const path = window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);
        const redirectTo = urlParams.get("redirect");

        if (redirectTo && redirectTo.startsWith("/invite/") && (path === "/login" || path === "/connexion")) {
          navigate(redirectTo);
          initialSessionHandled = true;
          return;
        }

        if (path === "/" || path === "/login" || path === "/connexion") {
          const route = await resolvePostAuthRoute(initialSession.user.id);
          if (!mounted) return;
          navigate(route);
        }
      }

      initialSessionHandled = true;
    }).catch((error) => {
      console.error("Failed to get initial session:", error);
      if (!mounted) return;
      setSession(null);
      setUser(null);
      setLoading(false);
      initialSessionHandled = true;
    });

    // 3. Silently refresh session when tab becomes visible again (only after 5 min away)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAt.current = Date.now();
        return;
      }
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastHiddenAt.current;
        if (elapsed < 5 * 60 * 1000) return;

        supabase.auth.getSession().then(({ data: { session: refreshedSession } }) => {
          if (!mounted) return;
          if (refreshedSession) {
            setSession(refreshedSession);
            setUser(prev => {
              if (prev?.id === refreshedSession.user?.id) return prev;
              return refreshedSession.user;
            });
          }
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [navigate, isDemoMode]);

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
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  // Fetch admin role when user changes
  useEffect(() => {
    if (isDemoMode || !user) {
      setIsAdmin(false);
      return;
    }
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle().then(({ data }) => {
      setIsAdmin(!!data);
    });
  }, [user?.id, isDemoMode]);

  // Memoize the context value to prevent unnecessary re-renders of all consumers
  const value = useMemo<AuthContextType>(
    () => ({ user, session, loading, isAdmin, signUp, signIn, signOut }),
    [user, session, loading, isAdmin, signUp, signIn, signOut]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
