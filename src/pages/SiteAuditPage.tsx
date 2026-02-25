import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { RotateCcw, ArrowRight, Eye } from "lucide-react";

const PAGE_OPTIONS = [
  { id: "accueil", label: "Page d'accueil" },
  { id: "a-propos", label: "Page À propos" },
  { id: "offres", label: "Page Offres / Services" },
  { id: "contact", label: "Page Contact" },
  { id: "produits", label: "Page Produits" },
];

type AuditData = {
  id: string;
  audit_mode: string | null;
  answers: Record<string, unknown>;
  completed: boolean;
  score_global: number;
  scores: Record<string, unknown>;
  diagnostic: string | null;
  recommendations: unknown[];
  current_page: string | null;
};

const SiteAuditPage = () => {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();

  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<AuditData | null>(null);
  const [step, setStep] = useState<"choose" | "pick-pages" | "questionnaire">("choose");
  const [selectedPages, setSelectedPages] = useState<string[]>(["accueil"]);
  const [otherPage, setOtherPage] = useState("");
  const [includeOther, setIncludeOther] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadAudit = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await (supabase.from("website_audit") as any)
      .select("*")
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setExisting(data);
    else setExisting(null);
    setLoading(false);
  };

  useEffect(() => {
    loadAudit();
  }, [user?.id]);

  const hasStarted = existing && (
    existing.completed ||
    (existing.answers && Object.keys(existing.answers).length > 0) ||
    existing.audit_mode
  );

  const upsertAudit = async (mode: string, pages?: string[]) => {
    if (!user) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      user_id: user.id,
      workspace_id: workspaceId !== user.id ? workspaceId : null,
      audit_mode: mode,
      answers: {},
      scores: {},
      score_global: 0,
      diagnostic: null,
      recommendations: [],
      completed: false,
      current_page: mode === "page_by_page" && pages?.length ? pages[0] : null,
    };

    if (existing?.id) {
      const { error } = await (supabase.from("website_audit") as any)
        .update(payload)
        .eq("id", existing.id);
      if (error) { toast.error("Erreur de sauvegarde"); setSaving(false); return; }
    } else {
      const { error } = await (supabase.from("website_audit") as any)
        .insert(payload);
      if (error) { toast.error("Erreur de sauvegarde"); setSaving(false); return; }
    }

    await loadAudit();
    setSaving(false);
    setStep("questionnaire");
  };

  const handleGlobal = () => upsertAudit("global");

  const handlePageByPage = () => {
    const allPages = [...selectedPages];
    if (includeOther && otherPage.trim()) allPages.push(otherPage.trim());
    if (allPages.length === 0) { toast.error("Sélectionne au moins une page"); return; }
    upsertAudit("page_by_page", allPages);
  };

  const handleReset = async () => {
    if (!existing?.id) return;
    setSaving(true);
    await (supabase.from("website_audit") as any).delete().eq("id", existing.id);
    setExisting(null);
    setStep("choose");
    setSaving(false);
    toast.success("Audit réinitialisé");
  };

  const togglePage = (id: string) => {
    setSelectedPages(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-3xl mx-auto px-4 py-8 space-y-6">
        <SubPageHeader
          parentLabel="Mon Site Web"
          parentTo="/site"
          currentLabel="Audit de conversion"
        />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">🔍 Audit de conversion</h1>
          <p className="text-muted-foreground">
            Diagnostique ton site page par page ou en global, et découvre ce qui bloque tes visiteuses.
          </p>
        </div>

        {/* Existing audit banner */}
        {hasStarted && step === "choose" && (
          <div className="rounded-2xl border border-primary bg-rose-pale p-6 space-y-4">
            <p className="font-display text-base font-bold text-foreground">
              {existing?.completed ? "✅ Tu as déjà un audit terminé !" : "📝 Tu as un audit en cours."}
            </p>
            <p className="text-sm text-muted-foreground">
              {existing?.completed
                ? `Score global : ${existing.score_global}/100. Tu peux consulter tes résultats ou recommencer.`
                : "Tu peux reprendre là où tu en étais ou recommencer de zéro."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setStep("questionnaire")} className="gap-2 rounded-pill">
                <Eye className="h-4 w-4" />
                {existing?.completed ? "Voir mon dernier audit" : "Reprendre l'audit"}
              </Button>
              <Button variant="outline" onClick={handleReset} disabled={saving} className="gap-2 rounded-pill">
                <RotateCcw className="h-4 w-4" />
                Refaire un audit
              </Button>
            </div>
          </div>
        )}

        {/* Mode selection */}
        {(!hasStarted || step === "choose") && !hasStarted && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={handleGlobal}
              disabled={saving}
              className="group relative rounded-2xl border bg-card p-6 text-left transition-all hover:border-primary hover:shadow-md cursor-pointer"
            >
              <span className="text-2xl mb-3 block">🌐</span>
              <h3 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                Audit global
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Un diagnostic rapide de tout ton site en 5 minutes. Idéal pour un premier état des lieux.
              </p>
              <span className="mt-3 inline-block font-mono-ui text-[10px] font-semibold px-2.5 py-0.5 rounded-pill text-primary bg-rose-pale">
                ~5 min
              </span>
            </button>

            <button
              onClick={() => setStep("pick-pages")}
              disabled={saving}
              className="group relative rounded-2xl border bg-card p-6 text-left transition-all hover:border-primary hover:shadow-md cursor-pointer"
            >
              <span className="text-2xl mb-3 block">📄</span>
              <h3 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                Audit page par page
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Un diagnostic détaillé, page par page. Plus long mais plus précis.
              </p>
              <span className="mt-3 inline-block font-mono-ui text-[10px] font-semibold px-2.5 py-0.5 rounded-pill text-primary bg-rose-pale">
                ~15 min
              </span>
            </button>
          </div>
        )}

        {/* Page picker for page_by_page mode */}
        {step === "pick-pages" && (
          <div className="rounded-2xl border bg-card p-6 space-y-5">
            <div>
              <h3 className="font-display text-lg font-bold text-foreground mb-1">
                Quelles pages veux-tu auditer ?
              </h3>
              <p className="text-sm text-muted-foreground">
                Sélectionne les pages de ton site à analyser.
              </p>
            </div>

            <div className="space-y-3">
              {PAGE_OPTIONS.map(opt => (
                <label
                  key={opt.id}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <Checkbox
                    checked={selectedPages.includes(opt.id)}
                    onCheckedChange={() => togglePage(opt.id)}
                  />
                  <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                    {opt.label}
                  </span>
                </label>
              ))}
              <label className="flex items-center gap-3 cursor-pointer group">
                <Checkbox
                  checked={includeOther}
                  onCheckedChange={(v) => setIncludeOther(!!v)}
                />
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                  Autre
                </span>
              </label>
              {includeOther && (
                <Input
                  placeholder="Ex : Blog, Portfolio, Landing page…"
                  value={otherPage}
                  onChange={(e) => setOtherPage(e.target.value)}
                  className="max-w-sm"
                />
              )}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handlePageByPage}
                disabled={saving || (selectedPages.length === 0 && !(includeOther && otherPage.trim()))}
                className="gap-2 rounded-pill"
              >
                Commencer l'audit <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => setStep("choose")} className="rounded-pill">
                Retour
              </Button>
            </div>
          </div>
        )}

        {/* Questionnaire placeholder */}
        {step === "questionnaire" && (
          <div className="rounded-2xl border bg-card p-6 text-center space-y-3">
            <p className="text-lg font-display font-bold text-foreground">
              {existing?.completed ? "📊 Résultats de ton audit" : "📝 Questionnaire en cours de construction"}
            </p>
            <p className="text-sm text-muted-foreground">
              {existing?.completed
                ? "Tes résultats détaillés seront affichés ici."
                : "Le questionnaire d'audit sera disponible très bientôt."}
            </p>
            <Button variant="outline" onClick={() => setStep("choose")} className="rounded-pill">
              Retour au choix
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default SiteAuditPage;
