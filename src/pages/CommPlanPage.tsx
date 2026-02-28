import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
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
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";

export default function CommPlanPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const { isDemoMode } = useDemoContext();
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
              { id: "s2", label: "Persona", description: "Portrait de ta cliente idéale", duration: 20, route: "/branding/persona", status: "done" },
              { id: "s3", label: "Ton & valeurs", description: "Ton identité de marque", duration: 15, route: "/branding/ton", status: "done" },
              { id: "s4", label: "Storytelling", description: "Ton histoire de fondatrice", duration: 30, route: "/branding/storytelling", status: "done" },
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
    (async () => {
      // Fetch config, overrides, coach exercises, and visibility in parallel
      const [configRes, overridesRes, exercisesRes, visibilityRes] = await Promise.all([
        (supabase.from("user_plan_config" as any).select("*").eq(column, value).maybeSingle() as any),
        (supabase.from("user_plan_overrides" as any).select("step_id, manual_status").eq(column, value) as any),
        (supabase.from("coach_exercises" as any).select("*").eq("workspace_id", workspaceId).order("sort_order") as any),
        (supabase.from("plan_step_visibility" as any).select("step_id, hidden").eq("workspace_id", workspaceId) as any),
      ]);

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
        setFullPlan(full);
        // Build filtered plan for display
        const planData = await computePlan({ column, value }, cfg, fetchedOverrides, fetchedExercises, fetchedVisibility);
        setPlan(planData);
      } else {
        setShowSetup(true);
      }
      setLoading(false);
    })();
  }, [user?.id, isDemoMode]);

  // Recompute plan when coach data changes
  const recompute = useCallback(async (
    ov: PlanStepOverride[] = overrides,
    ex: CoachExercise[] = coachExercises,
    vis: StepVisibility[] = hiddenSteps,
  ) => {
    if (!config) return;
    const full = await computePlan({ column, value }, config, ov, ex);
    setFullPlan(full);
    const filtered = await computePlan({ column, value }, config, ov, ex, vis);
    setPlan(filtered);
  }, [config, column, value, overrides, coachExercises, hiddenSteps]);

  const handleSaveConfig = useCallback(async (cfg: PlanConfig) => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        weekly_time: cfg.weekly_time,
        channels: cfg.channels,
        main_goal: cfg.main_goal,
      };

      if (config) {
        const { error } = await (supabase.from("user_plan_config") as any).update(payload).eq(column, value);
        if (error) { sonnerToast.error("Erreur de sauvegarde"); return; }
      } else {
        const { error } = await supabase.from("user_plan_config").insert(payload);
        if (error) { sonnerToast.error("Erreur de sauvegarde"); return; }
      }

      setConfig(cfg);
      const full = await computePlan({ column, value }, cfg, overrides, coachExercises);
      setFullPlan(full);
      const planData = await computePlan({ column, value }, cfg, overrides, coachExercises, hiddenSteps);
      setPlan(planData);
      setShowSetup(false);
    } finally {
      setSaving(false);
    }
  }, [user, config, overrides, coachExercises, hiddenSteps]);

  const handleToggleStep = useCallback(async (stepId: string, newStatus: 'done' | 'undone') => {
    if (!user || !plan || !config) return;
    const wsId = workspaceId !== user.id ? workspaceId : null;

    // Check if it's a coach exercise toggle
    if (stepId.startsWith("coach_")) {
      const exerciseId = stepId.replace("coach_", "");
      const dbStatus = newStatus === "done" ? "done" : "todo";
      await (supabase.from("coach_exercises" as any).update({ status: dbStatus, updated_at: new Date().toISOString() }).eq("id", exerciseId) as any);
      const newExercises = coachExercises.map(e => e.id === exerciseId ? { ...e, status: dbStatus } : e);
      setCoachExercises(newExercises);
      toast({ title: newStatus === "done" ? "✅ Étape cochée !" : "Étape décochée", duration: 2000 });
      await recompute(overrides, newExercises, hiddenSteps);
      return;
    }

    // Standard step override
    const newOverrides = [...overrides.filter(o => o.step_id !== stepId), { step_id: stepId, status: newStatus }];
    setOverrides(newOverrides);
    toast({ title: newStatus === "done" ? "✅ Étape cochée !" : "Étape décochée", duration: 2000 });
    await recompute(newOverrides, coachExercises, hiddenSteps);

    // Persist
    await (supabase.from("user_plan_overrides" as any).upsert({
      user_id: user.id,
      workspace_id: wsId,
      step_id: stepId,
      manual_status: newStatus,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,workspace_id,step_id" }) as any);
  }, [user, plan, config, overrides, coachExercises, hiddenSteps, column, value, workspaceId, recompute]);

  const handleExercisesChange = useCallback(async (newExercises: CoachExercise[]) => {
    setCoachExercises(newExercises);
    await recompute(overrides, newExercises, hiddenSteps);
  }, [overrides, hiddenSteps, recompute]);

  const handleVisibilityChange = useCallback(async (newVis: StepVisibility[]) => {
    setHiddenSteps(newVis);
    await recompute(overrides, coachExercises, newVis);
  }, [overrides, coachExercises, recompute]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader
          parentLabel="Dashboard"
          parentTo="/dashboard"
          currentLabel="Mon plan"
        />

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
          <Tabs defaultValue="parcours" className="space-y-4">
            <TabsList className="w-full grid grid-cols-2 h-11">
              <TabsTrigger value="parcours" className="gap-1.5 text-xs sm:text-sm">
                <ClipboardList className="h-3.5 w-3.5" />
                Parcours
              </TabsTrigger>
              <TabsTrigger value="bilan" className="gap-1.5 text-xs sm:text-sm">
                <BarChart3 className="h-3.5 w-3.5" />
                Bilan
              </TabsTrigger>
            </TabsList>

            <TabsContent value="parcours">
              <PlanView
                plan={plan}
                onEditConfig={() => setShowSetup(true)}
                onToggleStep={handleToggleStep}
              />
            </TabsContent>

            <TabsContent value="bilan">
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <Construction className="h-10 w-10 text-muted-foreground/40" />
                <h3 className="font-display font-bold text-foreground">Bientôt disponible</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Le bilan hebdomadaire te permettra de suivre tes performances et ton évolution semaine après semaine.
                </p>
              </div>
            </TabsContent>
          </Tabs>
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
