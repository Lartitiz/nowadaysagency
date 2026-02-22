import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Save, Sparkles, TrendingUp, TrendingDown, Minus, Upload, RefreshCw,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend, Area,
} from "recharts";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthLabel(dateStr: string) {
  const d = new Date(dateStr);
  return `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function monthLabelShort(dateStr: string) {
  const d = new Date(dateStr);
  return `${MONTHS_FR[d.getMonth()].slice(0, 3)}. ${d.getFullYear()}`;
}

function pctChange(cur: number | null, prev: number | null): { val: number; dir: "up" | "down" | "flat" } | null {
  if (cur == null || prev == null || prev === 0) return null;
  const val = ((cur - prev) / prev) * 100;
  return { val, dir: val > 5 ? "up" : val < -5 ? "down" : "flat" };
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "–";
  return n.toLocaleString("fr-FR");
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "–";
  return `${n.toFixed(1)}%`;
}

function fmtEur(n: number | null | undefined): string {
  if (n == null) return "–";
  return `${Math.round(n).toLocaleString("fr-FR")}€`;
}

function safeDivPct(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return (num / den) * 100;
}

function safeDiv(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

type StatsRow = Record<string, any>;

/* ═══════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════ */

export default function InstagramStats() {
  const { user } = useAuth();
  const { toast } = useToast();

  const now = useMemo(() => new Date(), []);
  const currentMonthDate = useMemo(() => monthKey(now), [now]);

  const [allStats, setAllStats] = useState<StatsRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthDate);
  const [formData, setFormData] = useState<StatsRow>({});
  const [formId, setFormId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");

  // Load all stats
  const loadStats = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("monthly_stats" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("month_date", { ascending: false });
    const rows = (data || []) as StatsRow[];
    setAllStats(rows);

    // Set comparison defaults
    if (rows.length >= 2) {
      setCompareA(rows[0].month_date);
      setCompareB(rows[1].month_date);
    } else if (rows.length === 1) {
      setCompareA(rows[0].month_date);
    }
  }, [user]);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Load form for selected month
  useEffect(() => {
    const row = allStats.find(s => s.month_date === selectedMonth);
    if (row) {
      setFormData(row);
      setFormId(row.id);
      setAiAnalysis(row.ai_analysis || "");
    } else {
      setFormData({});
      setFormId(null);
      setAiAnalysis("");
    }
  }, [selectedMonth, allStats]);

  const handleChange = (field: string, value: string, isText = false) => {
    setFormData(prev => ({
      ...prev,
      [field]: isText ? value : (value === "" ? null : Number(value)),
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const payload: any = {
      ...formData,
      user_id: user.id,
      month_date: selectedMonth,
      updated_at: new Date().toISOString(),
    };
    delete payload.id;
    delete payload.created_at;

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
  };

  const handleAnalyze = async () => {
    if (!user) return;
    setIsGenerating(true);
    try {
      const last6 = allStats.slice(0, 6);
      const { data, error } = await supabase.functions.invoke("engagement-insight", {
        body: {
          currentWeek: formData,
          history: last6,
          mode: "monthly_stats",
        },
      });
      if (error) throw error;
      const insight = data?.insight || "";
      setAiAnalysis(insight);
      if (formId) {
        await supabase.from("monthly_stats" as any).update({
          ai_analysis: insight,
          ai_analyzed_at: new Date().toISOString(),
        }).eq("id", formId);
      }
    } catch {
      toast({ title: "Erreur lors de l'analyse", variant: "destructive" });
    }
    setIsGenerating(false);
  };

  // Excel import
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      let imported = 0;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[0]) continue;

        // Parse month from column A — could be date or text
        let md: Date | null = null;
        if (typeof r[0] === "number") {
          md = XLSX.SSF.parse_date_code(r[0]) as any;
          if (md) md = new Date((md as any).y, (md as any).m - 1, 1);
        } else if (typeof r[0] === "string") {
          const parsed = new Date(r[0]);
          if (!isNaN(parsed.getTime())) md = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
        }
        if (!md) continue;

        const num = (col: number) => {
          const v = r[col];
          if (v == null || v === "" || v === "-") return null;
          const n = Number(v);
          return isNaN(n) ? null : n;
        };
        const txt = (col: number) => r[col]?.toString() || null;

        const payload: any = {
          user_id: user.id,
          month_date: monthKey(md),
          objective: txt(1),
          content_published: txt(2),
          reach: num(5),
          profile_visits: num(6),
          website_clicks: num(7),
          interactions: num(8),
          accounts_engaged: num(9),
          followers_engaged: num(11),
          followers: num(12),
          followers_gained: num(13),
          followers_lost: num(15),
          email_signups: num(17),
          newsletter_subscribers: num(18),
          website_visitors: num(19),
          traffic_pinterest: num(20),
          traffic_instagram: num(21),
          ga4_users: num(22),
          traffic_search: num(23),
          traffic_social: num(24),
          ad_budget: num(25),
          page_views_plan: num(26),
          page_views_academy: num(27),
          page_views_agency: num(28),
          discovery_calls: num(29),
          clients_signed: num(31),
          revenue: num(32),
        };

        await supabase.from("monthly_stats" as any).upsert(payload, { onConflict: "user_id,month_date" });
        imported++;
      }

      toast({ title: `✅ ${imported} mois de données importés. Tes graphiques sont prêts.` });
      loadStats();
    } catch (err) {
      toast({ title: "Erreur lors de l'import Excel", variant: "destructive" });
    }
    e.target.value = "";
  };

  // Derived computed values for the current form
  const engagementRate = safeDivPct(formData.interactions, formData.reach);
  const followersEngagedPct = safeDivPct(formData.followers_engaged, formData.followers);
  const profileConversionRate = safeDivPct(formData.followers_gained, formData.profile_visits);
  const totalPageViews = (formData.page_views_plan || 0) + (formData.page_views_academy || 0) + (formData.page_views_agency || 0);
  const callConversionRate = safeDivPct(formData.discovery_calls, totalPageViews || null);
  const avgBasket = safeDiv(formData.revenue, formData.clients_signed);
  const cac = safeDiv(formData.ad_budget, formData.clients_signed);

  // Previous month for dashboard comparison
  const latestMonth = allStats[0];
  const prevMonth = allStats[1];

  // Chart data
  const chartData = useMemo(() =>
    [...allStats].reverse().map(s => ({
      month: monthLabelShort(s.month_date),
      followers: s.followers ?? 0,
      reach: s.reach ?? 0,
      engagement: safeDivPct(s.interactions, s.reach) ?? 0,
      revenue: s.revenue ?? 0,
      clients: s.clients_signed ?? 0,
      website_visitors: s.website_visitors ?? 0,
      traffic_search: s.traffic_search ?? 0,
      traffic_social: s.traffic_social ?? 0,
      traffic_pinterest: s.traffic_pinterest ?? 0,
      traffic_instagram: s.traffic_instagram ?? 0,
    }))
  , [allStats]);

  // Month selector options
  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({ value: monthKey(d), label: monthLabel(monthKey(d)) });
    }
    return options;
  }, [now]);

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
          <span className="text-sm text-muted-foreground font-medium">
            {latestMonth ? monthLabel(latestMonth.month_date) : MONTHS_FR[now.getMonth()] + " " + now.getFullYear()}
          </span>
        </div>

        {/* API placeholder banner */}
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground flex items-start gap-2">
          <span>📸</span>
          <span>Bientôt : connecte ton Instagram pour remplir tes stats automatiquement. En attendant, saisis-les à la main.</span>
        </div>

        {/* ─── DASHBOARD CARDS ─── */}
        {latestMonth && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DashboardCard
              icon="👥" label="Abonné·es" value={fmt(latestMonth.followers)}
              change={pctChange(latestMonth.followers, prevMonth?.followers)}
              sub={latestMonth.followers_gained != null ? `+${latestMonth.followers_gained}` : undefined}
            />
            <DashboardCard
              icon="📣" label="Portée" value={fmt(latestMonth.reach)}
              change={pctChange(latestMonth.reach, prevMonth?.reach)}
            />
            <DashboardCard
              icon="💬" label="Engagement" value={fmtPct(safeDivPct(latestMonth.interactions, latestMonth.reach))}
              change={pctChange(
                safeDivPct(latestMonth.interactions, latestMonth.reach),
                safeDivPct(prevMonth?.interactions, prevMonth?.reach)
              )}
            />
            <DashboardCard
              icon="💰" label="CA" value={fmtEur(latestMonth.revenue)}
              change={pctChange(latestMonth.revenue, prevMonth?.revenue)}
            />
          </div>
        )}

        {/* ─── TABS ─── */}
        <Tabs defaultValue="overview" className="space-y-5">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="overview">📊 Vue d'ensemble</TabsTrigger>
            <TabsTrigger value="input">📝 Saisir mes stats</TabsTrigger>
            <TabsTrigger value="ai">🧠 Analyse IA</TabsTrigger>
          </TabsList>

          {/* ═══ OVERVIEW TAB ═══ */}
          <TabsContent value="overview" className="space-y-8">
            {chartData.length < 2 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Saisis au moins 2 mois de stats pour voir les graphiques d'évolution.
              </p>
            ) : (
              <>
                {/* Chart 1: Followers */}
                <ChartCard title="Évolution des abonné·es">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                      <Line type="monotone" dataKey="followers" stroke="#fb3d80" name="Abonné·es" strokeWidth={2.5} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* Chart 2: Reach + Engagement */}
                <ChartCard title="Portée et engagement">
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis yAxisId="left" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="hsl(var(--muted-foreground))" unit="%" />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                      <Bar yAxisId="left" dataKey="reach" fill="#ffa7c6" name="Portée" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="engagement" stroke="#8B5CF6" name="Engagement %" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* Chart 3: Traffic sources */}
                <ChartCard title="Sources de trafic site web">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                      <Legend />
                      <Bar dataKey="traffic_search" stackId="a" fill="#fb3d80" name="Search" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="traffic_social" stackId="a" fill="#8B5CF6" name="Réseaux sociaux" />
                      <Bar dataKey="traffic_pinterest" stackId="a" fill="#FFE561" name="Pinterest" />
                      <Bar dataKey="traffic_instagram" stackId="a" fill="#ffa7c6" name="Instagram" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* Chart 4: Funnel */}
                <ChartCard title="Funnel de conversion">
                  <FunnelChart data={latestMonth} />
                </ChartCard>

                {/* Chart 5: CA + Clients */}
                <ChartCard title="CA et clients">
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis yAxisId="left" fontSize={11} stroke="hsl(var(--muted-foreground))" unit="€" />
                      <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                      <Bar yAxisId="left" dataKey="revenue" fill="#fb3d80" name="CA (€)" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="clients" stroke="#8B5CF6" name="Clients" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* Comparison */}
                {allStats.length >= 2 && (
                  <ComparisonTable
                    allStats={allStats}
                    compareA={compareA}
                    compareB={compareB}
                    setCompareA={setCompareA}
                    setCompareB={setCompareB}
                  />
                )}
              </>
            )}
          </TabsContent>

          {/* ═══ INPUT TAB ═══ */}
          <TabsContent value="input" className="space-y-5">
            {/* Month selector */}
            <div className="flex items-center gap-3 flex-wrap">
              <Label className="text-sm font-medium">Mois :</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <label className="ml-auto cursor-pointer">
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelImport} />
                <Button variant="outline" size="sm" className="gap-1.5 pointer-events-none" tabIndex={-1}>
                  <Upload className="h-3.5 w-3.5" />
                  Importer (Excel)
                </Button>
              </label>
            </div>

            <Accordion type="multiple" defaultValue={["instagram"]} className="space-y-2">
              {/* Instagram */}
              <AccordionItem value="instagram" className="border rounded-xl px-4">
                <AccordionTrigger className="font-display text-sm font-bold">📸 Instagram</AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TextInput label="Objectif du mois" value={formData.objective} onChange={v => handleChange("objective", v, true)} />
                    <TextInput label="Contenu partagé" value={formData.content_published} onChange={v => handleChange("content_published", v, true)} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <NumInput label="Nb de comptes touchés (portée)" value={formData.reach} onChange={v => handleChange("reach", v)} />
                    <NumInput label="Couverture stories" value={formData.stories_coverage} onChange={v => handleChange("stories_coverage", v)} />
                    <NumInput label="Nb de vues" value={formData.views} onChange={v => handleChange("views", v)} />
                    <NumInput label="Nb de visites du profil" value={formData.profile_visits} onChange={v => handleChange("profile_visits", v)} />
                    <NumInput label="Nb de clics site web" value={formData.website_clicks} onChange={v => handleChange("website_clicks", v)} />
                    <NumInput label="Nb d'interactions" value={formData.interactions} onChange={v => handleChange("interactions", v)} />
                    <NumInput label="Nb de comptes qui ont interagi" value={formData.accounts_engaged} onChange={v => handleChange("accounts_engaged", v)} />
                    <NumInput label="Nb de followers qui ont interagi" value={formData.followers_engaged} onChange={v => handleChange("followers_engaged", v)} />
                    <NumInput label="Nb de followers" value={formData.followers} onChange={v => handleChange("followers", v)} />
                    <NumInput label="Followers en +" value={formData.followers_gained} onChange={v => handleChange("followers_gained", v)} />
                    <NumInput label="Followers en -" value={formData.followers_lost} onChange={v => handleChange("followers_lost", v)} />
                  </div>
                  {/* Computed fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <ComputedField label="Taux d'engagement" value={fmtPct(engagementRate)} />
                    <ComputedField label="% followers interagi" value={fmtPct(followersEngagedPct)} />
                    <ComputedField label="Taux de conversion profil" value={fmtPct(profileConversionRate)} />
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    💡 Tu trouves ces chiffres dans Instagram → Insights → Vue d'ensemble → 30 derniers jours
                  </p>
                </AccordionContent>
              </AccordionItem>

              {/* Emailing */}
              <AccordionItem value="emailing" className="border rounded-xl px-4">
                <AccordionTrigger className="font-display text-sm font-bold">📧 Emailing</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <NumInput label="Inscrits emailing en +" value={formData.email_signups} onChange={v => handleChange("email_signups", v)} />
                    <NumInput label="Abonnés newsletter total" value={formData.newsletter_subscribers} onChange={v => handleChange("newsletter_subscribers", v)} />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Site web */}
              <AccordionItem value="website" className="border rounded-xl px-4">
                <AccordionTrigger className="font-display text-sm font-bold">🌐 Site web</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <NumInput label="Visiteurs uniques" value={formData.website_visitors} onChange={v => handleChange("website_visitors", v)} />
                    <NumInput label="Utilisateurs actifs (GA4)" value={formData.ga4_users} onChange={v => handleChange("ga4_users", v)} />
                    <NumInput label="Search" value={formData.traffic_search} onChange={v => handleChange("traffic_search", v)} />
                    <NumInput label="Réseaux sociaux" value={formData.traffic_social} onChange={v => handleChange("traffic_social", v)} />
                    <NumInput label="Pinterest" value={formData.traffic_pinterest} onChange={v => handleChange("traffic_pinterest", v)} />
                    <NumInput label="Instagram" value={formData.traffic_instagram} onChange={v => handleChange("traffic_instagram", v)} />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Pages de vente */}
              <AccordionItem value="sales_pages" className="border rounded-xl px-4">
                <AccordionTrigger className="font-display text-sm font-bold">📄 Pages de vente</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <NumInput label="Visiteurs plan com'" value={formData.page_views_plan} onChange={v => handleChange("page_views_plan", v)} />
                    <NumInput label="Visiteurs Academy" value={formData.page_views_academy} onChange={v => handleChange("page_views_academy", v)} />
                    <NumInput label="Visiteurs Agency" value={formData.page_views_agency} onChange={v => handleChange("page_views_agency", v)} />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Business */}
              <AccordionItem value="business" className="border rounded-xl px-4">
                <AccordionTrigger className="font-display text-sm font-bold">💰 Business</AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <NumInput label="Appels découverte" value={formData.discovery_calls} onChange={v => handleChange("discovery_calls", v)} />
                    <NumInput label="Clients signés" value={formData.clients_signed} onChange={v => handleChange("clients_signed", v)} />
                    <NumInput label="CA du mois (€)" value={formData.revenue} onChange={v => handleChange("revenue", v)} />
                    <NumInput label="Budget pub (€)" value={formData.ad_budget} onChange={v => handleChange("ad_budget", v)} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <ComputedField label="Taux conversion appel" value={fmtPct(callConversionRate)} />
                    <ComputedField label="Panier moyen" value={fmtEur(avgBasket)} />
                    <ComputedField label="CAC" value={fmtEur(cac)} />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Lancement */}
              <AccordionItem value="launch" className="border rounded-xl px-4">
                <AccordionTrigger className="font-display text-sm font-bold">🚀 Lancement (optionnel)</AccordionTrigger>
                <AccordionContent className="space-y-3 pb-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!formData.has_launch}
                      onCheckedChange={v => setFormData(prev => ({ ...prev, has_launch: v }))}
                    />
                    <Label className="text-sm">J'ai un lancement ce mois</Label>
                  </div>
                  {formData.has_launch && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <NumInput label="Inscriptions" value={formData.launch_signups} onChange={v => handleChange("launch_signups", v)} />
                      <NumInput label="DM liés lancement" value={formData.launch_dms} onChange={v => handleChange("launch_dms", v)} />
                      <NumInput label="Clics lien vente" value={formData.launch_link_clicks} onChange={v => handleChange("launch_link_clicks", v)} />
                      <NumInput label="Vues stories lancement" value={formData.launch_story_views} onChange={v => handleChange("launch_story_views", v)} />
                      <NumInput label="Conversions" value={formData.launch_conversions} onChange={v => handleChange("launch_conversions", v)} />
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Sauvegarde..." : "💾 Sauvegarder"}
            </Button>
          </TabsContent>

          {/* ═══ AI TAB ═══ */}
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
                    🧠 Analyse IA — Basée sur tes {Math.min(allStats.length, 6)} derniers mois
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
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════ */

function DashboardCard({ icon, label, value, change, sub }: {
  icon: string; label: string; value: string;
  change: { val: number; dir: "up" | "down" | "flat" } | null;
  sub?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 text-center">
        <span className="text-xl">{icon}</span>
        <p className="font-display text-xl font-bold text-foreground mt-1">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {change && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium mt-1 ${
            change.dir === "up" ? "text-green-600" : change.dir === "down" ? "text-red-500" : "text-muted-foreground"
          }`}>
            {change.dir === "up" ? <TrendingUp className="h-3 w-3" /> : change.dir === "down" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {change.dir === "flat" ? "stable" : `${change.val > 0 ? "+" : ""}${change.val.toFixed(0)}%`}
          </span>
        )}
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
      <h3 className="font-display text-sm font-bold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground shrink-0 w-48 sm:w-56">{label}</label>
      <Input type="number" value={value ?? ""} onChange={e => onChange(e.target.value)} className="max-w-[120px]" placeholder="–" />
    </div>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1 sm:col-span-2">
      <label className="text-sm text-muted-foreground">{label}</label>
      <Input type="text" value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder="..." />
    </div>
  );
}

function ComputedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground shrink-0">{label}</label>
      <span className="text-sm font-semibold text-foreground bg-muted px-3 py-1.5 rounded-lg">{value}</span>
    </div>
  );
}

function FunnelChart({ data }: { data: StatsRow | undefined }) {
  if (!data) return <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée disponible.</p>;

  const totalPageViews = (data.page_views_plan || 0) + (data.page_views_academy || 0) + (data.page_views_agency || 0);
  const steps = [
    { label: "Comptes touchés", value: data.reach || 0 },
    { label: "Visites profil", value: data.profile_visits || 0 },
    { label: "Clics site", value: data.website_clicks || 0 },
    { label: "Pages vente", value: totalPageViews },
    { label: "Appels", value: data.discovery_calls || 0 },
    { label: "Clients", value: data.clients_signed || 0 },
  ];

  const maxVal = Math.max(...steps.map(s => s.value), 1);

  return (
    <div className="space-y-2 py-2">
      {steps.map((step, i) => {
        const pct = (step.value / maxVal) * 100;
        const convRate = i > 0 && steps[i - 1].value > 0
          ? ((step.value / steps[i - 1].value) * 100).toFixed(1)
          : null;
        return (
          <div key={step.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{step.label}</span>
              <span className="font-medium text-foreground">
                {fmt(step.value)}
                {convRate && <span className="text-muted-foreground ml-1">({convRate}%)</span>}
              </span>
            </div>
            <div className="h-5 bg-muted rounded-lg overflow-hidden">
              <div
                className="h-full rounded-lg transition-all duration-500"
                style={{ width: `${Math.max(pct, 2)}%`, background: `linear-gradient(90deg, #fb3d80, #ffa7c6)` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Comparison table */
function ComparisonTable({ allStats, compareA, compareB, setCompareA, setCompareB }: {
  allStats: StatsRow[]; compareA: string; compareB: string;
  setCompareA: (v: string) => void; setCompareB: (v: string) => void;
}) {
  const a = allStats.find(s => s.month_date === compareA);
  const b = allStats.find(s => s.month_date === compareB);

  const metrics = [
    { label: "Followers", key: "followers" },
    { label: "Portée", key: "reach" },
    { label: "Interactions", key: "interactions" },
    { label: "Visites profil", key: "profile_visits" },
    { label: "Clics site", key: "website_clicks" },
    { label: "Inscrits email", key: "email_signups" },
    { label: "Visiteurs site", key: "website_visitors" },
    { label: "CA", key: "revenue", format: fmtEur },
    { label: "Clients", key: "clients_signed" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
      <h3 className="font-display text-sm font-bold text-foreground">Comparaison mois par mois</h3>
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <Select value={compareA} onValueChange={setCompareA}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {allStats.map(s => <SelectItem key={s.month_date} value={s.month_date}>{monthLabel(s.month_date)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">vs</span>
        <Select value={compareB} onValueChange={setCompareB}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {allStats.map(s => <SelectItem key={s.month_date} value={s.month_date}>{monthLabel(s.month_date)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {a && b && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-4"></th>
                <th className="py-2 pr-4">{monthLabel(b.month_date)}</th>
                <th className="py-2 pr-4">{monthLabel(a.month_date)}</th>
                <th className="py-2">Variation</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => {
                const valA = a[m.key];
                const valB = b[m.key];
                const f = m.format || fmt;
                const change = pctChange(valA, valB);
                return (
                  <tr key={m.key} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-muted-foreground">{m.label}</td>
                    <td className="py-2 pr-4 font-medium">{f(valB)}</td>
                    <td className="py-2 pr-4 font-medium">{f(valA)}</td>
                    <td className="py-2">
                      {change ? (
                        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                          change.dir === "up" ? "text-green-600" : change.dir === "down" ? "text-red-500" : "text-muted-foreground"
                        }`}>
                          {change.dir === "up" ? "↑" : change.dir === "down" ? "↓" : "→"}
                          {change.dir === "flat" ? "stable" : `${change.val > 0 ? "+" : ""}${change.val.toFixed(1)}%`}
                        </span>
                      ) : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
