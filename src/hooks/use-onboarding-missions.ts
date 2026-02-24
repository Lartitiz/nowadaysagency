import { useQuery } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";

export interface OnboardingMission {
  id: string;
  title: string;
  emoji: string;
  time: string;
  route: string;
  completed: boolean;
  description: string;
}

const MISSIONS_META = [
  {
    id: "storytelling",
    title: "Raconte ton histoire",
    emoji: "📖",
    time: "15 min",
    route: "/branding/storytelling",
    description: "Écris pourquoi tu fais ce que tu fais. C'est la base de ta marque.",
  },
  {
    id: "persona",
    title: "Dessine ta cliente idéale",
    emoji: "🎯",
    time: "15 min",
    route: "/branding/persona",
    description: "Comprends qui tu veux toucher. L'outil crée ta fiche persona automatiquement.",
  },
  {
    id: "audit",
    title: "Fais le check-up de ton Insta",
    emoji: "🔍",
    time: "5 min",
    route: "/instagram/audit",
    description: "Un scan rapide de ton profil. Tu vois ce qui marche et ce qui coince.",
  },
  {
    id: "create",
    title: "Crée ton premier contenu",
    emoji: "✨",
    time: "10 min",
    route: "/instagram/creer",
    description: "Génère un post avec l'IA qui connaît ta marque. Tu vas voir, c'est bluffant.",
  },
  {
    id: "calendar",
    title: "Planifie ta semaine",
    emoji: "📅",
    time: "10 min",
    route: "/calendrier",
    description: "Place 2-3 contenus dans ton calendrier. Tu sauras quoi poster cette semaine.",
  },
] as const;

const DISMISS_KEY = "missions_dismissed_at";
const DISMISS_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function isDismissedNow(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (isNaN(ts)) return false;
  return Date.now() - ts < DISMISS_DURATION_MS;
}

const DEMO_COMPLETED = new Set(["storytelling", "persona", "audit"]);

export function useOnboardingMissions() {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const filter = useWorkspaceFilter();

  const [dismissed, setDismissed] = useState(() => isDismissedNow());

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }, []);

  const { data: completionMap, isLoading } = useQuery({
    queryKey: ["onboarding-missions", filter.value, isDemoMode],
    enabled: !!user && !isDemoMode,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const eq = (q: any) => q.eq(filter.column, filter.value);

      const [storytelling, persona, audit, posts, carousels, calendar] = await Promise.all([
        eq(supabase.from("storytelling").select("id", { count: "exact", head: true })
          .or("step_7_polished.not.is.null,imported_text.not.is.null")),
        eq(supabase.from("persona").select("id", { count: "exact", head: true })
          .not("step_1_frustrations", "is", null)
          .not("step_2_transformation", "is", null)),
        eq(supabase.from("instagram_audit").select("id", { count: "exact", head: true })
          .not("score_global", "is", null)),
        eq(supabase.from("generated_posts").select("id", { count: "exact", head: true })),
        eq(supabase.from("generated_carousels").select("id", { count: "exact", head: true })),
        eq(supabase.from("calendar_posts").select("id", { count: "exact", head: true })
          .not("date", "is", null)),
      ]);

      return {
        storytelling: (storytelling.count ?? 0) > 0,
        persona: (persona.count ?? 0) > 0,
        audit: (audit.count ?? 0) > 0,
        create: ((posts.count ?? 0) + (carousels.count ?? 0)) > 0,
        calendar: (calendar.count ?? 0) >= 2,
      } as Record<string, boolean>;
    },
  });

  const missions: OnboardingMission[] = useMemo(() => {
    if (isDemoMode) {
      return MISSIONS_META.map((m) => ({ ...m, completed: DEMO_COMPLETED.has(m.id) }));
    }
    return MISSIONS_META.map((m) => ({ ...m, completed: completionMap?.[m.id] ?? false }));
  }, [completionMap, isDemoMode]);

  const completedCount = missions.filter((m) => m.completed).length;
  const allDone = completedCount === 5;
  const nextMission = missions.find((m) => !m.completed) ?? null;

  // Re-show if dismissed but 14 days passed and not all done
  const effectiveDismissed = dismissed && (allDone || isDismissedNow());

  return {
    missions,
    completedCount,
    allDone,
    nextMission,
    dismissed: effectiveDismissed,
    dismiss,
    isLoading: isDemoMode ? false : isLoading,
  };
}
