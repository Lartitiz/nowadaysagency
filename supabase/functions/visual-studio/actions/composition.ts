// Action composition_save du Studio : enregistre l'affiche éditable et son fond.
// Déplacée telle quelle depuis index.ts (fiche 5, lot 2, docs/robustesse/gros-fichiers.md).
import type { Reference } from "../media.ts";
import { unwrap } from "../storage.ts";
import type { StudioContext, StudioSession } from "./context.ts";

/** Renvoie la session à jour (fonction SQL studio_save_composition). */
export async function saveComposition(
  ctx: StudioContext,
  session: StudioSession,
  references: Reference[],
): Promise<StudioSession> {
  const { sb, actor, p } = ctx;
  if (!p.composition || p.revision !== session.revision) {
    throw new Error("studio_conflict");
  }
  let backgroundPath = session.composition?.background_path || null;
  if (p.composition_use_image === false) backgroundPath = null;
  else if (p.composition_history_id) {
    const source = unwrap(
      await sb.from("visual_studio_compositions").select("background_path")
        .eq("id", p.composition_history_id)
        .eq("session_id", session.id).eq("workspace_id", p.workspace_id)
        .single(),
    );
    backgroundPath = source.background_path;
  } else if (p.viewed_version_id) {
    const source = unwrap(
      await sb.from("visual_studio_versions").select("result_path").eq(
        "id",
        p.viewed_version_id,
      ).eq("session_id", session.id).eq("status", "ready").single(),
    );
    backgroundPath = source.result_path;
  } else if (p.viewed_reference_id) {
    backgroundPath = references.find((r) =>
      r.id === p.viewed_reference_id
    )?.path || null;
  }
  session = unwrap(await sb.rpc("studio_save_composition", {
    p_actor: actor,
    p_workspace: p.workspace_id,
    p_session: session.id,
    p_revision: p.revision,
    p_design: p.composition,
    p_background_path: backgroundPath,
  }));
  return session;
}
