import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { startOfWeek, endOfWeek, format, addDays, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { MESSAGES } from "@/lib/messages";

/* ── Format icon mapping ── */
const FORMAT_ICONS: Record<string, string> = {
  story: "📱",
  story_serie: "📱",
  post_photo: "📸",
  post_carrousel: "🎠",
  reel: "🎬",
  article: "📝",
  live: "🎤",
};

const CANAL_ICONS: Record<string, string> = {
  linkedin: "💼",
  pinterest: "📌",
  newsletter: "✉️",
};

function getPostIcon(post: WeekPost): string {
  if (post.stories_count || post.stories_structure) return "📱";
  if (post.format && FORMAT_ICONS[post.format]) return FORMAT_ICONS[post.format];
  if (post.canal && CANAL_ICONS[post.canal]) return CANAL_ICONS[post.canal];
  return post.content_type_emoji || "📸";
}

function getStatusIndicator(status: string): { icon: string; colorClass: string } {
  switch (status) {
    case "published":
      return { icon: "✅", colorClass: "opacity-100" };
    case "ready":
    case "draft_ready":
    case "drafting":
      return { icon: "📝", colorClass: "opacity-50" };
    case "a_rediger":
    case "planned":
    case "idea":
    default:
      return { icon: "📅", colorClass: "text-primary opacity-80" };
  }
}

interface WeekPost {
  id: string;
  date: string;
  theme: string;
  format: string | null;
  status: string;
  canal: string;
  content_type_emoji: string | null;
  stories_count: number | null;
  stories_structure: string | null;
}

interface Props {
  animationDelay?: number;
}

export default function WeekCalendarWidget({ animationDelay = 0 }: Props) {
  const { user } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const navigate = useNavigate();
  const [weekPosts, setWeekPosts] = useState<WeekPost[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  const sunday = endOfWeek(now, { weekStartsOn: 1 });

  const fetchData = useCallback(async () => {
    if (isDemoMode) {
      // Use demo data with dates in the current week
      if (demoData) {
        const mondayStr = format(monday, "yyyy-MM-dd");
        const wednesdayStr = format(addDays(monday, 2), "yyyy-MM-dd");
        const fridayStr = format(addDays(monday, 4), "yyyy-MM-dd");
        const demoPosts: WeekPost[] = [
          {
            id: "demo-1", date: mondayStr,
            theme: "3 erreurs qui rendent tes photos invisibles",
            format: "post_carrousel", status: "published", canal: "instagram",
            content_type_emoji: null, stories_count: null, stories_structure: null,
          },
          {
            id: "demo-2", date: wednesdayStr,
            theme: "Coulisses séance studio",
            format: "reel", status: "planned", canal: "instagram",
            content_type_emoji: null, stories_count: null, stories_structure: null,
          },
          {
            id: "demo-3", date: fridayStr,
            theme: "Pourquoi tes photos de profil comptent",
            format: "reel", status: "planned", canal: "instagram",
            content_type_emoji: null, stories_count: null, stories_structure: null,
          },
        ];
        setWeekPosts(demoPosts);
      }
      setLoading(false);
      return;
    }

    if (!user) return;
    const weekStart = format(monday, "yyyy-MM-dd");
    const weekEnd = format(sunday, "yyyy-MM-dd");

    const { data } = await supabase
      .from("calendar_posts")
      .select("id, date, theme, format, status, canal, content_type_emoji, stories_count, stories_structure")
      .eq("user_id", user.id)
      .gte("date", weekStart)
      .lte("date", weekEnd)
      .order("date");

    setWeekPosts((data as WeekPost[]) || []);
    setLoading(false);
  }, [user?.id, isDemoMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const markAsPublished = async (postId: string) => {
    if (isDemoMode) {
      setWeekPosts(prev => prev.map(p => p.id === postId ? { ...p, status: "published" } : p));
      toast.success(MESSAGES.success.published);
      return;
    }

    const { error } = await supabase
      .from("calendar_posts")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", postId);

    if (error) {
      toast.error(MESSAGES.errors.save_failed.title);
      return;
    }
    toast.success(MESSAGES.success.published);
    fetchData();
  };

  // Build 7-day grid
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    const dateStr = format(d, "yyyy-MM-dd");
    const posts = weekPosts.filter(p => p.date === dateStr);
    return {
      label: format(d, "EEE", { locale: fr }).slice(0, 3).toUpperCase(),
      dateNum: format(d, "d"),
      dateStr,
      isToday: isToday(d),
      posts,
    };
  });

  const published = weekPosts.filter(p => p.status === "published").length;
  const total = weekPosts.length;
  const percentage = total > 0 ? Math.round((published / total) * 100) : 0;

  const todayStr = format(now, "yyyy-MM-dd");
  const nextPost = weekPosts.find(p => p.status !== "published" && p.date >= todayStr);
  const hasContent = weekPosts.length > 0;

  return (
    <div
      className="col-span-4 sm:col-span-6 lg:col-span-6 row-span-3
        rounded-[20px] p-5 sm:p-6
        bg-card border border-border
        shadow-[var(--shadow-bento)]
        hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[3px]
        active:translate-y-0 active:shadow-[var(--shadow-bento)]
        transition-all duration-[250ms] ease-out
        opacity-0 animate-reveal-up cursor-pointer"
      style={{ animationDelay: `${animationDelay}s`, animationFillMode: "forwards" }}
      onClick={() => navigate("/calendrier")}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xl bg-accent/30 w-9 h-9 flex items-center justify-center rounded-xl">📅</span>
          <h3 className="font-heading text-base font-bold text-foreground">Ma semaine</h3>
        </div>
        <span className="text-xs text-primary font-medium flex items-center gap-1">
          Voir le calendrier <ArrowRight className="h-3 w-3" />
        </span>
      </div>

      {hasContent ? (
        <>
          {/* 7-day grid */}
          <div className="grid grid-cols-7 gap-1 mb-4">
            {days.map((d) => (
              <div
                key={d.dateStr}
                className={`flex flex-col items-center gap-1 py-2 rounded-xl transition-colors ${
                  d.isToday ? "bg-rose-pale" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/calendrier?date=${d.dateStr}`);
                }}
              >
                <span className="text-[10px] font-mono-ui text-muted-foreground">{d.label}</span>
                <span className={`text-xs font-medium ${d.isToday ? "text-primary font-bold" : "text-foreground"}`}>
                  {d.dateNum}
                </span>
                {d.isToday && <div className="w-1 h-1 rounded-full bg-primary" />}
                <div className="flex flex-col items-center gap-0.5 mt-1 min-h-[24px]">
                  {d.posts.map((post) => {
                    const icon = getPostIcon(post);
                    const status = getStatusIndicator(post.status);
                    return (
                      <div key={post.id} className="flex items-center gap-0.5">
                        <span className={`text-xs leading-none ${status.colorClass}`}>{icon}</span>
                        <span className="text-[9px] leading-none">{status.icon}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Counter */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-foreground">
                <span className="font-heading text-xl font-bold text-primary mr-1">{published}/{total}</span>
                publiés
              </p>
              <span className="text-xs text-muted-foreground font-mono-ui">{percentage}%</span>
            </div>
            <Progress value={percentage} className="h-1.5" />
          </div>

          {/* Next post */}
          {nextPost && (
            <div className="mt-3 flex items-center justify-between gap-2 bg-muted/30 rounded-xl px-3 py-2">
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Prochain :</p>
                <p className="text-xs text-foreground font-medium truncate">
                  {getPostIcon(nextPost)} {nextPost.theme}
                </p>
                <p className="text-[10px] text-muted-foreground capitalize">
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
                className="text-[10px] shrink-0 h-7 px-2"
              >
                Marquer publié
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-muted-foreground mb-1">
            Rien de prévu cette semaine.
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Si t'as 15 minutes, planifie un contenu.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate("/calendrier");
            }}
            className="text-xs"
          >
            Planifier un contenu →
          </Button>
        </div>
      )}
    </div>
  );
}
