import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type Preferences = {weekly_ritual_enabled: boolean; weekly_ritual_day: number; notification_tips: boolean; notification_reminders: boolean};
const defaults: Preferences = {weekly_ritual_enabled: true, weekly_ritual_day: 1, notification_tips: true, notification_reminders: true};
export function useAccountPreferences(ownerId: string) {
  const {user} = useAuth();
  const scope = `${user?.id || ""}:${ownerId}`;
  const visit = useRef({scope});
  if (visit.current.scope !== scope) visit.current = {scope};
  const token = visit.current;
  const [state, setState] = useState({token, data: defaults, loaded: false, error: "", saving: false});
  const [revision, refresh] = useState(0);
  const busy = useRef<object | null>(null);
  const mounted = useRef(true);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  const reload = useCallback(() => refresh(n => n + 1), []);
  useEffect(() => {
    let alive = true;
    setState({token, data: defaults, loaded: false, error: "", saving: false});
    if (!user?.id || !ownerId) return;
    void (async () => {
      try {
        const {data, error} = await supabase.from("profiles").select("weekly_ritual_enabled,weekly_ritual_day,notification_tips,notification_reminders").eq("user_id",ownerId).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Profil indisponible ou accès insuffisant.");
        if (alive && visit.current === token) setState({token, data: data as unknown as Preferences, loaded: true, error: "", saving: false});
      } catch {
        if (alive && visit.current === token) setState({token, data: defaults, loaded: false, error: "Impossible de charger les préférences de ce compte.", saving: false});
      }
    })();
    return () => {alive = false;};
  }, [token, revision, ownerId, user?.id]);
  const save = async (patch: Partial<Preferences>) => {
    if (!mounted.current || visit.current !== token || !state.loaded || state.token !== token || user?.id !== ownerId || busy.current === token) return false;
    busy.current = token;
    setState(prev => ({...prev, saving: true}));
    try {
      // Partial update preserves a concurrent edit of another preference.
      const {data, error} = await supabase.from("profiles").update(patch as any).eq("user_id",ownerId).select("weekly_ritual_enabled,weekly_ritual_day,notification_tips,notification_reminders").single();
      if (error || !data) throw error || new Error("Missing receipt");
      if (!mounted.current || visit.current !== token) return false;
      setState({token, data: data as unknown as Preferences, loaded: true, error: "", saving: false});
      toast.success("Préférence enregistrée ✓");
      return true;
    } catch {
      if (mounted.current && visit.current === token) toast.error("Impossible d'enregistrer ta préférence. Réessaie.");
      return false;
    } finally {
      if (busy.current === token) busy.current = null;
      if (mounted.current && visit.current === token) setState(prev => ({...prev,saving:false}));
    }
  };
  const current = state.token === token;
  return {data: current ? state.data : defaults, loaded: current && state.loaded, error: current ? state.error : "", saving: current && state.saving, canEdit: user?.id === ownerId, reload, save};
}
