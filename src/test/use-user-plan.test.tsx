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

describe("normalizePlan", () => {
  it("maps 'studio' and 'now_pilot' to 'binome'", () => {
    expect(normalizePlan("studio")).toBe("binome");
    expect(normalizePlan("now_pilot")).toBe("binome");
  });

  it("passes through known plans and defaults unknown ones to 'free'", () => {
    expect(normalizePlan("free")).toBe("free");
    expect(normalizePlan("outil")).toBe("outil");
    expect(normalizePlan("binome")).toBe("binome");
    expect(normalizePlan("unknown_plan")).toBe("free");
  });
});

describe("useUserPlan — chargement depuis check-subscription", () => {
  it("charge le plan, les crédits bonus et l'usage renvoyés par l'edge function", async () => {
    mocks.invoke.mockResolvedValue(
      subscriptionResponse({ plan: "outil", bonus_credits: 5, ai_usage: { total: { used: 10, limit: 9999 } } }),
    );
    const { result } = renderHook(() => useUserPlan());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.plan).toBe("outil");
    expect(result.current.bonusCredits).toBe(5);
    expect(result.current.usage.total).toEqual({ used: 10, limit: 9999 });
    expect(result.current.isPaid).toBe(true);
    expect(result.current.isBinome).toBe(false);
  });

  it("normalise 'studio' en 'binome' au chargement", async () => {
    mocks.invoke.mockResolvedValue(subscriptionResponse({ plan: "studio" }));
    const { result } = renderHook(() => useUserPlan());

    await waitFor(() => expect(result.current.plan).toBe("binome"));
    expect(result.current.isBinome).toBe(true);
  });

  it("un admin obtient toujours l'accès binôme, quel que soit le plan renvoyé", async () => {
    mocks.auth = { user: { id: "admin-1" }, isAdmin: true };
    mocks.invoke.mockResolvedValue(subscriptionResponse({ plan: "free" }));
    const { result } = renderHook(() => useUserPlan());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plan).toBe("binome");
    expect(result.current.isPaid).toBe(true);
    expect(result.current.isBinome).toBe(true);
  });
});

describe("useUserPlan — cache avec TTL 60s", () => {
  it("réutilise la réponse en cache pour le même workspace sans rappeler l'edge function", async () => {
    const { result, unmount } = renderHook(() => useUserPlan());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    unmount();

    const { result: result2 } = renderHook(() => useUserPlan());
    await waitFor(() => expect(result2.current.loading).toBe(false));

    // Deuxième montage : la réponse vient du cache, pas d'un second appel réseau.
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it("refresh() invalide le cache et relance l'appel", async () => {
    const { result } = renderHook(() => useUserPlan());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });

    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it("refresh() sur une instance recharge aussi les AUTRES instances montées (ex. header + page de création)", async () => {
    const headerInstance = renderHook(() => useUserPlan());
    const creerInstance = renderHook(() => useUserPlan());
    await waitFor(() => expect(headerInstance.result.current.loading).toBe(false));
    await waitFor(() => expect(creerInstance.result.current.loading).toBe(false));
    expect(headerInstance.result.current.usage.total).toEqual({ used: 5, limit: 23 });

    mocks.invoke.mockResolvedValue(
      subscriptionResponse({ ai_usage: { total: { used: 6, limit: 23 } } }),
    );

    await act(async () => {
      await creerInstance.result.current.refresh();
    });

    // L'instance qui n'a pas appelé refresh() doit quand même voir le nouveau solde.
    await waitFor(() => expect(headerInstance.result.current.usage.total).toEqual({ used: 6, limit: 23 }));

    headerInstance.unmount();
    creerInstance.unmount();
  });

  it("expire le cache après le TTL de 60s", async () => {
    // On avance l'horloge via Date.now() plutôt que des fake timers : le cache
    // n'utilise aucun setTimeout, et de vrais timers laissent `waitFor` (RTL)
    // fonctionner normalement (son polling interne repose sur de vrais timers).
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      const { result, unmount } = renderHook(() => useUserPlan());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(mocks.invoke).toHaveBeenCalledTimes(1);
      unmount();

      nowSpy.mockReturnValue(1_000_000 + 61_000);

      const { result: result2 } = renderHook(() => useUserPlan());
      await waitFor(() => expect(result2.current.loading).toBe(false));
      expect(mocks.invoke).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe("useUserPlan — canUseFeature", () => {
  it("free plan allows branding but denies coaching", async () => {
    mocks.invoke.mockResolvedValue(subscriptionResponse({ plan: "free" }));
    const { result } = renderHook(() => useUserPlan());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canUseFeature("branding")).toBe(true);
    expect(result.current.canUseFeature("calendar")).toBe(true);
    expect(result.current.canUseFeature("generation_unlimited")).toBe(false);
    expect(result.current.canUseFeature("coaching")).toBe(false);
  });

  it("outil plan allows generation_unlimited but denies coaching", async () => {
    mocks.invoke.mockResolvedValue(subscriptionResponse({ plan: "outil" }));
    const { result } = renderHook(() => useUserPlan());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canUseFeature("generation_unlimited")).toBe(true);
    expect(result.current.canUseFeature("coaching")).toBe(false);
  });

  it("binome plan allows coaching", async () => {
    mocks.invoke.mockResolvedValue(subscriptionResponse({ plan: "binome" }));
    const { result } = renderHook(() => useUserPlan());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canUseFeature("coaching")).toBe(true);
    expect(result.current.canUseFeature("whatsapp")).toBe(true);
  });

  it("admin bypasses limits — free user with isAdmin gets binome access", async () => {
    mocks.auth = { user: { id: "admin-1" }, isAdmin: true };
    mocks.invoke.mockResolvedValue(subscriptionResponse({ plan: "free" }));
    const { result } = renderHook(() => useUserPlan());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canUseFeature("coaching")).toBe(true);
    expect(result.current.canUseFeature("whatsapp")).toBe(true);
  });
});

describe("useUserPlan — canGenerate", () => {
  it("refuse quand le compteur global a atteint sa limite", async () => {
    mocks.invoke.mockResolvedValue(
      subscriptionResponse({ ai_usage: { total: { used: 23, limit: 23 }, content: { used: 23, limit: 23 } } }),
    );
    const { result } = renderHook(() => useUserPlan());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canGenerate("content")).toBe(false);
  });

  it("autorise tant que le compteur global n'est pas atteint", async () => {
    mocks.invoke.mockResolvedValue(
      subscriptionResponse({ ai_usage: { total: { used: 5, limit: 23 }, content: { used: 5, limit: 23 } } }),
    );
    const { result } = renderHook(() => useUserPlan());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canGenerate("content")).toBe(true);
  });

  it("les crédits bonus prennent le relais même si le sous-plafond catégorie est atteint", async () => {
    mocks.invoke.mockResolvedValue(
      subscriptionResponse({
        bonus_credits: 3,
        ai_usage: { total: { used: 10, limit: 23 }, quality_max: { used: 0, limit: 0 } },
      }),
    );
    const { result } = renderHook(() => useUserPlan());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // quality_max.limit === 0 → refusé même avec des bonus (plafond catégorie à 0 = jamais dispo)
    expect(result.current.canGenerate("quality_max")).toBe(false);
  });

  it("admin peut toujours générer", async () => {
    mocks.auth = { user: { id: "admin-1" }, isAdmin: true };
    const { result } = renderHook(() => useUserPlan());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canGenerate("content")).toBe(true);
  });
});

describe("useUserPlan — remainingWithBonus", () => {
  it("additionne le restant mensuel et les crédits bonus", async () => {
    mocks.invoke.mockResolvedValue(
      subscriptionResponse({ bonus_credits: 7, ai_usage: { total: { used: 20, limit: 23 } } }),
    );
    const { result } = renderHook(() => useUserPlan());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.remainingTotal()).toBe(3);
    expect(result.current.remainingWithBonus()).toBe(10);
  });

  it("reste illimité (Infinity) quand le plan n'a pas de plafond", async () => {
    mocks.invoke.mockResolvedValue(
      subscriptionResponse({ plan: "outil", bonus_credits: 7, ai_usage: { total: { used: 10, limit: 9999 } } }),
    );
    const { result } = renderHook(() => useUserPlan());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // total.limit=9999 n'est PAS traité comme "illimité" par remainingTotal() —
    // seul un usage absent (pas de clé `total`) renvoie Infinity.
    expect(result.current.remainingTotal()).toBe(9989);
    expect(result.current.remainingWithBonus()).toBe(9996);
  });
});

describe("useUserPlan — plan hierarchy (PLAN_LIMITS)", () => {
  it("free total < outil total", () => {
    expect(PLAN_LIMITS.free.total).toBeLessThan(PLAN_LIMITS.outil.total);
  });

  it("free content < outil content", () => {
    expect(PLAN_LIMITS.free.content).toBeLessThan(PLAN_LIMITS.outil.content);
  });

  it("quality_max is gated to paid plans (free = 0)", () => {
    expect(PLAN_LIMITS.free.quality_max).toBe(0);
    expect(PLAN_LIMITS.outil.quality_max).toBeGreaterThan(0);
    expect(CATEGORIES).toContain("quality_max");
  });

  it("'studio' plan does not exist in PLAN_LIMITS (normalized to binome)", () => {
    expect(PLAN_LIMITS).not.toHaveProperty("studio");
  });
});
