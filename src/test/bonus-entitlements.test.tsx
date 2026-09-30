import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { PLAN_LIMITS, CATEGORIES } from "@/lib/plan-limits";

// Ce fichier testait une COPIE de la logique de use-user-plan.ts au lieu du
// hook réel : un bug introduit dans le hook aurait pu passer inaperçu. On
// importe désormais le vrai module et on mocke ses seules dépendances
// externes (contexts + client Supabase).

const mocks = vi.hoisted(() => ({
  auth: { user: { id: "user-1" } as any, isAdmin: false },
  workspace: { activeWorkspace: null as { id: string } | null, loading: false },
  demo: { isDemoMode: false, demoData: null as any, demoPlan: "binome" as string },
  invoke: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => mocks.workspace }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => mocks.demo }));
vi.mock("@/lib/error-tracker", () => ({ trackError: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

import { useUserPlan, normalizePlan, invalidateUserPlanCache } from "@/hooks/use-user-plan";

function subscriptionResponse(overrides: Partial<{ plan: string; bonus_credits: number; ai_usage: any }> = {}) {
  return {
    data: {
      plan: "free",
      bonus_credits: 0,
      ai_usage: { total: { used: 5, limit: 23 }, audit: { used: 1, limit: 3 }, quality_max: { used: 0, limit: 0 } },
      ...overrides,
    },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidateUserPlanCache();
  mocks.auth = { user: { id: "user-1" }, isAdmin: false };
  mocks.workspace = { activeWorkspace: null, loading: false };
  mocks.demo = { isDemoMode: false, demoData: null, demoPlan: "binome" };
  mocks.invoke.mockResolvedValue(subscriptionResponse());
});


it("le solde affiche les bonus une seule fois après épuisement du mensuel", async () => {
  mocks.invoke.mockResolvedValue(subscriptionResponse({bonus_credits:10, ai_usage:{total:{used:23,limit:23},content:{used:23,limit:23}}}));
  const {result}=renderHook(()=>useUserPlan());
  await waitFor(()=>expect(result.current.loading).toBe(false));
  expect(result.current.remainingWithBonus()).toBe(10);
});
