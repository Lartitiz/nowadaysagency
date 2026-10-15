/**
 * Contrôles « profils » de /admin/audit (Instagram sans audit, branding orphelin).
 * `profiles` se relie aux autres tables par user_id (pas par id) et le prénom /
 * le compte Instagram s'appellent prenom / instagram_username.
 */
export type ProfileCheckResult = {
  status: "info" | "error";
  category: "Données";
  title: string;
  detail: string;
};

type ProfileRow = { user_id: string; prenom?: string | null; instagram_username?: string | null };

export function profileChecks(
  profiles: ProfileRow[],
  auditedUserIds: string[],
  brandUserIds: string[],
): ProfileCheckResult[] {
  const results: ProfileCheckResult[] = [];
  const audited = new Set(auditedUserIds);
  for (const p of profiles.filter((p) => p.instagram_username?.trim())) {
    if (audited.has(p.user_id)) continue;
    results.push({
      status: "info",
      category: "Données",
      title: `${p.prenom || "User"} : Instagram sans audit`,
      detail: `Handle @${p.instagram_username!.trim().replace(/^@/, "")} renseigné mais jamais audité.`,
    });
  }
  const known = new Set(profiles.map((p) => p.user_id));
  for (const userId of new Set(brandUserIds)) {
    if (!userId || known.has(userId)) continue;
    results.push({
      status: "error",
      category: "Données",
      title: "Brand profile orphelin",
      detail: `brand_profile.user_id = ${userId.slice(0, 8)}… mais ce profil n'existe pas.`,
    });
  }
  return results;
}
