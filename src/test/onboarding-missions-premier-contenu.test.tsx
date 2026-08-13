import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

/* Bug d'audit (13/08/2026) : après la génération du premier contenu via
   l'onboarding (post posé au calendrier), « Crée ton premier contenu » restait
   non cochée alors que « Planifie ta semaine » se cochait grâce au même
   contenu. Cause : le critère comptait generated_posts/generated_carousels,
   deux tables que le flux /creer actuel n'alimente plus — un post généré vit
   dans calendar_posts avec son texte en content_draft. Ces tests rejouent le
   scénario au niveau du queryFn réel (supabase simulé table par table). */

const mocks = vi.hoisted(() => ({
  captured: { queryFn: null as null | (() => Promise<Record<string, boolean>>) },
  counts: {} as Record<string, number>,
}));

vi.mock("@/hooks/use-pending-brand-review", () => ({
  usePendingBrandReview: () => ({ pending: false, checking: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "user_id", value: "u1" }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => {
    mocks.captured.queryFn = opts.queryFn;
    return { data: undefined, isLoading: true };
  },
}));

/* Chaque requête est un builder chaînable ET awaitable ; la clé de comptage
   distingue les deux requêtes calendar_posts par le filtre appliqué
   (content_draft vs date). */
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const filtered: string[] = [];
      const b: any = {
        select: () => b,
        or: () => b,
        in: () => b,
        eq: () => b,
        not: (col: string) => { filtered.push(col); return b; },
        neq: (col: string) => { filtered.push(col); return b; },
        then: (resolve: any) => {
          const key =
            table === "calendar_posts"
              ? filtered.includes("content_draft") ? "calendar_posts:draft" : "calendar_posts:date"
              : table;
          return Promise.resolve({ count: mocks.counts[key] ?? 0 }).then(resolve);
        },
      };
      return b;
    },
  },
}));

import { useOnboardingMissions } from "@/hooks/use-onboarding-missions";

async function runDetection(counts: Record<string, number>) {
  mocks.counts = counts;
  renderHook(() => useOnboardingMissions());
  expect(mocks.captured.queryFn).toBeTruthy();
  return mocks.captured.queryFn!();
}

describe("mission « Crée ton premier contenu » — détection", () => {
  beforeEach(() => { mocks.captured.queryFn = null; });

  it("un post généré posé au calendrier coche la création (scénario du bug)", async () => {
    const map = await runDetection({
      "calendar_posts:draft": 1,
      "calendar_posts:date": 1,
    });
    expect(map.create).toBe(true);
    // Cohérence : la planification, elle, demande toujours 2 contenus posés.
    expect(map.calendar).toBe(false);
  });

  it("une idée planifiée sans texte ne coche pas la création", async () => {
    const map = await runDetection({
      "calendar_posts:draft": 0,
      "calendar_posts:date": 2,
    });
    expect(map.create).toBe(false);
    expect(map.calendar).toBe(true);
  });

  it("les anciens comptes (generated_posts/carousels) restent cochés", async () => {
    expect((await runDetection({ generated_posts: 1 })).create).toBe(true);
    expect((await runDetection({ generated_carousels: 1 })).create).toBe(true);
  });
});
