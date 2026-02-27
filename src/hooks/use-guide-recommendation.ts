import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchBrandingData,
  calculateBrandingCompletion,
  type BrandingCompletion,
} from "@/lib/branding-completion";

/* ── Types ── */
interface Alternative {
  title: string;
  route: string;
  icon: string; // Lucide icon name
}

export interface GuideRecommendation {
  title: string;
  explanation: string;
  ctaLabel: string;
  ctaRoute: string;
  icon: string;
  alternatives: Alternative[];
}

export interface ProfileSummary {
  firstName: string;
  brandingSections: number; // 0-6
  calendarPosts: number;
  lastAuditDate: string | null;
  onboardingComplete: boolean;
}

export interface UseGuideRecommendationResult {
  recommendation: GuideRecommendation;
  profileSummary: ProfileSummary;
  isLoading: boolean;
  error: string | null;
}

/* ── Section helpers ── */
const SECTION_ORDER = [
  { key: "storytelling" as const, label: "Ton histoire", route: "/branding/storytelling/new" },
  { key: "persona" as const, label: "Ton·ta client·e idéal·e", route: "/branding/persona" },
  { key: "proposition" as const, label: "Ta proposition de valeur", route: "/branding/proposition" },
  { key: "tone" as const, label: "Ton & style", route: "/branding/ton" },
  { key: "strategy" as const, label: "Ta stratégie de contenu", route: "/branding/strategie" },
  { key: "charter" as const, label: "Ta charte visuelle", route: "/branding/charter" },
] as const;

function countFilledSections(bc: BrandingCompletion): number {
  return SECTION_ORDER.filter((s) => bc[s.key] >= 50).length;
}

function getNextEmptySection(bc: BrandingCompletion) {
  return SECTION_ORDER.find((s) => bc[s.key] < 50) ?? SECTION_ORDER[0];
}

/* ── Fallback recommendation ── */
const FALLBACK: GuideRecommendation = {
  title: "Raconte-moi ton histoire",
  explanation:
    "Avant de créer du contenu, il faut poser les fondations. Ton storytelling, c'est ce qui va te différencier. On commence par là.",
  ctaLabel: "C'est parti !",
  ctaRoute: "/branding/storytelling/new",
  icon: "BookOpen",
  alternatives: [
    { title: "Définir ton·ta client·e idéal·e", route: "/branding/persona", icon: "Users" },
    { title: "Faire un audit Instagram", route: "/instagram/audit", icon: "Search" },
  ],
};

/* ── Decision tree ── */
function buildRecommendation(
  onboardingDone: boolean,
  bc: BrandingCompletion,
  calendarPosts: number,
  lastAuditDate: string | null,
): GuideRecommendation {
  const sectionsFilled = countFilledSections(bc);

  // P1 – Onboarding not done
  if (!onboardingDone) {
    return {
      title: "Termine ton diagnostic",
      explanation:
        "Tu as commencé à me raconter ton projet mais on n'a pas fini. Ton diagnostic va te donner un score et des priorités claires pour ta com'.",
      ctaLabel: "Reprendre →",
      ctaRoute: "/onboarding",
      icon: "ClipboardCheck",
      alternatives: [
        { title: "Explorer l'outil librement", route: "/dashboard/complet", icon: "LayoutGrid" },
      ],
    };
  }

  // P2 – Zero branding sections
  if (sectionsFilled === 0) {
    return FALLBACK;
  }

  // P3 – Storytelling done but no persona
  if (bc.storytelling >= 50 && bc.persona < 50) {
    return {
      title: "Clarifie qui est ton·ta client·e idéal·e",
      explanation:
        "Tu as une super histoire. Maintenant il faut savoir à qui tu la racontes. Sans persona, tes contenus parlent dans le vide.",
      ctaLabel: "C'est parti !",
      ctaRoute: "/branding/persona",
      icon: "Users",
      alternatives: [
        { title: "Créer ton premier post", route: "/creer", icon: "PenLine" },
        { title: "Continuer ton branding", route: "/branding", icon: "Palette" },
      ],
    };
  }

  // P4 – Branding < 3 sections
  if (sectionsFilled < 3) {
    const next = getNextEmptySection(bc);
    const remaining = 6 - sectionsFilled;
    return {
      title: "Continue à structurer ta com'",
      explanation: `Tu avances bien ! Il te reste ${remaining} section${remaining > 1 ? "s" : ""} à compléter. La prochaine : ${next.label}.`,
      ctaLabel: "C'est parti !",
      ctaRoute: next.route,
      icon: "Layers",
      alternatives: [
        { title: "Créer un contenu", route: "/creer", icon: "PenLine" },
        { title: "Voir ton calendrier", route: "/calendrier", icon: "CalendarDays" },
      ],
    };
  }

  // P5 – Branding ≥ 3 but empty calendar
  if (sectionsFilled >= 3 && calendarPosts === 0) {
    return {
      title: "Planifie ta première semaine de contenus",
      explanation:
        "Ton branding est en bonne voie. Le truc maintenant, c'est de passer à l'action. On planifie ensemble tes premiers posts ?",
      ctaLabel: "C'est parti !",
      ctaRoute: "/calendrier",
      icon: "CalendarPlus",
      alternatives: [
        { title: "Générer des idées de contenus", route: "/atelier", icon: "Lightbulb" },
        { title: "Faire un audit Instagram", route: "/instagram/audit", icon: "Search" },
      ],
    };
  }

  // P6 – Has posts but no audit
  if (calendarPosts > 0 && !lastAuditDate) {
    return {
      title: "Fais le point sur ton Instagram",
      explanation:
        "Tu crées du contenu, c'est top. Mais est-ce que ça porte ses fruits ? Un petit audit va te montrer ce qui marche et ce qu'on peut améliorer.",
      ctaLabel: "C'est parti !",
      ctaRoute: "/instagram/audit",
      icon: "BarChart3",
      alternatives: [
        { title: "Générer un nouveau contenu", route: "/creer", icon: "PenLine" },
        { title: "Enrichir ton branding", route: "/branding", icon: "Palette" },
      ],
    };
  }

  // P7 – Everything is advanced
  return {
    title: "Crée ton prochain contenu",
    explanation:
      "Ta com' est bien structurée. Le plus important maintenant : la régularité. On génère ton prochain post ?",
    ctaLabel: "C'est parti !",
    ctaRoute: "/creer",
    icon: "Sparkles",
    alternatives: [
      { title: "Voir ton calendrier", route: "/calendrier", icon: "CalendarDays" },
      { title: "Mettre à jour ton branding", route: "/branding", icon: "Palette" },
    ],
  };
}

/* ── Hook ── */
export function useGuideRecommendation(): UseGuideRecommendationResult {
  const { user } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const { column, value } = useWorkspaceFilter();

  const { data, isLoading, error } = useQuery({
    queryKey: ["guide-recommendation", user?.id, column, value, isDemoMode],
    queryFn: async (): Promise<{
      recommendation: GuideRecommendation;
      profileSummary: ProfileSummary;
    }> => {
      // Demo mode
      if (isDemoMode && demoData) {
        const bc: BrandingCompletion = {
          storytelling: 100,
          persona: 0,
          proposition: 20,
          tone: 15,
          strategy: 10,
          charter: 0,
          total: demoData.branding.completion ?? 24,
        };
        return {
          recommendation: buildRecommendation(true, bc, demoData.calendar_posts.length, null),
          profileSummary: {
            firstName: demoData.profile.first_name,
            brandingSections: countFilledSections(bc),
            calendarPosts: demoData.calendar_posts.length,
            lastAuditDate: null,
            onboardingComplete: true,
          },
        };
      }

      if (!user) throw new Error("Not authenticated");

      const filter = { column, value };

      // Parallel fetches
      const [brandingData, profileRes, planConfigRes, calendarCountRes, auditRes] =
        await Promise.all([
          fetchBrandingData(filter),
          (supabase.from("profiles") as any)
            .select("prenom, onboarding_completed")
            .eq(filter.column, filter.value)
            .maybeSingle(),
          (supabase.from("user_plan_config") as any)
            .select("onboarding_completed")
            .eq(filter.column, filter.value)
            .maybeSingle(),
          (supabase.from("calendar_posts") as any)
            .select("id", { count: "exact", head: true })
            .eq(filter.column, filter.value),
          (supabase.from("instagram_audit") as any)
            .select("created_at")
            .eq(filter.column, filter.value)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      const bc = calculateBrandingCompletion(brandingData);
      const firstName = (profileRes.data as any)?.prenom || "toi";
      const onboardingDone =
        (profileRes.data as any)?.onboarding_completed === true &&
        (planConfigRes.data as any)?.onboarding_completed === true;
      const calendarPosts = calendarCountRes.count ?? 0;
      const lastAuditDate: string | null = (auditRes.data as any)?.created_at ?? null;

      const recommendation = buildRecommendation(onboardingDone, bc, calendarPosts, lastAuditDate);

      return {
        recommendation,
        profileSummary: {
          firstName,
          brandingSections: countFilledSections(bc),
          calendarPosts,
          lastAuditDate,
          onboardingComplete: onboardingDone,
        },
      };
    },
    enabled: !!user || isDemoMode,
    staleTime: 3 * 60 * 1000,
  });

  return {
    recommendation: data?.recommendation ?? FALLBACK,
    profileSummary: data?.profileSummary ?? {
      firstName: "toi",
      brandingSections: 0,
      calendarPosts: 0,
      lastAuditDate: null,
      onboardingComplete: false,
    },
    isLoading,
    error: error ? (error as Error).message : null,
  };
}
