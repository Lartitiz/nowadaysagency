import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { RefreshCw, ArrowRight, CheckCircle2, AlertTriangle, XCircle, Info, Loader2 } from "lucide-react";

interface Check {
  category: string;
  name: string;
  status: "ok" | "warning" | "error" | "info";
  detail: string;
}

interface Suggestion {
  title: string;
  action: string;
  route: string;
}

const STATUS_CONFIG = {
  error: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Erreur" },
  warning: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10", label: "Warning" },
  info: { icon: Info, color: "text-primary", bg: "bg-primary/10", label: "Info" },
  ok: { icon: CheckCircle2, color: "text-[hsl(160_60%_45%)]", bg: "bg-[hsl(160_60%_45%)]/10", label: "OK" },
};

function CheckRow({ check }: { check: Check }) {
  const cfg = STATUS_CONFIG[check.status];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-start gap-3 rounded-xl px-4 py-3 ${cfg.bg}`}>
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cfg.color}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{check.category} · {check.name}</p>
        <p className="text-xs text-muted-foreground">{check.detail}</p>
      </div>
    </div>
  );
}

const DEMO_CHECKS: Check[] = [
  { category: "Profil", name: "Profil chargé", status: "ok", detail: "OK" },
  { category: "Profil", name: "Prénom renseigné", status: "ok", detail: "Léa" },
  { category: "Profil", name: "Onboarding complété", status: "ok", detail: "Complété" },
  { category: "Branding", name: "Branding existe", status: "ok", detail: "OK" },
  { category: "Branding", name: 'Champ "positioning"', status: "ok", detail: "Rempli" },
  { category: "Branding", name: 'Champ "mission"', status: "ok", detail: "Rempli" },
  { category: "Branding", name: 'Champ "values"', status: "warning", detail: "Vide" },
  { category: "Cible", name: "Persona défini", status: "ok", detail: "1 persona" },
  { category: "Offres", name: "Offres définies", status: "ok", detail: "2 offres" },
  { category: "Calendrier", name: "Posts avec date", status: "ok", detail: "5/5 ont une date" },
  { category: "Calendrier", name: "Posts avec format", status: "warning", detail: "3/5 ont un format" },
  { category: "Calendrier", name: "Compteur publications", status: "info", detail: "1 publié, 4 planifiés" },
  { category: "Audit", name: "Audit réalisé", status: "ok", detail: "Score : 72/100" },
  { category: "Routine", name: "Table routine accessible", status: "ok", detail: "3 entrées récentes" },
  { category: "Badges", name: "Badges débloqués", status: "ok", detail: "4 badges" },
  { category: "Base de données", name: 'Table "profiles"', status: "ok", detail: "Accessible" },
  { category: "Base de données", name: 'Table "calendar_posts"', status: "ok", detail: "Accessible" },
  { category: "Base de données", name: 'Table "brand_profile"', status: "ok", detail: "Accessible" },
  { category: "Crédits", name: "Crédits mensuels", status: "info", detail: "3/10 utilisés" },
];

const DEMO_SUGGESTIONS: Suggestion[] = [
  { title: "Valeurs non renseignées", action: "Complète tes valeurs de marque", route: "/branding" },
  { title: "Posts sans format défini", action: "Définis un format pour chaque post", route: "/calendrier" },
];

export default function ConnectionCheckPage() {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const navigate = useNavigate();
  const [checks, setChecks] = useState<Check[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const runChecks = useCallback(async () => {
    if (isDemoMode) {
      setChecks(DEMO_CHECKS);
      setSuggestions(DEMO_SUGGESTIONS);
      setLastRun(new Date());
      return;
    }
    if (!user) return;
    setLoading(true);
    const results: Check[] = [];
    const sugs: Suggestion[] = [];

    // Profile
    const { data: profile, error: profErr } = await supabase.from("profiles").select("prenom, activite, onboarding_completed, onboarding_completed_at, current_plan, instagram_username, website_url").eq("user_id", user.id).maybeSingle();
    results.push({ category: "Profil", name: "Profil chargé", status: profErr || !profile ? "error" : "ok", detail: profErr?.message || "OK" });
    if (profile) {
      results.push({ category: "Profil", name: "Prénom renseigné", status: profile.prenom ? "ok" : "warning", detail: profile.prenom || "Manquant" });
      results.push({ category: "Profil", name: "Onboarding complété", status: profile.onboarding_completed ? "ok" : "info", detail: profile.onboarding_completed ? "Complété" : "Pas encore complété" });
      results.push({ category: "Profil", name: "Plan actif", status: profile.current_plan ? "ok" : "info", detail: `Plan : ${profile.current_plan || "free"}` });
    }

    // Branding
    const { data: brand } = await supabase.from("brand_profile").select("positioning, mission, values, tone_keywords").eq("user_id", user.id).maybeSingle();
    results.push({ category: "Branding", name: "Branding existe", status: brand ? "ok" : "warning", detail: brand ? "OK" : "Pas de branding en base" });
    if (brand) {
      for (const field of ["positioning", "mission", "values", "tone_keywords"] as const) {
        const val = brand[field];
        const filled = val && (typeof val === "string" ? val.trim() !== "" : Array.isArray(val) ? (val as any[]).length > 0 : true);
        results.push({ category: "Branding", name: `Champ "${field}"`, status: filled ? "ok" : "warning", detail: filled ? "Rempli" : "Vide" });
      }
    }

    // Persona
    const { data: persona } = await supabase.from("brand_proposition").select("id").eq("user_id", user.id);
    results.push({ category: "Cible", name: "Proposition définie", status: (persona?.length ?? 0) > 0 ? "ok" : "warning", detail: (persona?.length ?? 0) > 0 ? `${persona!.length} proposition(s)` : "Aucune proposition" });

    // Calendar
    const { data: posts, error: postErr } = await supabase.from("calendar_posts").select("id, status, date, format").eq("user_id", user.id);
    results.push({ category: "Calendrier", name: "Table posts accessible", status: postErr ? "error" : "ok", detail: postErr?.message || `${posts?.length || 0} posts` });
    if (posts) {
      const published = posts.filter(p => p.status === "published").length;
      const withFormat = posts.filter(p => p.format).length;
      results.push({ category: "Calendrier", name: "Posts avec format", status: withFormat === posts.length ? "ok" : "warning", detail: `${withFormat}/${posts.length} ont un format` });
      results.push({ category: "Calendrier", name: "Compteur publications", status: "info", detail: `${published} publiés, ${posts.length - published} planifiés` });
      if (posts.length > 0 && !posts.some(p => p.format)) {
        sugs.push({ title: "Posts sans format défini", action: "Définis un format pour chaque post", route: "/calendrier" });
      }
    }

    // Audit
    const { data: audit } = await supabase.from("branding_audits").select("score_global, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    results.push({ category: "Audit", name: "Audit réalisé", status: audit ? "ok" : "info", detail: audit ? `Score : ${audit.score_global}/100` : "Pas encore d'audit" });

    // Engagement
    const { data: engLogs, error: engErr } = await supabase.from("engagement_checklist_logs").select("id").eq("user_id", user.id).order("log_date", { ascending: false }).limit(7);
    results.push({ category: "Routine", name: "Logs routine accessibles", status: engErr ? "error" : "ok", detail: engErr?.message || `${engLogs?.length || 0} entrées récentes` });

    // Coaching
    if (profile?.current_plan === "now_pilot") {
      const { data: prog } = await supabase.from("coaching_programs").select("id, current_month, current_phase").eq("client_user_id", user.id).eq("status", "active").maybeSingle();
      results.push({ category: "Accompagnement", name: "Programme Now Pilot", status: prog ? "ok" : "error", detail: prog ? `Mois ${prog.current_month}` : "Plan Now Pilot actif mais AUCUN programme trouvé !" });
      if (prog) {
        const { data: sessions } = await supabase.from("coaching_sessions").select("id").eq("program_id", prog.id);
        results.push({ category: "Accompagnement", name: "Sessions", status: (sessions?.length ?? 0) > 0 ? "ok" : "warning", detail: `${sessions?.length || 0} sessions` });
        const { data: deliverables } = await supabase.from("coaching_deliverables").select("id").eq("program_id", prog.id);
        results.push({ category: "Accompagnement", name: "Livrables", status: (deliverables?.length ?? 0) > 0 ? "ok" : "warning", detail: `${deliverables?.length || 0} livrables` });
      }
    }

    // Key tables accessibility
    const tables = ["profiles", "brand_profile", "calendar_posts", "branding_audits", "engagement_checklist_logs", "contacts", "saved_ideas", "content_drafts"] as const;
    for (const table of tables) {
      const { error } = await supabase.from(table).select("id").limit(1);
      results.push({ category: "Base de données", name: `Table "${table}"`, status: error ? "error" : "ok", detail: error ? `Erreur : ${error.message}` : "Accessible" });
    }

    // Suggestions
    if (profile?.instagram_username && !audit) {
      sugs.push({ title: "Instagram renseigné mais pas d'audit", action: "Lancer un audit Instagram", route: "/instagram/audit" });
    }
    if (brand?.positioning && !persona?.length) {
      sugs.push({ title: "Positionnement défini mais pas de proposition", action: "Le branding est incomplet sans proposition de valeur", route: "/branding/proposition" });
    }
    if (audit && posts && !posts.some(p => p.status === "published")) {
      sugs.push({ title: "Audit fait mais aucun contenu publié", action: "Les recommandations ne sont pas encore appliquées", route: "/instagram/creer" });
    }

    setChecks(results);
    setSuggestions(sugs);
    setLastRun(new Date());
    setLoading(false);
  }, [user, isDemoMode]);

  const errors = checks.filter(c => c.status === "error");
  const warnings = checks.filter(c => c.status === "warning");
  const infos = checks.filter(c => c.status === "info");
  const oks = checks.filter(c => c.status === "ok");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <div className="mb-6">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">🔧 Vérification des connexions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Scanne ton compte pour vérifier que tout est bien connecté.</p>
        </div>

        <div className="flex items-center justify-between mb-6">
          <p className="text-xs text-muted-foreground">
            {lastRun ? `Dernière vérification : ${lastRun.toLocaleTimeString("fr-FR")}` : "Aucune vérification lancée"}
          </p>
          <Button onClick={runChecks} disabled={loading} variant="outline" size="sm" className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {loading ? "Analyse en cours..." : checks.length ? "Relancer" : "Lancer la vérification"}
          </Button>
        </div>

        {checks.length > 0 && (
          <>
            {/* Summary */}
            <div className="flex flex-wrap gap-3 mb-6 p-4 rounded-xl border border-border bg-card">
              <span className="text-sm font-medium flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[hsl(160_60%_45%)]" /> {oks.length} OK</span>
              <span className="text-sm font-medium flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-amber-500" /> {warnings.length} Warnings</span>
              <span className="text-sm font-medium flex items-center gap-1.5"><XCircle className="h-4 w-4 text-destructive" /> {errors.length} Erreurs</span>
              <span className="text-sm font-medium flex items-center gap-1.5"><Info className="h-4 w-4 text-primary" /> {infos.length} Infos</span>
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <section className="mb-5">
                <h2 className="font-display text-sm font-bold text-destructive mb-2">❌ Erreurs (à corriger)</h2>
                <div className="space-y-1.5">{errors.map((c, i) => <CheckRow key={i} check={c} />)}</div>
              </section>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <section className="mb-5">
                <h2 className="font-display text-sm font-bold text-amber-500 mb-2">⚠️ Warnings (à vérifier)</h2>
                <div className="space-y-1.5">{warnings.map((c, i) => <CheckRow key={i} check={c} />)}</div>
              </section>
            )}

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <section className="mb-5">
                <h2 className="font-display text-sm font-bold text-primary mb-2">💡 Suggestions</h2>
                <div className="space-y-1.5">
                  {suggestions.map((s, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl bg-primary/5 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.title}</p>
                        <p className="text-xs text-muted-foreground">{s.action}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => navigate(s.route)} className="gap-1 text-primary text-xs shrink-0">
                        Y aller <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* OK */}
            {oks.length > 0 && (
              <details className="mb-5">
                <summary className="font-display text-sm font-bold text-[hsl(160_60%_45%)] mb-2 cursor-pointer">✅ Tout va bien ({oks.length})</summary>
                <div className="space-y-1.5 mt-2">{oks.map((c, i) => <CheckRow key={i} check={c} />)}</div>
              </details>
            )}

            {/* Info */}
            {infos.length > 0 && (
              <details className="mb-5">
                <summary className="font-display text-sm font-bold text-primary mb-2 cursor-pointer">ℹ️ Infos ({infos.length})</summary>
                <div className="space-y-1.5 mt-2">{infos.map((c, i) => <CheckRow key={i} check={c} />)}</div>
              </details>
            )}
          </>
        )}
      </main>
    </div>
  );
}
