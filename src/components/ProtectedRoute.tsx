import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { Navigate, useLocation } from "react-router-dom";
import { ReactNode, useEffect, useRef, useState } from "react";
import { resolveOnboardingStatus } from "@/lib/onboarding-status";

import AppHeader from "@/components/AppHeader";
import { isRouteVisible } from "@/config/feature-flags";
import DemoBanner from "@/components/demo/DemoBanner";

const GATING_TIMEOUT_MS = 5000;

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, session, loading, isAdmin, adminLoading } = useAuth();
  const { isDemoMode } = useDemoContext();
  const location = useLocation();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Refs scoped to the current mount + user.id (reset when user.id changes).
  const ranWithTokenRef = useRef(false);
  const gaveUpRef = useRef(false);
  const gatingStartedAtRef = useRef<number | null>(null);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Reset per-mount refs when user changes (login/logout).
    if (lastUserIdRef.current !== (user?.id ?? null)) {
      ranWithTokenRef.current = false;
      gaveUpRef.current = false;
      gatingStartedAtRef.current = null;
      lastUserIdRef.current = user?.id ?? null;
    }

    if (isDemoMode || !user || location.pathname === "/onboarding") {
      setCheckingOnboarding(false);
      if (isDemoMode) sessionStorage.setItem("onboarding_checked:demo", "done");
      return;
    }

    const scopedKey = `onboarding_checked:${user.id}`;
    const cached = sessionStorage.getItem(scopedKey);
    if (cached === "done") {
      setNeedsOnboarding(false);
      setCheckingOnboarding(false);
      return;
    }
    if (cached === "needs") {
      // Invalidate "needs" cache if a token is now available and we haven't
      // yet run the check token-in-hand for this mount. Otherwise honour it.
      const canRevalidate = !!session?.access_token && !ranWithTokenRef.current;
      if (!canRevalidate) {
        setNeedsOnboarding(true);
        setCheckingOnboarding(false);
        return;
      }
    }

    // Gating: do not run the check until the session token is actually injected.
    if (loading || !session?.access_token) {
      // If we already gave up for this mount, let the user through and stop.
      if (gaveUpRef.current) {
        setNeedsOnboarding(false);
        setCheckingOnboarding(false);
        return;
      }
      const now = Date.now();
      if (gatingStartedAtRef.current === null) {
        gatingStartedAtRef.current = now;
      }
      const elapsed = now - gatingStartedAtRef.current;
      if (elapsed >= GATING_TIMEOUT_MS) {
        console.warn(
          `[ProtectedRoute] Session token not ready after ${elapsed}ms — letting user through without onboarding check.`
        );
        gaveUpRef.current = true;
        setNeedsOnboarding(false);
        setCheckingOnboarding(false);
        return;
      }
      // Stay in checking state; effect will re-run when session?.access_token arrives.
      setCheckingOnboarding(true);
      return;
    }

    // Token is in hand: reset gating counters; this run is authoritative.
    gatingStartedAtRef.current = null;

    const check = async () => {
      try {
        const status = await resolveOnboardingStatus({
          profileUserId: user.id,
          planConfigUserId: user.id,
        });
        ranWithTokenRef.current = true;

        switch (status) {
          case "done":
            setNeedsOnboarding(false);
            sessionStorage.setItem(scopedKey, "done");
            break;
          case "needs":
            setNeedsOnboarding(true);
            sessionStorage.setItem(scopedKey, "needs");
            break;
          case "unknown":
            // Unreliable result: do NOT cache, do NOT redirect. Will retry on next useful render.
            setNeedsOnboarding(false);
            break;
        }
      } catch (e) {
        console.error("Onboarding check failed:", e);
        // Treat as unknown: no cache, no redirect.
        setNeedsOnboarding(false);
      } finally {
        setCheckingOnboarding(false);
      }
    };
    check();
  }, [user?.id, isDemoMode, location.pathname, session?.access_token, loading]);

  if (isDemoMode) {
    const DEMO_READY_ROUTES = [
      "/dashboard", "/dashboard/complet", "/dashboard/guide",
      "/branding", "/branding/section", "/branding/coaching",
      "/branding/offres",
      "/calendrier", "/accompagnement",
      "/instagram", "/instagram/profil", "/instagram/profil/bio",
      "/instagram/engagement", "/instagram/routine", "/linkedin",
      "/onboarding", "/welcome",
      "/parametres/connexions", "/creer",
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
        </>
      );
    }

    return <>{children}</>;
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

  // Feature flag: redirect non-admin from hidden module routes.
  // Only applies to flag-gated routes. Wait for the admin-role query to resolve
  // first — otherwise a cold load (deep link / refresh) evaluates isRouteVisible
  // while isAdmin is still false and wrongly bounces admins to /dashboard.
  if (!isRouteVisible(location.pathname, isAdmin)) {
    if (adminLoading) {
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
    return <Navigate to="/dashboard" replace />;
  }

  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
