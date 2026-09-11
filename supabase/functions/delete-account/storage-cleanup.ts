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
    await collect(userId);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await storage.remove(paths.slice(i, i + 100));
      if (error) throw new Error(`Storage ${bucket.id}: ${error.message}`);
      removed += Math.min(100, paths.length - i);
    }
  }
  return removed;
}
