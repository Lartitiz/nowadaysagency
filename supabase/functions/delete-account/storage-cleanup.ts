// Inventaire complet AVANT de supprimer : pagination stable et sous-dossiers.
// Tous les buckets sont inspectés, uniquement sous le préfixe exact du compte.
export async function cleanupUserStorage(admin: any, userId: string): Promise<number> {
  if (!/^[a-zA-Z0-9-]+$/.test(userId)) throw new Error("Invalid storage owner");
  const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
  if (bucketError) throw new Error(`Storage inventory: ${bucketError.message}`);
  let removed = 0;
  for (const bucket of buckets ?? []) {
    const storage = admin.storage.from(bucket.id);
    const paths: string[] = [];
    async function collect(prefix: string) {
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await storage.list(prefix, {
          limit: 100, offset, sortBy: { column: "name", order: "asc" },
        });
        if (error) throw new Error(`Storage ${bucket.id}: ${error.message}`);
        const entries = data ?? [];
        for (const entry of entries) {
          const path = `${prefix}/${entry.name}`;
          if (entry.id == null && entry.metadata == null) await collect(path);
          else paths.push(path);
        }
        if (entries.length < 100) break;
      }
    }
    if (bucket.id === "visual-studio") {
      paths.push(...await collectStudioPaths(admin, userId));
    } else {
      await collect(userId);
    }
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await storage.remove(paths.slice(i, i + 100));
      if (error) throw new Error(`Storage ${bucket.id}: ${error.message}`);
      removed += Math.min(100, paths.length - i);
    }
  }
  return removed;
}

// Studio paths use workspace/session IDs. Inventory rows before cascading their deletion.
async function collectStudioPaths(admin: any, userId: string): Promise<string[]> {
  const { data: workspaces, error: workspaceError } = await admin.from("workspaces").select("id").eq("created_by", userId);
  if (workspaceError) throw new Error("Studio workspace inventory failed");
  const ids = (workspaces ?? []).map((row: {id: string}) => row.id);
  const filter = `user_id.eq.${userId}${ids.length ? `,workspace_id.in.(${ids.join(",")})` : ""}`;
  const paths = new Set<string>();
  for (let start = 0; ; start += 100) {
    const {data, error} = await admin.from("visual_studio_sessions")
      .select("source_path,visual_studio_versions(result_path)").or(filter).order("id").range(start, start + 99);
    if (error) throw new Error("Studio session inventory failed");
    for (const row of data ?? []) {
      paths.add(row.source_path);
      for (const version of row.visual_studio_versions ?? []) paths.add(version.result_path);
    }
    if ((data?.length ?? 0) < 100) break;
  }
  // Versions created in a session owned by a remaining collaborator.
  for (let start = 0; ; start += 100) {
    const {data, error} = await admin.from("visual_studio_versions").select("result_path").eq("user_id", userId).order("id").range(start, start + 99);
    if (error) throw new Error("Studio version inventory failed");
    for (const row of data ?? []) paths.add(row.result_path);
    if ((data?.length ?? 0) < 100) break;
  }
  return [...paths];
}
