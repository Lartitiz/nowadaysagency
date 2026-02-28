import { useMemo } from "react";
import { useGuideRecommendation } from "./use-guide-recommendation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "./use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { useDemoContext } from "@/contexts/DemoContext";

export type UserPhase = "construction" | "action" | "pilotage";
export type UserSpeed = 1 | 2 | 3;

export interface UserPhaseResult {
  phase: UserPhase;
  speed: UserSpeed;
  score: number;
  showFullNav: boolean;
  showProTools: boolean;
  suggestedDailyActions: number;
  isLoading: boolean;
}

/**
 * Determines the user's internal phase and guidance speed.
 *
 * Phase logic:
 *   - "construction": branding total < 40% → identity still being built
 *   - "action": branding ≥ 40% but fewer than 8 calendar posts → content creation mode
 *   - "pilotage": branding ≥ 40% and ≥ 8 posts → autonomous cruise mode
 *
 * Speed logic (level of hand-holding):
 *   1 "Fais pour moi"  → brand new user, < 2 branding sections filled
 *   2 "Fais avec moi"  → intermediate, 2-4 sections filled
 *   3 "Je gère"        → advanced, 5+ sections or pilotage phase
 */
export function useUserPhase(): UserPhaseResult {
  const { user } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const { profileSummary, isLoading: guideLoading } = useGuideRecommendation();

  const result = useMemo((): Omit<UserPhaseResult, "isLoading"> => {
    const {
      brandingTotal,
      brandingSections,
      calendarPosts,
      onboardingComplete,
    } = profileSummary;

    // --- Phase ---
    let phase: UserPhase;
    if (brandingTotal < 40) {
      phase = "construction";
    } else if (calendarPosts < 8) {
      phase = "action";
    } else {
      phase = "pilotage";
    }

    // --- Speed ---
    let speed: UserSpeed;
    if (phase === "pilotage" || brandingSections >= 5) {
      speed = 3;
    } else if (brandingSections >= 2) {
      speed = 2;
    } else {
      speed = 1;
    }

    // --- Derived flags ---
    const showFullNav = phase !== "construction" || brandingSections >= 2;
    const showProTools = phase === "pilotage" || (phase === "action" && speed >= 2);

    // Suggested daily actions: beginners get 1, intermediate 2, advanced 3
    const suggestedDailyActions = speed as number;

    // Score = simple weighted composite (branding 60%, content regularity 40%)
    const contentScore = Math.min(calendarPosts * 5, 100); // 20 posts = 100%
    const score = Math.round(brandingTotal * 0.6 + contentScore * 0.4);

    return {
      phase,
      speed,
      score,
      showFullNav,
      showProTools,
      suggestedDailyActions,
    };
  }, [profileSummary]);

  return { ...result, isLoading: guideLoading };
}
