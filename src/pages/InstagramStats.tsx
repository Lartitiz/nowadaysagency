import { useState, useEffect, useMemo, useCallback } from "react";
import { LocalErrorBoundary } from "@/components/LocalErrorBoundary";
import { Link } from "react-router-dom";
import { useWorkspaceFilter, useWorkspaceId, useIsOwnSpace } from "@/hooks/use-workspace-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, RefreshCw, Settings, Plus, Trash2, ChevronRight } from "lucide-react";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import ExcelImportDialog from "@/components/stats/ExcelImportDialog";
import StatsPeriodSelector from "@/components/stats/StatsPeriodSelector";
import StatsOverview from "@/components/stats/StatsOverview";
import StatsCharts from "@/components/stats/StatsCharts";
import StatsForm from "@/components/stats/StatsForm";

import { SkeletonCard } from "@/components/ui/skeleton-card";

import {
  MONTHS_FR, monthKey, monthLabel, monthLabelShort,
  pctChange, fmt, fmtPct, fmtEur, safeDivPct, safeDiv,
} from "@/lib/stats-helpers";

import {
  type StatsRow, type StatsConfig, type PeriodPreset, type DashboardKPIs,
  getPeriodRange, BUSINESS_PRESETS, ALL_TRAFFIC_SOURCES, WEBSITE_PLATFORMS,
} from "@/components/stats/stats-types";

/* ═══════════════════════════════════════════════
   MAIN PAGE — orchestrator
   ═══════════════════════════════════════════════ */

export default function InstagramStats() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const isOwnSpace = useIsOwnSpace();

  const now = useMemo(() => new Date(), []);
  const currentMonthDate = useMemo(() => monthKey(now), [now]);
  // Convertit les codes pays ISO (FR) en noms lisibles (France) pour l'encart audience.
  const countryNames = useMemo(() => new Intl.DisplayNames(["fr"], { type: "region" }), []);

  /* ── State ── */
  const [allStats, setAllStats] = useState<StatsRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthDate);
  const [formData, setFormData] = useState<StatsRow>({});
  const [formId, setFormId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Connexion Instagram + récupération auto des stats via l'API (instagram-insights-fetch).
  const [igConnected, setIgConnected] = useState(false);
  const [fetchingLive, setFetchingLive] = useState(false);
  const [audience, setAudience] = useState<{ age?: any[]; gender?: any[]; cities?: any[]; countries?: any[] } | null>(null);
  const [livePosts, setLivePosts] = useState<{ top: any[]; flop: any[] } | null>(null);

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("3_months");
  const [customFrom, setCustomFrom] = useState(() => monthKey(new Date(now.getFullYear(), now.getMonth() - 5, 1)));
  const [customTo, setCustomTo] = useState(currentMonthDate);

  const [config, setConfig] = useState<StatsConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);

  const [draftConfig, setDraftConfig] = useState<StatsConfig>({
    website_platform: null, uses_ga4: false,
    traffic_sources: ["search", "social", "pinterest", "instagram"],
    sales_pages: [], business_type: null,
    business_metrics: ["discovery_calls", "clients_signed", "revenue", "ad_budget"],
    launch_metrics: ["signups", "launch_dms", "link_clicks", "story_views", "conversions"],
    custom_metrics: [],
  });

  /* ── Data loaders ── */
  const loadConfig = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await (supabase.from("stats_config" as any) as any)
        .select("*").eq(column, value)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      let cfg = (data as any as StatsConfig) || null;
      // Reprise des configs d'avant les espaces : sauvées sans workspace_id, elles
      // étaient invisibles au filtre workspace → l'onboarding revenait à chaque
      // visite. On rattache la plus récente à l'espace propre, une fois pour toutes.
      if (!cfg && column === "workspace_id" && isOwnSpace) {
        const { data: legacy } = await (supabase.from("stats_config" as any) as any)
          .select("*").eq("user_id", user.id).is("workspace_id", null)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (legacy) {
          cfg = legacy as any as StatsConfig;
          const { error: adoptErr } = await (supabase.from("stats_config" as any) as any)
            .update({ workspace_id: value }).eq("id", (legacy as any).id);
          if (adoptErr) console.error("Rattachement config legacy échoué:", adoptErr);
        }
      }
      if (cfg) {
        setConfig(cfg); setDraftConfig(cfg);
      } else {
        setShowOnboarding(true);
      }
    } catch (e) {
      console.error("Erreur chargement config stats:", e);
      toast.error("Impossible de charger ta configuration", { description: "Réessaie dans un instant." });
    } finally {
      setConfigLoaded(true);
    }
  }, [user?.id, column, value, isOwnSpace]);

  const loadStats = useCallback(async () => {
    if (!user) return;
    // Reprise des stats d'avant les espaces et des imports Excel orphelins
    // (workspace_id null → invisibles au filtre workspace) : on les rattache à
    // l'espace propre, sauf si le mois existe déjà côté workspace (pas de doublon).
    if (column === "workspace_id" && isOwnSpace) {
      const { data: legacy } = await (supabase.from("monthly_stats" as any) as any)
        .select("id, month_date").eq("user_id", user.id).is("workspace_id", null);
      if (legacy?.length) {
        const { data: wsRows } = await (supabase.from("monthly_stats" as any) as any)
          .select("month_date").eq("workspace_id", value);
        const taken = new Set((wsRows || []).map((r: any) => r.month_date));
        const toAdopt = (legacy as any[]).filter(r => !taken.has(r.month_date)).map(r => r.id);
        if (toAdopt.length) {
          const { error: adoptErr } = await (supabase.from("monthly_stats" as any) as any)
            .update({ workspace_id: value }).in("id", toAdopt);
          if (adoptErr) console.error("Rattachement stats legacy échoué:", adoptErr);
        }
      }
    }
    const { data } = await (supabase.from("monthly_stats" as any) as any)
      .select("*").eq(column, value).order("month_date", { ascending: false });
    const rows = (data || []) as StatsRow[];
    setAllStats(rows);
    if (rows.length >= 2) { setCompareA(rows[0].month_date); setCompareB(rows[1].month_date); }
    else if (rows.length === 1) { setCompareA(rows[0].month_date); }
  }, [user?.id, column, value, isOwnSpace]);

  useEffect(() => { loadConfig(); loadStats(); }, [loadConfig, loadStats]);

  // Sait si un compte Instagram est connecté (pour proposer le remplissage auto).
  useEffect(() => {
    if (!user) return;
    supabase.functions.invoke("social-status", {
      body: { workspace_id: workspaceId !== user.id ? workspaceId : undefined },
    }).then(({ data }) => {
      const conns = (data as any)?.connections || [];
      setIgConnected(conns.some((c: any) => c.platform === "instagram" && c.connected));
    }).catch(() => { /* non bloquant */ });
  }, [user?.id, workspaceId]);

  useEffect(() => {
    const row = allStats.find(s => s.month_date === selectedMonth);
    if (row) { setFormData(row); setFormId(row.id); setAiAnalysis(row.ai_analysis || ""); }
    else { setFormData({}); setFormId(null); setAiAnalysis(""); }
  }, [selectedMonth, allStats]);

  // Ré-affiche au chargement les derniers snapshots persistés (audience, top/flop).
  // Avant, ces encarts ne vivaient que dans le state après un clic « Remplir
  // depuis Instagram » et disparaissaient au rechargement de la page.
  useEffect(() => {
    if (!audience) {
      const withAud = allStats.find(s => (s.custom_data as any)?.ig_audience);
      if (withAud) setAudience((withAud.custom_data as any).ig_audience);
    }
    if (!livePosts) {
      const withPosts = allStats.find(s => (s.custom_data as any)?.ig_top_posts);
      const tp = withPosts ? (withPosts.custom_data as any).ig_top_posts : null;
      if (tp && (tp.top?.length || tp.flop?.length)) {
        setLivePosts({ top: tp.top || [], flop: tp.flop || [] });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStats]);

  /* ── Derived ── */
  const periodRange = useMemo(() => {
    if (periodPreset === "custom") return { from: customFrom, to: customTo };
    return getPeriodRange(periodPreset, now);
  }, [periodPreset, customFrom, customTo, now]);

  const periodStats = useMemo(() =>
    allStats.filter(s => s.month_date >= periodRange.from && s.month_date <= periodRange.to)
      .sort((a, b) => a.month_date.localeCompare(b.month_date)),
  [allStats, periodRange]);

  const isSingleMonth = periodRange.from === periodRange.to;

  const dashboardKPIs = useMemo<DashboardKPIs | null>(() => {
    if (periodStats.length === 0) return null;
    const last = periodStats[periodStats.length - 1];
    const followers = last.followers;
    // Moyenne sur les mois RENSEIGNÉS : diviser par tous les mois comptait les
    // mois vides comme des zéros et sous-estimait la portée moyenne.
    const reachMonths = periodStats.filter(r => r.reach != null && r.reach > 0);
    const avgReach = reachMonths.length
      ? reachMonths.reduce((s, r) => s + (r.reach || 0), 0) / reachMonths.length
      : 0;

    // Weighted engagement rate by reach: Σ(accounts_engaged) / Σ(reach).
    // Fallback to interactions if accounts_engaged isn't filled in (legacy data).
    const totalReach = periodStats.reduce((s, r) => s + (r.reach || 0), 0);
    const totalEngaged = periodStats.reduce(
      (s, r) => s + (r.accounts_engaged ?? r.interactions ?? 0),
      0,
    );
    const avgEngagement = totalReach > 0 ? (totalEngaged / totalReach) * 100 : 0;

    // Engagement by followers (Σ interactions / followers du dernier mois × 100, moyenné).
    const totalInteractions = periodStats.reduce((s, r) => s + (r.interactions || 0), 0);
    const engagementByFollowers = followers && followers > 0
      ? (totalInteractions / periodStats.length / followers) * 100
      : null;

    // Net growth: somme des followers_gained − followers_lost sur la période.
    const totalGained = periodStats.reduce((s, r) => s + (r.followers_gained || 0), 0);
    const totalLost = periodStats.reduce((s, r) => s + (r.followers_lost || 0), 0);
    const netGrowth = totalGained - totalLost;

    const periodMonths = periodStats.length;
    const prevStats = allStats
      .filter(s => s.month_date < periodRange.from)
      .sort((a, b) => b.month_date.localeCompare(a.month_date))
      .slice(0, periodMonths).reverse();

    const prevFollowers = prevStats.length > 0 ? prevStats[prevStats.length - 1]?.followers : null;
    const prevReachMonths = prevStats.filter(r => r.reach != null && r.reach > 0);
    const prevAvgReach = prevReachMonths.length
      ? prevReachMonths.reduce((s, r) => s + (r.reach || 0), 0) / prevReachMonths.length
      : null;

    const prevTotalReach = prevStats.reduce((s, r) => s + (r.reach || 0), 0);
    const prevTotalEngaged = prevStats.reduce((s, r) => s + (r.accounts_engaged ?? r.interactions ?? 0), 0);
    const prevAvgEngagement = prevStats.length > 0 && prevTotalReach > 0
      ? (prevTotalEngaged / prevTotalReach) * 100
      : null;

    const prevNetGrowth = prevStats.length > 0
      ? prevStats.reduce((s, r) => s + (r.followers_gained || 0) - (r.followers_lost || 0), 0)
      : null;

    return {
      followers, avgReach: Math.round(avgReach), avgEngagement, engagementByFollowers, netGrowth,
      changeFollowers: pctChange(followers, prevFollowers),
      changeReach: pctChange(avgReach, prevAvgReach),
      changeEngagement: pctChange(avgEngagement, prevAvgEngagement),
      changeNetGrowth: pctChange(netGrowth, prevNetGrowth),
      followersGained: isSingleMonth ? last.followers_gained : null,
    };
  }, [periodStats, allStats, periodRange, isSingleMonth]);

  const activeConfig = config || draftConfig;

  // « Non renseigné » ≠ « zéro » : un mois sans donnée reste null (Recharts saute
  // le point) au lieu de tracer une fausse chute à 0 dans les courbes.
  const chartData = useMemo(() =>
    periodStats.map(s => {
      const engaged = s.accounts_engaged ?? s.interactions ?? null;
      const eng = engaged != null && s.reach && s.reach > 0 ? (engaged / s.reach) * 100 : null;
      const engFollowers = s.followers && s.followers > 0 && s.interactions != null
        ? (s.interactions / s.followers) * 100
        : null;
      const gained = s.followers_gained ?? null;
      const lost = s.followers_lost != null ? -s.followers_lost : null;
      return {
        month: monthLabelShort(s.month_date),
        followers: s.followers ?? null,
        reach: s.reach ?? null,
        engagement: eng,
        engagement_followers: engFollowers,
        profile_visits: s.profile_visits ?? null,
        website_clicks: s.website_clicks ?? null,
        gained,
        lost,
        net: gained != null || lost != null ? (gained ?? 0) + (lost ?? 0) : null,
        ...(activeConfig.traffic_sources || ["search", "social", "pinterest", "instagram"]).reduce((acc, src) => {
          if (s.website_data && typeof s.website_data === "object" && s.website_data.sources) {
            acc[`traffic_${src}`] = s.website_data.sources[src] ?? (s as any)[`traffic_${src}`] ?? null;
          } else {
            acc[`traffic_${src}`] = (s as any)[`traffic_${src}`] ?? null;
          }
          return acc;
        }, {} as Record<string, number | null>),
      };
    })
  , [periodStats, config]);

  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({ value: monthKey(d), label: monthLabel(monthKey(d)) });
    }
    return options;
  }, [now]);

  /* ── Handlers ── */
  const handleChange = useCallback((field: string, value: string, isText = false) => {
    setFormData(prev => ({
      ...prev,
      [field]: isText ? value : (value === "" ? null : Number(value)),
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    const payload: any = {
      ...formData, user_id: user.id,
      workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      month_date: selectedMonth, updated_at: new Date().toISOString(),
    };
    delete payload.id; delete payload.created_at;
    try {
      if (formId) {
        const { error } = await supabase.from("monthly_stats" as any).update(payload).eq("id", formId);
        if (error) { toast.error("Erreur de sauvegarde"); setSaving(false); return; }
      } else {
        const { data: ins, error } = await supabase.from("monthly_stats" as any).insert(payload).select("id").single();
        if (error) { toast.error("Erreur de sauvegarde"); setSaving(false); return; }
        if (ins) setFormId((ins as any).id);
      }
      toast.success(`✅ Stats de ${monthLabel(selectedMonth)} enregistrées.`);
      
      // Auto-adjust period to include the saved month
      const currentRange = getPeriodRange(periodPreset, now);
      if (selectedMonth < currentRange.from || selectedMonth > currentRange.to) {
        // Switch to a period that includes the saved month
        if (selectedMonth === monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))) {
          setPeriodPreset("3_months");
        } else if (selectedMonth >= monthKey(new Date(now.getFullYear(), now.getMonth() - 5, 1))) {
          setPeriodPreset("6_months");
        } else if (selectedMonth >= monthKey(new Date(now.getFullYear(), 0, 1))) {
          setPeriodPreset("this_year");
        } else {
          setPeriodPreset("all");
        }
        toast.info("📊 Période ajustée pour afficher tes nouvelles stats.");
      }
      
      loadStats();
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    }
    setSaving(false);
  }, [user, formData, formId, selectedMonth, workspaceId, loadStats, periodPreset, now]);

  // Remplit automatiquement la ligne du mois en cours avec les vraies stats du
  // compte Instagram connecté (mêmes données que l'audit : abonnés, reach 28 j,
  // abonnés gagnés). Les champs non couverts par l'API restent en saisie manuelle.
  const fetchFromInstagram = useCallback(async () => {
    if (!user) return;
    setFetchingLive(true);
    try {
      const { data, error } = await supabase.functions.invoke("instagram-insights-fetch", {
        body: { workspace_id: workspaceId !== user.id ? workspaceId : undefined },
      });
      if (error || !(data as any)?.metrics) {
        const ctxBody = (error as any)?.context?.body;
        const msg = ctxBody?.error || (data as any)?.error || "";
        if (msg.includes("Reconnecte")) {
          toast.error("Reconnexion requise", { description: "Reconnecte ton compte Instagram pour autoriser la lecture de tes statistiques." });
        } else {
          toast.error("Stats indisponibles", { description: msg || "Impossible de récupérer tes statistiques Instagram pour le moment." });
        }
        return;
      }
      const m = (data as any).metrics;
      setAudience(m.audience || null);
      setLivePosts(
        (m.topPosts?.length || m.flopPosts?.length)
          ? { top: m.topPosts || [], flop: m.flopPosts || [] }
          : null,
      );
      const target = currentMonthDate;
      const existing = allStats.find(s => s.month_date === target) || {};
      const patch: any = {};
      const filled: string[] = [];
      if (typeof m.followers === "number") { patch.followers = m.followers; filled.push("abonnés"); }
      if (typeof m.reach30d === "number") { patch.reach = m.reach30d; filled.push("reach (28 j)"); }
      if (typeof m.views30d === "number") { patch.views = m.views30d; filled.push("vues"); }
      if (typeof m.totalInteractions30d === "number") { patch.interactions = m.totalInteractions30d; filled.push("interactions"); }
      if (typeof m.accountsEngaged30d === "number") { patch.accounts_engaged = m.accountsEngaged30d; filled.push("comptes engagés"); }
      if (typeof m.profileViews30d === "number") { patch.profile_visits = m.profileViews30d; filled.push("visites du profil"); }
      if (typeof m.followerGrowth30d === "number" && m.followerGrowth30d >= 0) {
        patch.followers_gained = m.followerGrowth30d; filled.push("abonnés gagnés");
      }
      // Persiste les snapshots du mois dans custom_data (JSONB) : audience ET
      // top/flop, pour que les encarts survivent au rechargement et que la
      // tendance d'audience se construise. Non bloquant : pas dans `filled`.
      const customData: any = { ...((existing as any).custom_data || {}) };
      const aud = m.audience;
      if (aud && (aud.age?.length || aud.gender?.length || aud.cities?.length || aud.countries?.length)) {
        customData.ig_audience = { ...aud, fetchedAt: m.fetchedAt || new Date().toISOString() };
      }
      if (m.topPosts?.length || m.flopPosts?.length) {
        customData.ig_top_posts = {
          top: m.topPosts || [],
          flop: m.flopPosts || [],
          fetchedAt: m.fetchedAt || new Date().toISOString(),
        };
      }
      if (Object.keys(customData).length) patch.custom_data = customData;
      if (!filled.length) {
        toast("Aucune métrique exploitable", { description: "L'API n'a renvoyé aucun chiffre fiable cette fois. Réessaie un peu plus tard." });
        return;
      }
      const payload: any = {
        ...existing, ...patch, user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        month_date: target, updated_at: new Date().toISOString(),
      };
      delete payload.id; delete payload.created_at;
      if ((existing as any).id) {
        const { error: upErr } = await supabase.from("monthly_stats" as any).update(payload).eq("id", (existing as any).id);
        if (upErr) { toast.error("Erreur d'enregistrement des stats récupérées"); return; }
      } else {
        const { error: insErr } = await supabase.from("monthly_stats" as any).insert(payload);
        if (insErr) { toast.error("Erreur d'enregistrement des stats récupérées"); return; }
      }
      setSelectedMonth(target);
      await loadStats();
      toast.success(`✅ Stats Instagram récupérées — ${monthLabel(target)}`, {
        description: `Rempli automatiquement : ${filled.join(", ")}. Complète le reste à la main dans « Saisir mes stats » si besoin.`,
      });
      // Honnêteté : le back signale quand une partie des appels Meta a échoué.
      // Sans ce message, l'utilisatrice croit ses stats complètes.
      if (m.partial) {
        toast.warning("Certaines statistiques n'ont pas pu être lues", {
          description: "Instagram n'a pas renvoyé toutes les métriques cette fois : les champs manquants sont restés vides. Réessaie plus tard ou complète-les à la main.",
        });
      }
    } catch {
      toast.error("Erreur lors de la récupération des stats Instagram");
    } finally {
      setFetchingLive(false);
    }
  }, [user, workspaceId, allStats, currentMonthDate, loadStats]);

  const handleAnalyze = useCallback(async () => {
    if (!user) return;
    setIsGenerating(true);
    try {
      // Historique = mois STRICTEMENT antérieurs au mois analysé. Avant, on
      // envoyait allStats.slice(0,6) qui INCLUAIT le mois analysé en tête :
      // l'edge le comparait à lui-même → « stable » systématique et faux.
      const history = allStats
        .filter(s => s.month_date < selectedMonth)
        .slice(0, 6);
      const { data, error } = await invokeWithTimeout("engagement-insight", {
        body: {
          currentWeek: { ...formData, month_date: selectedMonth },
          history,
          mode: "monthly_stats",
        },
      }, 60000);
      if (error) throw new Error(error.message);
      const insight = data?.insight || "";
      setAiAnalysis(insight);
      if (formId) {
        const { error: updErr } = await supabase.from("monthly_stats" as any).update({
          ai_analysis: insight, ai_analyzed_at: new Date().toISOString(),
        }).eq("id", formId);
        if (updErr) { toast.error("Erreur de sauvegarde de l'analyse"); }
      }
    } catch {
      toast.error("Erreur lors de l'analyse");
    }
    setIsGenerating(false);
  }, [user, allStats, formData, formId, selectedMonth]);

  const saveConfig = useCallback(async (cfg: StatsConfig) => {
    if (!user) return;
    const payload = {
      ...cfg, user_id: user.id,
      // Même convention que handleSave : la config appartient à l'espace actif,
      // sinon elle est invisible au rechargement (filtre workspace_id).
      workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      updated_at: new Date().toISOString(),
    } as any;
    delete payload.id;
    if (config?.id) {
      const { error } = await supabase.from("stats_config" as any).update(payload).eq("id", config.id);
      if (error) { toast.error("Erreur de sauvegarde"); return; }
    } else {
      const { data, error } = await supabase.from("stats_config" as any).insert(payload).select("id").single();
      if (error) { toast.error("Erreur de sauvegarde"); return; }
      if (data) payload.id = (data as any).id;
    }
    setConfig({ ...cfg, id: config?.id || payload.id });
    setDraftConfig({ ...cfg, id: config?.id || payload.id });
  }, [user, config, workspaceId]);

  const handleConfigClick = useCallback((step: number) => {
    setShowOnboarding(true); setOnboardingStep(step); setConfig(null);
  }, []);

  // Affiche un découpage d'audience (âge / genre / villes / pays) en % avec barres.
  // Pour les pays, on convertit le code ISO (FR) en nom lisible (France).
  const renderAudienceGroup = (title: string, arr: any[] | undefined, n: number) => {
    if (!arr || !arr.length) return null;
    const total = arr.reduce((s, x) => s + (Number(x?.value) || 0), 0) || 1;
    const isCountry = title === "Pays";
    const labelOf = (raw: string) => {
      if (!isCountry) return raw;
      try { return countryNames.of(raw) || raw; } catch { return raw; }
    };
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
        <ul className="space-y-1">
          {arr.slice(0, n).map((x, i) => {
            const pct = Math.round((Number(x?.value) || 0) / total * 100);
            return (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="w-28 shrink-0 truncate text-foreground" title={labelOf(String(x.label))}>{labelOf(String(x.label))}</span>
                <span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{pct}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  // Affiche une liste compacte de posts (top ou flop) avec format, engagement et lien.
  const renderPostGroup = (title: string, posts: any[] | undefined) => {
    if (!posts || !posts.length) return null;
    const fmtEmoji = (f: string) => {
      const u = String(f || "").toUpperCase();
      if (u.includes("REEL") || u.includes("VIDEO")) return "🎬";
      if (u.includes("CAROUSEL")) return "🖼️";
      return "📷";
    };
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
        <ul className="space-y-1.5">
          {posts.slice(0, 3).map((p, i) => {
            const er = typeof p?.engagementRate === "number" ? Math.round(p.engagementRate * 100) : null;
            const subject = (p?.subject || "").trim() || "(sans légende)";
            const inner = (
              <>
                <span className="shrink-0">{fmtEmoji(p?.format)}</span>
                <span className="flex-1 truncate text-foreground" title={subject}>{subject}</span>
                {er !== null && <span className="shrink-0 text-xs font-semibold text-primary tabular-nums">{er}%</span>}
              </>
            );
            return (
              <li key={i} className="flex items-center gap-2 text-sm">
                {p?.permalink
                  ? <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 w-full hover:underline">{inner}</a>
                  : inner}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  /* ── ONBOARDING ── */
  if (showOnboarding && !config) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-2xl px-6 py-8 max-md:px-4 space-y-6">
          <SubPageHeader parentTo="/instagram" parentLabel="Instagram" currentLabel="Mes stats" />
          <div className="rounded-xl border border-border bg-card p-6 space-y-6">
            <div className="text-center space-y-2">
              <h1 className="font-display text-2xl font-bold">📈 Configurons tes stats</h1>
              <p className="text-sm text-muted-foreground">
                Quelques questions pour adapter le suivi à TON projet. Ça prend 2 minutes.
              </p>
              <div className="flex justify-center gap-2 mt-3">
                {[1, 2, 3].map(s => (
                  <div key={s} className={`h-2 w-12 rounded-full ${s <= onboardingStep ? "bg-primary" : "bg-muted"}`} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Étape {onboardingStep}/3</p>
            </div>

            {onboardingStep === 1 && (
              <div className="space-y-4">
                <h2 className="font-display text-base font-bold">🌐 Ton site web</h2>
                <div>
                  <Label className="text-sm mb-2 block">Quelle plateforme utilises-tu ?</Label>
                  <div className="flex flex-wrap gap-2">
                    {WEBSITE_PLATFORMS.map(p => (
                      <Button key={p.id} variant={draftConfig.website_platform === p.id ? "default" : "outline"} size="sm"
                        onClick={() => setDraftConfig(c => ({ ...c, website_platform: p.id }))}>
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  {draftConfig.website_platform === "other" && (
                    <Input className="mt-2 max-w-xs" placeholder="Précise la plateforme..." aria-label="Précise la plateforme" value={draftConfig.website_platform_other || ""}
                      onChange={e => setDraftConfig(c => ({ ...c, website_platform_other: e.target.value }))} />
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-sm">Tu utilises Google Analytics ?</Label>
                  <div className="flex gap-2">
                    <Button variant={draftConfig.uses_ga4 ? "default" : "outline"} size="sm" onClick={() => setDraftConfig(c => ({ ...c, uses_ga4: true }))}>Oui</Button>
                    <Button variant={!draftConfig.uses_ga4 ? "default" : "outline"} size="sm" onClick={() => setDraftConfig(c => ({ ...c, uses_ga4: false }))}>Non</Button>
                  </div>
                </div>
                <div>
                  <Label className="text-sm mb-2 block">Quelles sources de trafic tu suis ?</Label>
                  <div className="space-y-2">
                    {ALL_TRAFFIC_SOURCES.map(src => (
                      <label key={src.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={(draftConfig.traffic_sources || []).includes(src.id)}
                          onCheckedChange={(checked) => {
                            setDraftConfig(c => ({
                              ...c,
                              traffic_sources: checked
                                ? [...(c.traffic_sources || []), src.id]
                                : (c.traffic_sources || []).filter(s => s !== src.id),
                            }));
                          }} />
                        {src.label}
                      </label>
                    ))}
                  </div>
                </div>
                <Button className="w-full" onClick={() => setOnboardingStep(2)}>
                  Suivant <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}

            {onboardingStep === 2 && (
              <div className="space-y-4">
                <h2 className="font-display text-base font-bold">📄 Tes pages de vente</h2>
                <p className="text-sm text-muted-foreground">Ajoute les pages que tu veux suivre (optionnel).</p>
                {(draftConfig.sales_pages || []).map((page, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input placeholder="Nom de la page/offre" aria-label={`Nom de la page de vente ${i + 1}`} value={page.name}
                      onChange={e => {
                        const pages = [...(draftConfig.sales_pages || [])];
                        pages[i] = { ...pages[i], name: e.target.value };
                        setDraftConfig(c => ({ ...c, sales_pages: pages }));
                      }} className="flex-1" />
                    <Input placeholder="URL" aria-label={`URL de la page de vente ${i + 1}`} value={page.url}
                      onChange={e => {
                        const pages = [...(draftConfig.sales_pages || [])];
                        pages[i] = { ...pages[i], url: e.target.value };
                        setDraftConfig(c => ({ ...c, sales_pages: pages }));
                      }} className="flex-1" />
                    <Button variant="ghost" size="icon" aria-label="Supprimer cette page de vente" onClick={() => {
                      setDraftConfig(c => ({ ...c, sales_pages: (c.sales_pages || []).filter((_, j) => j !== i) }));
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => {
                  setDraftConfig(c => ({ ...c, sales_pages: [...(c.sales_pages || []), { name: "", url: "" }] }));
                }} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Ajouter une page de vente
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setOnboardingStep(1)}>Retour</Button>
                  <Button className="flex-1" onClick={() => setOnboardingStep(3)}>
                    Suivant <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {onboardingStep === 3 && (
              <div className="space-y-4">
                <h2 className="font-display text-base font-bold">💰 Ton modèle business</h2>
                <div className="grid gap-2">
                  {Object.entries(BUSINESS_PRESETS).map(([key, preset]) => (
                    <button key={key}
                      className={`text-left p-3 rounded-xl border-2 transition-colors ${draftConfig.business_type === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                      onClick={() => setDraftConfig(c => ({ ...c, business_type: key, business_metrics: preset.metrics }))}>
                      <span className="font-medium text-sm">{preset.emoji} {preset.label}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{preset.desc}</p>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setOnboardingStep(2)}>Retour</Button>
                  <Button className="flex-1" onClick={async () => {
                    await saveConfig(draftConfig);
                    setShowOnboarding(false);
                    toast.success("✅ Configuration enregistrée !");
                  }}>
                    ✅ C'est prêt, montrer mes stats
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  💡 Tu pourras modifier tout ça dans ⚙️ à tout moment.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  /* ── Main render ── */
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4 space-y-6">
        <SubPageHeader parentTo="/instagram" parentLabel="Instagram" currentLabel="Mes stats" />

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">📈 Mes stats</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Remplis tes stats chaque mois pour suivre ta progression.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => handleConfigClick(1)}>
            <Settings className="h-4 w-4" /> Configurer
          </Button>
        </div>

        {/* ─── Period selector ─── */}
        <StatsPeriodSelector
          periodPreset={periodPreset}
          onPresetChange={setPeriodPreset}
          customFrom={customFrom} customTo={customTo}
          onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo}
          monthOptions={monthOptions}
        />

        {/* ─── KPI cards ─── */}
        {!configLoaded ? (
          <div className="grid grid-cols-2 gap-4">
            <SkeletonCard variant="medium" />
            <SkeletonCard variant="medium" />
            <SkeletonCard variant="medium" />
            <SkeletonCard variant="medium" />
          </div>
        ) : dashboardKPIs && <StatsOverview kpis={dashboardKPIs} isSingleMonth={isSingleMonth} />}

        {/* ─── Remplissage auto depuis l'API Instagram ─── */}
        {igConnected ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <span>📸</span>
              <span>Récupère automatiquement tes <strong className="text-foreground">abonnés, reach, vues, interactions, comptes engagés, visites de profil et abonnés gagnés</strong> du mois en cours depuis ton compte Instagram connecté.</span>
            </div>
            <Button onClick={fetchFromInstagram} disabled={fetchingLive} size="sm" className="gap-1.5 shrink-0">
              {fetchingLive
                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Récupération…</>
                : <><Sparkles className="h-3.5 w-3.5" />Remplir depuis Instagram</>}
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground flex items-center justify-between gap-3 flex-wrap">
            <span className="flex items-start gap-2"><span>📸</span><span>Connecte ton compte Instagram pour remplir tes stats automatiquement.</span></span>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to="/parametres/connexions">Connecter Instagram</Link>
            </Button>
          </div>
        )}

        {/* ─── Audience réelle (démographie des abonnés) ─── */}
        {audience && (audience.age?.length || audience.gender?.length || audience.cities?.length || audience.countries?.length) ? (
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
            <h3 className="font-display text-sm font-bold text-foreground">
              👥 Ton audience <span className="font-normal text-muted-foreground text-xs">— qui te suit sur Instagram</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              {renderAudienceGroup("Âge", audience.age, 4)}
              {renderAudienceGroup("Genre", audience.gender, 3)}
              {renderAudienceGroup("Villes", audience.cities, 5)}
              {renderAudienceGroup("Pays", audience.countries, 5)}
            </div>
            <p className="text-xs text-muted-foreground">
              Sers-t'en pour choisir tes sujets et ton ton. Données Instagram, calculées sur les abonnés identifiés (peut être &lt; ton total), à ±48 h.
            </p>
          </div>
        ) : null}

        {/* ─── Top / flop posts (30 derniers jours, depuis l'API) ─── */}
        {livePosts && (livePosts.top.length || livePosts.flop.length) ? (
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
            <h3 className="font-display text-sm font-bold text-foreground">
              🏆 Tes posts récents <span className="font-normal text-muted-foreground text-xs">— par taux d'engagement, 30 derniers jours</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              {renderPostGroup("Ce qui a le mieux marché", livePosts.top)}
              {/* On masque le « flop » s'il recoupe le « top » (cas < 4 posts mesurés). */}
              {renderPostGroup(
                "Ce qui a le moins marché",
                livePosts.flop.filter(f => !livePosts.top.some(t => t.id === f.id)),
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Le taux d'engagement = interactions ÷ portée (ou vues pour les Reels). Inspire-toi de ce qui marche pour tes prochains contenus.
            </p>
          </div>
        ) : null}

        {/* ─── Tabs ─── */}
        <Tabs defaultValue="overview" className="space-y-5">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="overview">📊 Vue d'ensemble</TabsTrigger>
            <TabsTrigger value="input">📝 Saisir mes stats</TabsTrigger>
            <TabsTrigger value="ai">🧠 Mon analyse</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            <StatsCharts
              chartData={chartData} isSingleMonth={isSingleMonth}
              activeConfig={activeConfig} periodStats={periodStats}
              allStats={allStats}
              compareA={compareA} compareB={compareB}
              setCompareA={setCompareA} setCompareB={setCompareB}
            />
          </TabsContent>

          <TabsContent value="input">
            <StatsForm
              selectedMonth={selectedMonth} onMonthChange={setSelectedMonth}
              monthOptions={monthOptions}
              formData={formData} onFieldChange={handleChange}
              onFormDataUpdate={setFormData}
              onSave={handleSave} saving={saving}
              onImportClick={() => setShowImportDialog(true)}
              onConfigClick={handleConfigClick}
              activeConfig={activeConfig}
            />
          </TabsContent>

          <TabsContent value="ai" className="space-y-5">
            <div className="text-center py-4">
              <Button onClick={handleAnalyze} disabled={isGenerating || allStats.length === 0} size="lg" className="gap-2">
                <Sparkles className="h-4 w-4" />
                {isGenerating ? "Analyse en cours..." : "🧠 Analyser mes stats avec l'IA"}
              </Button>
              {allStats.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-3">Saisis au moins 1 mois de stats pour lancer l'analyse.</p>
              ) : (
                <p className="text-sm text-muted-foreground mt-3">
                  Analyse {monthLabel(selectedMonth)} (le mois sélectionné dans « Saisir mes stats »), comparé à tes mois précédents.
                </p>
              )}
            </div>
            {aiAnalysis && (
              <div className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-foreground">
                    🧠 Mon analyse — {monthLabel(selectedMonth)}
                  </h3>
                  <Button variant="ghost" size="sm" onClick={handleAnalyze} disabled={isGenerating} className="gap-1">
                    <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                    Relancer
                  </Button>
                </div>
                <AiGeneratedMention />
                <div className="text-sm text-foreground whitespace-pre-line leading-relaxed">{aiAnalysis}</div>
                {formData.ai_analyzed_at && (
                  <p className="text-xs text-muted-foreground">
                    Dernière analyse : {new Date(formData.ai_analyzed_at).toLocaleDateString("fr-FR")}
                  </p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
      {user && <LocalErrorBoundary fallbackMessage="Erreur lors de l'import Excel."><ExcelImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} userId={user.id} onImportComplete={loadStats} /></LocalErrorBoundary>}
    </div>
  );
}
