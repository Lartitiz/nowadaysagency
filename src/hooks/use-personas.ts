import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { trackError } from "@/lib/error-tracker";

export interface PersonaSummary {
  id: string;
  label: string | null;
  is_primary: boolean;
  channels: string[] | null;
  portrait_prenom: string | null;
  step_1_frustrations: string | null;
  step_2_transformation: string | null;
  completed: boolean | null;
  created_at: string;
}

export function usePersonas() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const queryClient = useQueryClient();
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Ce hook lit `persona` dans un useState local, mais la table est AUSSI lue
  // par la query TanStack ["persona"] (use-branding → Dashboard, BrandingPage,
  // bio Insta, récap proposition). Sans invalider cette query après écriture,
  // ces écrans gardent l'ancienne persona jusqu'à leur staleTime (5 min). Même
  // classe de bug que le fond figé de /photos (#618).
  const invalidatePersonaQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["persona"] });
  }, [queryClient]);

  const fetchPersonas = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase.from("persona") as any)
      .select("id, label, is_primary, channels, portrait_prenom, step_1_frustrations, step_2_transformation, completed, created_at")
      .eq(column, value)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    setPersonas(data || []);
    setLoading(false);
  }, [user?.id, column, value]);

  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

  const setPrimary = useCallback(async (personaId: string) => {
    // Unset all primary, then set the target
    const ids = personas.map((p) => p.id);
    for (const id of ids) {
      const { error } = await supabase.from("persona").update({ is_primary: id === personaId } as any).eq("id", id);
      if (error) trackError(error, { hook: "usePersonas", action: "setPrimary" });
    }
    await fetchPersonas();
    invalidatePersonaQueries();
  }, [personas, fetchPersonas, invalidatePersonaQueries]);

  const updateChannels = useCallback(async (personaId: string, channels: string[]) => {
    const { error } = await supabase.from("persona").update({ channels } as any).eq("id", personaId);
    if (error) trackError(error, { hook: "usePersonas", action: "updateChannels" });
    await fetchPersonas();
    invalidatePersonaQueries();
  }, [fetchPersonas, invalidatePersonaQueries]);

  const deletePersona = useCallback(async (personaId: string) => {
    const { error } = await supabase.from("persona").delete().eq("id", personaId);
    if (error) trackError(error, { hook: "usePersonas", action: "deletePersona" });
    await fetchPersonas();
    invalidatePersonaQueries();
  }, [fetchPersonas, invalidatePersonaQueries]);

  const getPersonaForChannel = useCallback((channel: string): PersonaSummary | null => {
    const match = personas.find((p) => p.channels?.includes(channel));
    if (match) return match;
    return personas.find((p) => p.is_primary) || personas[0] || null;
  }, [personas]);

  return {
    personas,
    loading,
    refetch: fetchPersonas,
    setPrimary,
    updateChannels,
    deletePersona,
    getPersonaForChannel,
    primaryPersona: personas.find((p) => p.is_primary) || personas[0] || null,
  };
}
