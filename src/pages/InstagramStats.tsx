import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Save, Sparkles, TrendingUp, TrendingDown, Minus, Upload, RefreshCw, Settings, Plus, Trash2, ChevronRight,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend,
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

type StatsConfig = {
  id?: string;
  website_platform?: string | null;
  website_platform_other?: string | null;
  uses_ga4?: boolean;
  traffic_sources?: string[];
  sales_pages?: { name: string; url: string }[];
  business_type?: string | null;
  business_metrics?: string[];
  custom_metrics?: { name: string; type: string; section: string }[];
  launch_metrics?: string[];
};

/* ═══════════════════════════════════════════════
   PERIOD HELPERS
   ═══════════════════════════════════════════════ */

type PeriodPreset = "this_month" | "last_month" | "3_months" | "6_months" | "this_year" | "last_year" | "all" | "custom";

function getPeriodRange(preset: PeriodPreset, now: Date): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "this_month":
      return { from: monthKey(new Date(y, m, 1)), to: monthKey(new Date(y, m, 1)) };
    case "last_month":
      return { from: monthKey(new Date(y, m - 1, 1)), to: monthKey(new Date(y, m - 1, 1)) };
    case "3_months":
      return { from: monthKey(new Date(y, m - 2, 1)), to: monthKey(new Date(y, m, 1)) };
    case "6_months":
      return { from: monthKey(new Date(y, m - 5, 1)), to: monthKey(new Date(y, m, 1)) };
    case "this_year":
      return { from: monthKey(new Date(y, 0, 1)), to: monthKey(new Date(y, m, 1)) };
    case "last_year":
      return { from: monthKey(new Date(y - 1, 0, 1)), to: monthKey(new Date(y - 1, 11, 1)) };
    case "all":
      return { from: "2020-01-01", to: monthKey(new Date(y, m, 1)) };
    default:
      return { from: monthKey(new Date(y, m, 1)), to: monthKey(new Date(y, m, 1)) };
  }
}

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  this_month: "Ce mois",
  last_month: "Le mois dernier",
  "3_months": "Les 3 derniers mois",
  "6_months": "Les 6 derniers mois",
  this_year: "Cette année",
  last_year: "L'année dernière",
  all: "Depuis le début",
  custom: "Période personnalisée",
};

/* ═══════════════════════════════════════════════
   BUSINESS MODEL PRESETS
   ═══════════════════════════════════════════════ */

const BUSINESS_PRESETS: Record<string, { label: string; emoji: string; desc: string; metrics: string[] }> = {
  services: {
    label: "Services / Accompagnement",
    emoji: "🤝",
    desc: "Appels découverte, devis, clients signés",
    metrics: ["discovery_calls", "proposals_sent", "clients_signed", "revenue", "ad_budget"],
  },
  ecommerce: {
    label: "Produits / E-commerce",
    emoji: "🛍️",
    desc: "Commandes, panier moyen, taux de conversion",
    metrics: ["orders", "avg_basket", "revenue", "conversion_rate", "best_product", "ad_budget"],
  },
  formations: {
    label: "Formations / Programmes",
    emoji: "📚",
    desc: "Inscrits, conversions, taux de complétion",
    metrics: ["signups", "conversions", "revenue", "waitlist", "ad_budget"],
  },
  freelance: {
    label: "Freelance / Projets",
    emoji: "🎨",
    desc: "Devis envoyés, projets signés, CA",
    metrics: ["requests_received", "proposals_sent", "projects_signed", "revenue", "ad_budget"],
  },
  mix: {
    label: "Mix de plusieurs",
    emoji: "🔀",
    desc: "Tu choisis les métriques qui te parlent",
    metrics: ["discovery_calls", "clients_signed", "revenue", "ad_budget"],
  },
};

const ALL_BUSINESS_METRICS: Record<string, { label: string; type: "number" | "euro" | "text" }> = {
  discovery_calls: { label: "Appels découverte", type: "number" },
  proposals_sent: { label: "Devis/propositions envoyés", type: "number" },
  clients_signed: { label: "Clients signés", type: "number" },
  revenue: { label: "CA du mois", type: "euro" },
  ad_budget: { label: "Budget pub", type: "euro" },
  orders: { label: "Nb de commandes", type: "number" },
  avg_basket: { label: "Panier moyen", type: "euro" },
  conversion_rate: { label: "Taux de conversion boutique", type: "number" },
  best_product: { label: "Produit le plus vendu", type: "text" },
  signups: { label: "Nb d'inscrits", type: "number" },
  conversions: { label: "Nb de conversions (achat)", type: "number" },
  waitlist: { label: "Inscrits liste d'attente", type: "number" },
  requests_received: { label: "Demandes reçues", type: "number" },
  projects_signed: { label: "Projets signés", type: "number" },
};

const ALL_TRAFFIC_SOURCES = [
  { id: "search", label: "Recherche Google (SEO)" },
  { id: "social", label: "Réseaux sociaux" },
  { id: "pinterest", label: "Pinterest" },
  { id: "instagram", label: "Instagram" },
  { id: "newsletter", label: "Newsletter / Email" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "tiktok", label: "TikTok" },
  { id: "ads", label: "Publicité payante" },
];

const ALL_LAUNCH_METRICS = [
  { id: "signups", label: "Inscriptions (liste d'attente / freebie)" },
  { id: "launch_dms", label: "DM liés au lancement" },
  { id: "link_clicks", label: "Clics lien de vente" },
  { id: "story_views", label: "Vues stories lancement" },
  { id: "conversions", label: "Conversions (ventes)" },
  { id: "webinar_signups", label: "Inscrits webinar" },
  { id: "live_participants", label: "Participants live" },
  { id: "freebie_downloads", label: "Téléchargements freebie" },
];

const WEBSITE_PLATFORMS = [
  { id: "squarespace", label: "Squarespace" },
  { id: "wordpress", label: "WordPress" },
  { id: "shopify", label: "Shopify" },
  { id: "wix", label: "Wix" },
  { id: "webflow", label: "Webflow" },
  { id: "other", label: "Autre" },
];

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

  // Period selector
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this_month");
  const [customFrom, setCustomFrom] = useState(() => monthKey(new Date(now.getFullYear(), now.getMonth() - 5, 1)));
  const [customTo, setCustomTo] = useState(currentMonthDate);

  // Stats config
  const [config, setConfig] = useState<StatsConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);

  // Onboarding draft config
  const [draftConfig, setDraftConfig] = useState<StatsConfig>({
    website_platform: null,
    uses_ga4: false,
    traffic_sources: ["search", "social", "pinterest", "instagram"],
    sales_pages: [],
    business_type: null,
    business_metrics: ["discovery_calls", "clients_signed", "revenue", "ad_budget"],
    launch_metrics: ["signups", "launch_dms", "link_clicks", "story_views", "conversions"],
    custom_metrics: [],
  });

  // Load config
  const loadConfig = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("stats_config" as any)
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      const cfg = data as any as StatsConfig;
      setConfig(cfg);
      setDraftConfig(cfg);
    } else {
      setShowOnboarding(true);
    }
    setConfigLoaded(true);
  }, [user]);

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
    if (rows.length >= 2) {
      setCompareA(rows[0].month_date);
      setCompareB(rows[1].month_date);
    } else if (rows.length === 1) {
      setCompareA(rows[0].month_date);
    }
  }, [user]);

  useEffect(() => { loadConfig(); loadStats(); }, [loadConfig, loadStats]);

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

  // Period filtered data
  const periodRange = useMemo(() => {
    if (periodPreset === "custom") return { from: customFrom, to: customTo };
    return getPeriodRange(periodPreset, now);
  }, [periodPreset, customFrom, customTo, now]);

  const periodStats = useMemo(() => {
    return allStats.filter(s => s.month_date >= periodRange.from && s.month_date <= periodRange.to)
      .sort((a, b) => a.month_date.localeCompare(b.month_date));
  }, [allStats, periodRange]);

  const isSingleMonth = periodRange.from === periodRange.to;

  // Compute dashboard KPIs based on period
  const dashboardKPIs = useMemo(() => {
    if (periodStats.length === 0) return null;
    const last = periodStats[periodStats.length - 1];
    const followers = last.followers; // last month value
    const avgReach = periodStats.reduce((s, r) => s + (r.reach || 0), 0) / periodStats.length;
    const avgEngagement = periodStats.reduce((s, r) => s + (safeDivPct(r.interactions, r.reach) || 0), 0) / periodStats.length;
    const totalRevenue = periodStats.reduce((s, r) => s + (r.revenue || 0), 0);

    // Compare to equivalent previous period
    const periodMonths = periodStats.length;
    const prevStats = allStats
      .filter(s => s.month_date < periodRange.from)
      .sort((a, b) => b.month_date.localeCompare(a.month_date))
      .slice(0, periodMonths)
      .reverse();

    const prevFollowers = prevStats.length > 0 ? prevStats[prevStats.length - 1]?.followers : null;
    const prevAvgReach = prevStats.length > 0
      ? prevStats.reduce((s, r) => s + (r.reach || 0), 0) / prevStats.length : null;
    const prevAvgEngagement = prevStats.length > 0
      ? prevStats.reduce((s, r) => s + (safeDivPct(r.interactions, r.reach) || 0), 0) / prevStats.length : null;
    const prevTotalRevenue = prevStats.length > 0
      ? prevStats.reduce((s, r) => s + (r.revenue || 0), 0) : null;

    return {
      followers, avgReach: Math.round(avgReach), avgEngagement, totalRevenue,
      changeFollowers: pctChange(followers, prevFollowers),
      changeReach: pctChange(avgReach, prevAvgReach),
      changeEngagement: pctChange(avgEngagement, prevAvgEngagement),
      changeRevenue: pctChange(totalRevenue, prevTotalRevenue),
      followersGained: isSingleMonth ? last.followers_gained : null,
    };
  }, [periodStats, allStats, periodRange, isSingleMonth]);

  // Chart data based on period
  const chartData = useMemo(() =>
    periodStats.map(s => ({
      month: monthLabelShort(s.month_date),
      followers: s.followers ?? 0,
      reach: s.reach ?? 0,
      engagement: safeDivPct(s.interactions, s.reach) ?? 0,
      revenue: s.revenue ?? 0,
      clients: s.clients_signed ?? 0,
      ...(config?.traffic_sources || ["search", "social", "pinterest", "instagram"]).reduce((acc, src) => {
        if (s.website_data && typeof s.website_data === "object" && s.website_data.sources) {
          acc[`traffic_${src}`] = s.website_data.sources[src] ?? (s as any)[`traffic_${src}`] ?? 0;
        } else {
          acc[`traffic_${src}`] = (s as any)[`traffic_${src}`] ?? 0;
        }
        return acc;
      }, {} as Record<string, number>),
    }))
  , [periodStats, config]);

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
  };

  // Excel import — robust French date parsing
  const parseMonthDate = (value: any, rowIndex: number, prevDate: Date | null): Date | null => {
    if (!value && value !== 0) return null;

    // Case 1: Date object (SheetJS with cellDates: true)
    if (value instanceof Date && !isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), 1);
    }

    // Case 2: Excel serial number (number like 45347)
    if (typeof value === "number") {
      if (value > 40000 && value < 60000) {
        const d = new Date((value - 25569) * 86400 * 1000);
        if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
      }
      try {
        const parsed = XLSX.SSF.parse_date_code(value) as any;
        if (parsed) return new Date(parsed.y, parsed.m - 1, 1);
      } catch { /* fall through */ }
      return null;
    }

    if (typeof value !== "string") return null;
    const text = value.trim().toLowerCase().replace(/['']/g, "'");
    if (!text) return null;

    // Case 3: ISO string "2024-02-24" or "2024-02-24T00:00:00.000Z"
    if (text.match(/^\d{4}-\d{2}-\d{2}/)) {
      const d = new Date(text);
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
    }

    // Case 4: French date "24/02/2024"
    const frMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (frMatch) {
      const d = new Date(parseInt(frMatch[3]), parseInt(frMatch[2]) - 1, 1);
      if (!isNaN(d.getTime())) return d;
    }

    // Case 5: Try standard Date parse for other patterns
    if (/\d{4}/.test(value.trim())) {
      const iso = new Date(value.trim());
      if (!isNaN(iso.getTime())) return new Date(iso.getFullYear(), iso.getMonth(), 1);
    }

    // Case 6: French month name ("Août 24", "Sept", "Novembre", etc.)
    const monthMap: Record<string, number> = {
      janvier: 0, jan: 0, janv: 0,
      "février": 1, fevrier: 1, fev: 1, "fév": 1,
      mars: 2, mar: 2,
      avril: 3, avr: 3,
      mai: 4,
      juin: 5,
      juillet: 6, juil: 6,
      aout: 7, "août": 7,
      septembre: 8, sept: 8, sep: 8,
      octobre: 9, oct: 9,
      novembre: 10, nov: 10,
      "décembre": 11, decembre: 11, dec: 11, "déc": 11,
    };

    let foundMonth: number | null = null;
    const sortedKeys = Object.keys(monthMap).sort((a, b) => b.length - a.length);
    for (const name of sortedKeys) {
      if (text.startsWith(name)) { foundMonth = monthMap[name]; break; }
    }
    if (foundMonth === null) return null;

    const yearMatch = text.match(/(\d{2,4})/);
    let foundYear: number | null = null;
    if (yearMatch) {
      let y = parseInt(yearMatch[1]);
      if (y < 100) y += 2000;
      foundYear = y;
    }

    if (foundYear === null && prevDate) {
      if (foundMonth <= prevDate.getMonth()) {
        foundYear = prevDate.getFullYear() + 1;
      } else {
        foundYear = prevDate.getFullYear();
      }
    }

    if (foundYear === null) {
      foundYear = rowIndex <= 12 ? 2024 : rowIndex <= 24 ? 2025 : 2026;
    }

    return new Date(foundYear, foundMonth, 1);
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, {
        type: "array",
        cellDates: true,
        dateNF: "dd/mm/yyyy",
      });
      // Prefer sheet named "Bon suivi KPI"
      const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("bon suivi")) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: null,
        raw: false,
        dateNF: "yyyy-mm-dd",
      });

      console.log(`[Excel Import] Sheet: "${sheetName}", ${rows.length} rows (incl. header)`);
      if (rows.length > 0) console.log("[Excel Import] Header:", rows[0]);
      if (rows.length > 1) console.log("[Excel Import] Row 2 sample:", rows[1]);

      const importedRows: { monthDate: string; payload: any }[] = [];
      const skippedRows: { row: number; value: any; reason: string }[] = [];
      let prevDate: Date | null = null;

      const safeNum = (val: any): number | null => {
        if (val == null || val === "" || val === "-" || val === "/" || val === "__" || val === "—" || val === "--") return null;
        if (typeof val === "number") return isNaN(val) ? null : val;
        if (typeof val === "string") {
          // Handle cases like "86500 (pub)\n31000 (sans pub)" — take first number
          const match = val.match(/[\d\s.,]+/);
          if (match) {
            const cleaned = match[0].replace(/[\s.]/g, "").replace(",", ".");
            const n = parseFloat(cleaned);
            return isNaN(n) ? null : n;
          }
          return null;
        }
        return null;
      };
      const txt = (val: any) => (val != null && val !== "" && val !== "__" && val !== "--") ? String(val) : null;

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.every((c: any) => c == null || c === "")) continue;
        // Don't skip rows where col A is empty but other cols have data — just skip if truly empty
        if (!r[0] && !r[1] && !r[2]) continue;

        const md = parseMonthDate(r[0], i, prevDate);
        if (!md) {
          if (r[0] != null && String(r[0]).trim() !== "") {
            skippedRows.push({ row: i + 1, value: r[0], reason: "Date non reconnue" });
          }
          continue; // ← CONTINUE, never break
        }
        prevDate = md;

        const payload: any = {
          user_id: user.id, month_date: monthKey(md),
          objective: txt(r[1]), content_published: txt(r[2]),
          views: safeNum(r[3]), stories_coverage: safeNum(r[4]),
          reach: safeNum(r[5]), profile_visits: safeNum(r[6]),
          website_clicks: safeNum(r[7]), interactions: safeNum(r[8]),
          accounts_engaged: safeNum(r[9]), followers_engaged: safeNum(r[11]),
          followers: safeNum(r[12]), followers_gained: safeNum(r[13]),
          followers_lost: safeNum(r[15]), email_signups: safeNum(r[17]),
          newsletter_subscribers: safeNum(r[18]), website_visitors: safeNum(r[19]),
          traffic_pinterest: safeNum(r[20]), traffic_instagram: safeNum(r[21]),
          ga4_users: safeNum(r[22]), traffic_search: safeNum(r[23]),
          traffic_social: safeNum(r[24]), ad_budget: safeNum(r[25]),
          page_views_plan: safeNum(r[26]), page_views_academy: safeNum(r[27]),
          page_views_agency: safeNum(r[28]), discovery_calls: safeNum(r[29]),
          clients_signed: safeNum(r[31]), revenue: safeNum(r[32]),
        };
        importedRows.push({ monthDate: monthKey(md), payload });
      }

      // Fix year sequence gaps (e.g. dec 2024 → jan 2026 should be jan 2025)
      importedRows.sort((a, b) => a.monthDate.localeCompare(b.monthDate));
      const corrections: string[] = [];
      for (let i = 1; i < importedRows.length; i++) {
        const prevD = new Date(importedRows[i - 1].monthDate);
        const currD = new Date(importedRows[i].monthDate);
        const monthDiff = (currD.getFullYear() - prevD.getFullYear()) * 12 + (currD.getMonth() - prevD.getMonth());
        if (monthDiff > 6) {
          const expectedMonth = (prevD.getMonth() + 1) % 12;
          const expectedYear = prevD.getMonth() + 1 > 11 ? prevD.getFullYear() + 1 : prevD.getFullYear();
          const correctedDate = new Date(expectedYear, expectedMonth, 1);
          const oldKey = importedRows[i].monthDate;
          const newKey = monthKey(correctedDate);
          importedRows[i].monthDate = newKey;
          importedRows[i].payload.month_date = newKey;
          corrections.push(`${monthLabel(oldKey)} → ${monthLabel(newKey)}`);
          // Re-sort after correction and re-check from this index
        }
      }
      if (corrections.length > 0) {
        console.log("[Excel Import] Year corrections:", corrections);
        // Re-sort after all corrections
        importedRows.sort((a, b) => a.monthDate.localeCompare(b.monthDate));
      }

      // Batch upsert
      let imported = 0;
      for (const row of importedRows) {
        const { error } = await supabase.from("monthly_stats" as any).upsert(row.payload, { onConflict: "user_id,month_date" });
        if (!error) imported++;
      }

      const firstMonth = importedRows.length > 0 ? monthLabel(importedRows[0].monthDate) : "";
      const lastMonth = importedRows.length > 0 ? monthLabel(importedRows[importedRows.length - 1].monthDate) : "";
      let description = imported > 0 ? `De ${firstMonth} à ${lastMonth}` : "Aucune donnée trouvée dans le fichier.";
      if (corrections.length > 0) {
        description += `\n⚠️ ${corrections.length} correction(s) d'année automatique(s).`;
      }
      if (skippedRows.length > 0) {
        description += `\n${skippedRows.length} ligne(s) ignorée(s) : ${skippedRows.map(s => `L${s.row} "${s.value}"`).join(", ")}`;
      }

      toast({ title: `✅ ${imported} mois importés`, description });
      loadStats();
    } catch (err) {
      console.error("Import error:", err);
      toast({ title: "Erreur lors de l'import", description: "Vérifie le format de ton fichier Excel.", variant: "destructive" });
    }
    e.target.value = "";
  };

  // Save config
  const saveConfig = async (cfg: StatsConfig) => {
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
  };

  // Computed values
  const engagementRate = safeDivPct(formData.interactions, formData.reach);
  const followersEngagedPct = safeDivPct(formData.followers_engaged, formData.followers);
  const profileConversionRate = safeDivPct(formData.followers_gained, formData.profile_visits);
  const totalPageViews = (formData.page_views_plan || 0) + (formData.page_views_academy || 0) + (formData.page_views_agency || 0);
  const callConversionRate = safeDivPct(formData.discovery_calls, totalPageViews || null);
  const avgBasket = safeDiv(formData.revenue, formData.clients_signed);
  const cac = safeDiv(formData.ad_budget, formData.clients_signed);

  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({ value: monthKey(d), label: monthLabel(monthKey(d)) });
    }
    return options;
  }, [now]);

  const activeConfig = config || draftConfig;

  // ── ONBOARDING ──
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
                    <Input className="mt-2 max-w-xs" placeholder="Précise la plateforme..." value={draftConfig.website_platform_other || ""}
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
                    <Input placeholder="Nom de la page/offre" value={page.name}
                      onChange={e => {
                        const pages = [...(draftConfig.sales_pages || [])];
                        pages[i] = { ...pages[i], name: e.target.value };
                        setDraftConfig(c => ({ ...c, sales_pages: pages }));
                      }} className="flex-1" />
                    <Input placeholder="URL" value={page.url}
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
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => { setShowOnboarding(true); setOnboardingStep(1); setConfig(null); }}>
            <Settings className="h-4 w-4" /> Configurer
          </Button>
        </div>

        {/* ─── PERIOD SELECTOR ─── */}
        <div className="flex items-center gap-3 flex-wrap">
          <Label className="text-sm font-medium">Période :</Label>
          <Select value={periodPreset} onValueChange={v => setPeriodPreset(v as PeriodPreset)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map(k => (
                <SelectItem key={k} value={k}>{PERIOD_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {periodPreset === "custom" && (
          <div className="flex items-center gap-3 flex-wrap">
            <Label className="text-sm">Du :</Label>
            <Select value={customFrom} onValueChange={setCustomFrom}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Label className="text-sm">Au :</Label>
            <Select value={customTo} onValueChange={setCustomTo}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* ─── DASHBOARD CARDS ─── */}
        {dashboardKPIs && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DashboardCard icon="👥" label="Abonné·es" value={fmt(dashboardKPIs.followers)}
              change={dashboardKPIs.changeFollowers}
              sub={dashboardKPIs.followersGained != null ? `+${dashboardKPIs.followersGained}` : undefined} />
            <DashboardCard icon="📣" label={isSingleMonth ? "Portée" : "Portée moy."} value={fmt(dashboardKPIs.avgReach)}
              change={dashboardKPIs.changeReach} />
            <DashboardCard icon="💬" label={isSingleMonth ? "Engagement" : "Engagement moy."} value={fmtPct(dashboardKPIs.avgEngagement)}
              change={dashboardKPIs.changeEngagement} />
            <DashboardCard icon="💰" label={isSingleMonth ? "CA" : "CA cumulé"} value={fmtEur(dashboardKPIs.totalRevenue)}
              change={dashboardKPIs.changeRevenue} />
          </div>
        )}

        {/* ─── API placeholder ─── */}
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground flex items-start gap-2">
          <span>📸</span>
          <span>Bientôt : connecte ton Instagram pour remplir tes stats automatiquement.</span>
        </div>

        {/* ─── TABS ─── */}
        <Tabs defaultValue="overview" className="space-y-5">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="overview">📊 Vue d'ensemble</TabsTrigger>
            <TabsTrigger value="input">📝 Saisir mes stats</TabsTrigger>
            <TabsTrigger value="ai">🧠 Analyse IA</TabsTrigger>
          </TabsList>

          {/* ═══ OVERVIEW TAB ═══ */}
          <TabsContent value="overview" className="space-y-8">
            {chartData.length < 2 && !isSingleMonth ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Saisis au moins 2 mois de stats pour voir les graphiques d'évolution.
              </p>
            ) : chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Aucune donnée pour cette période.
              </p>
            ) : (
              <>
                {chartData.length >= 2 && (
                  <>
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

                    {/* Traffic sources — dynamic based on config */}
                    <ChartCard title="Sources de trafic site web">
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                          <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                          <Legend />
                          {(activeConfig.traffic_sources || []).map((src, i) => {
                            const colors = ["#fb3d80", "#8B5CF6", "#FFE561", "#ffa7c6", "#34D399", "#60A5FA", "#F59E0B", "#A78BFA", "#FB923C"];
                            const label = ALL_TRAFFIC_SOURCES.find(s => s.id === src)?.label || src;
                            return (
                              <Bar key={src} dataKey={`traffic_${src}`} stackId="a" fill={colors[i % colors.length]} name={label}
                                radius={i === (activeConfig.traffic_sources || []).length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                            );
                          })}
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>

                    {/* CA + Clients */}
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
                  </>
                )}

                {/* Funnel — adapts to business type */}
                <ChartCard title="Funnel de conversion">
                  <FunnelChart data={periodStats.length > 0 ? periodStats[periodStats.length - 1] : undefined} businessType={activeConfig.business_type} />
                </ChartCard>

                {/* Comparison */}
                {allStats.length >= 2 && (
                  <ComparisonTable allStats={allStats} compareA={compareA} compareB={compareB}
                    setCompareA={setCompareA} setCompareB={setCompareB} />
                )}
              </>
            )}
          </TabsContent>

          {/* ═══ INPUT TAB ═══ */}
          <TabsContent value="input" className="space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
              <Label className="text-sm font-medium">Mois :</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="ml-auto cursor-pointer">
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelImport} />
                <Button variant="outline" size="sm" className="gap-1.5 pointer-events-none" tabIndex={-1}>
                  <Upload className="h-3.5 w-3.5" /> Importer (Excel)
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
                    <NumInput label="Comptes touchés (portée)" value={formData.reach} onChange={v => handleChange("reach", v)} />
                    <NumInput label="Couverture stories" value={formData.stories_coverage} onChange={v => handleChange("stories_coverage", v)} />
                    <NumInput label="Nb de vues" value={formData.views} onChange={v => handleChange("views", v)} />
                    <NumInput label="Visites du profil" value={formData.profile_visits} onChange={v => handleChange("profile_visits", v)} />
                    <NumInput label="Clics site web" value={formData.website_clicks} onChange={v => handleChange("website_clicks", v)} />
                    <NumInput label="Interactions" value={formData.interactions} onChange={v => handleChange("interactions", v)} />
                    <NumInput label="Comptes qui ont interagi" value={formData.accounts_engaged} onChange={v => handleChange("accounts_engaged", v)} />
                    <NumInput label="Followers qui ont interagi" value={formData.followers_engaged} onChange={v => handleChange("followers_engaged", v)} />
                    <NumInput label="Nb de followers" value={formData.followers} onChange={v => handleChange("followers", v)} />
                    <NumInput label="Followers en +" value={formData.followers_gained} onChange={v => handleChange("followers_gained", v)} />
                    <NumInput label="Followers en -" value={formData.followers_lost} onChange={v => handleChange("followers_lost", v)} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <ComputedField label="Taux d'engagement" value={fmtPct(engagementRate)} />
                    <ComputedField label="% followers interagi" value={fmtPct(followersEngagedPct)} />
                    <ComputedField label="Conversion profil" value={fmtPct(profileConversionRate)} />
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

              {/* Site web — dynamic based on config */}
              <AccordionItem value="website" className="border rounded-xl px-4">
                <AccordionTrigger className="font-display text-sm font-bold">
                  🌐 Site web {activeConfig.website_platform ? `(${getPlatformLabel(activeConfig)})` : ""}
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <NumInput label={`Visiteurs uniques${activeConfig.uses_ga4 ? " (GA4)" : ""}`}
                      value={formData.website_visitors} onChange={v => handleChange("website_visitors", v)} />
                    {activeConfig.uses_ga4 && (
                      <NumInput label="Utilisateurs actifs (GA4)" value={formData.ga4_users} onChange={v => handleChange("ga4_users", v)} />
                    )}
                  </div>
                  {(activeConfig.traffic_sources || []).length > 0 && (
                    <>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-2">Sources de trafic</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(activeConfig.traffic_sources || []).map(src => {
                          const label = ALL_TRAFFIC_SOURCES.find(s => s.id === src)?.label || src;
                          return <NumInput key={src} label={label} value={formData[`traffic_${src}`]} onChange={v => handleChange(`traffic_${src}`, v)} />;
                        })}
                      </div>
                    </>
                  )}
                  <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => { setShowOnboarding(true); setOnboardingStep(1); setConfig(null); }}>
                    <Settings className="h-3.5 w-3.5" /> Modifier la configuration
                  </Button>
                </AccordionContent>
              </AccordionItem>

              {/* Pages de vente — dynamic based on config */}
              <AccordionItem value="sales_pages" className="border rounded-xl px-4">
                <AccordionTrigger className="font-display text-sm font-bold">📄 Mes pages de vente</AccordionTrigger>
                <AccordionContent className="pb-4 space-y-4">
                  {(activeConfig.sales_pages || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune page configurée.
                      <Button variant="link" size="sm" className="ml-1 p-0 h-auto" onClick={() => { setShowOnboarding(true); setOnboardingStep(2); setConfig(null); }}>
                        Configurer
                      </Button>
                    </p>
                  ) : (
                    (activeConfig.sales_pages || []).map((page, i) => (
                      <div key={i}>
                        <p className="text-sm font-medium text-foreground mb-1">"{page.name}"</p>
                        <NumInput label="Visiteurs uniques"
                          value={(formData.sales_pages_data as any)?.[page.name] ?? formData[`page_views_${i}`]}
                          onChange={v => {
                            const spd = { ...(formData.sales_pages_data || {}) as any, [page.name]: v === "" ? null : Number(v) };
                            setFormData(prev => ({ ...prev, sales_pages_data: spd }));
                          }} />
                      </div>
                    ))
                  )}
                  {/* Backward compat for old fixed fields */}
                  {(activeConfig.sales_pages || []).length === 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <NumInput label="Visiteurs plan com'" value={formData.page_views_plan} onChange={v => handleChange("page_views_plan", v)} />
                      <NumInput label="Visiteurs Academy" value={formData.page_views_academy} onChange={v => handleChange("page_views_academy", v)} />
                      <NumInput label="Visiteurs Agency" value={formData.page_views_agency} onChange={v => handleChange("page_views_agency", v)} />
                    </div>
                  )}
                  <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => { setShowOnboarding(true); setOnboardingStep(2); setConfig(null); }}>
                    <Settings className="h-3.5 w-3.5" /> Modifier
                  </Button>
                </AccordionContent>
              </AccordionItem>

              {/* Business — dynamic based on config */}
              <AccordionItem value="business" className="border rounded-xl px-4">
                <AccordionTrigger className="font-display text-sm font-bold">
                  💰 Business {activeConfig.business_type ? `(${BUSINESS_PRESETS[activeConfig.business_type]?.label || ""})` : ""}
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(activeConfig.business_metrics || ["discovery_calls", "clients_signed", "revenue", "ad_budget"]).map(metricId => {
                      const meta = ALL_BUSINESS_METRICS[metricId];
                      if (!meta) return null;
                      if (meta.type === "text") {
                        return <TextInput key={metricId} label={meta.label}
                          value={(formData.business_data as any)?.[metricId] ?? formData[metricId]}
                          onChange={v => {
                            const bd = { ...(formData.business_data || {}) as any, [metricId]: v };
                            setFormData(prev => ({ ...prev, business_data: bd }));
                          }} />;
                      }
                      // Use existing columns for backward compat
                      const existingCols = ["discovery_calls", "clients_signed", "revenue", "ad_budget"];
                      if (existingCols.includes(metricId)) {
                        return <NumInput key={metricId} label={meta.label + (meta.type === "euro" ? " (€)" : "")}
                          value={formData[metricId]} onChange={v => handleChange(metricId, v)} />;
                      }
                      return <NumInput key={metricId} label={meta.label + (meta.type === "euro" ? " (€)" : "")}
                        value={(formData.business_data as any)?.[metricId]}
                        onChange={v => {
                          const bd = { ...(formData.business_data || {}) as any, [metricId]: v === "" ? null : Number(v) };
                          setFormData(prev => ({ ...prev, business_data: bd }));
                        }} />;
                    })}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <ComputedField label="Panier moyen" value={fmtEur(avgBasket)} />
                    <ComputedField label="CAC" value={fmtEur(cac)} />
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => { setShowOnboarding(true); setOnboardingStep(3); setConfig(null); }}>
                    <Settings className="h-3.5 w-3.5" /> Modifier
                  </Button>
                </AccordionContent>
              </AccordionItem>

              {/* Lancement */}
              <AccordionItem value="launch" className="border rounded-xl px-4">
                <AccordionTrigger className="font-display text-sm font-bold">🚀 Lancement (optionnel)</AccordionTrigger>
                <AccordionContent className="space-y-3 pb-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={!!formData.has_launch}
                      onCheckedChange={v => setFormData(prev => ({ ...prev, has_launch: v }))} />
                    <Label className="text-sm">J'ai un lancement ce mois</Label>
                  </div>
                  {formData.has_launch && (
                    <>
                      <TextInput label="Nom du lancement" value={formData.launch_name}
                        onChange={v => handleChange("launch_name", v, true)} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(activeConfig.launch_metrics || ["signups", "launch_dms", "link_clicks", "story_views", "conversions"]).map(metricId => {
                          const label = ALL_LAUNCH_METRICS.find(m => m.id === metricId)?.label || metricId;
                          // Use existing columns for backward compat
                          const existingCols: Record<string, string> = {
                            signups: "launch_signups", launch_dms: "launch_dms",
                            link_clicks: "launch_link_clicks", story_views: "launch_story_views",
                            conversions: "launch_conversions",
                          };
                          if (existingCols[metricId]) {
                            return <NumInput key={metricId} label={label} value={formData[existingCols[metricId]]}
                              onChange={v => handleChange(existingCols[metricId], v)} />;
                          }
                          return <NumInput key={metricId} label={label}
                            value={(formData.launch_data as any)?.[metricId]}
                            onChange={v => {
                              const ld = { ...(formData.launch_data || {}) as any, [metricId]: v === "" ? null : Number(v) };
                              setFormData(prev => ({ ...prev, launch_data: ld }));
                            }} />;
                        })}
                      </div>
                    </>
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

function getPlatformLabel(config: StatsConfig) {
  if (!config.website_platform) return "";
  const p = WEBSITE_PLATFORMS.find(p => p.id === config.website_platform);
  let label = p?.label || config.website_platform;
  if (config.website_platform === "other" && config.website_platform_other) label = config.website_platform_other;
  if (config.uses_ga4) label += " + GA4";
  return label;
}

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

function FunnelChart({ data, businessType }: { data: StatsRow | undefined; businessType?: string | null }) {
  if (!data) return <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée disponible.</p>;

  const totalPageViews = (data.page_views_plan || 0) + (data.page_views_academy || 0) + (data.page_views_agency || 0);

  let steps: { label: string; value: number }[];
  switch (businessType) {
    case "ecommerce":
      steps = [
        { label: "Comptes touchés", value: data.reach || 0 },
        { label: "Visites profil", value: data.profile_visits || 0 },
        { label: "Boutique", value: data.website_visitors || 0 },
        { label: "Panier", value: (data.business_data as any)?.orders || data.clients_signed || 0 },
        { label: "Commande", value: (data.business_data as any)?.orders || data.clients_signed || 0 },
      ];
      break;
    case "formations":
      steps = [
        { label: "Comptes touchés", value: data.reach || 0 },
        { label: "Visites profil", value: data.profile_visits || 0 },
        { label: "Page vente", value: totalPageViews || data.website_clicks || 0 },
        { label: "Inscription", value: (data.business_data as any)?.signups || 0 },
        { label: "Achat", value: (data.business_data as any)?.conversions || data.clients_signed || 0 },
      ];
      break;
    case "freelance":
      steps = [
        { label: "Comptes touchés", value: data.reach || 0 },
        { label: "Visites profil", value: data.profile_visits || 0 },
        { label: "Site", value: data.website_clicks || 0 },
        { label: "Demande", value: (data.business_data as any)?.requests_received || 0 },
        { label: "Devis", value: (data.business_data as any)?.proposals_sent || 0 },
        { label: "Projet", value: (data.business_data as any)?.projects_signed || data.clients_signed || 0 },
      ];
      break;
    default: // services
      steps = [
        { label: "Comptes touchés", value: data.reach || 0 },
        { label: "Visites profil", value: data.profile_visits || 0 },
        { label: "Clics site", value: data.website_clicks || 0 },
        { label: "Pages vente", value: totalPageViews },
        { label: "Appels", value: data.discovery_calls || 0 },
        { label: "Clients", value: data.clients_signed || 0 },
      ];
  }

  const maxVal = Math.max(...steps.map(s => s.value), 1);

  return (
    <div className="space-y-2 py-2">
      {steps.map((step, i) => {
        const pct = (step.value / maxVal) * 100;
        const convRate = i > 0 && steps[i - 1].value > 0
          ? ((step.value / steps[i - 1].value) * 100).toFixed(1) : null;
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
              <div className="h-full rounded-lg transition-all duration-500"
                style={{ width: `${Math.max(pct, 2)}%`, background: `linear-gradient(90deg, #fb3d80, #ffa7c6)` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
                const f = (m as any).format || fmt;
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
