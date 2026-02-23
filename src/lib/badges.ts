import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* ── Badge definitions ── */
export interface BadgeDef {
  id: string;
  emoji: string;
  title: string;
  description: string;
  condition: (stats: BadgeStats) => boolean;
}

export interface BadgeStats {
  total_published: number;
  completed_weeks: number;
  consecutive_streaks: number;
  branding_completion: number;
  carousels_published: number;
  reels_published: number;
  bio_completed: boolean;
  audit_improved: boolean;
}

export const BADGES: BadgeDef[] = [
  {
    id: "first_post",
    emoji: "✍️",
    title: "Première publication",
    description: "Tu as publié ton premier contenu depuis l'outil",
    condition: (s) => s.total_published >= 1,
  },
  {
    id: "five_posts",
    emoji: "🌱",
    title: "5 contenus publiés",
    description: "La régularité commence ici",
    condition: (s) => s.total_published >= 5,
  },
  {
    id: "ten_posts",
    emoji: "🌿",
    title: "10 contenus publiés",
    description: "Tu prends le rythme",
    condition: (s) => s.total_published >= 10,
  },
  {
    id: "twenty_five_posts",
    emoji: "🌳",
    title: "25 contenus publiés",
    description: "Ta com' a pris racine",
    condition: (s) => s.total_published >= 25,
  },
  {
    id: "fifty_posts",
    emoji: "🏆",
    title: "50 contenus publiés",
    description: "Franchement, bravo",
    condition: (s) => s.total_published >= 50,
  },
  {
    id: "first_streak",
    emoji: "🔥",
    title: "Première semaine complète",
    description: "Tous tes contenus prévus sont publiés",
    condition: (s) => s.completed_weeks >= 1,
  },
  {
    id: "month_streak",
    emoji: "💫",
    title: "1 mois de régularité",
    description: "4 semaines complètes d'affilée",
    condition: (s) => s.consecutive_streaks >= 4,
  },
  {
    id: "branding_complete",
    emoji: "🎨",
    title: "Branding posé",
    description: "Ton positionnement, ta cible, ton ton : tout est clair",
    condition: (s) => s.branding_completion >= 100,
  },
  {
    id: "first_carousel",
    emoji: "📱",
    title: "Premier carrousel",
    description: "Le format qui performe le mieux : bien joué",
    condition: (s) => s.carousels_published >= 1,
  },
  {
    id: "first_reel",
    emoji: "🎬",
    title: "Premier Reel",
    description: "Tu as osé la vidéo",
    condition: (s) => s.reels_published >= 1,
  },
  {
    id: "bio_optimized",
    emoji: "✨",
    title: "Bio optimisée",
    description: "Ta vitrine Instagram est au point",
    condition: (s) => s.bio_completed,
  },
  {
    id: "audit_improved",
    emoji: "📈",
    title: "Score en hausse",
    description: "Ton audit s'améliore depuis le dernier diagnostic",
    condition: (s) => s.audit_improved,
  },
];

/* ── Compute streak data from calendar_posts ── */
export interface WeekStreakStatus {
  weekStart: string;
  planned: number;
  published: number;
  status: "empty" | "complete" | "partial" | "missed";
}

export function computeWeekStatus(posts: { date: string; status: string }[], weekStart: string, weekEnd: string): WeekStreakStatus {
  const planned = posts.filter(
    (p) => p.date >= weekStart && p.date <= weekEnd && (p.status === "ready" || p.status === "published" || p.status === "drafting" || p.status === "a_rediger")
  );
  const published = planned.filter((p) => p.status === "published");

  if (planned.length === 0) return { weekStart, planned: 0, published: 0, status: "empty" };
  if (published.length === planned.length) return { weekStart, planned: planned.length, published: published.length, status: "complete" };
  if (published.length > 0) return { weekStart, planned: planned.length, published: published.length, status: "partial" };
  return { weekStart, planned: planned.length, published: 0, status: "missed" };
}

export function getConsecutiveStreaks(weeklyData: WeekStreakStatus[]): number {
  let streak = 0;
  for (let i = weeklyData.length - 1; i >= 0; i--) {
    if (weeklyData[i].status === "complete") streak++;
    else break;
  }
  return streak;
}

/* ── Badge stats fetcher ── */
export async function getUserBadgeStats(userId: string): Promise<BadgeStats> {
  const [publishedRes, carouselRes, reelRes, bioRes, auditRes] = await Promise.all([
    supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "published"),
    supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "published").in("format", ["carousel", "post_carrousel"]),
    supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "published").eq("format", "reel"),
    supabase.from("audit_validations").select("id").eq("user_id", userId).eq("section", "bio").eq("status", "validated").maybeSingle(),
    supabase.from("instagram_audit").select("score_global").eq("user_id", userId).order("created_at", { ascending: false }).limit(2),
  ]);

  // Get completed weeks (last 12 weeks)
  const now = new Date();
  const twelveWeeksAgo = new Date(now);
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
  const { data: recentPosts } = await supabase
    .from("calendar_posts")
    .select("date, status")
    .eq("user_id", userId)
    .gte("date", twelveWeeksAgo.toISOString().split("T")[0])
    .lte("date", now.toISOString().split("T")[0]);

  // Build weekly statuses
  const weekStatuses: WeekStreakStatus[] = [];
  for (let w = 0; w < 12; w++) {
    const ws = new Date(now);
    ws.setDate(ws.getDate() - ((11 - w) * 7) - ws.getDay() + 1);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    const wsStr = ws.toISOString().split("T")[0];
    const weStr = we.toISOString().split("T")[0];
    weekStatuses.push(computeWeekStatus(recentPosts || [], wsStr, weStr));
  }

  const completedWeeks = weekStatuses.filter((w) => w.status === "complete").length;
  const consecutiveStreaks = getConsecutiveStreaks(weekStatuses);

  // Audit improvement
  const audits = auditRes.data || [];
  const auditImproved = audits.length >= 2 && (audits[0] as any).score_global > (audits[1] as any).score_global;

  return {
    total_published: publishedRes.count ?? 0,
    completed_weeks: completedWeeks,
    consecutive_streaks: consecutiveStreaks,
    branding_completion: 0, // Will be passed externally
    carousels_published: carouselRes.count ?? 0,
    reels_published: reelRes.count ?? 0,
    bio_completed: !!bioRes.data,
    audit_improved: auditImproved,
  };
}

/* ── Check and unlock new badges ── */
export async function checkBadges(userId: string, brandingCompletion: number = 0): Promise<void> {
  const stats = await getUserBadgeStats(userId);
  stats.branding_completion = brandingCompletion;

  const { data: existing } = await supabase
    .from("user_badges")
    .select("badge_id")
    .eq("user_id", userId);

  const existingIds = (existing || []).map((b: any) => b.badge_id);

  const newBadges = BADGES.filter(
    (badge) => !existingIds.includes(badge.id) && badge.condition(stats)
  );

  if (newBadges.length === 0) return;

  await supabase.from("user_badges").insert(
    newBadges.map((b) => ({ user_id: userId, badge_id: b.id }))
  );

  newBadges.forEach((badge) => {
    toast.success(`${badge.emoji} ${badge.title} débloqué !`, {
      description: badge.description,
    });
  });
}
