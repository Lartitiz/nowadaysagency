import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import {
  fetchBrandingData,
  calculateBrandingCompletion,
  type BrandingCompletion,
} from "@/lib/branding-completion";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek } from "date-fns";

/* ── Types ── */

export interface SessionTask {
  id: string;
  title: string;
  emoji: string;
  duration: number; // seconds
  route: string;
  description: string;
  completed: boolean;
}

export interface SessionState {
  isActive: boolean;
  tasks: SessionTask[];
  currentTaskIndex: number;
  currentTask: SessionTask | null;
  elapsedSeconds: number;
  taskElapsedSeconds: number;
  completedTasks: SessionTask[];
  isPaused: boolean;
  isRecap: boolean;
}

export interface SessionContextValue extends SessionState {
  startSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  completeCurrentTask: () => void;
  skipCurrentTask: () => void;
  endSession: () => void;
}

const INITIAL_STATE: SessionState = {
  isActive: false,
  tasks: [],
  currentTaskIndex: 0,
  currentTask: null,
  elapsedSeconds: 0,
  taskElapsedSeconds: 0,
  completedTasks: [],
  isPaused: false,
  isRecap: false,
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

/* ── Helpers ── */

function pickBrandingRoute(
  completion: BrandingCompletion,
  exclude?: string,
): string {
  const sections: { key: keyof BrandingCompletion; threshold: number; route: string }[] = [
    { key: "storytelling", threshold: 100, route: "/branding/storytelling" },
    { key: "persona", threshold: 50, route: "/branding/persona" },
    { key: "proposition", threshold: 50, route: "/branding/proposition" },
    { key: "tone", threshold: 50, route: "/branding/ton" },
    { key: "strategy", threshold: 50, route: "/branding/strategie" },
  ];

  for (const s of sections) {
    if (s.route === exclude) continue;
    if (completion[s.key] < s.threshold) return s.route;
  }
  return sections[0].route;
}

async function countWeekPosts(wf: { column: string; value: string }): Promise<number> {
  try {
    const now = new Date();
    const monday = startOfWeek(now, { weekStartsOn: 1 });
    const sunday = endOfWeek(now, { weekStartsOn: 1 });
    const { count } = await (supabase.from as any)("calendar_posts")
      .select("id", { count: "exact", head: true })
      .eq(wf.column, wf.value)
      .gte("date", monday.toISOString())
      .lte("date", sunday.toISOString());
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function buildTasks(
  userId: string,
  wf: { column: string; value: string },
): Promise<SessionTask[]> {
  const [raw, weekPosts] = await Promise.all([
    fetchBrandingData(wf),
    countWeekPosts(wf),
  ]);
  const completion = calculateBrandingCompletion(raw);
  const tasks: SessionTask[] = [];
  const brandingLow = completion.total < 60;

  // 1. Branding if low
  if (brandingLow) {
    const route = pickBrandingRoute(completion);
    tasks.push({
      id: "branding",
      title: "Renforce tes fondations",
      emoji: "🎨",
      duration: 600,
      route,
      description: "Complète la section de ton branding qui en a le plus besoin.",
      completed: false,
    });
  }

  // 2. Always: creation
  tasks.push({
    id: "create1",
    title: "Crée un contenu",
    emoji: "✨",
    duration: 600,
    route: "/creer",
    description: "Génère un post avec l'IA. Choisis le format qui t'inspire.",
    completed: false,
  });

  // 3. Second slot
  if (brandingLow) {
    const firstRoute = tasks.find((t) => t.id === "branding")?.route;
    const route2 = pickBrandingRoute(completion, firstRoute);
    tasks.push({
      id: "branding2",
      title: "Continue ton branding",
      emoji: "🎯",
      duration: 300,
      route: route2,
      description: "Encore un petit effort, tu y es presque.",
      completed: false,
    });
  } else {
    tasks.push({
      id: "create2",
      title: "Encore un contenu",
      emoji: "🔥",
      duration: 600,
      route: "/instagram/carousel",
      description: "Un carrousel, un reel, un post LinkedIn… Varie les plaisirs.",
      completed: false,
    });
  }

  // 4. Planning or ideas
  if (weekPosts >= 3) {
    tasks.push({
      id: "ideas",
      title: "Stocke des idées",
      emoji: "💡",
      duration: 300,
      route: "/atelier",
      description: "Note 3 idées de contenus pour la semaine prochaine.",
      completed: false,
    });
  } else {
    tasks.push({
      id: "plan",
      title: "Planifie ta semaine",
      emoji: "📅",
      duration: 300,
      route: "/calendrier",
      description: "Place tes contenus dans le calendrier. Tu sauras quoi poster.",
      completed: false,
    });
  }

  // 5. Always: engagement
  tasks.push({
    id: "engage",
    title: "5 min d'engagement",
    emoji: "💬",
    duration: 300,
    route: "/instagram/routine",
    description: "Interagis avec ta communauté. C'est ce qui fait la différence.",
    completed: false,
  });

  return tasks;
}

/* ── Provider ── */

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const wf = useWorkspaceFilter();

  const [state, setState] = useState<SessionState>(INITIAL_STATE);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer
  useEffect(() => {
    if (state.isActive && !state.isPaused && !state.isRecap) {
      intervalRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          elapsedSeconds: prev.elapsedSeconds + 1,
          taskElapsedSeconds: prev.taskElapsedSeconds + 1,
        }));
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state.isActive, state.isPaused, state.isRecap]);

  const startSession = useCallback(async () => {
    if (!user) return;
    const tasks = await buildTasks(user.id, wf);
    setState({
      isActive: true,
      tasks,
      currentTaskIndex: 0,
      currentTask: tasks[0] ?? null,
      elapsedSeconds: 0,
      taskElapsedSeconds: 0,
      completedTasks: [],
      isPaused: false,
      isRecap: false,
    });
  }, [user, wf]);

  const pauseSession = useCallback(() => {
    setState((prev) => ({ ...prev, isPaused: true }));
  }, []);

  const resumeSession = useCallback(() => {
    setState((prev) => ({ ...prev, isPaused: false }));
  }, []);

  const advanceTask = useCallback((markCompleted: boolean) => {
    setState((prev) => {
      const updatedTasks = prev.tasks.map((t, i) =>
        i === prev.currentTaskIndex && markCompleted
          ? { ...t, completed: true }
          : t,
      );
      const completedTasks = updatedTasks.filter((t) => t.completed);
      const nextIndex = prev.currentTaskIndex + 1;

      if (nextIndex >= prev.tasks.length) {
        return {
          ...prev,
          tasks: updatedTasks,
          completedTasks,
          isRecap: true,
          currentTask: null,
          taskElapsedSeconds: 0,
        };
      }

      return {
        ...prev,
        tasks: updatedTasks,
        completedTasks,
        currentTaskIndex: nextIndex,
        currentTask: updatedTasks[nextIndex],
        taskElapsedSeconds: 0,
      };
    });
  }, []);

  const completeCurrentTask = useCallback(() => advanceTask(true), [advanceTask]);
  const skipCurrentTask = useCallback(() => advanceTask(false), [advanceTask]);

  const endSession = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const value: SessionContextValue = {
    ...state,
    startSession,
    pauseSession,
    resumeSession,
    completeCurrentTask,
    skipCurrentTask,
    endSession,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
