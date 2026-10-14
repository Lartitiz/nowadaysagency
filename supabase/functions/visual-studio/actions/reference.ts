// Action reference du Studio : ajout (bibliothèque, charte, image créée),
// changement de rôle ou retrait d'une référence.
// Déplacée telle quelle depuis index.ts (fiche 5, lot 2, docs/robustesse/gros-fichiers.md).
import { activeReferences } from "../conversation.ts";
import { MAX_REFERENCES } from "../competencies.ts";
import type { Reference } from "../media.ts";
import { BUCKET, charterReferences, download, store, unwrap } from "../storage.ts";
import type { StudioContext, StudioSession } from "./context.ts";

/** Réponse anticipée (409 / 400) ou session à jour. */
export async function updateReference(
  ctx: StudioContext,
  session: StudioSession,
  references: Reference[],
): Promise<Response | StudioSession> {
  const { sb, p, json } = ctx;
  if (
    (!p.photo_id && !p.reference_id && !p.version_id && p.charter_index == null) ||
    p.revision !== session.revision
  ) {
    return json(
      {
        code: "refresh_request",
        error: "Recharge la session avant de choisir une référence.",
      },
      409,
    );
  }
  const active = unwrap(
    await sb
      .from("visual_studio_versions")
      .select("id")
      .eq("session_id", session.id)
      .eq("status", "processing"),
  );
  if (active.length) {
    return json(
      { error: "Attends le résultat avant de changer les références." },
      409,
    );
  }
  const matches = (r: Reference) =>
    p.reference_id ? r.id === p.reference_id
    : p.version_id ? r.version_id === p.version_id
    : r.photo_id === p.photo_id;
  const found = references.find(matches);
  if (p.remove) {
    references = references.filter((r) => !matches(r));
  } else if (found) {
    if (p.subject_group && p.subject_group !== found.id && !references.some(ref => ref.id === p.subject_group && ref.role === (p.reference_role || found.role))) throw new Error("studio_conflict");
    references = references.map((r) =>
      r === found ? { ...r, role: p.reference_role || r.role, role_source: p.reference_role === "auto" ? "library" : p.role_source || "user", role_explicit: p.reference_role === "auto" ? false : r.role_explicit, subject_group: p.reference_role && p.reference_role !== r.role ? undefined : r.subject_group, ...(p.subject_group !== undefined ? { subject_group: p.subject_group } : {}) } : r
    );
  } else {
    if (!p.photo_id && !p.version_id && p.charter_index == null) {
      throw new Error("studio_conflict");
    }
    if (references.length >= MAX_REFERENCES) {
      return json(
        {
          error:
            "Garde jusqu’à huit références par demande. Retire-en une pour en choisir une autre.",
        },
        400,
      );
    }
    const charterImage = p.charter_index == null
      ? null
      : (await charterReferences(sb, p.workspace_id))[p.charter_index];
    if (p.charter_index != null && !charterImage) {
      throw new Error("studio_conflict");
    }
    const generated = p.version_id ? unwrap(
      await sb.from("visual_studio_versions").select("*")
        .eq("id", p.version_id).eq("session_id", session.id)
        .eq("status", "ready").single(),
    ) : null;
    const photo = charterImage || generated ? null : unwrap(
      await sb.from("user_photos").select("*")
        .eq("id", p.photo_id).eq("workspace_id", p.workspace_id).eq(
          "status",
          "ready",
        ).is("removed_from_library_at", null).single(),
    );
    const id = crypto.randomUUID(),
      path = generated?.result_path || `${p.workspace_id}/${session.id}/reference-${id}`;
    if (!generated) {
      const blob = await download(
        sb,
        charterImage ? "moodboards" : "user-photos",
        charterImage?.path || photo!.storage_path,
      );
      await store(sb, BUCKET, path, blob);
    }
    references = [
      ...references,
      {
        id,
        photo_id: photo?.id || null,
        version_id: generated?.id,
        path,
        role: charterImage ? "style" : p.reference_role || "auto",
        role_source: p.role_source || "library",
        subject_group: p.subject_group,
        name: (charterImage?.name || photo?.name || generated?.proposal?.summary || "Référence").slice(
          0,
          120,
        ),
        kind: photo?.kind,
        description: photo?.description?.slice(0, 500),
      },
    ];
  }
  session = unwrap(
    await sb
      .from("visual_studio_sessions")
      .update({
        references,
        source_metadata: { ...session.source_metadata, studio_context: {
          ...session.source_metadata?.studio_context,
          start_index: session.source_metadata?.studio_context?.start_index || 0,
          branch_id: session.source_metadata?.studio_context?.branch_id || null,
          reference_ids: [...new Set([
            ...activeReferences(session, references),
            ...(!p.remove && !found ? [references[references.length - 1].id] : []),
          ])].filter(id => references.some(ref => ref.id === id)),
        } },
        proposal: null,
        revision: session.revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .eq("revision", p.revision)
      .select("*")
      .single(),
  );
  return session;
}
