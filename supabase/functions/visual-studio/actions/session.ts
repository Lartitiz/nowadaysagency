// Actions de session du Studio : création, archivage, lecture d'une
// composition enregistrée, sélection des références.
// Déplacées telles quelles depuis index.ts (fiche 5, lot 2, docs/robustesse/gros-fichiers.md).
import { activeReferences, type ConversationContext } from "../conversation.ts";
import type { Reference } from "../media.ts";
import { BUCKET, download, unwrap } from "../storage.ts";
import type { StudioContext, StudioSession } from "./context.ts";

/** Action create : réponse anticipée (409) ou rien quand la session est prête. */
export async function createSession(
  ctx: StudioContext,
  sessionResult: { data: StudioSession | null; error: { message: string } | null },
): Promise<Response | undefined> {
  const { sb, actor, p, json } = ctx;
  const photo = p.photo_id
    ? unwrap(
      await sb
        .from("user_photos")
        .select("*")
        .eq("id", p.photo_id)
        .eq("workspace_id", p.workspace_id)
        .eq("status", "ready")
        .is("removed_from_library_at", null)
        .single(),
    )
    : null;
  if (
    sessionResult.data &&
    sessionResult.data.source_photo_id !== (photo?.id || null)
  ) {
    return json({ error: "Cette session utilise une autre photo." }, 409);
  }
  if (!sessionResult.data) {
    const { error } = await sb.from("visual_studio_sessions").insert({
      id: p.session_id,
      workspace_id: p.workspace_id,
      user_id: actor,
      source_photo_id: photo?.id || null,
      name: (photo?.name || "Nouvelle idée").slice(0, 120),
      source_path: photo
        ? `${p.workspace_id}/${p.session_id}/original`
        : null,
      source_ready: !photo,
      references: photo ? null : [],
      source_metadata: {
        kind: photo?.kind,
        description: photo?.description,
        input_path: photo?.storage_path,
      },
      messages: [
        {
          role: "assistant",
          text:
            "Quelle image aimerais-tu créer, améliorer ou imaginer ? Tu peux commencer par une question. Je m’appuie sur ta marque et les références que tu choisis. Rien n’est généré avant ta confirmation.",
        },
      ],
    });
    if (error && error.code !== "23505") throw error;
  }
  sessionResult = await sb
    .from("visual_studio_sessions")
    .select("*")
    .eq("id", p.session_id)
    .eq("workspace_id", p.workspace_id)
    .single();
  const sourceSession = unwrap(sessionResult);
  if (sourceSession.source_photo_id !== (photo?.id || null)) {
    throw new Error("studio_conflict");
  }
  if (!sourceSession.source_ready) {
    const existing = await sb.storage
      .from(BUCKET)
      .download(sourceSession.source_path);
    if (existing.error) {
      const original = await download(
        sb,
        "user-photos",
        sourceSession.source_metadata.input_path,
      );
      const uploaded = await sb.storage
        .from(BUCKET)
        .upload(sourceSession.source_path, original, {
          contentType: original.type,
          upsert: false,
        });
      if (
        uploaded.error &&
        uploaded.error.message !== "The resource already exists"
      ) {
        throw uploaded.error;
      }
    }
    unwrap(
      await sb
        .from("visual_studio_sessions")
        .update({ source_ready: true })
        .eq("id", p.session_id)
        .select("id")
        .single(),
    );
  }
}

/** Actions archive / restore : renvoie la session à jour. */
export async function archiveSession(ctx: StudioContext, session: StudioSession): Promise<StudioSession> {
  const { sb, p } = ctx;
  if (p.revision == null) throw new Error("studio_conflict");
  session = unwrap(await sb.rpc("studio_set_session_archived", {
    p_workspace: p.workspace_id,
    p_session: session.id,
    p_revision: p.revision,
    p_archive: p.action === "archive",
  }));
  return session;
}

/** Action composition_read : renvoie toujours la réponse au front. */
export async function readComposition(ctx: StudioContext, session: StudioSession): Promise<Response> {
  const { sb, p, json } = ctx;
  if (!p.composition_history_id) throw new Error("studio_conflict");
  const saved = unwrap(await sb.from("visual_studio_compositions").select("*")
    .eq("id", p.composition_history_id).eq("session_id", session.id)
    .eq("workspace_id", p.workspace_id).single());
  const signed = saved.background_path
    ? await sb.storage.from(BUCKET).createSignedUrl(saved.background_path, 900)
    : null;
  return json({ composition: {
    id: saved.id,
    design: saved.design,
    created_at: saved.created_at,
    background_url: signed?.data?.signedUrl || null,
  } });
}

/** Action selection : réponse anticipée (409) ou session à jour. */
export async function selectReferences(
  ctx: StudioContext,
  session: StudioSession,
  references: Reference[],
): Promise<Response | StudioSession> {
  const { sb, p, json } = ctx;
  const active = unwrap(await sb.from("visual_studio_versions").select("id").eq("session_id", session.id).eq("status", "processing"));
  if (active.length) return json({ error: "Attends le résultat avant de changer les références." }, 409);
  if (p.revision !== session.revision || !p.reference_ids || p.reference_ids.some(id => !references.some(ref => ref.id === id))) throw new Error("studio_conflict");
  const previous = session.source_metadata?.studio_context as ConversationContext | undefined;
  session = unwrap(await sb.from("visual_studio_sessions").update({
    source_metadata: { ...session.source_metadata, studio_context: {
      ...(p.new_request ? {} : previous), reference_ids: [...new Set(p.reference_ids)],
      branch_id: p.viewed_version_id || null,
      start_index: p.new_request ? session.messages.length : previous?.start_index || 0,
    } }, proposal: null, ...(p.new_request ? { brief: "" } : {}),
    revision: session.revision + 1, updated_at: new Date().toISOString(),
  }).eq("id", session.id).eq("revision", p.revision).select("*").single());
  return session;
}
