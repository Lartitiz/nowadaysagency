import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, TrendingUp, TrendingDown, Euro,
  Activity, BarChart3, Target, Crown,
  AlertTriangle, Zap, UserX,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

/* ── Constants ── */

const PLAN_LABELS: Record<string, string> = {
  free: "Gratuit", outil: "Assistant Com'", binome: "Binôme", pro: "Pro",
};

const PLAN_COLORS: Record<string, string> = {
  free: "#9CA3AF", outil: "#8B5CF6", binome: "#fb3d80", pro: "#3B82F6",
};

const PIE_COLORS = ["#fb3d80", "#8B5CF6", "#F59E0B", "#3B82F6", "#10B981", "#6366F1", "#EC4899"];

const CANAL_LABELS: Record<string, string> = {
  instagram: "Instagram", linkedin: "LinkedIn", pinterest: "Pinterest",
  newsletter: "Newsletter", blog: "Blog", autre: "Autre",
};

const CATEGORY_LABELS: Record<string, string> = {
  content: "Contenus", audit: "Audits", dm_comment: "DM & Commentaires",
  bio_profile: "Bio & Profil", suggestion: "Suggestions", import: "Import", adaptation: "Adaptations",
};

const tooltipStyle = { borderRadius: 8, fontSize: 13, border: "1px solid hsl(var(--border))" };

/* ── Types ── */

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
  // Comparisons
  new_prev_month: number;
  active_prev_month: number;
  ai_total_prev_month: number;
  // Business
  mrr: number;
  churn_rate: number;
  churned_this_month: number;
  conversion_rate: number;
  paid_users: number;
  promo_users: number;
  active_paid_subs: number;
  revenue_by_plan: Record<string, number>;
  // Engagement
  active_week: number;
  active_month: number;
  retention_rate: number;
  retained_users: number;
  ai_by_day: { date: string; count: number }[];
  total_tokens: number;
  power_users: { user_id: string; prenom: string; plan: string; count: number }[];
  // Content
  drafts_this_month: number;
  calendar_posts_this_month: number;
  avg_content_score: number;
  drafts_by_canal: Record<string, number>;
  calendar_by_canal: Record<string, number>;
  content_usage_rate: number;
  // Branding
  score_distribution: Record<string, number>;
  // Demographics
  activity_types: Record<string, number>;
  levels: Record<string, number>;
  channel_popularity: Record<string, number>;
  ai_by_action_type: Record<string, number>;
  // Alerts
  near_limit_free: { user_id: string; prenom: string; credits_used: number }[];
  inactive_paid: { user_id: string; prenom: string; plan: string; last_sign_in: string | null }[];
  zombie_users_count: number;
}

type Section = "dashboard" | "business" | "engagement_product" | "users";

const sections: { key: Section; label: string; icon: React.ComponentType<any> }[] = [
  { key: "dashboard", label: "Tableau de bord", icon: BarChart3 },
  { key: "business", label: "Business", icon: Euro },
  { key: "engagement_product", label: "Engagement & Produit", icon: Activity },
  { key: "users", label: "Utilisatrices", icon: Target },
];

/* ── Main component ── */

export default function AdminStatsTab() {
  const { session } = useAuth();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("dashboard");

  const fetchStats = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await supabase.functions.invoke("admin-users?mode=stats", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: null,
      });
      if (res.error) {
        setError(res.error?.message || JSON.stringify(res.error));
      } else if (res.data) {
        setStats(res.data);
      }
    } catch (e: any) {
      setError(e?.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-6 text-center space-y-3">
        <p className="text-sm font-medium text-destructive">Impossible de charger les stats</p>
        <p className="text-xs text-muted-foreground break-all">Erreur : {error}</p>
        <Button variant="outline" size="sm" onClick={fetchStats}>
          <RefreshCw className="w-4 h-4 mr-1.5" /> Réessayer
        </Button>
      </div>
    );
  }

  if (loading || !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="flex flex-wrap items-center gap-2">
        {sections.map(s => {
          const Icon = s.icon;
          return (
            <Button
              key={s.key}
              variant={section === s.key ? "default" : "ghost"}
              size="sm"
              onClick={() => setSection(s.key)}
              className="gap-1.5"
            >
              <Icon className="w-4 h-4" />
              {s.label}
            </Button>
          );
        })}
        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Rafraîchir
          </Button>
        </div>
      </div>

      {/* Sections */}
      {section === "dashboard" && <OverviewSection stats={stats} />}
      {section === "business" && <BusinessSection stats={stats} />}
      {section === "engagement_product" && <EngagementProductSection stats={stats} />}
      {section === "users" && <DemographicsSection stats={stats} />}
    </div>
  );
}

/* ── Section placeholders ── */

function OverviewSection({ stats }: { stats: StatsData }) {
  const activeRate = stats.total_users > 0 ? Math.round((stats.active_this_month / stats.total_users) * 100) : 0;

  const signupsData = stats.signups_by_week.map(s => ({
    ...s,
    label: format(parseISO(s.week), "d MMM", { locale: fr }),
  }));

  const plansData = Object.entries(stats.plans)
    .filter(([, v]) => v > 0)
    .map(([plan, count]) => ({ plan, count, label: PLAN_LABELS[plan] || plan }));


  const mrrSub = Object.entries(stats.revenue_by_plan || {})
    .filter(([, v]) => v > 0)
    .map(([plan, amount]) => `${PLAN_LABELS[plan] || plan}: ${amount}€`)
    .join(" · ") || `${stats.paid_users} abonnées`;

  const estimatedCost = Math.round((stats.total_tokens || 0) * 0.000003);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Inscrites"
          value={stats.total_users}
          trend={stats.new_this_month - (stats.new_prev_month || 0)}
          sub={stats.new_this_month > 0 ? `+${stats.new_this_month} ce mois` : undefined}
          subColor="text-emerald-600"
        />
        <KpiCard
          title="Actives"
          value={stats.active_this_month}
          trend={stats.active_this_month - (stats.active_prev_month || 0)}
          sub={`${activeRate}% du total`}
          status={activeRate >= 30 ? "good" : activeRate >= 15 ? "warning" : "danger"}
        />
        <KpiCard
          title="MRR"
          value={stats.mrr}
          suffix="€"
          sub={mrrSub}
          subColor="text-emerald-600"
        />
        <KpiCard
          title="Onboarding"
          value={stats.onboarding_rate}
          suffix="%"
          sub={`${stats.onboarding_completed} sur ${stats.total_users}`}
        />
        <KpiCard
          title="Coût API estimé"
          value={estimatedCost}
          suffix="€"
          sub="ce mois"
        />
      </div>

      {/* Alerts panel */}
      <AlertsPanel stats={stats} />

      {/* Chart: Inscriptions par semaine */}
      <ChartCard title="Inscriptions par semaine">
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
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="count" stroke="#fb3d80" strokeWidth={2} fill="url(#signupFill)" name="Inscriptions" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Plan distribution badges */}
      <div className="flex flex-wrap gap-2">
        {plansData.map((p) => (
          <span
            key={p.plan}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white"
            style={{ backgroundColor: PLAN_COLORS[p.plan] || "#9CA3AF" }}
          >
            {p.label} {p.count}
          </span>
        ))}
      </div>

      {/* Top 5 power users */}
      <ChartCard title="Top 5 power users du mois">
        {(!stats.power_users || stats.power_users.length === 0) ? (
          <EmptyChart message="Pas encore d'activité" />
        ) : (
          <div className="space-y-2.5">
            {stats.power_users.slice(0, 5).map((pu, i) => (
              <div key={pu.user_id} className="flex items-center gap-3 py-1.5">
                <span className="text-xs font-mono text-muted-foreground w-5 text-right">{i + 1}.</span>
                {i < 3 ? <Crown className="w-4 h-4 text-amber-400" /> : <span className="w-4" />}
                <span className="text-sm font-medium flex-1 truncate">{pu.prenom}</span>
                <Badge variant="outline" className="text-xs" style={{ borderColor: PLAN_COLORS[pu.plan] || "#9CA3AF" }}>
                  {PLAN_LABELS[pu.plan] || pu.plan}
                </Badge>
                <span className="text-sm text-muted-foreground font-medium tabular-nums">{pu.count} <span className="text-xs">gén.</span></span>
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  );
}

function BusinessSection({ stats }: { stats: StatsData }) {

  const revenueData = Object.entries(stats.revenue_by_plan || {})
    .filter(([, v]) => v > 0)
    .map(([plan, amount]) => ({ plan, amount, label: PLAN_LABELS[plan] || plan }));

  const paidPlansSub = Object.entries(stats.plans || {})
    .filter(([plan, count]) => plan !== "free" && count > 0)
    .map(([plan, count]) => `${count} ${PLAN_LABELS[plan] || plan}`)
    .join(" · ");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard title="MRR" value={stats.mrr} suffix="€" sub={`ARR : ${(stats.mrr * 12).toLocaleString("fr")}€`} subColor="text-emerald-600" />
        <KpiCard title="Abonnées payantes" value={stats.paid_users} sub={paidPlansSub || `${stats.conversion_rate}% de conversion`} />
        <KpiCard title="Taux de churn" value={stats.churn_rate} suffix="%" sub={`${stats.churned_this_month} départ·s ce mois`} subColor={stats.churn_rate > 10 ? "text-red-500" : undefined} status={stats.churn_rate <= 5 ? "good" : stats.churn_rate <= 10 ? "warning" : "danger"} />
        <KpiCard title="Conversion free→payant" value={stats.conversion_rate} suffix="%" status={stats.conversion_rate >= 5 ? "good" : stats.conversion_rate >= 2 ? "warning" : "danger"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Revenus par plan (MRR)">
          {revenueData.length === 0 ? (
            <EmptyChart message="Pas encore de revenus" />
          ) : (
            <div className="flex flex-wrap gap-4">
              {revenueData.map((entry) => (
                <div key={entry.plan} className="flex items-center gap-3 rounded-lg border bg-background p-4 min-w-[140px]">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PLAN_COLORS[entry.plan] || "#9CA3AF" }} />
                  <div>
                    <p className="text-xs text-muted-foreground">{entry.label}</p>
                    <p className="text-lg font-bold font-display">{entry.amount}<span className="text-xs font-normal text-muted-foreground">€/mois</span></p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Funnel de conversion">
          <div className="space-y-4 py-4">
            <FunnelStep label="Inscrites totales" value={stats.total_users} max={stats.total_users} color="#9CA3AF" />
            <FunnelStep label="Onboarding terminé" value={stats.onboarding_completed} max={stats.total_users} color="#8B5CF6" />
            <FunnelStep label="Actives ce mois (IA)" value={stats.active_this_month} max={stats.total_users} color="#F59E0B" />
            <FunnelStep label="Abonnées payantes" value={stats.paid_users} max={stats.total_users} color="#fb3d80" />
          </div>
          {(stats.promo_users || 0) > 0 && (
            <div className="text-xs text-muted-foreground mt-3 pt-3 border-t">
              Accès promo (hors funnel) : {stats.promo_users}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function EngagementProductSection({ stats }: { stats: StatsData }) {
  const PLAN_COLORS: Record<string, string> = {
    free: "#9CA3AF", outil: "#8B5CF6", binome: "#fb3d80", pro: "#3B82F6",
  };

  const aiDayData = (stats.ai_by_day || []).map(d => ({
    ...d,
    label: format(parseISO(d.date), "d MMM", { locale: fr }),
  }));

  const draftsData = Object.entries(stats.drafts_by_canal || {})
    .filter(([, v]) => v > 0)
    .map(([canal, count]) => ({ canal, count, label: CANAL_LABELS[canal] || canal }))
    .sort((a, b) => b.count - a.count);

  const scoreDistData = Object.entries(stats.score_distribution || {})
    .map(([range, count], i) => ({ range, count, fill: PIE_COLORS[i % PIE_COLORS.length] }));

  const maxFeature = Math.max(...stats.top_features.map(f => f.count), 1);

  const totalContent = (stats.drafts_this_month || 0) + (stats.calendar_posts_this_month || 0);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard title="Rétention" value={stats.retention_rate} suffix="%" sub={`${stats.retained_users} revenues du mois dernier`} subColor={stats.retention_rate >= 50 ? "text-emerald-600" : "text-amber-500"} status={stats.retention_rate >= 50 ? "good" : stats.retention_rate >= 30 ? "warning" : "danger"} />
        <KpiCard title="Contenus générés" value={totalContent} sub={`${stats.drafts_this_month} brouillons · ${stats.calendar_posts_this_month} planifiés`} />
        <KpiCard title="Contenus → planifiés" value={stats.content_usage_rate || 0} suffix="%" sub={`${stats.calendar_posts_this_month} planifiés sur ${stats.drafts_this_month} générés`} subColor={(stats.content_usage_rate || 0) >= 50 ? "text-emerald-600" : (stats.content_usage_rate || 0) >= 25 ? "text-amber-500" : "text-red-500"} />
        <KpiCard title="Générations IA" value={stats.ai_total_this_month} trend={stats.ai_total_this_month - (stats.ai_total_prev_month || 0)} sub="ce mois" />
      </div>

      {/* Activité IA quotidienne */}
      <ChartCard title="Activité IA quotidienne (30 jours)">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={aiDayData}>
            <defs>
              <linearGradient id="aiDayFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} interval={4} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="count" stroke="#8B5CF6" strokeWidth={2} fill="url(#aiDayFill)" name="Générations IA" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Power users */}
      <ChartCard title="Power users ce mois">
        {(!stats.power_users || stats.power_users.length === 0) ? (
          <EmptyChart message="Pas encore d'activité ce mois" />
        ) : (
          <div className="space-y-2.5">
            {stats.power_users.map((pu, i) => (
              <div key={pu.user_id} className="flex items-center gap-3 py-1.5">
                <span className="text-xs font-mono text-muted-foreground w-5 text-right">{i + 1}.</span>
                {i < 3 ? <Crown className="w-4 h-4 text-amber-400" /> : <span className="w-4" />}
                <span className="text-sm font-medium flex-1 truncate">{pu.prenom}</span>
                <Badge variant="outline" className="text-xs" style={{ borderColor: PLAN_COLORS[pu.plan] || "#9CA3AF" }}>
                  {PLAN_LABELS[pu.plan] || pu.plan}
                </Badge>
                <span className="text-sm text-muted-foreground font-medium tabular-nums">{pu.count} <span className="text-xs">générations</span></span>
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      {/* Brouillons par canal + Distribution scores branding */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Brouillons par canal">
          {draftsData.length === 0 ? (
            <EmptyChart message="Aucun brouillon ce mois" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={draftsData} layout="vertical" barCategoryGap={8}>
                <XAxis type="number" hide />
                <YAxis dataKey="label" type="category" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="#fb3d80" name="Brouillons" label={{ position: "right", fontSize: 12, fill: "hsl(var(--foreground))" }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Distribution scores branding">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={scoreDistData} barCategoryGap={12}>
              <XAxis dataKey="range" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Utilisatrices">
                {scoreDistData.map((entry) => (
                  <Cell key={entry.range} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Détail fonctionnalités IA (toutes) */}
      <ChartCard title="Détail fonctionnalités IA (toutes)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {stats.top_features.map(f => (
            <div key={f.category} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{CATEGORY_LABELS[f.category] || f.category}</span>
                <span className="text-muted-foreground font-medium">{f.count}</span>
              </div>
              <Progress value={(f.count / maxFeature) * 100} className="h-1.5" />
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}

function AlertsPanel({ stats }: { stats: StatsData }) {
  const now = new Date();
  const dayOfMonth = now.getDate();

  const alerts: React.ReactNode[] = [];

  // a) Inactive paid users
  if (stats.inactive_paid && stats.inactive_paid.length > 0) {
    alerts.push(
      <div key="inactive-paid" className="flex gap-3 rounded-lg border-l-4 border-l-red-500 bg-red-500/5 p-4">
        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">{stats.inactive_paid.length} abonnée(s) payante(s) inactive(s) depuis 14j</p>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.inactive_paid.map(u => `${u.prenom} (${PLAN_LABELS[u.plan] || u.plan})`).join(", ")}
          </p>
        </div>
      </div>
    );
  }

  // b) Free users near limit
  if (stats.near_limit_free && stats.near_limit_free.length > 0) {
    alerts.push(
      <div key="near-limit" className="flex gap-3 rounded-lg border-l-4 border-l-amber-500 bg-amber-500/5 p-4">
        <Zap className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">{stats.near_limit_free.length} utilisatrice(s) free proche(s) de la limite (7+/10 crédits)</p>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.near_limit_free.map(u => `${u.prenom} (${u.credits_used} crédits)`).join(", ")}
          </p>
        </div>
      </div>
    );
  }

  // c) Zombie users
  if (stats.zombie_users_count > 0) {
    alerts.push(
      <div key="zombie" className="flex gap-3 rounded-lg border-l-4 border-l-gray-400 bg-gray-500/5 p-4">
        <UserX className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">{stats.zombie_users_count} inscrite(s) sans activité après 7 jours</p>
        </div>
      </div>
    );
  }

  // d) No signups this month after the 7th
  if (stats.new_this_month === 0 && dayOfMonth > 7) {
    alerts.push(
      <div key="no-signups" className="flex gap-3 rounded-lg border-l-4 border-l-amber-500 bg-amber-500/5 p-4">
        <TrendingDown className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">Aucune nouvelle inscription ce mois</p>
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-500/5 p-3 text-center">
        <p className="text-sm text-emerald-600">✓ Tout va bien — aucune alerte</p>
      </div>
    );
  }

  return <div className="space-y-3">{alerts}</div>;
}

function DemographicsSection({ stats }: { stats: StatsData }) {
  const activityData = Object.entries(stats.activity_types || {})
    .filter(([k]) => k !== "non renseigné")
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  const activityTotal = activityData.reduce((s, d) => s + d.count, 0);

  const levelsData = Object.entries(stats.levels || {})
    .filter(([k]) => k !== "non renseigné")
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => b.count - a.count);

  const channelData = Object.entries(stats.channel_popularity || {})
    .map(([canal, count]) => ({ canal, count, label: CANAL_LABELS[canal] || canal }))
    .sort((a, b) => b.count - a.count);
  const maxChannel = Math.max(...channelData.map(c => c.count), 1);

  const LEVEL_COLORS = ["#8B5CF6", "#A78BFA", "#C4B5FD", "#DDD6FE"];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Type d'activité">
          {activityData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune donnée</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {activityData.map((d, i) => {
                const pct = activityTotal > 0 ? Math.round((d.count / activityTotal) * 100) : 0;
                return (
                  <span
                    key={d.type}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white"
                    style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                  >
                    {d.type} ({d.count}{pct > 5 ? ` · ${pct}%` : ""})
                  </span>
                );
              })}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Niveau déclaré">
          {levelsData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune donnée</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {levelsData.map((d, i) => (
                <span
                  key={d.level}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: LEVEL_COLORS[i % LEVEL_COLORS.length],
                    color: i < 2 ? "white" : "#1f2937",
                  }}
                >
                  {d.level} ({d.count})
                </span>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Canaux utilisés par les utilisatrices">
        {channelData.length === 0 ? (
          <EmptyChart message="Aucune donnée" />
        ) : (
          <div className="space-y-3">
            {channelData.map(c => (
              <div key={c.canal} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{c.label}</span>
                  <span className="text-muted-foreground font-medium">{c.count} utilisatrices</span>
                </div>
                <Progress value={(c.count / maxChannel) * 100} className="h-1.5" />
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  );
}

/* ── Shared utility components ── */

function KpiCard({ title, value, suffix, sub, subColor, trend, status }: {
  title: string;
  value: number;
  suffix?: string;
  sub?: string;
  subColor?: string;
  trend?: number;
  status?: "good" | "warning" | "danger";
}) {
  const statusBorder = status === "good" ? "border-l-4 border-l-emerald-500" : status === "warning" ? "border-l-4 border-l-amber-500" : status === "danger" ? "border-l-4 border-l-red-500" : "";
  return (
    <div className={`rounded-xl border bg-card p-5 flex flex-col gap-1 ${statusBorder}`}>
      <p className="text-xs text-muted-foreground">{title}</p>
      <div className="flex items-baseline gap-1.5">
        <p className="text-2xl font-bold font-display">{value.toLocaleString("fr")}{suffix && <span className="text-sm font-normal text-muted-foreground">{suffix}</span>}</p>
        {trend !== undefined && trend !== 0 && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${trend > 0 ? "text-emerald-600" : "text-red-500"}`}>
            {trend > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {trend > 0 ? "+" : ""}{trend}
          </span>
        )}
      </div>
      {sub && <p className={`text-xs ${subColor || "text-muted-foreground"}`}>{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold mb-4">{title}</h3>
      {children}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function FunnelStep({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground font-medium">{value} <span className="text-xs">({pct}%)</span></span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}



const ProgressRing = forwardRef<HTMLDivElement, { value: number }>(({ value }, ref) => {
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(value, 100) / 100) * c;
  return (
    <div ref={ref} className="relative w-32 h-32">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${dash} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold">{value}%</span>
      </div>
    </div>
  );
});