import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useProfileUserId } from "@/hooks/use-workspace-query";

export type ChannelId = "instagram" | "linkedin" | "newsletter" | "pinterest" | "site" | "seo";

export const ALL_CHANNELS: { id: ChannelId; label: string; emoji: string; comingSoon: boolean }[] = [
  { id: "instagram", label: "Instagram", emoji: "📱", comingSoon: false },
  { id: "linkedin", label: "LinkedIn", emoji: "💼", comingSoon: false },
  { id: "newsletter", label: "Newsletter / Emailing", emoji: "📧", comingSoon: true },
  { id: "pinterest", label: "Pinterest", emoji: "📌", comingSoon: true },
  { id: "site", label: "Site web / Blog", emoji: "🌐", comingSoon: false },
  { id: "seo", label: "SEO", emoji: "🔍", comingSoon: false },
];

export interface ActiveChannels {
  channels: ChannelId[];
  hasInstagram: boolean;
  hasLinkedin: boolean;
  hasNewsletter: boolean;
  hasPinterest: boolean;
  hasSeo: boolean;
  hasWebsite: boolean;
  loading: boolean;
  setChannels: (channels: ChannelId[]) => Promise<void>;
}

export function useActiveChannels(): ActiveChannels {
  const { user } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const profileUserId = useProfileUserId();
  const [channels, setChannelsState] = useState<ChannelId[]>(["instagram"]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemoMode) {
      const channelMap: Record<string, ChannelId> = { instagram: "instagram", website: "site", newsletter: "newsletter", linkedin: "linkedin", pinterest: "pinterest", seo: "seo", site: "site" };
      const demoChannels = (demoData?.onboarding?.canaux || ["instagram", "site"]).map(c => channelMap[c] || c) as ChannelId[];
      setChannelsState(demoChannels);
      setLoading(false);
      return;
    }

    if (!user?.id) return;
    (async () => {
      const { data: profile } = await (supabase
        .from("profiles") as any)
        .select("canaux")
        .eq(column, value)
        .maybeSingle();

      if (profile?.canaux && Array.isArray(profile.canaux) && profile.canaux.length > 0) {
        setChannelsState(profile.canaux as ChannelId[]);
      } else {
        const { data: planConfig } = await (supabase
          .from("user_plan_config") as any)
          .select("channels")
          .eq(column, value)
          .maybeSingle();
        if (planConfig?.channels && Array.isArray(planConfig.channels) && (planConfig.channels as string[]).length > 0) {
          setChannelsState(planConfig.channels as ChannelId[]);
        }
      }
      setLoading(false);
    })();
  }, [user?.id, isDemoMode, column, value]);

  const setChannels = useCallback(async (newChannels: ChannelId[]) => {
    if (!user?.id) return;
    const previous = channels;
    setChannelsState(newChannels); // optimistic

    // Sync both tables; if either write fails, roll back the optimistic update
    const [profileRes, planRes] = await Promise.all([
      supabase.from("profiles").update({ canaux: newChannels }).eq("user_id", profileUserId),
      supabase.from("user_plan_config").update({ channels: newChannels }).eq("user_id", profileUserId),
    ]);
    if (profileRes.error || planRes.error) {
      console.error("setChannels: échec de la synchro des canaux", profileRes.error || planRes.error);
      setChannelsState(previous); // rollback
      toast.error("Tes canaux n'ont pas pu être enregistrés. Réessaie.");
    }
  }, [user?.id, profileUserId, channels]);

  return {
    channels,
    hasInstagram: channels.includes("instagram"),
    hasLinkedin: channels.includes("linkedin"),
    hasNewsletter: channels.includes("newsletter"),
    hasPinterest: channels.includes("pinterest"),
    hasSeo: channels.includes("seo"),
    hasWebsite: channels.includes("site"),
    loading,
    setChannels,
  };
}
