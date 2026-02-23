import { useSearchParams, useNavigate } from "react-router-dom";
import BrandingCoachingFlow from "@/components/branding/BrandingCoachingFlow";

type Section = "story" | "persona" | "value_proposition" | "tone_style" | "content_strategy" | "offers";

const VALID_SECTIONS: Section[] = ["story", "persona", "value_proposition", "tone_style", "content_strategy", "offers"];

const RECAP_ROUTES: Record<Section, string> = {
  story: "/branding/storytelling",
  persona: "/branding/persona/recap",
  value_proposition: "/branding/proposition/recap",
  tone_style: "/branding/ton/recap",
  content_strategy: "/branding/strategie/recap",
  offers: "/branding/offres",
};

export default function BrandingCoachingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const section = searchParams.get("section") as Section;

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
