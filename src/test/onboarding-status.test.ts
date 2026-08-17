import { describe, it, expect, vi, beforeEach } from "vitest";

// resolveOnboardingStatus est le helper de sécurité qui pilote le gating
// onboarding dans ProtectedRoute (src/components/ProtectedRoute.tsx). La règle
// documentée est stricte : un null (ligne absente ou bloquée par RLS) ne doit
// JAMAIS être traité comme "needs" — sinon ProtectedRoute renverrait à tort
// des comptes déjà onboardés vers /onboarding au moindre lag DB / RLS.

type MockResponse = { data: unknown; error: unknown } | "reject";

const mocks = vi.hoisted(() => ({
  responses: {} as Record<string, MockResponse>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            const resp = mocks.responses[table];
            if (resp === "reject") throw new Error(`network error on ${table}`);
            return resp ?? { data: null, error: null };
          },
        }),
      }),
    }),
  },
}));

import { resolveOnboardingStatus } from "@/lib/onboarding-status";

function setResponses(profiles: MockResponse, userPlanConfig: MockResponse) {
  mocks.responses = { profiles, user_plan_config: userPlanConfig };
}

beforeEach(() => {
  mocks.responses = {};
});

const OPTS = { profileUserId: "u1", planConfigUserId: "u1" };

describe("resolveOnboardingStatus — \"done\"", () => {
  it("profiles.onboarding_completed = true suffit", async () => {
    setResponses(
      { data: { onboarding_completed: true }, error: null },
      { data: { onboarding_completed: false }, error: null }
    );
    expect(await resolveOnboardingStatus(OPTS)).toBe("done");
  });

  it("user_plan_config.onboarding_completed = true suffit", async () => {
    setResponses(
      { data: { onboarding_completed: false }, error: null },
      { data: { onboarding_completed: true }, error: null }
    );
    expect(await resolveOnboardingStatus(OPTS)).toBe("done");
  });

  it("une seule table dispo à true (l'autre indisponible) donne quand même done", async () => {
    setResponses("reject", { data: { onboarding_completed: true }, error: null });
    expect(await resolveOnboardingStatus(OPTS)).toBe("done");
  });
});

describe("resolveOnboardingStatus — \"needs\"", () => {
  it("les deux tables à false explicitement", async () => {
    setResponses(
      { data: { onboarding_completed: false }, error: null },
      { data: { onboarding_completed: false }, error: null }
    );
    expect(await resolveOnboardingStatus(OPTS)).toBe("needs");
  });

  it("une ligne présente à false, l'autre absente (null)", async () => {
    setResponses(
      { data: { onboarding_completed: false }, error: null },
      { data: null, error: null }
    );
    expect(await resolveOnboardingStatus(OPTS)).toBe("needs");
  });

  it("une table à false, l'autre indisponible (requête rejetée)", async () => {
    setResponses({ data: { onboarding_completed: false }, error: null }, "reject");
    expect(await resolveOnboardingStatus(OPTS)).toBe("needs");
  });
});

describe("resolveOnboardingStatus — \"unknown\" (règle de sécurité : jamais \"needs\" sur un null)", () => {
  it("les deux tables renvoient une ligne absente (data: null)", async () => {
    setResponses({ data: null, error: null }, { data: null, error: null });
    expect(await resolveOnboardingStatus(OPTS)).toBe("unknown");
  });

  it("les deux requêtes sont rejetées", async () => {
    setResponses("reject", "reject");
    expect(await resolveOnboardingStatus(OPTS)).toBe("unknown");
  });

  it("les deux tables renvoient une erreur Supabase (ex: RLS)", async () => {
    setResponses(
      { data: null, error: { message: "RLS violation" } },
      { data: null, error: { message: "RLS violation" } }
    );
    expect(await resolveOnboardingStatus(OPTS)).toBe("unknown");
  });

  it("une table absente (null) et l'autre indisponible — ne bascule jamais en needs", async () => {
    setResponses({ data: null, error: null }, "reject");
    expect(await resolveOnboardingStatus(OPTS)).toBe("unknown");
  });

  it("une table en erreur et l'autre ligne absente — ne bascule jamais en needs", async () => {
    setResponses(
      { data: null, error: { message: "RLS violation" } },
      { data: null, error: null }
    );
    expect(await resolveOnboardingStatus(OPTS)).toBe("unknown");
  });
});
