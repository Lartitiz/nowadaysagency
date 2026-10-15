/**
 * `profiles` n'a pas de workspace_id rempli : la ligne se lit par le user_id
 * de la propriétaire de l'espace (vu en réel le 15/10/2026, lecture vide).
 * Lecture d'enrichissement : en cas d'échec, on rend null (l'audit continue).
 */
export async function readOwnerProfile(sb: any, userId: string, workspaceId: string | null | undefined, fields: string) {
  let ownerId = userId;
  if (workspaceId) {
    const { data: owner, error } = await sb.from("workspace_members").select("user_id")
      .eq("workspace_id", workspaceId).eq("role", "owner").maybeSingle();
    if (error || !owner?.user_id) return null;
    ownerId = owner.user_id;
  }
  const { data, error } = await sb.from("profiles").select(fields).eq("user_id", ownerId).maybeSingle();
  return error ? null : data;
}
