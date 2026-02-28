import { useMemo } from "react";
import { useGuideRecommendation } from "./use-guide-recommendation";
import { useAuth } from "@/contexts/AuthContext";
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

const FULL_TOOLS_KEY = "lac_full_tools_clicks";

function getFullToolsClicks(): number {
  try {
    return parseInt(localStorage.getItem(FULL_TOOLS_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

export function incrementFullToolsClicks(): void {
  try {
    const current = getFullToolsClicks();
    localStorage.setItem(FULL_TOOLS_KEY, String(current + 1));
  } catch {
    // ignore
  }
}

/**
 * Determines the user's internal phase and guidance speed.
 *
 * Phase logic:
 *   - "construction": branding total < 40%
 *   - "action": branding ≥ 40% but fewer than 8 calendar posts
 *   - "pilotage": branding ≥ 40% and ≥ 8 posts
 *
 * Override: if localStorage lac_full_tools_clicks ≥ 3, bump phase up one level.
 */
export function useUserPhase(): UserPhaseResult {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const { profileSummary, isLoading: guideLoading } = useGuideRecommendation();

  const result = useMemo((): Omit<UserPhaseResult, "isLoading"> => {
    const {
      brandingTotal,
      brandingSections,
      calendarPosts,
    } = profileSummary;

    // --- Base phase ---
    let phase: UserPhase;
    if (brandingTotal < 40) {
      phase = "construction";
    } else if (calendarPosts < 8) {
      phase = "action";
    } else {
      phase = "pilotage";
    }

    // --- Override: user keeps clicking "Voir tous les outils" ---
    const clicks = getFullToolsClicks();
    if (clicks >= 3) {
      if (phase === "construction") phase = "action";
      else if (phase === "action") phase = "pilotage";
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
    const suggestedDailyActions = speed as number;

    const contentScore = Math.min(calendarPosts * 5, 100);
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
