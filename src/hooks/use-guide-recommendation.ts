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
  brandingTotal: number; // 0-100
  calendarPosts: number;
  lastAuditDate: string | null;
  onboardingComplete: boolean;
  contentsGenerated: number;
}

export interface UseGuideRecommendationResult {
  recommendation: GuideRecommendation;
  profileSummary: ProfileSummary;
  isLoading: boolean;
  error: string | null;
}

/* ── Section helpers ── */
const SECTION_ORDER = [
  { key: "storytelling" as const, label: "Ton histoire", route: "/branding/section?section=story", routeNew: "/branding/coaching?section=story" },
  { key: "persona" as const, label: "Ton·ta client·e idéal·e", route: "/branding/section?section=persona&tab=synthese", routeNew: "/branding/coaching?section=persona" },
  { key: "proposition" as const, label: "Ta proposition de valeur", route: "/branding/proposition/recap", routeNew: "/branding/proposition/recap" },
  { key: "tone" as const, label: "Ton & style", route: "/branding/section?section=tone_style&tab=synthese", routeNew: "/branding/coaching?section=tone_style" },
  { key: "strategy" as const, label: "Ta stratégie de contenu", route: "/branding/section?section=content_strategy&tab=synthese", routeNew: "/branding/coaching?section=content_strategy" },
  { key: "offers" as const, label: "Tes offres", route: "/branding/offres", routeNew: "/branding/offres" },
  { key: "charter" as const, label: "Ta charte visuelle", route: "/branding/charter", routeNew: "/branding/charter" },
] as const;

function countFilledSections(bc: BrandingCompletion): number {
  return SECTION_ORDER.filter((s) => bc[s.key] >= 50).length;
}

function getNextEmptySection(bc: BrandingCompletion) {
  const s = SECTION_ORDER.find((s) => bc[s.key] < 50) ?? SECTION_ORDER[0];
  return { ...s, activeRoute: bc[s.key] > 0 ? s.route : s.routeNew };
}

/* ── Fallback recommendation ── */
const FALLBACK: GuideRecommendation = {
  title: "Raconte-moi ton histoire",
  explanation:
    "Bon, on part de zéro et c'est très bien. La première étape : raconter ton histoire. C'est la fondation de tout le reste. Sans ça, ta com' ressemblera à toutes les autres.",
  ctaLabel: "C'est parti !",
  ctaRoute: "/branding/coaching?section=story",
  icon: "BookOpen",
  alternatives: [
    { title: "Définir ton·ta client·e idéal·e", route: "/branding/section?section=persona", icon: "Users" },
    { title: "Faire un audit Instagram", route: "/instagram/audit", icon: "Search" },
  ],
};

/* ── Decision tree ── */
function buildRecommendation(
  onboardingDone: boolean,
  bc: BrandingCompletion,
  calendarPosts: number,
  lastAuditDate: string | null,
  contentsGenerated: number = 0,
): GuideRecommendation {
  const sectionsFilled = countFilledSections(bc);

  // P1 – Onboarding not done
  if (!onboardingDone) {
    return {
      title: "Termine ton diagnostic",
      explanation:
        "On avait commencé à discuter de ton projet et je suis restée sur ma faim ! Ton diagnostic va te donner une vraie feuille de route. Promis, ça prend 10 minutes max.",
      ctaLabel: "Reprendre →",
      ctaRoute: "/onboarding",
      icon: "ClipboardCheck",
      alternatives: [
        { title: "Explorer l'outil librement", route: "/dashboard/complet", icon: "LayoutGrid" },
      ],
    };
  }

  // P2 – Pas encore de contenu créé : pousser la création en priorité
  // L'enrichissement a pré-rempli assez de branding pour que les générateurs fonctionnent
  if (contentsGenerated === 0 && calendarPosts === 0) {
    const hasContent = contentsGenerated > 0;
    if (!hasContent) {
      return {
        title: "Crée ton premier contenu",
        explanation:
          "Ton branding est posé, l'outil connaît ton projet. Le meilleur moyen de tester la puissance de l'outil, c'est de créer un contenu tout de suite. L'IA utilise tout ce que tu as renseigné pour écrire avec ta voix.",
        ctaLabel: "Créer un contenu →",
        ctaRoute: "/creer",
        icon: "Sparkles",
        alternatives: [
          { title: "Affiner mon branding", route: "/branding", icon: "Palette" },
          { title: "Faire un audit Instagram", route: "/instagram/audit", icon: "Search" },
        ],
      };
    }
    // A déjà créé du contenu mais branding incomplet → suggestion douce
    const next = getNextEmptySection(bc);
    const remaining = 7 - sectionsFilled;
    return {
      title: "Affine ton branding pour des contenus encore meilleurs",
      explanation: `Tes premiers contenus sont lancés, bravo ! Pour que l'IA soit encore plus précise, il te reste ${remaining} section${remaining > 1 ? "s" : ""} de branding à compléter. Chaque info en plus rend tes contenus plus personnalisés.`,
      ctaLabel: "Compléter →",
      ctaRoute: next.activeRoute,
      icon: "Palette",
      alternatives: [
        { title: "Créer un autre contenu", route: "/creer", icon: "PenLine" },
        { title: "Planifier mes contenus", route: "/calendrier", icon: "CalendarPlus" },
      ],
    };
  }

  // P5 – Branding ≥ 3 but empty calendar
  if (sectionsFilled >= 3 && calendarPosts === 0) {
    return {
      title: "Planifie ta première semaine de contenus",
      explanation:
        "Ton branding prend forme et c'est top. Sauf que la plus belle stratégie du monde ne sert à rien si elle reste dans un tiroir. On planifie tes premiers contenus ? *(Spoiler : c'est plus simple que tu crois.)*",
      ctaLabel: "C'est parti !",
      ctaRoute: "/calendrier",
      icon: "CalendarPlus",
      alternatives: [
        { title: "Générer des idées de contenus", route: "/creer", icon: "Lightbulb" },
        { title: "Faire un audit Instagram", route: "/instagram/audit", icon: "Search" },
      ],
    };
  }

  // P6 – Has posts but no audit
  if (calendarPosts > 0 && !lastAuditDate) {
    return {
      title: "Fais le point sur ton Instagram",
      explanation:
        "Tu publies, c'est déjà énorme. Maintenant la question : est-ce que ça marche ? Un petit check-up de ton Instagram va te donner des pistes concrètes pour t'améliorer.",
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
      "Ta com' est bien calée. Le secret maintenant, c'est la régularité. Pas la perfection, la régularité. On crée ton prochain contenu ?",
    ctaLabel: "C'est parti !",
    ctaRoute: "/creer",
    icon: "Sparkles",
    alternatives: [
      { title: "Mettre à jour ton branding", route: "/branding", icon: "Palette" },
      { title: "Faire ta routine d'engagement", route: "/instagram/routine", icon: "Heart" },
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
      // Demo mode – Léa, photographe portraitiste éthique
      if (isDemoMode && demoData) {
        // 4/6 sections: storytelling ✓, persona ✓, proposition ✓, tone ✓, strategy ✗, charter ✗
        const bc: BrandingCompletion = {
          storytelling: 100,
          persona: 100,
          proposition: 80,
          tone: 70,
          strategy: 0,
          offers: 0,
          charter: 0,
          total: 50,
        };
        // Audit done 2 weeks ago
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        const lastAudit = twoWeeksAgo.toISOString();

        return {
          recommendation: buildRecommendation(true, bc, 0, lastAudit, 3),
          profileSummary: {
            firstName: demoData.profile.first_name,
            brandingSections: 4,
            brandingTotal: bc.total,
            calendarPosts: 0,
            lastAuditDate: lastAudit,
            onboardingComplete: true,
            contentsGenerated: 3,
          },
        };
      }

      if (!user) throw new Error("Not authenticated");

      const filter = { column, value };

      // Parallel fetches
      const [brandingData, profileRes, planConfigRes, calendarCountRes, auditRes, contentsCountRes] =
        await Promise.all([
          fetchBrandingData(filter),
    (supabase.from("profiles") as any)
            .select("prenom, onboarding_completed")
            .eq("user_id", user.id)
            .maybeSingle(),
          (supabase.from("user_plan_config") as any)
            .select("onboarding_completed")
            .eq("user_id", user.id)
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
          (supabase.from("content_drafts") as any)
            .select("id", { count: "exact", head: true })
            .eq(filter.column, filter.value),
        ]);

      const bc = calculateBrandingCompletion(brandingData);
      const firstName = (profileRes.data as any)?.prenom || "toi";
      // Consider onboarding done if EITHER table says true
      // (prevents lockout if one table wasn't updated during original onboarding)
      const profileOnboarded = (profileRes.data as any)?.onboarding_completed === true;
      const configOnboarded = (planConfigRes.data as any)?.onboarding_completed === true;
      const onboardingDone = profileOnboarded || configOnboarded;
      const calendarPosts = calendarCountRes.count ?? 0;
      const lastAuditDate: string | null = (auditRes.data as any)?.created_at ?? null;
      const contentsCount = contentsCountRes.count ?? 0;

      const recommendation = buildRecommendation(onboardingDone, bc, calendarPosts, lastAuditDate, contentsCount);

      return {
        recommendation,
        profileSummary: {
          firstName,
          brandingSections: countFilledSections(bc),
          brandingTotal: bc.total,
          calendarPosts,
          lastAuditDate,
          onboardingComplete: onboardingDone,
          contentsGenerated: contentsCount,
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
      brandingTotal: 0,
      calendarPosts: 0,
      lastAuditDate: null,
      onboardingComplete: false,
      contentsGenerated: 0,
    },
    isLoading,
    error: error ? (error as Error).message : null,
  };
}
