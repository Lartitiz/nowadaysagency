import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import type { DemoDataType } from "@/lib/demo-data";
import { DEMO_PROFILES, DEFAULT_DEMO_PROFILE, type DemoProfileId, type DemoProfileMeta } from "@/lib/demo-profiles";

export type DemoPlan = "free" | "binome";

export interface DemoData {
  profile: { first_name: string; activity: string; activity_type?: string };
  branding: {
    positioning: string;
    mission: string;
    unique_proposition: string;
    values: string[];
  };
  persona: {
    prenom: string;
    age: string;
    metier: string;
    situation: string;
    ca: string;
    frustrations: string;
    desires: string;
    phrase_signature: string;
  };
  tone: {
    keywords: string[];
    description: string;
    avoid: string[];
  };
  offers: { name: string; price: string; description: string }[];
  story_summary: string;
  editorial: {
    pillars: string[];
    frequency: string;
  };
  calendar_posts: {
    title: string;
    format: string;
    objective: string;
    planned_day: string;
  }[];
  contacts: { name: string; type: string; note: string }[];
  audit: {
    score: number;
    points_forts: { titre: string; detail: string }[];
    points_faibles: { titre: string; detail: string; priorite: string; module: string }[];
    plan_action: { titre: string; temps: string; module: string }[];
  };
  plan?: string;
  credits_monthly?: number;
  credits_used?: number;
  plan_expires_at?: string;
}

export const DEMO_COACHING = DEMO_PROFILES.lea.data.coaching;

interface DemoContextType {
  isDemoMode: boolean;
  demoData: DemoDataType | null;
  demoName: string;
  demoActivity: string;
  demoCoaching: typeof DEMO_COACHING;
  demoPlan: DemoPlan;
  setDemoPlan: (plan: DemoPlan) => void;
  showDemoOnboarding: boolean;
  activateDemo: (profileId?: DemoProfileId) => void;
  skipDemoOnboarding: () => void;
  deactivateDemo: () => void;
  demoProfileId: DemoProfileId;
  setDemoProfile: (id: DemoProfileId) => void;
  availableProfiles: DemoProfileMeta[];
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [showDemoOnboarding, setShowDemoOnboarding] = useState(true);
  const [demoPlan, setDemoPlan] = useState<DemoPlan>("binome");
  const [demoProfileId, setDemoProfileId] = useState<DemoProfileId>(DEFAULT_DEMO_PROFILE);

  const activeProfile = DEMO_PROFILES[demoProfileId];
  const activeData = activeProfile?.data;

  const activateDemo = useCallback((profileId?: DemoProfileId) => {
    setIsDemoMode(true);
    setShowDemoOnboarding(true);
    setDemoPlan("binome");
    if (profileId) setDemoProfileId(profileId);
  }, []);

  const skipDemoOnboarding = useCallback(() => {
    setShowDemoOnboarding(false);
  }, []);

  const deactivateDemo = useCallback(() => {
    setIsDemoMode(false);
    setShowDemoOnboarding(true);
    setDemoPlan("binome");
    setDemoProfileId(DEFAULT_DEMO_PROFILE);
  }, []);

  const value = useMemo<DemoContextType>(
    () => ({
      isDemoMode,
      demoData: isDemoMode ? activeData : null,
      demoName: isDemoMode ? activeData.profile.first_name : "",
      demoActivity: isDemoMode ? activeData.profile.activity : "",
      demoCoaching: isDemoMode ? activeData.coaching : DEMO_PROFILES.lea.data.coaching,
      demoPlan,
      setDemoPlan,
      showDemoOnboarding: isDemoMode && showDemoOnboarding,
      activateDemo,
      skipDemoOnboarding,
      deactivateDemo,
      demoProfileId,
      setDemoProfile: setDemoProfileId,
      availableProfiles: Object.values(DEMO_PROFILES),
    }),
    [isDemoMode, showDemoOnboarding, demoPlan, demoProfileId, activeData, activateDemo, skipDemoOnboarding, deactivateDemo]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoContext() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemoContext must be used within DemoProvider");
  return context;
}
