import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    let initialSessionHandled = false;

    // 1. Listen to auth state changes FIRST (per Supabase docs)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!mounted) return;

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        // Only set loading false on INITIAL_SESSION or if initial load already done
        if (event === 'INITIAL_SESSION' || initialSessionHandled) {
          setLoading(false);
        }

        // Skip redirect logic until initial session is resolved
        if (!initialSessionHandled) return;

        if (event === "SIGNED_IN" && currentSession?.user) {
          const path = window.location.pathname;
          if (path === "/" || path === "/login" || path === "/connexion") {
            setTimeout(async () => {
              if (!mounted) return;
              const { data: profile } = await supabase
                .from("profiles")
                .select("onboarding_completed")
                .eq("user_id", currentSession.user.id)
                .maybeSingle();

              if (!mounted) return;
              if (!profile || !profile.onboarding_completed) {
                navigate("/onboarding");
              } else {
                navigate("/dashboard");
              }
            }, 0);
          }
        }

        // Only redirect on explicit sign out, NOT on token refresh failures
        if (event === "SIGNED_OUT") {
          navigate("/login");
        }
      }
    );

    // 2. Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!mounted) return;

      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setLoading(false);

      if (initialSession?.user) {
        const path = window.location.pathname;
        if (path === "/" || path === "/login" || path === "/connexion") {
          supabase
            .from("profiles")
            .select("onboarding_completed")
            .eq("user_id", initialSession.user.id)
            .maybeSingle()
            .then(({ data: profile }) => {
              if (!mounted) return;
              if (!profile || !profile.onboarding_completed) {
                navigate("/onboarding");
              } else {
                navigate("/dashboard");
              }
            });
        }
      }

      initialSessionHandled = true;
    });

    // 3. Silently refresh session when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session: refreshedSession } }) => {
          if (!mounted) return;
          if (refreshedSession) {
            setSession(refreshedSession);
            setUser(refreshedSession.user);
          }
          // Do NOT redirect if session is null here — let onAuthStateChange handle SIGNED_OUT
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [navigate]);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
