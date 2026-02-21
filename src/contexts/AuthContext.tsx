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
    // We only want to redirect on explicit SIGNED_IN from login, not on session restore.
    // getSession handles initial load; onAuthStateChange handles subsequent events.
    let initialSessionHandled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Skip the first SIGNED_IN that fires right after getSession (session restore)
        if (!initialSessionHandled) return;

        if (event === "SIGNED_IN" && session?.user) {
          // Only redirect if on login/landing page (fresh sign-in), not on tab switch
          const path = window.location.pathname;
          if (path === "/" || path === "/login" || path === "/connexion") {
            setTimeout(async () => {
              const { data: profile } = await supabase
                .from("profiles")
                .select("onboarding_completed")
                .eq("user_id", session.user.id)
                .maybeSingle();

              if (!profile || !profile.onboarding_completed) {
                navigate("/onboarding");
              } else {
                navigate("/dashboard");
              }
            }, 0);
          }
        }

        if (event === "SIGNED_OUT") {
          navigate("/login");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // After initial session is handled, allow future auth events to trigger redirects
      if (session?.user) {
        // Check onboarding only if user is on the landing/login page
        const path = window.location.pathname;
        if (path === "/" || path === "/login" || path === "/connexion") {
          supabase
            .from("profiles")
            .select("onboarding_completed")
            .eq("user_id", session.user.id)
            .maybeSingle()
            .then(({ data: profile }) => {
              if (!profile || !profile.onboarding_completed) {
                navigate("/onboarding");
              } else {
                navigate("/dashboard");
              }
            });
        }
        // Otherwise, stay on current page (deep link / tab switch preservation)
      }

      // Mark initial load as done so future onAuthStateChange events can redirect
      initialSessionHandled = true;
    });

    return () => subscription.unsubscribe();
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
