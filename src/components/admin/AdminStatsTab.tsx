import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const CATEGORY_LABELS: Record<string, string> = {
  content: "Contenus",
  audit: "Audits",
  dm_comment: "DM & Commentaires",
  bio_profile: "Bio & Profil",
  suggestion: "Suggestions",
  import: "Import",
  adaptation: "Adaptations",
};

const PLAN_COLORS: Record<string, string> = {
  free: "#9CA3AF",
  outil: "#8B5CF6",
  studio: "#F59E0B",
  now_pilot: "#fb3d80",
};

interface StatsData {
  total_users: number;
  new_this_month: number;
  active_this_month: number;
  plans: Record<string, number>;
  ai_total_this_month: number;
  ai_by_category: Record<string, number>;
  avg_branding_score: number;
  onboarding_completed: number;
  onboarding_rate: number;
  top_features: { category: string; count: number }[];
  signups_by_week: { week: string; count: number }[];
}

export default function AdminStatsTab() {
  const { session } = useAuth();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await supabase.functions.invoke("admin-users?mode=stats", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: null,
      });
      if (res.data) setStats(res.data);
    } catch (e) {
      console.error("Failed to load stats", e);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading || !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    );
  }

  const activeRate = stats.total_users > 0 ? Math.round((stats.active_this_month / stats.total_users) * 100) : 0;

  const signupsData = stats.signups_by_week.map(s => ({
    ...s,
    label: format(parseISO(s.week), "d MMM", { locale: fr }),
  }));

  const plansData = Object.entries(stats.plans)
    .filter(([, v]) => v > 0)
    .map(([plan, count]) => ({ plan, count, label: plan === "now_pilot" ? "Now Pilot" : plan.charAt(0).toUpperCase() + plan.slice(1) }));

  const maxFeature = Math.max(...stats.top_features.map(f => f.count), 1);

  // SVG progress circle
  const circleR = 52;
  const circleC = 2 * Math.PI * circleR;
  const circleDash = (stats.onboarding_rate / 100) * circleC;

  return (
    <div className="space-y-6">
      {/* Refresh */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={fetchStats} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Rafraîchir
        </Button>
      </div>

      {/* Section 1 : KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard title="Inscrites" value={stats.total_users} sub={stats.new_this_month > 0 ? `+${stats.new_this_month} ce mois` : undefined} subColor="text-emerald-600" />
        <KpiCard title="Actives ce mois" value={stats.active_this_month} sub={`${activeRate}% du total`} />
        <KpiCard title="Générations IA" value={stats.ai_total_this_month} sub="ce mois" />
        <div className="rounded-xl border bg-card p-5 flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Score branding moyen</p>
          <p className="text-2xl font-bold font-display">{stats.avg_branding_score}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
          <Progress value={stats.avg_branding_score} className="h-2 mt-1" />
        </div>
      </div>

      {/* Section 2 : Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Signups chart */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Inscriptions par semaine</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={signupsData}>
              <defs>
                <linearGradient id="signupFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb3d80" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#fb3d80" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13, border: "1px solid hsl(var(--border))" }} />
              <Area type="monotone" dataKey="count" stroke="#fb3d80" strokeWidth={2} fill="url(#signupFill)" name="Inscriptions" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Plans chart */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Répartition par plan</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={plansData} layout="vertical" barCategoryGap={8}>
              <XAxis type="number" hide />
              <YAxis dataKey="label" type="category" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13, border: "1px solid hsl(var(--border))" }} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} name="Utilisatrices" label={{ position: "right", fontSize: 12, fill: "hsl(var(--foreground))" }}>
                {plansData.map((entry) => (
                  <Cell key={entry.plan} fill={PLAN_COLORS[entry.plan] || "#9CA3AF"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 3 : Détails */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top features */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Top fonctionnalités</h3>
          <div className="space-y-3">
            {stats.top_features.slice(0, 7).map(f => (
              <div key={f.category} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{CATEGORY_LABELS[f.category] || f.category}</span>
                  <span className="text-muted-foreground font-medium">{f.count}</span>
                </div>
                <Progress value={(f.count / maxFeature) * 100} className="h-1.5" />
              </div>
            ))}
          </div>
        </div>

        {/* Onboarding */}
        <div className="rounded-xl border bg-card p-5 flex flex-col items-center justify-center">
          <h3 className="text-sm font-semibold mb-4 self-start">Onboarding</h3>
          <div className="relative w-32 h-32 mb-3">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r={circleR} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
              <circle
                cx="60" cy="60" r={circleR}
                fill="none"
                stroke="#fb3d80"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${circleDash} ${circleC}`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold">{stats.onboarding_rate}%</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            {stats.onboarding_completed} sur {stats.total_users} ont terminé l'onboarding
          </p>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, sub, subColor }: { title: string; value: number; sub?: string; subColor?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold font-display">{value}</p>
      {sub && <p className={`text-xs ${subColor || "text-muted-foreground"}`}>{sub}</p>}
    </div>
  );
}
