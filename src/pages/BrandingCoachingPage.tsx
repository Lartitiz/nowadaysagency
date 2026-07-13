import { useSearchParams, useNavigate, Navigate } from "react-router-dom";
import BrandingCoachingFlow from "@/components/branding/BrandingCoachingFlow";
import { LocalErrorBoundary } from "@/components/LocalErrorBoundary";

type Section = "story" | "persona" | "tone_style" | "content_strategy" | "offers" | "charter" | "content_series";

const VALID_SECTIONS: Section[] = ["story", "persona", "tone_style", "content_strategy", "offers", "charter", "content_series"];

const SECTION_ALIAS: Record<string, string> = {
  storytelling: "story",
  tone: "tone_style",
  strategy: "content_strategy",
  proposition: "value_proposition",
};

const RECAP_ROUTES: Record<Section, string> = {
  story: "/branding/section?section=story&tab=synthese",
  persona: "/branding/section?section=persona&tab=synthese",
  tone_style: "/branding/section?section=tone_style&tab=synthese",
  content_strategy: "/branding/section?section=content_strategy&tab=synthese",
  offers: "/branding/offres",
  charter: "/branding/charter",
  content_series: "/branding/section?section=content_strategy&tab=series",
};

export default function BrandingCoachingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawSection = searchParams.get("section");
  const personaId = searchParams.get("personaId");
  const focus = searchParams.get("focus");

  // Resolve aliases
  const resolved = SECTION_ALIAS[rawSection || ""] || rawSection;

  // Redirect value_proposition to its recap page.
  // Use <Navigate> rather than calling navigate() during render (which triggers a
  // "Cannot update a component while rendering" warning and unstable redirects).
  if (resolved === "value_proposition") {
    return <Navigate to="/branding/proposition/recap" replace />;
  }

  const section = resolved as Section;

  if (!section || !VALID_SECTIONS.includes(section)) {
    return <Navigate to="/branding" replace />;
  }

  return (
    <LocalErrorBoundary fallbackMessage="Le coaching branding a rencontré une erreur.">
      <BrandingCoachingFlow
        section={section}
        personaId={personaId || undefined}
        focus={focus || undefined}
        onComplete={() => navigate(RECAP_ROUTES[section] || "/branding")}
        onBack={() => navigate("/branding")}
      />
    </LocalErrorBoundary>
  );
}
