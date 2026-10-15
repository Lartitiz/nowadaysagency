// Effacement des fichiers d'une cliente qui supprime son compte.
// Inventaire complet AVANT de supprimer (pagination stable, sous-dossiers), et
// AVANT l'effacement des lignes : les chemins rangés par espace ou par session
// ne se retrouvent qu'à partir de ces lignes.

// Buckets dont les fichiers sont rangés sous `<userId>/…` : le dossier de la
// cliente suffit. Le test `coverage_test.ts` échoue si un bucket utilisé dans
// le code n'est classé ni ici ni dans SPECIAL_BUCKETS.
export const USER_PREFIX_BUCKETS = [
  "audit-posts",
  "audit-screenshots",
  "beta-feedback",
  "brand-assets",
  "calendar-media",
  "calendar-visuals",
  "canva-import",
  "crosspost-uploads",
  "deliverables",
  "inspiration-screenshots",
  "instagram-publish",
  "linkedin-audit-screenshots",
  "moodboards",
  "onboarding-uploads",
  "user-photos",
] as const;

// Buckets rangés autrement que par cliente : traités à part ci-dessous.
export const SPECIAL_BUCKETS: Record<string, string> = {
  "visual-studio": "`<espace>/<session>/…` (original, références, dérivés .fidelity.*, verrous .refine-lock, résultats)",
  "studio-video": "`<espace>/<clip>/clip.mp4`",
  "crosspost-sources": "`workspace/<espace>/…` ou `user/<cliente>/…`",
  "landing-assets": "images du site déposées par l'admin seulement : aucune donnée cliente, rien à effacer",
};

const SAFE_ID = /^[a-zA-Z0-9-]+$/;

type Plan = { prefixes: Map<string, Set<string>>; paths: Map<string, Set<string>> };

export async function cleanupUserStorage(admin: any, userId: string): Promise<number> {
  if (!SAFE_ID.test(userId)) throw new Error("Invalid storage owner");
  const plan = await planSpecialBuckets(admin, userId);
  const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
  if (bucketError) throw new Error(`Storage inventory: ${bucketError.message}`);
  let removed = 0;
  for (const bucket of buckets ?? []) {
    const storage = admin.storage.from(bucket.id);
    const paths = new Set<string>(plan.paths.get(bucket.id) ?? []);
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
          else paths.add(path);
        }
        if (entries.length < 100) break;
      }
    }
    // Le dossier de la cliente, dans TOUS les buckets (y compris un bucket
    // ajouté plus tard sans que cette liste suive).
    await collect(userId);
    for (const prefix of plan.prefixes.get(bucket.id) ?? []) await collect(prefix);
    const list = [...paths];
    for (let i = 0; i < list.length; i += 100) {
      const { error } = await storage.remove(list.slice(i, i + 100));
      if (error) throw new Error(`Storage ${bucket.id}: ${error.message}`);
      removed += Math.min(100, list.length - i);
    }
  }
  return removed;
}

// Lit les lignes AVANT qu'elles ne soient effacées, et en déduit les dossiers
// à vider. Garde-fou : un espace entier n'est vidé que si la cliente en est la
// PROPRIÉTAIRE (workspaces.created_by) ; dans l'espace d'une autre, seuls les
// dossiers de SES sessions et de SES clips le sont.
async function planSpecialBuckets(admin: any, userId: string): Promise<Plan> {
  const plan: Plan = { prefixes: new Map(), paths: new Map() };
  const owned = new Set<string>(
    (await rows(admin, "workspaces", "id", (q) => q.eq("created_by", userId))).map((r) => checkId(r.id)),
  );
  const addPrefix = (bucket: string, prefix: string) => {
    assertAllowedPrefix(prefix, userId, owned);
    if (!plan.prefixes.has(bucket)) plan.prefixes.set(bucket, new Set());
    plan.prefixes.get(bucket)!.add(prefix);
  };
  const addPath = (bucket: string, path: string | null | undefined) => {
    if (!path) return;
    if (!plan.paths.has(bucket)) plan.paths.set(bucket, new Set());
    plan.paths.get(bucket)!.add(path);
  };

  for (const ws of owned) {
    addPrefix("visual-studio", ws);
    addPrefix("studio-video", ws);
    addPrefix("crosspost-sources", `workspace/${ws}`);
  }
  addPrefix("crosspost-sources", `user/${userId}`);

  // Ses sessions Studio et ses clips vidéo rangés dans l'espace d'une autre.
  for (const s of await rows(admin, "visual_studio_sessions", "id,workspace_id", (q) => q.eq("user_id", userId))) {
    if (!owned.has(s.workspace_id)) addPrefix("visual-studio", `${checkId(s.workspace_id)}/${checkId(s.id)}`);
  }
  for (const j of await rows(admin, "studio_video_jobs", "id,workspace_id", (q) => q.eq("user_id", userId))) {
    if (!owned.has(j.workspace_id)) addPrefix("studio-video", `${checkId(j.workspace_id)}/${checkId(j.id)}`);
  }
  // Ses versions créées dans la session d'une collaboratrice qui reste : on
  // efface le fichier précis (et son verrou de retouche), pas la session.
  for (const v of await rows(admin, "visual_studio_versions", "result_path", (q) => q.eq("user_id", userId))) {
    if (!v.result_path) continue;
    addPath("visual-studio", v.result_path);
    addPath("visual-studio", `${v.result_path}.refine-lock`);
  }
  return plan;
}

function checkId(value: unknown): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error("Storage inventory: invalid id");
  return value;
}

// Un dossier « d'un seul niveau » (un espace entier) n'est jamais vidé s'il
// n'appartient pas à la cliente. Les dossiers de session/clip ont deux niveaux.
export function assertAllowedPrefix(prefix: string, userId: string, owned: Set<string>) {
  const parts = prefix.split("/");
  const ok =
    (parts.length === 1 && owned.has(parts[0])) ||
    (parts.length === 2 && parts[0] === "workspace" && owned.has(parts[1])) ||
    (parts.length === 2 && parts[0] === "user" && parts[1] === userId) ||
    (parts.length === 2 && parts[0] !== "workspace" && parts[0] !== "user" && parts.every((p) => SAFE_ID.test(p)));
  if (!ok) throw new Error(`Storage inventory: refused prefix ${prefix}`);
}

async function rows(admin: any, table: string, columns: string, filter: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let start = 0; ; start += 100) {
    const { data, error } = await filter(admin.from(table).select(columns)).order("id").range(start, start + 99);
    if (error) throw new Error(`Storage inventory ${table} failed`);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < 100) break;
  }
  return out;
}
