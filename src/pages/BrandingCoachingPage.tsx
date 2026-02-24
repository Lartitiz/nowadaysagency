import { useSearchParams, useNavigate } from "react-router-dom";
import BrandingCoachingFlow from "@/components/branding/BrandingCoachingFlow";

type Section = "story" | "persona" | "tone_style" | "content_strategy" | "offers";

const VALID_SECTIONS: Section[] = ["story", "persona", "tone_style", "content_strategy", "offers"];

const RECAP_ROUTES: Record<Section, string> = {
  story: "/branding/storytelling",
  persona: "/branding/persona/recap",
  tone_style: "/branding/ton/recap",
  content_strategy: "/branding/strategie/recap",
  offers: "/branding/offres",
};

export default function BrandingCoachingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawSection = searchParams.get("section");

  // Redirect value_proposition to its recap page
  if (rawSection === "value_proposition") {
    navigate("/branding/proposition/recap", { replace: true });
    return null;
  }

  const section = rawSection as Section;

  if (!section || !VALID_SECTIONS.includes(section)) {
    navigate("/branding");
    return null;
  }

  return (
    <BrandingCoachingFlow
      section={section}
      onComplete={() => navigate(RECAP_ROUTES[section] || "/branding")}
      onBack={() => navigate("/branding")}
    />
  );
}
