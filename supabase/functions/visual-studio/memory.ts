import { getServiceClient } from "../_shared/plan-limiter.ts";
import { MAX_REFERENCES } from "./competencies.ts";
import { type Reference } from "./media.ts";
type DB = ReturnType<typeof getServiceClient>;
type Params = {
  action: string;
  workspace_id: string;
  memory_id?: string;
  memory_revision?: number;
  memory_kind?: string;
  memory_name?: string;
  memory_note?: string;
  fictional_model?: true;
  version_id?: string;
  revision?: number;
  remove?: boolean;
};
type Session = { id: string; revision: number; [key: string]: unknown };
export type Memory = {
  id: string;
  kind: string;
  name: string;
  note: string;
  revision: number;
  references: Reference[];
};
export async function readMemory(db: DB, workspace: string): Promise<Memory[]> {
  const { data, error } = await db.from("studio_brand_memory").select(
    "id,kind,name,note,revision,references",
  )
    .eq("workspace_id", workspace).is("archived_at", null).order("updated_at", {
      ascending: false,
    }).limit(100);
  if (error) throw error;
  return data || [];
}
export async function handleMemory(
  db: DB,
  actor: string,
  p: Params,
  session: Session,
  references: Reference[],
) {
  if (!p.memory_id) throw new Error("studio_conflict");
  const { data: existing, error } = await db.from("studio_brand_memory").select(
    "*",
  ).eq("id", p.memory_id).eq("workspace_id", p.workspace_id).maybeSingle();
  if (error) throw error;
  if (p.action === "memory_apply") {
    if (!existing || existing.archived_at || session.revision !== p.revision) {
      throw new Error("studio_conflict");
    }
    const { data: active, error: activeError } = await db.from(
      "visual_studio_versions",
    ).select("id").eq("session_id", session.id).eq("status", "processing")
      .limit(1);
    if (activeError) throw activeError;
    if (active?.length) throw new Error("studio_busy");
    const added = (existing.references as Reference[]).filter((r) =>
      !references.some((old) => old.path === r.path)
    );
    const merged = [
      ...references,
      ...added.map((r) => ({ ...r, memory_id: existing.id })),
    ];
    if (merged.length > MAX_REFERENCES) {
      throw new Error("studio_reference_limit");
    }
    const { data: updated, error: conflict } = await db.from(
      "visual_studio_sessions",
    ).update({
      references: merged,
      proposal: null,
      revision: session.revision + 1,
      updated_at: new Date().toISOString(),
      // The selected direction is a session choice, never a global brand rewrite.
      brief: String(session.brief || "").slice(0, 800) +
        `\nDirection choisie : ${existing.name}. ${existing.note}`,
    }).eq("id", session.id).eq("workspace_id", p.workspace_id).eq(
      "revision",
      p.revision,
    ).select("*").single();
    if (conflict || !updated) throw new Error("studio_conflict");
    return updated;
  }
  if (
    p.memory_revision == null ||
    (!p.remove && (!p.memory_kind || !p.memory_name || !p.memory_note))
  ) throw new Error("studio_conflict");
  let refs: Reference[] = existing?.references || [];
  if (!existing) {
    if (p.memory_kind === "casting" && (!p.fictional_model || !p.version_id)) {
      throw new Error("studio_casting_source");
    }
    if (p.version_id && p.memory_kind !== "preference") {
      const { data: version, error: versionError } = await db.from(
        "visual_studio_versions",
      ).select("id,result_path,proposal")
        .eq("id", p.version_id).eq("session_id", session.id).eq(
          "workspace_id",
          p.workspace_id,
        ).eq("status", "ready").single();
      if (versionError || !version) throw new Error("studio_conflict");
      const sourceRefs: Reference[] = version.proposal.references || [];
      if (
        p.memory_kind === "casting" &&
        (version.proposal.subject_kind === "portrait" ||
          sourceRefs.some((r) => r.role === "person" || r.kind === "portrait"))
      ) throw new Error("studio_casting_source");
      refs = [{
        id: version.id,
        photo_id: null,
        version_id: version.id,
        path: version.result_path,
        name: p.memory_name!,
        role: p.memory_kind === "casting" ? "casting" : "style",
      }];
    } else if (p.memory_kind === "direction") {
      refs = references.filter((r) =>
        r.role === "style" || r.role === "composition"
      ).map((r) => ({ ...r }));
    }
  }
  const result = await db.rpc("studio_write_memory", {
    p_actor: actor,
    p_workspace: p.workspace_id,
    p_id: p.memory_id,
    p_revision: p.memory_revision,
    p_kind: existing?.kind || p.memory_kind,
    p_name: p.memory_name || existing?.name,
    p_note: p.memory_note || existing?.note,
    p_references: refs,
    p_remove: p.remove || false,
  });
  if (result.error) throw result.error;
  return session;
}
