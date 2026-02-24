import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { format, startOfWeek, subWeeks, isAfter } from "date-fns";
import { fr } from "date-fns/locale";

const ADMIN_EMAIL = "laetitia@nowadaysagency.com";

/* ─── KPI card ─── */
function KpiCard({ emoji, value, label, loading }: { emoji: string; value: string | number; label: string; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col items-center text-center gap-1.5">
      <span className="text-2xl">{emoji}</span>
      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <p className="text-2xl font-bold text-foreground font-display">{value}</p>
      )}
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

/* ─── Section title ─── */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading text-sm uppercase tracking-wider text-muted-foreground mt-10 mb-4">{children}</h2>;
}

export default function AdminAnalyticsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Guard
  useEffect(() => {
    if (user && user.email !== ADMIN_EMAIL) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeUsers7d, setActiveUsers7d] = useState(0);
  const [onboardingCompleted, setOnboardingCompleted] = useState(0);
  const [aiUsage30d, setAiUsage30d] = useState(0);
  const [paidPlans, setPaidPlans] = useState(0);

  // Raw data for charts
  const [profiles, setProfiles] = useState<any[]>([]);
  const [aiRows, setAiRows] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [recentProfiles, setRecentProfiles] = useState<any[]>([]);
  const [planConfigs, setPlanConfigs] = useState<any[]>([]);

  useEffect(() => {
    if (!user || user.email !== ADMIN_EMAIL) return;

    const load = async () => {
      setLoading(true);
      try {
        // 1. Profiles count + recent
        const { data: allProfiles, count: profileCount } = await supabase
          .from("profiles")
          .select("id, user_id, prenom, created_at, onboarding_completed", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(500);
        setTotalUsers(profileCount ?? allProfiles?.length ?? 0);
        setProfiles(allProfiles ?? []);
        setRecentProfiles((allProfiles ?? []).slice(0, 20));

        // 2. Active users (7d) — distinct user_id from ai_usage
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: activeData } = await supabase
          .from("ai_usage")
          .select("user_id")
          .gte("created_at", sevenDaysAgo)
          .limit(1000);
        const uniqueActive = new Set((activeData ?? []).map((r: any) => r.user_id));
        setActiveUsers7d(uniqueActive.size);

        // 3. Onboarding completed
        const { count: onbCount } = await supabase
          .from("user_plan_config")
          .select("id", { count: "exact", head: true })
          .eq("onboarding_completed", true);
        setOnboardingCompleted(onbCount ?? 0);

        // 4. AI usage 30d
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: aiData, count: aiCount } = await supabase
          .from("ai_usage")
          .select("category, created_at", { count: "exact" })
          .gte("created_at", thirtyDaysAgo)
          .limit(1000);
        setAiUsage30d(aiCount ?? aiData?.length ?? 0);
        setAiRows(aiData ?? []);

        // 5. Paid plans
        const { count: paidCount } = await supabase
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "active");
        setPaidPlans(paidCount ?? 0);

        // 6. Subscriptions for recent profiles join
        const { data: subsData } = await supabase
          .from("subscriptions")
          .select("user_id, plan, status")
          .limit(500);
        setSubscriptions(subsData ?? []);

        // 7. Plan configs for onboarding status
        const { data: pcData } = await supabase
          .from("user_plan_config")
          .select("user_id, onboarding_completed")
          .limit(500);
        setPlanConfigs(pcData ?? []);
      } catch (e) {
        console.error("Admin analytics load error", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  // ─── Chart 1: Signups per week (12 weeks) ───
  const signupsByWeek = useMemo(() => {
    const cutoff = subWeeks(new Date(), 12);
    const weeks: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      const wk = startOfWeek(subWeeks(new Date(), 11 - i), { weekStartsOn: 1 });
      weeks[format(wk, "yyyy-MM-dd")] = 0;
    }
    (profiles ?? []).forEach((p: any) => {
      const d = new Date(p.created_at);
      if (!isAfter(d, cutoff)) return;
      const wk = startOfWeek(d, { weekStartsOn: 1 });
      const key = format(wk, "yyyy-MM-dd");
      if (key in weeks) weeks[key]++;
    });
    return Object.entries(weeks).map(([week, count]) => ({
      week: format(new Date(week), "d MMM", { locale: fr }),
      count,
    }));
  }, [profiles]);

  // ─── Chart 2: Top AI categories ───
  const categoryChart = useMemo(() => {
    const map: Record<string, number> = {};
    (aiRows ?? []).forEach((r: any) => {
      const cat = r.category || "autre";
      map[cat] = (map[cat] || 0) + 1;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([category, count]) => ({ category, count }));
  }, [aiRows]);

  // ─── Table: recent signups enriched ───
  const recentTable = useMemo(() => {
    const subMap = new Map((subscriptions ?? []).map((s: any) => [s.user_id, s]));
    const pcMap = new Map((planConfigs ?? []).map((pc: any) => [pc.user_id, pc]));
    return (recentProfiles ?? []).map((p: any) => {
      const sub = subMap.get(p.user_id);
      const pc = pcMap.get(p.user_id);
      return {
        prenom: p.prenom || "—",
        date: format(new Date(p.created_at), "dd/MM/yyyy"),
        onboarding: p.onboarding_completed || pc?.onboarding_completed ? "✅" : "—",
        plan: sub?.plan || "free",
      };
    });
  }, [recentProfiles, subscriptions, planConfigs]);

  const CHART_COLORS = [
    "hsl(var(--primary))",
    "hsl(var(--primary) / 0.8)",
    "hsl(var(--primary) / 0.6)",
    "hsl(var(--primary) / 0.45)",
    "hsl(var(--primary) / 0.3)",
  ];

  if (!user || user.email !== ADMIN_EMAIL) return null;

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main id="main-content" className="mx-auto max-w-4xl px-4 sm:px-6 py-6">
        <SubPageHeader parentLabel="Admin" parentTo="/admin/coaching" currentLabel="Analytics app" />

        {/* ═══ KPIs ═══ */}
        <SectionTitle>📊 Vue d'ensemble</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KpiCard emoji="👥" value={totalUsers} label="Utilisatrices inscrites" loading={loading} />
          <KpiCard emoji="🟢" value={activeUsers7d} label="Actives (7j)" loading={loading} />
          <KpiCard emoji="✅" value={onboardingCompleted} label="Onboarding complété" loading={loading} />
          <KpiCard emoji="🤖" value={aiUsage30d} label="Générations IA (30j)" loading={loading} />
          <KpiCard emoji="💳" value={paidPlans} label="Plans payants actifs" loading={loading} />
          <KpiCard emoji="🎨" value="À venir" label="Branding moyen" loading={false} />
        </div>

        {/* ═══ Signups chart ═══ */}
        <SectionTitle>📈 Inscriptions par semaine (12 dernières)</SectionTitle>
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={signupsByWeek} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 13 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="count" name="Inscriptions" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ═══ AI categories chart ═══ */}
        <SectionTitle>🤖 Top fonctionnalités IA (30j)</SectionTitle>
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : categoryChart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Aucune donnée</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, categoryChart.length * 36)}>
              <BarChart data={categoryChart} layout="vertical" barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={140}
                  tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 13 }}
                />
                <Bar dataKey="count" name="Utilisations" radius={[0, 6, 6, 0]}>
                  {categoryChart.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ═══ Recent signups table ═══ */}
        <SectionTitle>🆕 Dernières inscriptions</SectionTitle>
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prénom</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Onboarding</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTable.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">{row.prenom}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{row.date}</td>
                      <td className="px-4 py-2.5 text-center">{row.onboarding}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          row.plan === "now_pilot"
                            ? "bg-primary/10 text-primary"
                            : row.plan === "studio" || row.plan === "outil"
                              ? "bg-secondary text-foreground"
                              : "bg-muted text-muted-foreground"
                        }`}>
                          {row.plan === "now_pilot" ? "Pilot" : row.plan === "studio" ? "Studio" : row.plan === "outil" ? "Outil" : "Free"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
