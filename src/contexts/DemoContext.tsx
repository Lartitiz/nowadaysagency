import { createContext, useContext, useReducer, useCallback, useMemo, ReactNode } from "react";

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

interface DemoState {
  isDemoMode: boolean;
  demoData: DemoData | null;
  demoName: string;
  demoActivity: string;
}

type DemoAction =
  | { type: "ACTIVATE"; data: DemoData; name: string; activity: string }
  | { type: "DEACTIVATE" };

function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "ACTIVATE":
      return {
        isDemoMode: true,
        demoData: {
          ...action.data,
          plan: "now_pilot",
          credits_monthly: 300,
          credits_used: 16,
          plan_expires_at: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        demoName: action.name,
        demoActivity: action.activity,
      };
    case "DEACTIVATE":
      return { isDemoMode: false, demoData: null, demoName: "", demoActivity: "" };
    default:
      return state;
  }
}

const initialState: DemoState = {
  isDemoMode: false,
  demoData: null,
  demoName: "",
  demoActivity: "",
};

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(demoReducer, initialState);

  const activateDemo = useCallback((data: DemoData, name: string, activity: string) => {
    dispatch({ type: "ACTIVATE", data, name, activity });
  }, []);

  const deactivateDemo = useCallback(() => {
    dispatch({ type: "DEACTIVATE" });
  }, []);

  const value = useMemo<DemoContextType>(
    () => ({
      isDemoMode: state.isDemoMode,
      demoData: state.demoData,
      demoName: state.demoName,
      demoActivity: state.demoActivity,
      demoCoaching: DEMO_COACHING,
      activateDemo,
      deactivateDemo,
    }),
    [state, activateDemo, deactivateDemo]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoContext() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemoContext must be used within DemoProvider");
  return context;
}
