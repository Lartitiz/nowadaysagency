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
  // Demo plan data
  plan?: string;
  credits_monthly?: number;
  credits_used?: number;
  plan_expires_at?: string;
}

export const DEMO_COACHING = {
  current_phase: "strategy",
  current_month: 2,
  sessions: [
    { number: 1, title: "Audit + positionnement", status: "completed", date: "2026-02-10", summary: "On a posé ton positionnement et ta mission." },
    { number: 2, title: "Cible, offres, ton", status: "completed", date: "2026-02-17", summary: "Marine définie. 3 offres reformulées." },
    { number: 3, title: "Ligne éditoriale", status: "scheduled", date: "2026-02-25" },
    { number: 4, title: "Calendrier + templates", status: "scheduled" },
    { number: 5, title: "Contenus + mise en place", status: "locked" },
    { number: 6, title: "Contenus + mise en place", status: "locked" },
    { number: 7, title: "Revue mensuelle", status: "locked", phase: "binome" },
    { number: 8, title: "Revue mensuelle", status: "locked", phase: "binome" },
    { number: 9, title: "Bilan + autonomie", status: "locked", phase: "binome" },
  ],
  actions: [
    { title: "Lister 5 sujets passion", completed: false },
    { title: "Regarder mes 5 meilleurs posts", completed: false },
    { title: "Valider mon positionnement", completed: true },
  ],
  deliverables: [
    { title: "Audit de communication", status: "delivered" },
    { title: "Branding complet", status: "delivered" },
    { title: "Portrait cible", status: "delivered" },
    { title: "Ligne éditoriale", status: "pending" },
    { title: "Calendrier 3 mois", status: "pending" },
  ],
};

interface DemoContextType {
  isDemoMode: boolean;
  demoData: DemoData | null;
  demoName: string;
  demoActivity: string;
  demoCoaching: typeof DEMO_COACHING;
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
    // Always inject now_pilot plan data into demo
    setDemoData({
      ...data,
      plan: "now_pilot",
      credits_monthly: 300,
      credits_used: 16,
      plan_expires_at: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
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
    () => ({ isDemoMode, demoData, demoName, demoActivity, demoCoaching: DEMO_COACHING, activateDemo, deactivateDemo }),
    [isDemoMode, demoData, demoName, demoActivity, activateDemo, deactivateDemo]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoContext() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemoContext must be used within DemoProvider");
  return context;
}
