// Stockage et droits du Studio : téléchargement, images allégées pour Claude,
// enregistrement, droit d'écriture, images de la charte.
// Déplacé tel quel depuis index.ts (fiche 5, lot 1, docs/robustesse/gros-fichiers.md).
import { getServiceClient } from "../_shared/plan-limiter.ts";
import { visionBlock } from "./media.ts";

export const BUCKET = "visual-studio";
function requireValue<T>(
  value: T,
  message = "Ressource indisponible",
): NonNullable<T> {
  if (value == null) throw new Error(message);
  return value;
}
export function unwrap<T>(result: {
  data: T;
  error: { message: string } | null;
}): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  return requireValue(result.data);
}
export async function download(
  sb: ReturnType<typeof getServiceClient>,
  bucket: string,
  path: string,
) {
  const blob = unwrap(await sb.storage.from(bucket).download(path));
  if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || blob.size > 15_000_000) {
    throw new Error("Photo non prise en charge");
  }
  return blob;
}
export async function visionFromStorage(
  sb: ReturnType<typeof getServiceClient>,
  bucket: string,
  path: string,
) {
  const resized = async (width: number) => {
    const { data, error } = await sb.storage.from(bucket).download(path, {
      transform: { width, quality: 80, resize: "contain" },
    });
    return error ? null : data;
  };
  // The interpreter never needs more than ~1568 px (the vision model downsizes
  // beyond that). Loading full originals for every reference exhausted the
  // worker memory (546 WORKER_RESOURCE_LIMIT). Generation still uses originals.
  // Several references plus the parent version travel in one request (and its
  // base64 copy is duplicated in the JSON body): keep each one small.
  for (const width of [1024, 768]) {
    const light = await resized(width);
    if (light && /^image\/(jpeg|png|webp)$/.test(light.type) && light.size <= 1_500_000) {
      return await visionBlock(light);
    }
  }
  return await visionBlock(await download(sb, bucket, path), resized);
}
export async function store(
  sb: ReturnType<typeof getServiceClient>,
  bucket: string,
  path: string,
  blob: Blob,
) {
  const { error } = await sb.storage
    .from(bucket)
    .upload(path, blob, { contentType: blob.type, upsert: true });
  if (error) throw error;
}
export async function canWrite(
  sb: ReturnType<typeof getServiceClient>,
  actor: string,
  workspace: string,
) {
  const row = unwrap(
    await sb
      .from("workspace_members")
      .select("role")
      .eq("user_id", actor)
      .eq("workspace_id", workspace)
      .single(),
  );
  return ["owner", "manager", "editor"].includes(row.role);
}
export async function charterReferences(
  sb: ReturnType<typeof getServiceClient>,
  workspace: string,
): Promise<{ path: string; name: string }[]> {
  const { data, error } = await sb.from("brand_charter").select(
    "moodboard_images",
  ).eq("workspace_id", workspace).maybeSingle();
  if (error) throw error;
  if (!Array.isArray(data?.moodboard_images)) return [];
  const members = unwrap(
    await sb.from("workspace_members").select("user_id").eq(
      "workspace_id",
      workspace,
    ),
  );
  const owners = new Set(members.map((m) => m.user_id));
  return data.moodboard_images.filter((
    r: unknown,
  ): r is { path: string; name: string } =>
    !!r && typeof r === "object" && (!("role" in r) || r.role !== "avoid") &&
    "path" in r && typeof r.path === "string" &&
    !r.path.includes("..") && owners.has(r.path.split("/")[0]) && "name" in r &&
    typeof r.name === "string"
  ).slice(0, 9);
}
