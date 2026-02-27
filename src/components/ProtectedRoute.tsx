import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { Navigate, useLocation } from "react-router-dom";
import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { isDemoMode } = useDemoContext();
  const location = useLocation();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    if (isDemoMode || !user || location.pathname === "/onboarding") {
      setCheckingOnboarding(false);
      return;
    }

    const check = async () => {
      try {
        const [{ data: profile }, { data: config }] = await Promise.all([
          supabase.from("profiles")
            .select("onboarding_completed")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase.from("user_plan_config")
            .select("onboarding_completed")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);
        const done = profile?.onboarding_completed === true && config?.onboarding_completed === true;
        setNeedsOnboarding(!done);
      } catch {
        setNeedsOnboarding(false);
      } finally {
        setCheckingOnboarding(false);
      }
    };
    check();
  }, [user?.id, isDemoMode, location.pathname]);

  if (isDemoMode) return <>{children}</>;

  if (loading || checkingOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
