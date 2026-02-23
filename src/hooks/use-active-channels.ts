import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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
  const [channels, setChannelsState] = useState<ChannelId[]>(["instagram"]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      // Read from profiles.canaux first, fallback to user_plan_config.channels
      const { data: profile } = await supabase
        .from("profiles")
        .select("canaux")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.canaux && Array.isArray(profile.canaux) && profile.canaux.length > 0) {
        setChannelsState(profile.canaux as ChannelId[]);
      } else {
        // Fallback to user_plan_config
        const { data: planConfig } = await supabase
          .from("user_plan_config")
          .select("channels")
          .eq("user_id", user.id)
          .maybeSingle();
        if (planConfig?.channels && Array.isArray(planConfig.channels) && (planConfig.channels as string[]).length > 0) {
          setChannelsState(planConfig.channels as ChannelId[]);
        }
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const setChannels = useCallback(async (newChannels: ChannelId[]) => {
    if (!user?.id) return;
    setChannelsState(newChannels);

    // Sync both tables in parallel
    await Promise.all([
      supabase.from("profiles").update({ canaux: newChannels }).eq("user_id", user.id),
      supabase.from("user_plan_config").update({ channels: newChannels }).eq("user_id", user.id),
    ]);
  }, [user?.id]);

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
