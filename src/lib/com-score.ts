import { supabase } from "@/integrations/supabase/client";
import { fetchBrandingData, calculateBrandingCompletion } from "@/lib/branding-completion";

export interface ComScore {
  total: number;
  branding: number;
  regularity: number;
  engagement: number;
  channels: number;
  aiUsage: number;
  trend: number;
}

type WF = { column: string; value: string };

const WEEKLY_TARGET: Record<string, number> = {
  less_2h: 1,
  "2_5h": 2,
  "5_10h": 3,
  more_10h: 5,
};

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

// Helper to run a count query with workspace filter + extra conditions
async function countRows(
  table: string,
  wf: WF,
  extra?: (q: any) => any,
): Promise<number> {
  try {
    let q = (supabase.from as any)(table).select("id", { count: "exact", head: true }).eq(wf.column, wf.value);
    if (extra) q = extra(q);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/* ── Component scores ── */

async function scoreBranding(wf: WF): Promise<number> {
  try {
    const raw = await fetchBrandingData(wf);
    const completion = calculateBrandingCompletion(raw);
    return Math.round(completion.total * 0.35);
  } catch {
    return 0;
  }
}

async function scoreRegularity(wf: WF, since: string): Promise<number> {
  try {
    const actual = await countRows("calendar_posts", wf, (q: any) =>
      q.eq("status", "published").gte("date", since),
    );
    const { data } = await (supabase.from as any)("user_plan_config")
      .select("weekly_time")
      .eq(wf.column, wf.value)
      .maybeSingle();
    const weeklyKey = data?.weekly_time ?? "2_5h";
    const target4w = (WEEKLY_TARGET[weeklyKey] ?? 2) * 4;
    return Math.round(Math.min(100, (actual / target4w) * 100) * 0.25);
  } catch {
    return 0;
  }
}

async function scoreEngagement(wf: WF, since: string): Promise<number> {
  try {
    const actual = await countRows("engagement_checklist_logs", wf, (q: any) =>
      q.eq("streak_maintained", true).gte("log_date", since.slice(0, 10)),
    );
    return Math.round(Math.min(100, (actual / 20) * 100) * 0.15);
  } catch {
    return 0;
  }
}

async function scoreChannels(wf: WF): Promise<number> {
  try {
    const { data: profile } = await (supabase.from as any)("profiles")
      .select("canaux")
      .eq(wf.column, wf.value)
      .maybeSingle();

    const declared: string[] = profile?.canaux ?? [];
    if (declared.length === 0) return 0;

    const thirtyAgo = daysAgo(30);
    const checks = declared.map(async (ch: string) => {
      const c = ch.toLowerCase();
      try {
        if (c.includes("instagram")) {
          const cp = await countRows("calendar_posts", wf, (q: any) =>
            q.eq("canal", "instagram").gte("date", thirtyAgo),
          );
          if (cp > 0) return true;
          const gp = await countRows("generated_posts", wf, (q: any) =>
            q.gte("created_at", thirtyAgo),
          );
          return gp > 0;
        }
        if (c.includes("linkedin")) {
          const n = await countRows("generated_posts", wf, (q: any) =>
            q.gte("created_at", thirtyAgo),
          );
          return n > 0;
        }
        if (c.includes("pinterest")) {
          const n = await countRows("pinterest_pins", wf, (q: any) =>
            q.gte("created_at", thirtyAgo),
          );
          return n > 0;
        }
        if (c.includes("site") || c.includes("website")) {
          const { data } = await (supabase.from as any)("website_homepage")
            .select("updated_at")
            .eq(wf.column, wf.value)
            .gte("updated_at", thirtyAgo)
            .limit(1);
          return (data?.length ?? 0) > 0;
        }
      } catch {
        return false;
      }
      return false;
    });

    const results = await Promise.all(checks);
    const active = results.filter(Boolean).length;
    return Math.round((active / declared.length) * 10);
  } catch {
    return 0;
  }
}

async function scoreAiUsage(wf: WF, since: string): Promise<number> {
  try {
    const [posts, carousels] = await Promise.all([
      countRows("generated_posts", wf, (q: any) => q.gte("created_at", since)),
      countRows("generated_carousels", wf, (q: any) => q.gte("created_at", since)),
    ]);
    return Math.min(15, posts + carousels);
  } catch {
    return 0;
  }
}

/* ── Main ── */

export async function computeComScore(
  workspaceFilter: WF,
): Promise<ComScore> {
  const since28 = daysAgo(28);
  const since30 = daysAgo(30);

  const [branding, regularity, engagement, channels, aiUsage] = await Promise.all([
    scoreBranding(workspaceFilter),
    scoreRegularity(workspaceFilter, since28),
    scoreEngagement(workspaceFilter, since28),
    scoreChannels(workspaceFilter),
    scoreAiUsage(workspaceFilter, since30),
  ]);

  const total = Math.min(100, branding + regularity + engagement + channels + aiUsage);

  // Trend: compare with previous 4-week window
  let trend = 0;
  try {
    const since56 = daysAgo(56);
    const [prevReg, prevEng, prevAi] = await Promise.all([
      scoreRegularity(workspaceFilter, since56),
      scoreEngagement(workspaceFilter, since56),
      scoreAiUsage(workspaceFilter, since56),
    ]);
    const prevTotal = Math.min(
      100,
      branding + Math.max(0, prevReg - regularity) + Math.max(0, prevEng - engagement) + channels + Math.max(0, prevAi - aiUsage),
    );
    trend = total - prevTotal;
  } catch {
    trend = 0;
  }

  return { total, branding, regularity, engagement, channels, aiUsage, trend };
}
