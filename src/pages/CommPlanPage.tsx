import { usePlanningVisit } from "@/hooks/use-planning-visit";
import { useWorkspaceReady } from "@/hooks/use-workspace-query";
import { useRef, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId, useProfileUserId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import PlanSetup from "@/components/plan/PlanSetup";
import PlanView from "@/components/plan/PlanView";
import CoachPlanManager from "@/components/plan/CoachPlanManager";
import { computePlan, type PlanData, type PlanConfig, type PlanStepOverride, type CoachExercise, type StepVisibility } from "@/lib/plan-engine";
import { Loader2, ClipboardList, BarChart3, Construction, Settings2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useDemoContext } from "@/contexts/DemoContext";
import { toast } from "sonner";

// Le tour guidé du plan a été retiré (10/07) : le coachmark est réservé au
// dashboard, première visite uniquement. Ses étapes 3-4 pointaient de toute
// façon vers le nav desktop de AppHeader, masqué depuis la sidebar (anchors
// data-tour="nav-*" jamais visibles → étapes auto-sautées).

export default function CommPlanPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const scope = useWorkspaceId();
  const ready = useWorkspaceReady();
  if (!ready || !user) return null;
  return <CommPlanPageScreen key={`${user.id}:${scope}`} embedded={embedded} />;
}

function CommPlanPageScreen({ embedded = false }: { embedded?: boolean }) {
  const visit = usePlanningVisit();
  const loadSequence = useRef(0);
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const ownerId = useProfileUserId();
  const { isDemoMode } = useDemoContext();
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [configId, setConfigId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<PlanConfig | null>(null);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [overrides, setOverrides] = useState<PlanStepOverride[]>([]);
  const [coachExercises, setCoachExercises] = useState<CoachExercise[]>([]);
  const [hiddenSteps, setHiddenSteps] = useState<StepVisibility[]>([]);
  const [showCoachManager, setShowCoachManager] = useState(false);
  // For visibility tab we need a "full plan" (without hidden filtering) for CoachPlanManager
  const [fullPlan, setFullPlan] = useState<PlanData | null>(null);

  const isCoachMode = !!(user && workspaceId && workspaceId !== user.id);

  useEffect(() => {
    if (isDemoMode) {
      const demoCfg: PlanConfig = { weekly_time: "30min", channels: ["instagram", "site", "newsletter"], main_goal: "visibility" };
      setConfig(demoCfg);
      const demoPlan: PlanData = {
        config: demoCfg,
        progressPercent: 42,
        totalMinutesRemaining: 180,
        completedCount: 5,
        totalCount: 12,
        phases: [
          {
            id: "foundations", title: "🏗️ Les fondations", emoji: "🏗️", locked: false,
            steps: [
              { id: "s1", label: "Positionnement", description: "Définis ce que tu fais et pour qui", duration: 15, route: "/branding", status: "done" },
              { id: "s2", label: "Mon·a client·e idéal·e", description: "Portrait de ta cliente idéale", duration: 20, route: "/branding/section?section=persona", status: "done" },
              { id: "s3", label: "Ma voix & mes combats", description: "Ton identité de marque", duration: 15, route: "/branding/section?section=tone_style", status: "done" },
              { id: "s4", label: "Mon histoire", description: "Ton histoire de fondatrice", duration: 30, route: "/branding/section?section=story", status: "done" },
            ],
          },
          {
            id: "instagram", title: "📱 Instagram", emoji: "📱", locked: false,
            steps: [
              { id: "s5", label: "Bio Instagram", description: "Optimise ta bio", duration: 10, route: "/instagram/profil/bio", status: "done", detail: "✅ Validée" },
              { id: "s6", label: "Highlights", description: "Structure tes highlights", duration: 30, route: "/instagram/profil/stories", status: "in_progress" },
              { id: "s7", label: "Calendrier", description: "Planifie tes contenus", duration: 20, route: "/calendrier", status: "todo" },
              { id: "s8", label: "Routine engagement", description: "15 min/jour", duration: 15, route: "/instagram/routine", status: "todo" },
            ],
          },
          {
            id: "site", title: "🌐 Site web", emoji: "🌐", locked: false,
            steps: [
              { id: "s9", label: "Page d'accueil", description: "Ton message principal", duration: 30, route: "/site/accueil", status: "todo" },
              { id: "s10", label: "Page à propos", description: "Ton histoire", duration: 20, route: "/site/a-propos", status: "todo" },
              { id: "s11", label: "Témoignages", description: "Preuve sociale", duration: 15, route: "/site/temoignages", status: "todo" },
              { id: "s12", label: "Page capture", description: "Collecte des emails", duration: 20, route: "/site/capture", status: "todo" },
            ],
          },
        ],
      };
      setPlan(demoPlan);
      setFullPlan(demoPlan);
      setLoading(false);
      return;
    }
    if (!user?.id) return;
    const loadRequest = ++loadSequence.current;
    (async () => {
      setLoading(true); setLoadError(false);
      try {
      // Fetch config, overrides, coach exercises, and visibility in parallel
      const [configRes, overridesRes, exercisesRes, visibilityRes] = await Promise.all([
        (supabase.from("user_plan_config" as any).select("*").eq(column, value).maybeSingle() as any),
        (supabase.from("user_plan_overrides" as any).select("step_id, manual_status").eq(column, value) as any),
        (supabase.from("coach_exercises" as any).select("*").eq("workspace_id", workspaceId).order("sort_order") as any),
        (supabase.from("plan_step_visibility" as any).select("step_id, hidden").eq("workspace_id", workspaceId) as any),
      ]);

      if (!visit.current || loadSequence.current !== loadRequest) return;
      for (const result of [configRes, overridesRes, exercisesRes, visibilityRes]) if (result.error) throw result.error;
      // The owner's pre-workspace onboarding row remains account-scoped. Read it
      // without adopting/moving it, and never use the manager's account as fallback.
      if (!configRes.data && ownerId === user.id) {
        const legacy = await supabase.from("user_plan_config").select("*").eq("user_id", ownerId).is("workspace_id", null).maybeSingle();
        if (!visit.current || loadSequence.current !== loadRequest) return;
        if (legacy.error) throw legacy.error;
        configRes.data = legacy.data;
      }
      setConfigId(configRes.data?.id ?? null);
      const fetchedOverrides: PlanStepOverride[] = (overridesRes.data || []).map((o: any) => ({
        step_id: o.step_id,
        status: o.manual_status,
      }));
      setOverrides(fetchedOverrides);

      const fetchedExercises: CoachExercise[] = exercisesRes.data || [];
      setCoachExercises(fetchedExercises);

      const fetchedVisibility: StepVisibility[] = (visibilityRes.data || []).map((v: any) => ({
        step_id: v.step_id,
        hidden: v.hidden,
      }));
      setHiddenSteps(fetchedVisibility);

      if (configRes.data) {
        const cfg: PlanConfig = {
          weekly_time: configRes.data.weekly_time,
          channels: (configRes.data.channels as string[]) || ["instagram"],
          main_goal: configRes.data.main_goal,
        };
        setConfig(cfg);
        // Build full plan (no hidden filtering) for coach manager
        const full = await computePlan({ column, value }, cfg, fetchedOverrides, fetchedExercises);
        if (!visit.current || loadSequence.current !== loadRequest) return;
        setFullPlan(full);
        // Build filtered plan for display
        const planData = await computePlan({ column, value }, cfg, fetchedOverrides, fetchedExercises, fetchedVisibility);
        if (!visit.current || loadSequence.current !== loadRequest) return;
        setPlan(planData);
      } else {
        setShowSetup(true);
      }
      } catch (error) { if (visit.current && loadSequence.current === loadRequest) setLoadError(true); }
      finally { if (visit.current && loadSequence.current === loadRequest) setLoading(false); }
    })();
  }, [user?.id, isDemoMode, column, value, workspaceId, ownerId, reloadKey]);

  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (!loading && plan && !localStorage.getItem("lac_plan_welcomed")) {
      setShowWelcome(true);
    }
  }, [loading, plan]);

  // Recompute plan when coach data changes
  const recompute = useCallback(async (
    ov: PlanStepOverride[] = overrides,
    ex: CoachExercise[] = coachExercises,
    vis: StepVisibility[] = hiddenSteps,
  ) => {
    if (!config) return;
    const full = await computePlan({ column, value }, config, ov, ex);
    if (!visit.current) return;
    setFullPlan(full);
    const filtered = await computePlan({ column, value }, config, ov, ex, vis);
    if (visit.current) setPlan(filtered);
  }, [config, column, value, overrides, coachExercises, hiddenSteps]);

  const handleSaveConfig = useCallback(async (cfg: PlanConfig) => {
    if (!user || !ownerId || loading || loadError || inFlight.current) return;
    inFlight.current = true; setSaving(true);
    try {
      const fields = { weekly_time: cfg.weekly_time, channels: cfg.channels, main_goal: cfg.main_goal };
      // This table also stores account onboarding and remains unique by owner.
      // Never move another workspace's row to the currently viewed workspace.
      let id = configId;
      if (!id) {
        const { data: existing, error } = await supabase.from("user_plan_config").select("id,workspace_id").eq("user_id", ownerId).maybeSingle();
        if (error) throw error;
        if (!visit.current) return;
        if (existing && !(existing.workspace_id === null && ownerId === user.id) && existing.workspace_id !== (workspaceId !== user.id ? workspaceId : null)) throw new Error("Cette configuration appartient à un autre espace. Elle a été conservée ; ouvre cet espace pour la modifier.");
        id = existing?.id ?? null;
      }
      const query = id ? supabase.from("user_plan_config").update(fields).eq("id", id)
        : supabase.from("user_plan_config").insert({ ...fields, user_id: ownerId, workspace_id: workspaceId !== user.id ? workspaceId : null });
      const { data, error } = await query.select("id").single();
      if (error || !data) throw error || new Error("La sauvegarde n’a pas pu être confirmée.");
      if (!visit.current) return;
      setConfigId(data.id); setConfig(cfg); setShowSetup(false); setReloadKey(k => k + 1);
    } catch (error: any) { if (visit.current) toast.error(error instanceof Error ? error.message : "La configuration n’a pas pu être enregistrée."); }
    finally { inFlight.current = false; if (visit.current) setSaving(false); }
  }, [user, ownerId, loading, loadError, configId, column, value, workspaceId]);

  const handleToggleStep = useCallback(async (stepId: string, newStatus: 'done' | 'undone') => {
    if (!user || !plan || !config || inFlight.current) return;
    inFlight.current = true;
    try {
      if (stepId.startsWith("coach_")) {
        const id = stepId.replace("coach_", "");
        const status = newStatus === "done" ? "done" : "todo";
        const { data, error } = await supabase.from("coach_exercises").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspaceId).select("id").single();
        if (error || !data) throw error || new Error("missing receipt");
        if (!visit.current) return;
        const next = coachExercises.map(e => e.id === id ? { ...e, status } : e);
        setCoachExercises(next); await recompute(overrides, next, hiddenSteps);
      } else {
        const read = supabase.from("user_plan_overrides").select("id").eq("user_id", user.id).eq("step_id", stepId);
        const scope = workspaceId !== user.id ? read.eq("workspace_id", workspaceId) : read.is("workspace_id", null);
        const { data: existing, error: readError } = await scope.order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (readError) throw readError;
        if (!visit.current) return;
        const fields = { manual_status: newStatus, updated_at: new Date().toISOString() };
        const query = existing ? supabase.from("user_plan_overrides").update(fields).eq("id", existing.id)
          : supabase.from("user_plan_overrides").insert({ ...fields, user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : null, step_id: stepId });
        const { data, error } = await query.select("id").single();
        if (error || !data) throw error || new Error("missing receipt");
        if (!visit.current) return;
        const next = [...overrides.filter(o => o.step_id !== stepId), { step_id: stepId, status: newStatus }];
        setOverrides(next); await recompute(next, coachExercises, hiddenSteps);
      }
      if (visit.current) toast.success(newStatus === "done" ? "Étape cochée !" : "Étape décochée");
    } catch { if (visit.current) toast.error("L’étape n’a pas pu être enregistrée. Réessaie."); }
    finally { inFlight.current = false; }
  }, [user, plan, config, overrides, coachExercises, hiddenSteps, column, value, workspaceId, recompute]);

  const handleExercisesChange = useCallback(async (newExercises: CoachExercise[]) => {
    setCoachExercises(newExercises);
    await recompute(overrides, newExercises, hiddenSteps);
  }, [overrides, hiddenSteps, recompute]);

  const handleVisibilityChange = useCallback(async (newVis: StepVisibility[]) => {
    setHiddenSteps(newVis);
    await recompute(overrides, coachExercises, newVis);
  }, [overrides, coachExercises, recompute]);

  if (loadError) return <div className="p-6"><p>Impossible de charger ta stratégie. Tes réglages ont été conservés.</p><Button onClick={() => setReloadKey(k => k + 1)}>Réessayer</Button></div>;

  if (embedded) {
  return (
      <div className="max-w-[700px]">
        {showWelcome && !loading && plan && (
          <div className="animate-fade-in text-center space-y-4 mb-8 py-6">
            <div className="text-4xl">🎉</div>
            <h2 className="font-display text-xl text-foreground">Ton plan de com' est prêt</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {plan.totalCount} étapes personnalisées, environ{" "}
              {plan.totalMinutesRemaining >= 60 ? `${Math.floor(plan.totalMinutesRemaining / 60)}h` : `${plan.totalMinutesRemaining} min`}{" "}
              de travail au total. Pas besoin de tout faire d'un coup : avance à ton rythme.
            </p>
            <Button variant="outline" className="rounded-full text-sm" onClick={() => { setShowWelcome(false); localStorage.setItem("lac_plan_welcomed", "true"); }}>
              C'est parti →
            </Button>
          </div>
        )}
        {isCoachMode && plan && (
          <div className="flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5">
            <p className="text-sm text-foreground">👩‍🏫 <span className="font-medium">Mode coach</span> : tu peux personnaliser ce plan</p>
            <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0" onClick={() => setShowCoachManager(true)}>
              <Settings2 className="h-3.5 w-3.5" /> Personnaliser
            </Button>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : showSetup || !plan ? (
          <PlanSetup onSubmit={handleSaveConfig} saving={saving} initialConfig={config} />
        ) : (
          <div className="space-y-4"><PlanView plan={plan} onEditConfig={() => setShowSetup(true)} onToggleStep={handleToggleStep} /></div>
        )}
        {isCoachMode && fullPlan && (
          <CoachPlanManager open={showCoachManager} onOpenChange={setShowCoachManager} workspaceId={workspaceId} plan={fullPlan} exercises={coachExercises} hiddenSteps={hiddenSteps} onExercisesChange={handleExercisesChange} onVisibilityChange={handleVisibilityChange} />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader
          parentLabel="Dashboard"
          parentTo="/dashboard"
          currentLabel="Mon plan"
        />

        {showWelcome && !loading && plan && (
          <div className="animate-fade-in text-center space-y-4 mb-8 py-6">
            <div className="text-4xl">🎉</div>
            <h2 className="font-display text-xl text-foreground">
              Ton plan de com' est prêt
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {plan.totalCount} étapes personnalisées, environ{" "}
              {plan.totalMinutesRemaining >= 60
                ? `${Math.floor(plan.totalMinutesRemaining / 60)}h`
                : `${plan.totalMinutesRemaining} min`}{" "}
              de travail au total. Pas besoin de tout faire d'un coup : avance à ton rythme.
            </p>
            <Button
              variant="outline"
              className="rounded-full text-sm"
              onClick={() => {
                setShowWelcome(false);
                localStorage.setItem("lac_plan_welcomed", "true");
              }}
            >
              C'est parti →
            </Button>
          </div>
        )}

        {/* Coach mode banner */}
        {isCoachMode && plan && (
          <div className="flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5">
            <p className="text-sm text-foreground">
              👩‍🏫 <span className="font-medium">Mode coach</span> — tu peux personnaliser ce plan
            </p>
            <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0" onClick={() => setShowCoachManager(true)}>
              <Settings2 className="h-3.5 w-3.5" />
              Personnaliser
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : showSetup || !plan ? (
          <PlanSetup
            onSubmit={handleSaveConfig}
            saving={saving}
            initialConfig={config}
          />
        ) : (
          <div className="space-y-4">
            <PlanView
              plan={plan}
              onEditConfig={() => setShowSetup(true)}
              onToggleStep={handleToggleStep}
            />
          </div>
        )}

        {/* Coach Manager Dialog */}
        {isCoachMode && fullPlan && (
          <CoachPlanManager
            open={showCoachManager}
            onOpenChange={setShowCoachManager}
            workspaceId={workspaceId}
            plan={fullPlan}
            exercises={coachExercises}
            hiddenSteps={hiddenSteps}
            onExercisesChange={handleExercisesChange}
            onVisibilityChange={handleVisibilityChange}
          />
        )}
      </main>
    </div>
  );
}
