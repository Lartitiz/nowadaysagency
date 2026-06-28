import { useState, useEffect, useCallback } from "react";
import { format, parseISO, isValid } from "date-fns";
import { fr } from "date-fns/locale";

/** Formatte une date ISO en libellé court, sans crasher si la valeur est nulle/invalide. */
function safeDateLabel(value?: string): string {
  if (!value) return "—";
  const d = parseISO(value);
  return isValid(d) ? format(d, "d MMM", { locale: fr }) : value;
}
import { useAuth } from "@/contexts/AuthContext";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
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
  free: "#9CA3AF", outil: "#8B5CF6", binome: "hsl(var(--primary))", pro: "#3B82F6",
};

const PIE_COLORS = ["hsl(var(--primary))", "#8B5CF6", "#F59E0B", "#3B82F6", "#10B981", "#6366F1", "#EC4899"];

const CANAL_LABELS: Record<string, string> = {
  instagram: "Instagram", linkedin: "LinkedIn", pinterest: "Pinterest",
  newsletter: "Newsletter", blog: "Blog", autre: "Autre",
};

const CATEGORY_LABELS: Record<string, string> = {
  content: "Contenus", audit: "Audits", dm_comment: "DM & Commentaires",
  bio_profile: "Bio & Profil", suggestion: "Suggestions", import: "Import", adaptation: "Adaptations",
};

const tooltipStyle = { borderRadius: 8, fontSize: 13, border: "1px solid hsl(var(--border))" };

/* ── Coût API ── */

/**
 * Coût estimé en €/token, indexé sur les tarifs de SORTIE par modèle.
 * `tokens_used` = input + output ; appliquer le tarif de sortie au total
 * surestime un peu (l'input est moins cher) → borne HAUTE volontaire, idéale
 * pour caler un plafond Premium prudent. Bien plus fiable que l'ancien taux
 * plat de 3 $/M qui ignorait l'écart Opus (~75 $/M) vs Haiku (~5 $/M).
 */
const MODEL_COST_PER_TOKEN: { match: RegExp; rate: number }[] = [
  { match: /opus/i, rate: 0.00007 },          // ~75 $/M
  { match: /sonnet/i, rate: 0.000014 },       // ~15 $/M
  { match: /haiku/i, rate: 0.000005 },        // ~5 $/M
  { match: /gemini.*flash/i, rate: 0.0000004 }, // gateway Lovable, scoring/suggestions (~0,3 $/M)
];
const DEFAULT_COST_PER_TOKEN = 0.000014; // modèle inconnu / gateway → tarif Sonnet

/** Coût API estimé du mois, pondéré par modèle quand la ventilation est dispo. */
function estimateApiCost(stats: StatsData): number {
  const byModel = stats.tokens_by_model;
  let cost: number;
  if (byModel && Object.keys(byModel).length > 0) {
    cost = Object.entries(byModel).reduce((sum, [model, tokens]) => {
      const rule = MODEL_COST_PER_TOKEN.find(r => r.match.test(model));
      return sum + tokens * (rule?.rate ?? DEFAULT_COST_PER_TOKEN);
    }, 0);
  } else {
    // Fallback tant que l'edge n'est pas redéployée (pas de ventilation par modèle).
    cost = (stats.total_tokens || 0) * DEFAULT_COST_PER_TOKEN;
  }
  return Math.round(cost * 100) / 100;
}

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
  /** Tokens (input+output) ventilés par modèle, pour pondérer le coût. Absent tant que l'edge n'est pas redéployée. */
  tokens_by_model?: Record<string, number>;
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
  // Activation & adoption (peuvent être absents tant que l'edge function n'est pas redéployée)
  activation_funnel?: { step: string; count: number }[];
  feature_adoption?: { category: string; users: number; rate: number }[];
  published_this_month?: number;
  published_total?: number;
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
      const res = await invokeWithTimeout("admin-users?mode=stats", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: null,
      }, 30000);
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

  const signupsData = (stats.signups_by_week || []).map(s => ({
    ...s,
    label: safeDateLabel(s.week),
  }));

  const plansData = Object.entries(stats.plans)
    .filter(([, v]) => v > 0)
    .map(([plan, count]) => ({ plan, count, label: PLAN_LABELS[plan] || plan }));


  const mrrSub = Object.entries(stats.revenue_by_plan || {})
    .filter(([, v]) => v > 0)
    .map(([plan, amount]) => `${PLAN_LABELS[plan] || plan}: ${amount}€`)
    .join(" · ") || `${stats.paid_users} abonnées`;

  // Coût pondéré par modèle (cf. estimateApiCost) : Opus pèse ~5× Haiku.
  const estimatedCost = estimateApiCost(stats);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Inscrites"
          value={stats.total_users}
          trend={stats.new_this_month - (stats.new_prev_month || 0)}
          sub={stats.new_this_month > 0 ? `+${stats.new_this_month} ce mois` : undefined}
          subColor="text-success"
        />
        <KpiCard
          title="Actives (ont créé)"
          value={stats.active_this_month}
          trend={stats.active_this_month - (stats.active_prev_month || 0)}
          sub={`${activeRate}% ont généré ce mois`}
          status={activeRate >= 30 ? "good" : activeRate >= 15 ? "warning" : "danger"}
        />
        <KpiCard
          title="MRR"
          value={stats.mrr}
          suffix="€"
          sub={mrrSub}
          subColor="text-success"
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

      {/* Tunnel d'activation : où les inscrites décrochent jusqu'à la publication */}
      {stats.activation_funnel && stats.activation_funnel.length > 0 && (
        <ChartCard title="Tunnel d'activation (jusqu'à la publication)">
          <div className="space-y-3">
            {stats.activation_funnel.map((s, i) => {
              const top = stats.activation_funnel![0]?.count || 1;
              const prev = i > 0 ? stats.activation_funnel![i - 1].count : s.count;
              const pctTotal = Math.round((s.count / top) * 100);
              const pctPrev = prev > 0 ? Math.round((s.count / prev) * 100) : 100;
              return (
                <div key={s.step}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{s.step}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {s.count} · {pctTotal}%
                      {i > 0 && pctPrev < 100 && <span className="text-error"> (−{100 - pctPrev}% vs étape préc.)</span>}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pctTotal}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      )}

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
            <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#signupFill)" name="Inscriptions" />
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
                {i < 3 ? <Crown className="w-4 h-4 text-warning" /> : <span className="w-4" />}
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
        <KpiCard title="MRR" value={stats.mrr} suffix="€" sub={`ARR : ${(stats.mrr * 12).toLocaleString("fr")}€`} subColor="text-success" />
        <KpiCard title="Abonnées payantes" value={stats.paid_users} sub={paidPlansSub || `${stats.conversion_rate}% de conversion`} />
        <KpiCard title="Taux de churn" value={stats.churn_rate} suffix="%" sub={`${stats.churned_this_month} départ·s ce mois`} subColor={stats.churn_rate > 10 ? "text-error" : undefined} status={stats.churn_rate <= 5 ? "good" : stats.churn_rate <= 10 ? "warning" : "danger"} />
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
            <FunnelStep label="Abonnées payantes" value={stats.paid_users} max={stats.total_users} color="hsl(var(--primary))" />
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

  const aiDayData = (stats.ai_by_day || []).map(d => ({
    ...d,
    label: safeDateLabel(d.date),
  }));

  const draftsData = Object.entries(stats.drafts_by_canal || {})
    .filter(([, v]) => v > 0)
    .map(([canal, count]) => ({ canal, count, label: CANAL_LABELS[canal] || canal }))
    .sort((a, b) => b.count - a.count);

  const scoreDistData = Object.entries(stats.score_distribution || {})
    .map(([range, count], i) => ({ range, count, fill: PIE_COLORS[i % PIE_COLORS.length] }));

  const topFeatures = stats.top_features || [];
  const maxFeature = Math.max(...topFeatures.map(f => f.count), 1);

  const totalContent = (stats.drafts_this_month || 0) + (stats.calendar_posts_this_month || 0);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard title="Rétention" value={stats.retention_rate} suffix="%" sub={`${stats.retained_users} revenues du mois dernier`} subColor={stats.retention_rate >= 50 ? "text-success" : "text-warning"} status={stats.retention_rate >= 50 ? "good" : stats.retention_rate >= 30 ? "warning" : "danger"} />
        <KpiCard title="Contenus générés" value={totalContent} sub={`${stats.drafts_this_month} brouillons · ${stats.calendar_posts_this_month} planifiés`} />
        <KpiCard title="Publiés ce mois" value={stats.published_this_month ?? 0} sub={stats.published_total !== undefined ? `${stats.published_total} au total` : "publications réelles"} subColor={(stats.published_this_month ?? 0) > 0 ? "text-success" : undefined} />
        <KpiCard title="Planifiés / générés" value={stats.content_usage_rate || 0} suffix="%" sub={`${stats.calendar_posts_this_month} planifiés · ${stats.drafts_this_month} générés (indicatif)`} subColor={(stats.content_usage_rate || 0) >= 50 ? "text-success" : (stats.content_usage_rate || 0) >= 25 ? "text-warning" : "text-error"} />
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
                {i < 3 ? <Crown className="w-4 h-4 text-warning" /> : <span className="w-4" />}
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
                <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="hsl(var(--primary))" name="Brouillons" label={{ position: "right", fontSize: 12, fill: "hsl(var(--foreground))" }} />
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

      {/* Adoption par fonctionnalité : combien de clientes DISTINCTES utilisent chaque brique (largeur, pas volume) */}
      {stats.feature_adoption && stats.feature_adoption.length > 0 && (
        <ChartCard title="Adoption par fonctionnalité (clientes distinctes)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {stats.feature_adoption.map(f => (
              <div key={f.category} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{CATEGORY_LABELS[f.category] || f.category}</span>
                  <span className="text-muted-foreground font-medium">{f.users} <span className="text-xs">({f.rate}%)</span></span>
                </div>
                <Progress value={f.rate} className="h-1.5" />
              </div>
            ))}
          </div>
        </ChartCard>
      )}

      {/* Détail fonctionnalités IA (toutes) — volume de générations */}
      <ChartCard title="Détail fonctionnalités IA (volume de générations)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {topFeatures.map(f => (
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
      <div key="inactive-paid" className="flex gap-3 rounded-lg border-l-4 border-l-error bg-error/5 p-4">
        <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" />
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
      <div key="near-limit" className="flex gap-3 rounded-lg border-l-4 border-l-warning bg-warning/5 p-4">
        <Zap className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">{stats.near_limit_free.length} utilisatrice(s) free proche(s) de la limite (48+/60 crédits)</p>
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
      <div key="no-signups" className="flex gap-3 rounded-lg border-l-4 border-l-warning bg-warning/5 p-4">
        <TrendingDown className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">Aucune nouvelle inscription ce mois</p>
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-center">
        <p className="text-sm text-success">✓ Tout va bien — aucune alerte</p>
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
  const statusBorder = status === "good" ? "border-l-4 border-l-success" : status === "warning" ? "border-l-4 border-l-warning" : status === "danger" ? "border-l-4 border-l-error" : "";
  return (
    <div className={`rounded-xl border bg-card p-5 flex flex-col gap-1 ${statusBorder}`}>
      <p className="text-xs text-muted-foreground">{title}</p>
      <div className="flex items-baseline gap-1.5">
        <p className="text-2xl font-bold font-display">{(value ?? 0).toLocaleString("fr")}{suffix && <span className="text-sm font-normal text-muted-foreground">{suffix}</span>}</p>
        {trend !== undefined && trend !== 0 && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${trend > 0 ? "text-success" : "text-error"}`}>
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
