// Action save du Studio : copie une image créée (et son original) dans la
// bibliothèque de photos. Renvoie toujours { photo_id }, sans la réponse « read ».
// Déplacée telle quelle depuis index.ts (fiche 5, lot 2, docs/robustesse/gros-fichiers.md).
import { BUCKET, download, store, unwrap } from "../storage.ts";
import type { StudioContext, StudioSession } from "./context.ts";

export async function saveToLibrary(ctx: StudioContext, session: StudioSession): Promise<Response> {
  const { sb, actor, p, json } = ctx;
  const v = unwrap(
    await sb
      .from("visual_studio_versions")
      .select("*")
      .eq("id", p.version_id)
      .eq("session_id", session.id)
      .eq("status", "ready")
      .single(),
  );
  if (!v.library_photo_id) {
    const result = await download(sb, BUCKET, v.result_path);
    const originalPath = Object.hasOwn(v.proposal, "original_path")
      ? v.proposal.original_path
      : session.source_path;
    await store(
      sb,
      "user-photos",
      `${v.user_id}/studio_${v.id}.jpg`,
      result,
    );
    if (originalPath) {
      await store(
        sb,
        "user-photos",
        `${v.user_id}/studio_${v.id}_original.jpg`,
        await download(sb, BUCKET, originalPath),
      );
    }
  }
  const photoId = unwrap(
    await sb.rpc("studio_save_library", {
      p_actor: actor,
      p_version: v.id,
    }),
  );
  return json({ photo_id: photoId });
}
