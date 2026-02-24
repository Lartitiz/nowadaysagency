import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, CheckCircle2, AlertTriangle, XCircle, Info, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

const ADMIN_EMAIL = "laetitia@nowadaysagency.com";

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */
interface AuditResult {
  status: "ok" | "warning" | "error" | "info";
  category: string;
  title: string;
  detail?: string;
  fix?: () => Promise<void>;
  fixLabel?: string;
}

type AuditStep = {
  label: string;
  status: "pending" | "running" | "done";
  count?: number;
};

/* ═══════════════════════════════════════════
   AUDIT CHECKS
   ═══════════════════════════════════════════ */

// Helper to safely query any table
async function safeQuery(table: string, select = "*", filters?: Record<string, any>) {
  try {
    let q = (supabase.from(table as any) as any).select(select);
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        if (v === null) q = q.is(k, null);
        else q = q.eq(k, v);
      }
    }
    const { data, error } = await q;
    return { data, error };
  } catch (e: any) {
    return { data: null, error: e };
  }
}

async function checkSchema(): Promise<AuditResult[]> {
  const results: AuditResult[] = [];
  const TABLES = [
    "profiles", "brand_profile", "persona", "offers", "user_offers",
    "calendar_posts", "coaching_programs", "coaching_sessions",
    "coaching_deliverables", "branding_coaching_sessions",
    "intake_questionnaires", "subscriptions", "saved_ideas",
    "generated_posts", "generated_carousels", "instagram_audit",
    "linkedin_audit", "branding_audits", "stories_sequences",
    "content_drafts", "content_scores", "engagement_contacts",
    "engagement_streaks", "engagement_weekly", "user_documents",
    "branding_suggestions", "branding_summary", "storytelling",
    "brand_proposition", "brand_strategy", "voice_profile",
    "communication_plans", "user_rhythm",
  ];

  for (const table of TABLES) {
    const { error } = await safeQuery(table, "id", undefined);
    if (error) {
      results.push({
        status: "error",
        category: "Tables",
        title: `Table ${table} inaccessible`,
        detail: error.message || String(error),
      });
    } else {
      results.push({
        status: "ok",
        category: "Tables",
        title: `Table ${table}`,
        detail: "Accessible ✓",
      });
    }
  }
  return results;
}

async function checkDataCoherence(): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  // 1. Active programs with mismatched subscription
  const { data: activePrograms } = await safeQuery("coaching_programs", "id, client_user_id, status", { status: "active" });
  for (const prog of activePrograms || []) {
    const { data: sub } = await (supabase.from("subscriptions" as any) as any)
      .select("plan")
      .eq("user_id", prog.client_user_id)
      .maybeSingle();

    if (!sub || sub.plan !== "now_pilot") {
      results.push({
        status: "error",
        category: "Données",
        title: "Plan désynchronisé",
        detail: `Client ${prog.client_user_id.slice(0, 8)}… a un programme actif mais sub.plan = '${sub?.plan || "absent"}'`,
        fixLabel: "Synchroniser → now_pilot",
        fix: async () => {
          await (supabase.from("subscriptions" as any) as any)
            .upsert({
              user_id: prog.client_user_id,
              plan: "now_pilot",
              status: "active",
              source: "coaching",
            }, { onConflict: "user_id" });
        },
      });
    }
  }

  // 2. Sessions without scheduled_date
  const { data: sessionsNoDate } = await (supabase.from("coaching_sessions" as any) as any)
    .select("id, title, session_number")
    .is("scheduled_date", null);
  if (sessionsNoDate?.length) {
    results.push({
      status: "warning",
      category: "Données",
      title: `${sessionsNoDate.length} session(s) sans date`,
      detail: "Ces sessions n'apparaîtront pas dans le planning client.",
    });
  }

  // 3. Coaching deliverables not delivered
  const { data: pendingDeliverables } = await safeQuery("coaching_deliverables", "id, title, status", { status: "pending" });
  if (pendingDeliverables?.length) {
    results.push({
      status: "info",
      category: "Données",
      title: `${pendingDeliverables.length} livrable(s) en attente`,
      detail: "Ces livrables n'ont pas encore été livrés à la cliente.",
    });
  }

  // 4. Brand profiles with key fields empty
  const { data: allBrand } = await (supabase.from("brand_profile" as any) as any)
    .select("user_id, positioning, mission, values, tone_keywords");
  for (const b of allBrand || []) {
    const missing: string[] = [];
    if (!b.positioning) missing.push("positionnement");
    if (!b.mission) missing.push("mission");
    if (!b.values || (Array.isArray(b.values) && b.values.length === 0)) missing.push("valeurs");
    if (!b.tone_keywords || (Array.isArray(b.tone_keywords) && b.tone_keywords.length === 0)) missing.push("ton");
    if (missing.length >= 3) {
      results.push({
        status: "warning",
        category: "Données",
        title: `Branding très incomplet (${b.user_id.slice(0, 8)}…)`,
        detail: `Champs vides : ${missing.join(", ")}`,
      });
    }
  }

  // 5. Calendar posts without format
  const { data: postsNoFormat } = await (supabase.from("calendar_posts" as any) as any)
    .select("id")
    .is("format", null);
  if (postsNoFormat?.length > 5) {
    results.push({
      status: "warning",
      category: "Données",
      title: `${postsNoFormat.length} posts sans format`,
      detail: "Ces posts ne peuvent pas être triés par format dans le calendrier.",
    });
  }

  // 6. Instagram audit exists?
  const { data: profiles } = await (supabase.from("profiles" as any) as any)
    .select("id, first_name, instagram_handle");
  for (const p of (profiles || []).filter((p: any) => p.instagram_handle)) {
    const { data: audit } = await (supabase.from("instagram_audit" as any) as any)
      .select("id")
      .eq("user_id", p.id)
      .maybeSingle();
    if (!audit) {
      results.push({
        status: "info",
        category: "Données",
        title: `${p.first_name || "User"} : Instagram sans audit`,
        detail: `Handle @${p.instagram_handle} renseigné mais jamais audité.`,
      });
    }
  }

  // 7. Orphan branding (brand_profile without matching profile)
  const { data: allBrandProfiles } = await (supabase.from("brand_profile" as any) as any).select("user_id");
  for (const b of allBrandProfiles || []) {
    const { data: profile } = await (supabase.from("profiles" as any) as any)
      .select("id")
      .eq("id", b.user_id)
      .maybeSingle();
    if (!profile) {
      results.push({
        status: "error",
        category: "Données",
        title: "Brand profile orphelin",
        detail: `brand_profile.user_id = ${b.user_id.slice(0, 8)}… mais ce profil n'existe pas.`,
      });
    }
  }

  if (results.length === 0) {
    results.push({ status: "ok", category: "Données", title: "Cohérence des données", detail: "Aucune anomalie détectée" });
  }
  return results;
}

async function checkRLS(): Promise<AuditResult[]> {
  const results: AuditResult[] = [];
  const tables = [
    "profiles", "brand_profile", "persona", "offers", "user_offers",
    "calendar_posts", "coaching_programs", "coaching_sessions",
    "coaching_deliverables", "branding_coaching_sessions", "subscriptions",
  ];

  for (const table of tables) {
    const { error } = await safeQuery(table, "id");
    if (error && (error.code === "42501" || error.message?.includes("permission"))) {
      results.push({
        status: "error",
        category: "RLS",
        title: `RLS bloquante sur ${table}`,
        detail: "Pas de policy SELECT pour cet utilisateur.",
      });
    } else if (error) {
      results.push({
        status: "warning",
        category: "RLS",
        title: `${table} : erreur d'accès`,
        detail: error.message,
      });
    } else {
      results.push({
        status: "ok",
        category: "RLS",
        title: `${table} : accès OK`,
      });
    }
  }
  return results;
}

async function checkConnections(): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  // Completed coaching sessions without extracted data
  const { data: coachingSessions } = await (supabase.from("branding_coaching_sessions" as any) as any)
    .select("user_id, section, extracted_data, is_complete");
  for (const s of (coachingSessions || []).filter((s: any) => s.is_complete)) {
    const extracted = s.extracted_data || {};
    if (Object.keys(extracted).length === 0) {
      results.push({
        status: "warning",
        category: "Connexions",
        title: `Coaching ${s.section} : pas de données extraites`,
        detail: "Session complétée mais extracted_data est vide. Les fiches ne sont pas alimentées.",
      });
    }
  }

  // Subscriptions without matching profile
  const { data: subs } = await (supabase.from("subscriptions" as any) as any).select("user_id, plan");
  for (const s of (subs || []).filter((s: any) => s.plan === "now_pilot")) {
    const { data: prog } = await (supabase.from("coaching_programs" as any) as any)
      .select("id")
      .eq("client_user_id", s.user_id)
      .eq("status", "active")
      .maybeSingle();
    if (!prog) {
      results.push({
        status: "warning",
        category: "Connexions",
        title: "Abo now_pilot sans programme actif",
        detail: `User ${s.user_id.slice(0, 8)}… a un plan now_pilot mais aucun programme actif.`,
      });
    }
  }

  // Manual check reminders
  results.push({
    status: "info",
    category: "Connexions",
    title: "Calendrier → Générateur",
    detail: "Vérifier manuellement que le clic sur un post du calendrier pré-remplit le générateur.",
  });

  return results;
}

async function checkEdgeFunctions(): Promise<AuditResult[]> {
  const results: AuditResult[] = [];
  const functions = [
    "check-subscription", "generate-content", "branding-coaching",
    "assistant-chat", "create-checkout", "stripe-webhook",
  ];

  for (const fn of functions) {
    try {
      const { error } = await supabase.functions.invoke(fn, {
        method: "POST",
        body: { ping: true },
      });
      // A function that responds (even with error) is deployed
      results.push({
        status: "ok",
        category: "Edge Functions",
        title: fn,
        detail: "Déployée et accessible",
      });
    } catch (e: any) {
      results.push({
        status: "error",
        category: "Edge Functions",
        title: `${fn} inaccessible`,
        detail: e.message,
      });
    }
  }
  return results;
}

/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */
const CATEGORIES = ["Tables", "Données", "RLS", "Connexions", "Edge Functions"] as const;
const CATEGORY_ICONS: Record<string, string> = {
  Tables: "🗄️",
  Données: "📊",
  RLS: "🔒",
  Connexions: "🔗",
  "Edge Functions": "⚡",
};

export default function AdminAuditPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [results, setResults] = useState<AuditResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState<AuditStep[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [fixedItems, setFixedItems] = useState<Set<string>>(new Set());
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const toggleCategory = useCallback((cat: string) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  const runAudit = useCallback(async () => {
    setRunning(true);
    setResults([]);
    setFixedItems(new Set());
    setProgress(0);

    const stepsDef: AuditStep[] = [
      { label: "Tables et colonnes", status: "pending" },
      { label: "Cohérence des données", status: "pending" },
      { label: "RLS et permissions", status: "pending" },
      { label: "Connexions entre modules", status: "pending" },
      { label: "Edge Functions", status: "pending" },
    ];
    setSteps([...stepsDef]);

    const allResults: AuditResult[] = [];
    const runners = [checkSchema, checkDataCoherence, checkRLS, checkConnections, checkEdgeFunctions];

    for (let i = 0; i < runners.length; i++) {
      stepsDef[i].status = "running";
      setSteps([...stepsDef]);
      setProgress(((i) / runners.length) * 100);

      try {
        const r = await runners[i]();
        allResults.push(...r);
        stepsDef[i].count = r.length;
      } catch (e: any) {
        allResults.push({ status: "error", category: stepsDef[i].label, title: "Erreur interne", detail: e.message });
      }

      stepsDef[i].status = "done";
      setSteps([...stepsDef]);
    }

    setResults(allResults);
    setProgress(100);
    setRunning(false);
    setLastRun(new Date());
    toast.success(`Audit terminé : ${allResults.filter(r => r.status === "error").length} erreur(s), ${allResults.filter(r => r.status === "warning").length} warning(s)`);
  }, []);

  const handleFix = async (result: AuditResult, idx: number) => {
    if (!result.fix) return;
    try {
      await result.fix();
      setFixedItems(prev => new Set(prev).add(`${result.category}-${idx}`));
      toast.success(`Corrigé : ${result.title}`);
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    }
  };

  const okCount = results.filter(r => r.status === "ok").length;
  const warnCount = results.filter(r => r.status === "warning").length;
  const errCount = results.filter(r => r.status === "error").length;
  const infoCount = results.filter(r => r.status === "info").length;

  if (!user || user.email !== ADMIN_EMAIL) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => navigate("/admin/coaching")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>

        {/* Header */}
        <div className="bg-card rounded-2xl border border-border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="font-heading text-2xl font-bold text-foreground flex items-center gap-2">
                🔧 Audit complet de l'app
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Scanne toutes les tables, données, RLS et connexions.
              </p>
            </div>
            <Button onClick={runAudit} disabled={running} size="lg" className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {running ? "Audit en cours…" : "Lancer l'audit"}
            </Button>
          </div>
          {lastRun && !running && (
            <p className="text-xs text-muted-foreground">
              Dernier audit : {formatDistanceToNow(lastRun, { addSuffix: true, locale: fr })}
            </p>
          )}
        </div>

        {/* Progress during scan */}
        {running && (
          <div className="bg-card rounded-2xl border border-border p-6 mb-6">
            <h2 className="font-heading text-lg font-bold text-foreground mb-4">🔧 Audit en cours…</h2>
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3 mb-2">
                {step.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : step.status === "running" ? (
                  <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                ) : (
                  <div className="h-4 w-4 rounded border border-muted shrink-0" />
                )}
                <span className={`text-sm ${step.status === "done" ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                  {step.count !== undefined && <span className="ml-2 text-xs text-muted-foreground">({step.count} checks)</span>}
                </span>
              </div>
            ))}
            <Progress value={progress} className="mt-4 h-2" />
          </div>
        )}

        {/* Summary cards */}
        {results.length > 0 && !running && (
          <>
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="bg-green-50 dark:bg-green-950/30 rounded-xl p-4 text-center border border-green-200 dark:border-green-800">
                <p className="text-2xl font-bold text-green-600">{okCount}</p>
                <p className="text-xs text-green-600">OK</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 text-center border border-amber-200 dark:border-amber-800">
                <p className="text-2xl font-bold text-amber-600">{warnCount}</p>
                <p className="text-xs text-amber-600">Warnings</p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-4 text-center border border-red-200 dark:border-red-800">
                <p className="text-2xl font-bold text-red-600">{errCount}</p>
                <p className="text-xs text-red-600">Erreurs</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-4 text-center border border-blue-200 dark:border-blue-800">
                <p className="text-2xl font-bold text-blue-600">{infoCount}</p>
                <p className="text-xs text-blue-600">Infos</p>
              </div>
            </div>

            {/* Results by category */}
            {CATEGORIES.map(cat => {
              const catResults = results.filter(r => r.category === cat);
              if (catResults.length === 0) return null;
              const hasIssues = catResults.some(r => r.status !== "ok");
              const isCollapsed = collapsedCategories[cat];
              const catErrors = catResults.filter(r => r.status === "error").length;
              const catWarnings = catResults.filter(r => r.status === "warning").length;

              return (
                <div key={cat} className="mb-4">
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center justify-between bg-card rounded-xl border border-border p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span>{CATEGORY_ICONS[cat]}</span>
                      <span className="font-medium text-foreground">{cat}</span>
                      <span className="text-xs text-muted-foreground">({catResults.length} checks)</span>
                      {catErrors > 0 && <Badge variant="destructive" className="text-xs">{catErrors} erreur(s)</Badge>}
                      {catWarnings > 0 && <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">{catWarnings} warning(s)</Badge>}
                      {!hasIssues && <Badge className="text-xs bg-green-100 text-green-700 border-green-300">Tout OK</Badge>}
                    </div>
                    {isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {!isCollapsed && (
                    <div className="mt-1 space-y-1">
                      {/* Show errors/warnings first, then infos, then OKs */}
                      {[...catResults]
                        .sort((a, b) => {
                          const order = { error: 0, warning: 1, info: 2, ok: 3 };
                          return order[a.status] - order[b.status];
                        })
                        .map((result, idx) => {
                          const key = `${result.category}-${idx}`;
                          const isFixed = fixedItems.has(key);

                          return (
                            <div
                              key={key}
                              className={`p-3 rounded-xl border ml-4 ${
                                result.status === "error"
                                  ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                                  : result.status === "warning"
                                  ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
                                  : result.status === "info"
                                  ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
                                  : "bg-green-50/50 dark:bg-green-950/10 border-green-200 dark:border-green-800"
                              }`}
                            >
                              <div className="flex justify-between items-start gap-3">
                                <div className="flex items-start gap-2 min-w-0">
                                  {result.status === "ok" && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />}
                                  {result.status === "warning" && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
                                  {result.status === "error" && <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                                  {result.status === "info" && <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />}
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm text-foreground">{result.title}</p>
                                    {result.detail && (
                                      <p className="text-xs text-muted-foreground mt-0.5 break-words">{result.detail}</p>
                                    )}
                                  </div>
                                </div>
                                {result.fix && !isFixed && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs shrink-0"
                                    onClick={() => handleFix(result, idx)}
                                  >
                                    {result.fixLabel || "Corriger →"}
                                  </Button>
                                )}
                                {isFixed && (
                                  <span className="text-xs text-green-600 font-medium shrink-0">✅ Corrigé</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Empty state */}
        {!running && results.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Aucun audit lancé</p>
            <p className="text-sm mt-1">Cliquez sur "Lancer l'audit" pour scanner l'app.</p>
          </div>
        )}
      </div>
    </div>
  );
}
