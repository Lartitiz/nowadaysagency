import { useSearchParams, useNavigate } from "react-router-dom";
import BrandingCoachingFlow from "@/components/branding/BrandingCoachingFlow";
import { LocalErrorBoundary } from "@/components/LocalErrorBoundary";

type Section = "story" | "persona" | "tone_style" | "content_strategy" | "offers" | "charter";

const VALID_SECTIONS: Section[] = ["story", "persona", "tone_style", "content_strategy", "offers", "charter"];

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
};

export default function BrandingCoachingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawSection = searchParams.get("section");

  // Resolve aliases
  const resolved = SECTION_ALIAS[rawSection || ""] || rawSection;

  // Redirect value_proposition to its recap page
  if (resolved === "value_proposition") {
    navigate("/branding/proposition/recap", { replace: true });
    return null;
  }

  const section = resolved as Section;

  if (!section || !VALID_SECTIONS.includes(section)) {
    navigate("/branding");
    return null;
  }

  return (
    <LocalErrorBoundary fallbackMessage="Le coaching branding a rencontré une erreur.">
      <BrandingCoachingFlow
        section={section}
        onComplete={() => navigate(RECAP_ROUTES[section] || "/branding")}
        onBack={() => navigate("/branding")}
      />
    </LocalErrorBoundary>
  );
}
