import { supabase } from "@/integrations/supabase/client";

/**
 * Query the persona table returning the primary persona.
 * Handles multi-persona by prioritizing is_primary, then most recent.
 */
export function queryPrimaryPersona(
  selectFields: string,
  filterColumn: string,
  filterValue: string
) {
  return (supabase.from("persona") as any)
    .select(selectFields)
    .eq(filterColumn, filterValue)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}
