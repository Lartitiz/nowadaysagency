import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { Navigate, useLocation } from "react-router-dom";
import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import AppHeader from "@/components/AppHeader";
import { isRouteVisible } from "@/config/feature-flags";
import DemoBanner from "@/components/demo/DemoBanner";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const { isDemoMode } = useDemoContext();
  const location = useLocation();
  const [checkingOnboarding, setCheckingOnboarding] = useState(() => {
    return sessionStorage.getItem("onboarding_checked") !== "done";
  });
  const [needsOnboarding, setNeedsOnboarding] = useState(() => {
    return sessionStorage.getItem("onboarding_checked") === "needs";
  });

  useEffect(() => {
    if (isDemoMode || !user || location.pathname === "/onboarding") {
      setCheckingOnboarding(false);
      if (isDemoMode) sessionStorage.setItem("onboarding_checked", "done");
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
        const done = profile?.onboarding_completed === true || config?.onboarding_completed === true;
        setNeedsOnboarding(!done);
        sessionStorage.setItem("onboarding_checked", done ? "done" : "needs");
      } catch (e) {
        console.error("Onboarding check failed:", e);
        setNeedsOnboarding(true);
      } finally {
        setCheckingOnboarding(false);
      }
    };
    check();
  }, [user?.id, isDemoMode, location.pathname]);

  if (isDemoMode) {
    const DEMO_READY_ROUTES = [
      "/dashboard", "/dashboard/complet", "/dashboard/guide",
      "/branding", "/branding/section", "/branding/coaching",
      "/branding/offres",
      "/calendrier", "/accompagnement", "/plan-de-com",
      "/instagram", "/instagram/profil", "/instagram/profil/bio",
      "/instagram/engagement", "/instagram/routine", "/linkedin",
      "/offres", "/guide", "/onboarding", "/welcome",
      "/connexion-check", "/creer",
    ];
    const currentPath = location.pathname;
    const isReady = DEMO_READY_ROUTES.some(r => currentPath === r || currentPath.startsWith(r + "/"));

    if (!isReady) {
      return (
        <>
          <DemoBanner />
          <AppHeader />
          <div className="min-h-screen bg-background flex flex-col">
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="max-w-md text-center space-y-4 animate-fade-in">
                <span className="text-5xl block">🔜</span>
                <h2 className="font-display text-xl text-foreground">
                  Cette page est disponible dans l'outil complet
                </h2>
                <p className="text-muted-foreground text-sm">
                  Crée ton compte gratuit pour accéder à toutes les fonctionnalités, ou reviens au dashboard pour continuer la visite.
                </p>
                <div className="flex gap-3 justify-center pt-2">
                  <a href="/login" className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                    Créer mon compte
                  </a>
                  <a href="/dashboard" className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border text-foreground text-sm font-medium hover:bg-muted/50 transition-colors">
                    ← Retour au dashboard
                  </a>
                </div>
              </div>
            </div>
          </div>
          <FloatingChatButton />
        </>
      );
    }

    return <>{children}<FloatingChatButton /></>;
  }

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

  // Feature flag: redirect non-admin from hidden module routes
  if (!isRouteVisible(location.pathname, isAdmin)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}<FloatingChatButton /></>;
}
