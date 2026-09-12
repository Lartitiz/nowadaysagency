import { supabase } from "@/integrations/supabase/client";

type Row = Record<string, any>;
export interface ImportScope { column: string; value: string; userId: string }

/** Read errors and ambiguous targets must never turn into an insertion. */
export async function readImportRows(table: string, scope: ImportScope): Promise<Row[]> {
  if (!scope.value || !scope.userId) throw new Error("Espace indisponible. Réessaie après son chargement.");
  const { data, error } = await (supabase.from(table as any) as any).select("*").eq(scope.column, scope.value);
  if (error) throw error;
  return data || [];
}

export function importTarget(rows: Row[], collection = false): Row | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  if (collection) {
    const primary = rows.filter(row => row.is_primary === true);
    if (primary.length === 1) return primary[0];
  }
  throw new Error("Plusieurs fiches existent. Choisis la fiche concernée avant d'importer.");
}

/** Writes exactly the reviewed ID; .single() also detects a zero-row update. */
export async function saveImportRow(table: string, scope: ImportScope, id: string | null, fields: Row): Promise<Row> {
  if (!scope.value || !scope.userId) throw new Error("Espace indisponible.");
  const query = id
    ? (supabase.from(table as any) as any).update(fields).eq("id", id).eq(scope.column, scope.value)
    : (supabase.from(table as any) as any).insert({
      user_id: scope.userId,
      ...(scope.column === "workspace_id" ? { workspace_id: scope.value } : {}),
      ...fields,
    });
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  if (!data?.id) throw new Error("Aucune fiche enregistrée. Recharge les données avant de réessayer.");
  return data;
}
