import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

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
}

interface DemoContextType {
  isDemoMode: boolean;
  demoData: DemoData | null;
  demoName: string;
  demoActivity: string;
  activateDemo: (data: DemoData, name: string, activity: string) => void;
  deactivateDemo: () => void;
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoData, setDemoData] = useState<DemoData | null>(null);
  const [demoName, setDemoName] = useState("");
  const [demoActivity, setDemoActivity] = useState("");

  const activateDemo = useCallback((data: DemoData, name: string, activity: string) => {
    setDemoData(data);
    setDemoName(name);
    setDemoActivity(activity);
    setIsDemoMode(true);
  }, []);

  const deactivateDemo = useCallback(() => {
    setDemoData(null);
    setDemoName("");
    setDemoActivity("");
    setIsDemoMode(false);
  }, []);

  const value = useMemo<DemoContextType>(
    () => ({ isDemoMode, demoData, demoName, demoActivity, activateDemo, deactivateDemo }),
    [isDemoMode, demoData, demoName, demoActivity, activateDemo, deactivateDemo]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoContext() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemoContext must be used within DemoProvider");
  return context;
}
