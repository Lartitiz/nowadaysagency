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
    // Track whether this is a fresh sign-in vs session restoration
    let isInitialLoad = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (event === "SIGNED_IN" && session?.user) {
          // Only redirect on actual sign-in (not session restore on page load)
          // On initial load, the user is already on the page they navigated to
          if (isInitialLoad) {
            isInitialLoad = false;
            // Still check onboarding for initial load
            setTimeout(async () => {
              const { data: profile } = await supabase
                .from("profiles")
                .select("onboarding_completed")
                .eq("user_id", session.user.id)
                .maybeSingle();

              if (!profile || !profile.onboarding_completed) {
                navigate("/onboarding");
              }
              // Don't redirect to /dashboard — let the user stay on their current page
            }, 0);
          } else {
            // Fresh sign-in from login page
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
    isInitialLoad = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
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
