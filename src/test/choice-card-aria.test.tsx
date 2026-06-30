import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ChoiceCard } from "@/components/onboarding/OnboardingShared";

// Garde-fou a11y : ChoiceCard (écrans à choix d'onboarding) doit annoncer son
// état sélectionné aux lecteurs d'écran via aria-pressed, pas seulement par la
// couleur / le ✓ visuel.
describe("ChoiceCard a11y", () => {
  it("expose aria-pressed=true quand sélectionné", () => {
    const { getByRole } = render(<ChoiceCard emoji="🎯" label="Objectif A" selected onClick={() => {}} />);
    expect(getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("expose aria-pressed=false quand non sélectionné", () => {
    const { getByRole } = render(<ChoiceCard emoji="🎯" label="Objectif B" selected={false} onClick={() => {}} />);
    expect(getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });
});
