import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import PlanSetup from "@/components/plan/PlanSetup";
import PlanView from "@/components/plan/PlanView";
import { computePlan, type PlanData, type PlanConfig } from "@/lib/plan-engine";
import { Loader2, ClipboardList, BarChart3, Construction } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useDemoContext } from "@/contexts/DemoContext";

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

  useEffect(() => {
    if (isDemoMode) {
      const demoCfg: PlanConfig = { weekly_time: "30min", channels: ["instagram", "site", "newsletter"], main_goal: "visibility" };
      setConfig(demoCfg);
      // Build a demo plan with some steps done
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
              { id: "s3", label: "Ton & valeurs", description: "Ton identité de marque", duration: 15, route: "/branding/ton-style", status: "done" },
              { id: "s4", label: "Storytelling", description: "Ton histoire de fondatrice", duration: 30, route: "/branding/storytelling", status: "done" },
            ],
          },
          {
            id: "instagram", title: "📱 Instagram", emoji: "📱", locked: false,
            steps: [
              { id: "s5", label: "Bio Instagram", description: "Optimise ta bio", duration: 10, route: "/instagram/bio", status: "done", detail: "✅ Validée" },
              { id: "s6", label: "Highlights", description: "Structure tes highlights", duration: 30, route: "/instagram/highlights", status: "in_progress" },
              { id: "s7", label: "Calendrier", description: "Planifie tes contenus", duration: 20, route: "/calendar", status: "todo" },
              { id: "s8", label: "Routine engagement", description: "15 min/jour", duration: 15, route: "/instagram/engagement", status: "todo" },
            ],
          },
          {
            id: "site", title: "🌐 Site web", emoji: "🌐", locked: false,
            steps: [
              { id: "s9", label: "Page d'accueil", description: "Ton message principal", duration: 30, route: "/site/accueil", status: "todo" },
              { id: "s10", label: "Page à propos", description: "Ton histoire", duration: 20, route: "/site/a-propos", status: "todo" },
              { id: "s11", label: "Témoignages", description: "Preuve sociale", duration: 15, route: "/site/testimonials", status: "todo" },
              { id: "s12", label: "Page capture", description: "Collecte des emails", duration: 20, route: "/site/capture", status: "todo" },
            ],
          },
        ],
      };
      setPlan(demoPlan);
      setLoading(false);
      return;
    }
    if (!user?.id) return;
    (async () => {
      const { data } = await (supabase
        .from("user_plan_config" as any)
        .select("*")
        .eq(column, value)
        .maybeSingle() as any);

      if (data) {
        const cfg: PlanConfig = {
          weekly_time: data.weekly_time,
          channels: (data.channels as string[]) || ["instagram"],
          main_goal: data.main_goal,
        };
        setConfig(cfg);
        const planData = await computePlan({ column, value }, cfg);
        setPlan(planData);
      } else {
        setShowSetup(true);
      }
      setLoading(false);
    })();
  }, [user?.id, isDemoMode]);

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
        await (supabase.from("user_plan_config") as any).update(payload).eq(column, value);
      } else {
        await supabase.from("user_plan_config").insert(payload);
      }

      setConfig(cfg);
      const planData = await computePlan({ column, value }, cfg);
      setPlan(planData);
      setShowSetup(false);
    } finally {
      setSaving(false);
    }
  }, [user, config]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader
          parentLabel="Dashboard"
          parentTo="/dashboard"
          currentLabel="Mon plan"
        />

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
      </main>
    </div>
  );
}
