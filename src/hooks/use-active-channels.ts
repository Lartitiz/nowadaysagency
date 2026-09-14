import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useProfileOwner, useWorkspaceReady } from "@/hooks/use-workspace-query";

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
  error: string | null;
  saving: boolean;
  canEdit: boolean;
  reload: () => void;
  setChannels: (channels: ChannelId[]) => Promise<boolean>;
}

export function useActiveChannels(): ActiveChannels {
  const { user } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const owner = useProfileOwner();
  const profileUserId = owner.userId;
  const queryClient = useQueryClient();
  const ready = useWorkspaceReady();
  const scope = `${user?.id || ""}:${column}:${value}:${profileUserId}:${ready}:${isDemoMode}`;
  const visit = useRef({ scope });
  if (visit.current.scope !== scope) visit.current = { scope };
  const [state, setState] = useState<{visit: object; channels: ChannelId[]; loading: boolean; error: string | null; saving: boolean}>({visit: visit.current, channels: [], loading: true, error: null, saving: false});
  const [revision, refresh] = useState(0);
  const reload = useCallback(() => refresh(n => n + 1), []);
  const busy = useRef<object | null>(null);
  const mounted = useRef(true);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  const current = state.visit === visit.current;
  const channels = current ? state.channels : [];
  const loading = !!user && (!current || state.loading);
  const error = current ? state.error : null;
  const saving = current && state.saving;
  // profiles and plan config are account records. A manager cannot modify
  // another account's preferences under their existing RLS policies.
  const canEdit = !!user && user.id === profileUserId && ready && !isDemoMode;

  useEffect(() => {
    const token = visit.current;
    let cancelled = false;
    const commit = (patch: Partial<typeof state>) => {
      if (!cancelled && token === visit.current) setState(prev => ({...prev, ...patch, visit: token}));
    };
    commit({channels: [], loading: !!user, error: null, saving: false});
    if (isDemoMode) {
      const map: Record<string, ChannelId> = {website: "site"};
      commit({channels: (demoData?.onboarding?.canaux || ["instagram", "site"]).map(c => map[c] || c) as ChannelId[], loading: false});
      return;
    }
    if (owner.error) {commit({channels: [], loading: false, error: "Impossible de trouver le propriétaire de cet espace."}); return;}
    if (!user?.id || !ready || !profileUserId) return;
    void (async () => {
      try {
        const {data: profile, error: profileError} = await supabase.from("profiles").select("canaux").eq("user_id", profileUserId).maybeSingle();
        if (profileError) throw profileError;
        if (Array.isArray(profile?.canaux) && profile.canaux.length) {
          commit({channels: profile.canaux as ChannelId[], loading: false});
          return;
        }
        const {data: plan, error: planError} = await supabase.from("user_plan_config").select("channels").eq("user_id", profileUserId).maybeSingle();
        if (planError) throw planError;
        commit({channels: Array.isArray(plan?.channels) ? plan.channels as ChannelId[] : [], loading: false});
      } catch {
        commit({channels: [], loading: false, error: "Impossible de charger les canaux. Réessaie."});
      }
    })();
    return () => { cancelled = true; };
  }, [scope, revision, demoData, owner.error]);

  const renderVisit = visit.current;
  const setChannels = useCallback(async (newChannels: ChannelId[]) => {
    const token = renderVisit;
    // An old callback must never target another visit, including A → B → A.
    if (!mounted.current || token !== visit.current || !canEdit || loading || error || busy.current === token) return false;
    busy.current = token;
    setState(prev => ({...prev, saving: true}));
    try {
      const {data, error: writeError} = await supabase.rpc("save_active_channels" as any, {p_owner_id: profileUserId, p_channels: newChannels});
      if (writeError || !data || (data as any).saved !== true) throw writeError || new Error("Missing receipt");
      if (!mounted.current || visit.current !== token) return false;
      setState(prev => ({...prev, channels: newChannels, saving: false}));
      void queryClient.invalidateQueries({queryKey: ["profile"]});
      return true;
    } catch {
      if (mounted.current && visit.current === token) toast.error("Tes canaux n'ont pas pu être enregistrés. Réessaie.");
      return false;
    } finally {
      if (busy.current === token) busy.current = null;
      if (mounted.current && visit.current === token) setState(prev => ({...prev, saving: false}));
    }
  }, [renderVisit, canEdit, loading, error, profileUserId, queryClient]);

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
    error, saving, canEdit, reload: () => {if (owner.error) void owner.reload(); reload();},
  };
}
