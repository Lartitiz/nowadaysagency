import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { BADGES } from "@/lib/badges";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface UnlockedBadge {
  badge_id: string;
  unlocked_at: string;
  seen: boolean;
}

export default function BadgesWidget({ animationDelay = 0 }: { animationDelay?: number }) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const [unlocked, setUnlocked] = useState<UnlockedBadge[]>([]);

  useEffect(() => {
    if (isDemoMode) {
      setUnlocked([
        { badge_id: "first_post", unlocked_at: "2026-02-20T10:00:00Z", seen: true },
        { badge_id: "five_posts", unlocked_at: "2026-02-22T14:00:00Z", seen: true },
      ]);
      return;
    }
    if (!user) return;
    (supabase
      .from("user_badges") as any)
      .select("badge_id, unlocked_at, seen")
      .eq(column, value)
      .then(({ data }: any) => {
        if (data) {
          setUnlocked(data as UnlockedBadge[]);
          const unseenIds = data.filter((b: any) => !b.seen).map((b: any) => b.badge_id);
          if (unseenIds.length > 0) {
            (supabase
              .from("user_badges") as any)
              .update({ seen: true })
              .eq(column, value)
              .in("badge_id", unseenIds)
              .then(() => {});
          }
        }
      });
  }, [user?.id, isDemoMode, column, value]);

  const unlockedIds = unlocked.map((b) => b.badge_id);

  return (
    <div
      className="rounded-[20px] border border-border bg-card p-5 shadow-[var(--shadow-bento)] opacity-0 animate-reveal-up mb-6"
      style={{ animationDelay: `${animationDelay}s`, animationFillMode: "forwards" }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-sm font-bold text-foreground">
          Tes badges · {unlocked.length}/{BADGES.length}
        </h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {BADGES.map((badge) => {
          const isUnlocked = unlockedIds.includes(badge.id);
          const unlockedData = unlocked.find((u) => u.badge_id === badge.id);

          if (isUnlocked && unlockedData) {
            return (
              <Popover key={badge.id}>
                <PopoverTrigger asChild>
                  <button className="text-xl w-9 h-9 flex items-center justify-center rounded-xl bg-rose-pale hover:bg-secondary transition-colors cursor-pointer">
                    {badge.emoji}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-3" side="top">
                  <p className="font-heading text-sm font-bold mb-0.5">{badge.emoji} {badge.title}</p>
                  <p className="text-xs text-muted-foreground mb-1">{badge.description}</p>
                  <p className="text-[10px] font-mono-ui text-muted-foreground">
                    Débloqué le {format(new Date(unlockedData.unlocked_at), "d MMM yyyy", { locale: fr })}
                  </p>
                </PopoverContent>
              </Popover>
            );
          }

          return (
            <Tooltip key={badge.id}>
              <TooltipTrigger asChild>
                <span className="text-lg w-9 h-9 flex items-center justify-center rounded-xl bg-muted/40 text-muted-foreground/30 cursor-default">
                  🔒
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{badge.title}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
