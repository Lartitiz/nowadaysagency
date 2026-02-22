import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import PlanSetup from "@/components/plan/PlanSetup";
import PlanView from "@/components/plan/PlanView";
import { computePlan, type PlanData, type PlanConfig } from "@/lib/plan-engine";
import { Loader2 } from "lucide-react";

export default function CommPlanPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<PlanConfig | null>(null);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  // Load config from DB
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_plan_config")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        const cfg: PlanConfig = {
          weekly_time: data.weekly_time,
          channels: (data.channels as string[]) || ["instagram"],
          main_goal: data.main_goal,
        };
        setConfig(cfg);
        const planData = await computePlan(user.id, cfg);
        setPlan(planData);
      } else {
        setShowSetup(true);
      }
      setLoading(false);
    })();
  }, [user]);

  const handleSaveConfig = useCallback(async (cfg: PlanConfig) => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        weekly_time: cfg.weekly_time,
        channels: cfg.channels,
        main_goal: cfg.main_goal,
      };

      if (config) {
        await supabase.from("user_plan_config").update(payload).eq("user_id", user.id);
      } else {
        await supabase.from("user_plan_config").insert(payload);
      }

      setConfig(cfg);
      const planData = await computePlan(user.id, cfg);
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
          <PlanView
            plan={plan}
            onEditConfig={() => setShowSetup(true)}
          />
        )}
      </main>
    </div>
  );
}
