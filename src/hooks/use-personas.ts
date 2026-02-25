import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";

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
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [loading, setLoading] = useState(true);

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
      await supabase.from("persona").update({ is_primary: id === personaId } as any).eq("id", id);
    }
    await fetchPersonas();
  }, [personas, fetchPersonas]);

  const updateChannels = useCallback(async (personaId: string, channels: string[]) => {
    await supabase.from("persona").update({ channels } as any).eq("id", personaId);
    await fetchPersonas();
  }, [fetchPersonas]);

  const deletePersona = useCallback(async (personaId: string) => {
    await supabase.from("persona").delete().eq("id", personaId);
    await fetchPersonas();
  }, [fetchPersonas]);

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
