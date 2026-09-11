import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrl, USER_PHOTOS_BUCKET, type UserPhotoRow } from "@/lib/photo-storage";
import { cleanRecipe, type PhotoRecipe } from "@/lib/photo-composition";

// Isolated schema boundary until generated Supabase types pick up the additive migration.
const db: SupabaseClient = supabase;
export interface PhotoWorkflowRow {
  id: string; user_id: string; workspace_id: string; kind: "direction" | "preparation";
  name: string; data: Record<string, unknown>; updated_at: string;
}
export interface PreparedPhotoOutput {
  id: string;
  sourceIndex: number;
  label: string;
  recipe: PhotoRecipe;
  enabled: boolean;
  approved: boolean;
  caption: string;
  date: string;
  photoId: string;
  postId: string;
  savedPhoto?: boolean;
  savedPost?: boolean;
}
export interface WorkflowSource {
  id: string;
  name: string;
  dataUrl: string;
  photoId?: string;
  cutoutUrl?: string;
  cutoutId?: string;
  description?: string;
  kind?: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validPhotoId(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }

export async function listPhotoWorkflows(workspaceId: string, kind: PhotoWorkflowRow["kind"]) {
  const { data, error } = await db.from("photo_workflows").select("*").eq("workspace_id", workspaceId)
    .eq("kind", kind).order("updated_at", { ascending: false }).limit(50);
  if (error) throw new Error("Les préparations enregistrées sont indisponibles. Réessaie dans un instant.");
  return data as PhotoWorkflowRow[];
}
export async function savePhotoWorkflow(row: Omit<PhotoWorkflowRow, "updated_at">) {
  if (!validPhotoId(row.workspace_id) || !validPhotoId(row.user_id)) throw new Error("Espace de travail indisponible.");
  // An update uses the existing creator; collaborators must not pass an INSERT policy.
  const update = () => db.from("photo_workflows").update({ name: row.name, data: row.data })
    .eq("id", row.id).eq("workspace_id", row.workspace_id).eq("kind", row.kind).select("id").maybeSingle();
  const existing = await update();
  if (existing.error) throw new Error("L’enregistrement a échoué. Ta préparation reste ouverte ; réessaie.");
  if (existing.data) return;
  const { error } = await db.from("photo_workflows").insert(row);
  if (error) {
    if (error.code === "23505") { const retry = await update(); if (!retry.error && retry.data) return; }
    throw new Error("L’enregistrement a échoué. Ta préparation reste ouverte ; réessaie.");
  }
}
export async function readWorkflowSource(photoId: string, workspaceId: string): Promise<WorkflowSource> {
  const { data, error } = await supabase.from("user_photos").select("*").eq("id", photoId).eq("workspace_id", workspaceId).single();
  if (error || data?.status !== "ready") throw new Error("Une photo source n’est plus disponible dans cet espace.");
  const row = data as UserPhotoRow;
  const { data: blob, error: downloadError } = await supabase.storage.from(USER_PHOTOS_BUCKET).download(row.storage_path);
  if (downloadError || !blob) throw new Error("La photo ne peut pas être chargée. Réessaie.");
  return { id: row.id, photoId: row.id, name: row.name || "Photo", description: row.description || "",
    kind: row.kind || "autre", dataUrl: await blobToDataUrl(blob) };
}
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Photo illisible.")); reader.readAsDataURL(blob);
  });
}

/** Stable id and paths allow a lost response / partial upload to be retried, without another row. */
export async function saveWorkflowPhoto(input: {
  id: string; userId: string; workspaceId: string; name: string; dataUrl: string;
  description?: string; kind?: string;
}): Promise<string> {
  const { data: existing, error: readError } = await supabase.from("user_photos").select("id, status, storage_path")
    .eq("id", input.id).eq("workspace_id", input.workspaceId).maybeSingle();
  if (readError) throw readError;
  if (existing?.status === "ready") return existing.id;
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(input.dataUrl)) throw new Error("Photo source invalide.");
  const blob = await (await fetch(input.dataUrl)).blob();
  if (!/^image\/(png|jpeg|webp)$/.test(blob.type)) throw new Error("Format de photo non pris en charge.");
  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width, height = bitmap.height; bitmap.close();
  const ext = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1];
  // A collaborator can resume a pending upload in their own storage folder.
  // Ready files returned above are never overwritten.
  const path = existing?.storage_path?.startsWith(`${input.userId}/`) ? existing.storage_path : `${input.userId}/${input.id}.${ext}`;
  if (!existing) {
    const { error } = await supabase.from("user_photos").insert({ id: input.id, user_id: input.userId,
      workspace_id: input.workspaceId, name: input.name.slice(0, 120), status: "pending", storage_path: path,
      original_storage_path: path, description: input.description?.slice(0, 300) || input.name.slice(0, 120),
      kind: input.kind || "autre", source_type: "upload", tags: ["composition"], width, height, file_size_bytes: blob.size });
    // An overlapping retry can insert the same id; its asset upload remains deterministic.
    if (error) throw error;
  }
  const { error: uploadError } = await supabase.storage.from(USER_PHOTOS_BUCKET).upload(path, blob, { contentType: blob.type, upsert: true });
  if (uploadError) throw uploadError;
  const { error: updateError } = await supabase.from("user_photos").update({ status: "ready", storage_path: path,
    original_storage_path: path, width, height, file_size_bytes: blob.size }).eq("id", input.id).eq("workspace_id", input.workspaceId).select("id").single();
  if (updateError) throw updateError;
  return input.id;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export async function saveWorkflowCalendarDraft(output: PreparedPhotoOutput, input: { userId: string; workspaceId: string; name: string; workflowId: string }) {
  if (!output.savedPhoto || !output.approved || !isCalendarDate(output.date)) throw new Error("Vérifie le visuel et choisis une date avant d’enregistrer.");
  if (output.recipe.format === "cover" || output.recipe.format === "banner") throw new Error("La couverture et la bannière se téléchargent ou se conservent dans Mes photos.");
  const { data: existing, error: readError } = await supabase.from("calendar_posts").select("id").eq("id", output.postId).eq("workspace_id", input.workspaceId).maybeSingle();
  if (readError) throw readError;
  if (existing) return;
  const { data: photo, error: photoError } = await supabase.from("user_photos").select("storage_path, status")
    .eq("id", output.photoId).eq("workspace_id", input.workspaceId).single();
  if (photoError || photo.status !== "ready") throw new Error("Le visuel doit être enregistré avant son brouillon.");
  // Same private-photo signing convention as the existing seasonal calendar flow.
  const url = await getSignedPhotoUrl(photo.storage_path, 365 * 24 * 3600);
  if (!url) throw new Error("Impossible de préparer le lien du visuel.");
  const story = output.recipe.format === "story";
  const { error } = await supabase.from("calendar_posts").insert({ id: output.postId, user_id: input.userId,
    workspace_id: input.workspaceId, theme: `${input.name} — ${output.label}`.slice(0, 200), date: output.date,
    canal: "instagram", format: story ? "story_serie" : "post", status: "drafting", content_draft: output.caption,
    auto_publish: false, scheduled_publish_at: null, media_urls: [url],
    story_sequence_detail: { type: "photo_composition", photo_workflow_id: input.workflowId, photo_workflow_output_id: output.id,
      photo_urls: [url], visual_urls: [url], source_photo_ids: [output.photoId], photo_composition: JSON.parse(JSON.stringify(output.recipe)) },
    ...(story ? { stories_count: 1 } : {}) });
  if (error) {
    if (error.code !== "23505") throw error;
    const { data: retry, error: retryError } = await supabase.from("calendar_posts").select("id").eq("id", output.postId).eq("workspace_id", input.workspaceId).single();
    if (retryError || !retry) throw error;
  }
}

export function serialisePreparation(sources: WorkflowSource[], outputs: PreparedPhotoOutput[], fields: Record<string, string>) {
  return { version: 1, sources: sources.map(s => ({ id: s.id, name: s.name, photoId: s.photoId, cutoutId: s.cutoutId })),
    outputs, fields };
}
export function parsePreparation(data: Record<string, unknown>) {
  const sources = Array.isArray(data.sources) ? data.sources : [];
  const outputs = Array.isArray(data.outputs) ? data.outputs : [];
  if (data.version !== 1 || sources.length < 1 || sources.length > 20 || outputs.length < 1 || outputs.length > 40) throw new Error("Cette préparation n’est pas compatible.");
  for (const s of sources) if (!s || !validPhotoId(s.photoId) || (s.cutoutId && !validPhotoId(s.cutoutId))) throw new Error("Source enregistrée invalide.");
  const parsed = outputs.map(o => {
    if (!o || !validPhotoId(o.id) || !validPhotoId(o.photoId) || !validPhotoId(o.postId) ||
      !Number.isInteger(o.sourceIndex) || o.sourceIndex < 0 || o.sourceIndex >= sources.length || !o.recipe) throw new Error("Format enregistré invalide.");
    return { ...o, recipe: cleanRecipe(o.recipe), label: String(o.label).slice(0, 120), caption: String(o.caption || "").slice(0, 5000),
      date: isCalendarDate(o.date) ? o.date : "", enabled: !!o.enabled, approved: !!o.approved,
      savedPhoto: !!o.savedPhoto, savedPost: !!o.savedPost } as PreparedPhotoOutput;
  });
  return { sources: sources as { photoId: string; cutoutId?: string }[], outputs: parsed,
    fields: data.fields && typeof data.fields === "object" ? data.fields as Record<string, string> : {} };
}
