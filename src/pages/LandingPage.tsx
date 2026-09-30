import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSEO } from "@/hooks/use-page-seo";
import PublicLanding from "@/components/landing/PublicLanding";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const loginTarget =
    new URLSearchParams(location.search).get("offer") === "outil"
      ? "/login?offer=outil&redirect=%2Fpricing%3Fselected%3Dpremium"
      : "/login";

  usePageSEO({
    title: "L’Assistant Com’ — Crée tes contenus, organise ta com’",
    description:
      "La plateforme IA des indépendants : tes posts, tes carrousels, tes visuels et ton calendrier, au même endroit. À ton image.",
    canonical: "/",
  });

  // React Router ne scrolle pas vers le hash (ex: /#signup-section depuis /login).
  useEffect(() => {
    if (loading || user) return;
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [loading, user, location.search, location.hash]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-sm bg-primary animate-bounce-dot" />
          <div
            className="h-3 w-3 rounded-sm bg-primary animate-bounce-dot"
            style={{ animationDelay: "0.16s" }}
          />
          <div
            className="h-3 w-3 rounded-sm bg-primary animate-bounce-dot"
            style={{ animationDelay: "0.32s" }}
          />
        </div>
      </div>
    );
  }

  // Inscription fraîche (marqueur posé par SignupForm) : ce Navigate gagne la
  // course contre resolvePostAuthRoute — l'effet auth (AuthContext) se
  // ré-abonne à chaque changement d'identité de `navigate` et son setTimeout
  // s'annule (`mounted=false`) — donc c'est ICI qu'il faut router vers
  // /onboarding. Lecture SEULE : le marqueur est consommé à l'arrivée
  // (montage d'Onboarding) ou par resolvePostAuthRoute, jamais pendant un
  // render (double render StrictMode = double consommation).
  if (user) {
    let freshSignup = false;
    try {
      freshSignup = !!sessionStorage.getItem("lac_fresh_signup");
    } catch {
      /* storage indisponible */
    }
    return <Navigate to={freshSignup ? "/onboarding" : "/dashboard"} replace />;
  }

  return <PublicLanding loginTarget={loginTarget} />;
}
