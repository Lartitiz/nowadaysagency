import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

/* Parcours voulu : relire sa fiche de marque, PUIS créer.
   Tant qu'une fiche attend d'être validée, la « prochaine étape » du tableau
   de bord ne doit pas envoyer créer un contenu — la page de création renvoie
   de toute façon sur la fiche, et l'IA écrirait sans connaître la marque. */

const mocks = vi.hoisted(() => ({ pending: { value: false } }));

vi.mock("@/hooks/use-pending-brand-review", () => ({
  usePendingBrandReview: () => ({ pending: mocks.pending.value, checking: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "user_id", value: "u1" }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({}) }) }) } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { storytelling: true, persona: true, audit: true, create: false, calendar: false, connect: false }, isLoading: false }),
}));

import { useOnboardingMissions } from "@/hooks/use-onboarding-missions";

describe("missions d'accueil — la fiche passe avant la création", () => {
  beforeEach(() => { mocks.pending.value = false; });

  it("fiche en attente : la prochaine étape est de valider la fiche", () => {
    mocks.pending.value = true;
    const { result } = renderHook(() => useOnboardingMissions());
    expect(result.current.nextMission?.id).toBe("brand_review");
    expect(result.current.nextMission?.route).toContain("/branding");
  });

  it("fiche validée : la mission « valide ta fiche » disparaît", () => {
    const { result } = renderHook(() => useOnboardingMissions());
    expect(result.current.missions.some((m) => m.id === "brand_review")).toBe(false);
    expect(result.current.nextMission?.id).toBe("create");
  });
});
