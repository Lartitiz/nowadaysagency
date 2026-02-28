import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useNavigate } from "react-router-dom";
import { startOfWeek, endOfWeek, format, addDays, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { checkBadges, computeWeekStatus, getConsecutiveStreaks, type WeekStreakStatus } from "@/lib/badges";
import { toast } from "sonner";

interface WeekPost {
  id: string;
  theme: string;
  date: string;
  status: string;
  format: string | null;
}

interface Props {
  animationDelay?: number;
  brandingCompletion?: number;
}

export default function WeeklyProgressWidget({ animationDelay = 0, brandingCompletion = 0 }: Props) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const navigate = useNavigate();
  const [weekPosts, setWeekPosts] = useState<WeekPost[]>([]);
  const [consecutiveStreaks, setConsecutiveStreaks] = useState(0);
  const [lastWeekEmpty, setLastWeekEmpty] = useState(false);

  const now = new Date();
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  const sunday = endOfWeek(now, { weekStartsOn: 1 });
  const weekStartStr = format(monday, "yyyy-MM-dd");
  const weekEndStr = format(sunday, "yyyy-MM-dd");

  const fetchWeekData = useCallback(async () => {
    if (!user) return;

    // Fetch current week posts
    const { data: posts } = await (supabase
      .from("calendar_posts") as any)
      .select("id, theme, date, status, format")
      .eq(column, value)
      .gte("date", weekStartStr)
      .lte("date", weekEndStr)
      .order("date");

    setWeekPosts((posts as WeekPost[]) || []);

    // Fetch last 8 weeks for streak calculation
    const eightWeeksAgo = format(subWeeks(monday, 8), "yyyy-MM-dd");
    const { data: recentPosts } = await (supabase
      .from("calendar_posts") as any)
      .select("date, status")
      .eq(column, value)
      .gte("date", eightWeeksAgo)
      .lte("date", weekEndStr);

    const weekStatuses: WeekStreakStatus[] = [];
    for (let w = 0; w < 8; w++) {
      const ws = addDays(subWeeks(monday, 7 - w), 0);
      const we = addDays(ws, 6);
      weekStatuses.push(
        computeWeekStatus(recentPosts || [], format(ws, "yyyy-MM-dd"), format(we, "yyyy-MM-dd"))
      );
    }
    setConsecutiveStreaks(getConsecutiveStreaks(weekStatuses));

    // Check if last week was empty
    const lastMonday = subWeeks(monday, 1);
    const lastSunday = addDays(lastMonday, 6);
    const lastWeekStatus = computeWeekStatus(
      recentPosts || [],
      format(lastMonday, "yyyy-MM-dd"),
      format(lastSunday, "yyyy-MM-dd")
    );
    setLastWeekEmpty(lastWeekStatus.status === "empty" || lastWeekStatus.status === "missed");
  }, [user?.id, weekStartStr, weekEndStr, column, value]);

  useEffect(() => {
    fetchWeekData();
  }, [fetchWeekData]);

  const planned = weekPosts.length;
  const published = weekPosts.filter((p) => p.status === "published").length;
  const percentage = planned > 0 ? Math.round((published / planned) * 100) : 0;
  const isComplete = planned > 0 && published === planned;

  // Next unpublished post
  const nextPost = weekPosts.find(
    (p) => p.status !== "published" && p.date >= format(now, "yyyy-MM-dd")
  );

  const markAsPublished = async (postId: string) => {
    const { error } = await supabase
      .from("calendar_posts")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", postId);

    if (error) {
      toast.error("Oups, ça n'a pas marché. Réessaie.");
      return;
    }

    toast.success("✅ Publié !");
    fetchWeekData();
    if (user) checkBadges({ column, value }, user.id, brandingCompletion);
  };

  // Progress bar color
  const progressClass =
    percentage === 0
      ? "[&>div]:bg-muted"
      : percentage < 50
      ? "[&>div]:bg-[hsl(338_100%_71%)]"
      : percentage < 100
      ? "[&>div]:bg-primary"
      : "[&>div]:bg-[hsl(160_60%_45%)]";

  return (
    <div
      className="rounded-[20px] border border-border bg-card p-5 shadow-[var(--shadow-bento)] opacity-0 animate-reveal-up mb-6"
      style={{ animationDelay: `${animationDelay}s`, animationFillMode: "forwards" }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-sm font-bold text-foreground">📅 Ma semaine</h3>
        {consecutiveStreaks > 1 && (
          <span className="text-xs font-medium text-[hsl(25_95%_53%)] flex items-center gap-1">
            🔥 {consecutiveStreaks} semaines de suite !
          </span>
        )}
      </div>

      {/* Complete week */}
      {isComplete && (
        <>
          <p className="text-sm text-foreground mb-2">
            <span className="font-heading text-2xl font-bold text-[hsl(160_60%_45%)] mr-1">{published}/{planned}</span>
            publiés cette semaine 🎉
          </p>
          <Progress value={100} className={`h-2 rounded-xl ${progressClass}`} />
          <p className="text-xs text-muted-foreground mt-2 italic">Bravo, semaine complète !</p>
        </>
      )}

      {/* In progress */}
      {planned > 0 && !isComplete && (
        <>
          <p className="text-sm text-foreground mb-2">
            <span className="font-heading text-2xl font-bold text-primary mr-1">{published}/{planned}</span>
            publiés
          </p>
          <Progress value={percentage} className={`h-2 rounded-xl ${progressClass}`} />

          {nextPost && (
            <button
              onClick={() => navigate(`/calendrier?date=${nextPost.date}&post=${nextPost.id}`)}
              className="mt-3 flex items-center justify-between gap-2 bg-muted/30 rounded-xl px-3 py-2 w-full text-left hover:bg-muted/50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Prochain :</p>
                <p className="text-sm text-foreground font-medium truncate">"{nextPost.theme}"</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {format(new Date(nextPost.date + "T00:00:00"), "EEEE", { locale: fr })}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  markAsPublished(nextPost.id);
                }}
                className="text-xs shrink-0"
              >
                Marquer publié
              </Button>
            </button>
          )}
        </>
      )}

      {/* Nothing planned */}
      {planned === 0 && !lastWeekEmpty && (
        <>
          <p className="text-sm text-muted-foreground mb-3">
            Aucun contenu planifié cette semaine.
            <br />
            Pas de pression : si t'as 15 minutes, planifie un post.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate("/calendrier")} className="text-xs">
            Planifier un contenu →
          </Button>
        </>
      )}

      {/* Nothing planned + last week was empty too */}
      {planned === 0 && lastWeekEmpty && (
        <>
          <p className="text-sm text-muted-foreground mb-3">
            La semaine dernière t'as fait une pause. C'est ok. Prête à reprendre ? 💪
          </p>
          <Button variant="default" size="sm" onClick={() => navigate("/calendrier")} className="text-xs">
            Planifier ma semaine →
          </Button>
        </>
      )}
    </div>
  );
}
