import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import { DEMO_DATA, type DemoDataType } from "@/lib/demo-data";

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

export const DEMO_COACHING = DEMO_DATA.coaching;

interface DemoContextType {
  isDemoMode: boolean;
  demoData: DemoDataType | null;
  demoName: string;
  demoActivity: string;
  demoCoaching: typeof DEMO_COACHING;
  showDemoOnboarding: boolean;
  activateDemo: () => void;
  skipDemoOnboarding: () => void;
  deactivateDemo: () => void;
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [showDemoOnboarding, setShowDemoOnboarding] = useState(true);

  const activateDemo = useCallback(() => {
    setIsDemoMode(true);
    setShowDemoOnboarding(true);
  }, []);

  const skipDemoOnboarding = useCallback(() => {
    setShowDemoOnboarding(false);
  }, []);

  const deactivateDemo = useCallback(() => {
    setIsDemoMode(false);
    setShowDemoOnboarding(true);
  }, []);

  const value = useMemo<DemoContextType>(
    () => ({
      isDemoMode,
      demoData: isDemoMode ? DEMO_DATA : null,
      demoName: isDemoMode ? DEMO_DATA.profile.first_name : "",
      demoActivity: isDemoMode ? DEMO_DATA.profile.activity : "",
      demoCoaching: DEMO_COACHING,
      showDemoOnboarding: isDemoMode && showDemoOnboarding,
      activateDemo,
      skipDemoOnboarding,
      deactivateDemo,
    }),
    [isDemoMode, showDemoOnboarding, activateDemo, skipDemoOnboarding, deactivateDemo]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoContext() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemoContext must be used within DemoProvider");
  return context;
}
