import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls } from "@/lib/photo-storage";
import { studioRequest } from "@/features/visual-studio/api";
import { sourceKey, type VideoReference } from "./sources";

type StudioVersionRow = {
  id: string;
  session_id: string;
  library_photo_id: string | null;
  proposal: unknown;
};

// A saved Studio image has a library photo ID. The version is the video source:
// the video endpoint checks its provenance again before sending it to the provider.
export async function savedStudioVersions(workspaceId: string, photoIds: string[]) {
  if (!photoIds.length) return new Map<string, StudioVersionRow>();
  const { data, error } = await supabase.from("visual_studio_versions")
    .select("id,session_id,library_photo_id,proposal")
    .eq("workspace_id", workspaceId).eq("status", "ready")
    .in("library_photo_id", photoIds);
  if (error) throw error;
  return new Map((data || []).map(v => [v.library_photo_id!, v]));
}

export async function videoReferencePreviews(workspaceId: string, references: VideoReference[]) {
  const previews = new Map<string, string>();
  const photos = references.filter(r => r.kind === "photo");
  const versions = references.filter(r => r.kind === "studio_version");
  const versionRows = versions.length ? await supabase.from("visual_studio_versions")
    .select("id,session_id,library_photo_id")
    .eq("workspace_id", workspaceId).in("id", versions.map(r => r.id)) : null;
  if (versionRows?.error) throw versionRows.error;
  const libraryIds = (versionRows?.data || []).map(v => v.library_photo_id).filter((id): id is string => !!id);
  const photoIds = [...new Set([...photos.map(r => r.id), ...libraryIds])];
  const photoRows = photoIds.length ? await supabase.from("user_photos")
    .select("id,storage_path").eq("workspace_id", workspaceId).in("id", photoIds) : null;
  if (photoRows?.error) throw photoRows.error;
  const paths = new Map((photoRows?.data || []).map(p => [p.id, p.storage_path]));
  const signed = await getSignedPhotoUrls([...paths.values()]);
  for (const ref of photos) {
    const url = signed.get(paths.get(ref.id) || "");
    if (url) previews.set(sourceKey(ref), url);
  }
  for (const row of versionRows?.data || []) {
    const url = signed.get(paths.get(row.library_photo_id || "") || "");
    if (url) previews.set(`studio_version:${row.id}`, url);
  }
  const unsaved = (versionRows?.data || []).filter(v => !previews.has(`studio_version:${v.id}`));
  for (const sessionId of [...new Set(unsaved.map(v => v.session_id))]) {
    try {
      const state = await studioRequest<{ versions: { id: string; url: string | null }[] }>({
        action: "read", workspace_id: workspaceId, session_id: sessionId,
      });
      for (const version of state.versions) if (version.url) previews.set(`studio_version:${version.id}`, version.url);
    } catch { /* A missing Studio session does not hide the other selected previews. */ }
  }
  return previews;
}
