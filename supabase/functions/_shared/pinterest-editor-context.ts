/** Uses the same creator+workspace target as the Pinterest editors and their RLS.
 * Personal NULL rows remain personal; absence and a failed read are different.
 */
export async function loadPinterestKeywords(client: any, userId: string, workspaceId?: string | null): Promise<string> {
  let query = client.from("pinterest_keywords").select("keywords_raw").eq("user_id", userId);
  query = workspaceId ? query.eq("workspace_id", workspaceId) : query.is("workspace_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Impossible de lire les mots-clés Pinterest de cet espace.");
  return data?.keywords_raw || "";
}

export async function canUsePinterestEditor(client: any, userId: string, workspaceId?: string | null): Promise<boolean> {
  if (!workspaceId) return true;
  const { data, error } = await client.from("workspace_members").select("role")
    .eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  return !error && !!data && ["owner", "manager"].includes(data.role);
}
