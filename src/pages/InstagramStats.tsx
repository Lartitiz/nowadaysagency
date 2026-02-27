import { useState, useEffect, useMemo, useCallback } from "react";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { useToast } from "@/hooks/use-toast";
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
  const { toast } = useToast();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();

  const now = useMemo(() => new Date(), []);
  const currentMonthDate = useMemo(() => monthKey(now), [now]);

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

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this_month");
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
    const { data } = await (supabase.from("stats_config" as any) as any)
      .select("*").eq(column, value).maybeSingle();
    if (data) {
      const cfg = data as any as StatsConfig;
      setConfig(cfg); setDraftConfig(cfg);
    } else {
      setShowOnboarding(true);
    }
    setConfigLoaded(true);
  }, [user?.id]);

  const loadStats = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase.from("monthly_stats" as any) as any)
      .select("*").eq(column, value).order("month_date", { ascending: false });
    const rows = (data || []) as StatsRow[];
    setAllStats(rows);
    if (rows.length >= 2) { setCompareA(rows[0].month_date); setCompareB(rows[1].month_date); }
    else if (rows.length === 1) { setCompareA(rows[0].month_date); }
  }, [user?.id]);

  useEffect(() => { loadConfig(); loadStats(); }, [loadConfig, loadStats]);

  useEffect(() => {
    const row = allStats.find(s => s.month_date === selectedMonth);
    if (row) { setFormData(row); setFormId(row.id); setAiAnalysis(row.ai_analysis || ""); }
    else { setFormData({}); setFormId(null); setAiAnalysis(""); }
  }, [selectedMonth, allStats]);

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
    const avgReach = periodStats.reduce((s, r) => s + (r.reach || 0), 0) / periodStats.length;
    const avgEngagement = periodStats.reduce((s, r) => s + (safeDivPct(r.interactions, r.reach) || 0), 0) / periodStats.length;
    const totalRevenue = periodStats.reduce((s, r) => s + (r.revenue || 0), 0);

    const periodMonths = periodStats.length;
    const prevStats = allStats
      .filter(s => s.month_date < periodRange.from)
      .sort((a, b) => b.month_date.localeCompare(a.month_date))
      .slice(0, periodMonths).reverse();

    const prevFollowers = prevStats.length > 0 ? prevStats[prevStats.length - 1]?.followers : null;
    const prevAvgReach = prevStats.length > 0 ? prevStats.reduce((s, r) => s + (r.reach || 0), 0) / prevStats.length : null;
    const prevAvgEngagement = prevStats.length > 0 ? prevStats.reduce((s, r) => s + (safeDivPct(r.interactions, r.reach) || 0), 0) / prevStats.length : null;
    const prevTotalRevenue = prevStats.length > 0 ? prevStats.reduce((s, r) => s + (r.revenue || 0), 0) : null;

    return {
      followers, avgReach: Math.round(avgReach), avgEngagement, totalRevenue,
      changeFollowers: pctChange(followers, prevFollowers),
      changeReach: pctChange(avgReach, prevAvgReach),
      changeEngagement: pctChange(avgEngagement, prevAvgEngagement),
      changeRevenue: pctChange(totalRevenue, prevTotalRevenue),
      followersGained: isSingleMonth ? last.followers_gained : null,
    };
  }, [periodStats, allStats, periodRange, isSingleMonth]);

  const activeConfig = config || draftConfig;

  const chartData = useMemo(() =>
    periodStats.map(s => ({
      month: monthLabelShort(s.month_date),
      followers: s.followers ?? 0,
      reach: s.reach ?? 0,
      engagement: safeDivPct(s.interactions, s.reach) ?? 0,
      revenue: s.revenue ?? 0,
      clients: s.clients_signed ?? 0,
      ...(activeConfig.traffic_sources || ["search", "social", "pinterest", "instagram"]).reduce((acc, src) => {
        if (s.website_data && typeof s.website_data === "object" && s.website_data.sources) {
          acc[`traffic_${src}`] = s.website_data.sources[src] ?? (s as any)[`traffic_${src}`] ?? 0;
        } else {
          acc[`traffic_${src}`] = (s as any)[`traffic_${src}`] ?? 0;
        }
        return acc;
      }, {} as Record<string, number>),
    }))
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
        await supabase.from("monthly_stats" as any).update(payload).eq("id", formId);
      } else {
        const { data: ins } = await supabase.from("monthly_stats" as any).insert(payload).select("id").single();
        if (ins) setFormId((ins as any).id);
      }
      toast({ title: `✅ Stats de ${monthLabel(selectedMonth)} enregistrées.` });
      loadStats();
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    }
    setSaving(false);
  }, [user, formData, formId, selectedMonth, workspaceId, loadStats, toast]);

  const handleAnalyze = useCallback(async () => {
    if (!user) return;
    setIsGenerating(true);
    try {
      const last6 = allStats.slice(0, 6);
      const { data, error } = await supabase.functions.invoke("engagement-insight", {
        body: { currentWeek: formData, history: last6, mode: "monthly_stats" },
      });
      if (error) throw error;
      const insight = data?.insight || "";
      setAiAnalysis(insight);
      if (formId) {
        await supabase.from("monthly_stats" as any).update({
          ai_analysis: insight, ai_analyzed_at: new Date().toISOString(),
        }).eq("id", formId);
      }
    } catch {
      toast({ title: "Erreur lors de l'analyse", variant: "destructive" });
    }
    setIsGenerating(false);
  }, [user, allStats, formData, formId, toast]);

  const saveConfig = useCallback(async (cfg: StatsConfig) => {
    if (!user) return;
    const payload = { ...cfg, user_id: user.id, updated_at: new Date().toISOString() } as any;
    delete payload.id;
    if (config?.id) {
      await supabase.from("stats_config" as any).update(payload).eq("id", config.id);
    } else {
      const { data } = await supabase.from("stats_config" as any).insert(payload).select("id").single();
      if (data) payload.id = (data as any).id;
    }
    setConfig({ ...cfg, id: config?.id || payload.id });
    setDraftConfig({ ...cfg, id: config?.id || payload.id });
  }, [user, config]);

  const handleConfigClick = useCallback((step: number) => {
    setShowOnboarding(true); setOnboardingStep(step); setConfig(null);
  }, []);

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
                    <Button variant="ghost" size="icon" onClick={() => {
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
                    toast({ title: "✅ Configuration enregistrée !" });
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

        {/* ─── API placeholder ─── */}
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground flex items-start gap-2">
          <span>📸</span>
          <span>Bientôt : connecte ton Instagram pour remplir tes stats automatiquement.</span>
        </div>

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
              {allStats.length === 0 && (
                <p className="text-sm text-muted-foreground mt-3">Saisis au moins 1 mois de stats pour lancer l'analyse.</p>
              )}
            </div>
            {aiAnalysis && (
              <div className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-foreground">
                    🧠 Mon analyse — Basée sur tes {Math.min(allStats.length, 6)} derniers mois
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
      {user && <ExcelImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} userId={user.id} onImportComplete={loadStats} />}
    </div>
  );
}
