// Réponse commune du Studio (lecture « read ») : rattrapage des images
// bloquées (reprise Higgsfield, résultat stocké → terminée, résultat perdu →
// incertaine), relecture de la session et des versions, URL signées (cache
// signedPaths), quota, mémoire, charte et photos proposées.
// Toutes les actions qui ne renvoient pas leur propre réponse finissent ici.
// ORDRE DES REQUÊTES À GARDER : handler_contract_test.ts le fige.
// Déplacé tel quel depuis index.ts (fiche 5, lot 4, docs/robustesse/gros-fichiers.md).
import { checkQuota, isQaTestAccount } from "../_shared/plan-limiter.ts";
import { premiumAllowed, shouldRecover } from "./contract.ts";
import { activeReferences } from "./conversation.ts";
import { reconcileHiggsfieldImage } from "./higgsfield-image.ts";
import { legacyReferences } from "./media.ts";
import { readMemory } from "./memory.ts";
import { missingObject } from "./storage-errors.ts";
import { BUCKET, charterReferences, unwrap } from "./storage.ts";
import type { StudioContext, StudioSession } from "./actions/context.ts";

export async function readState(ctx: StudioContext, session: StudioSession, writable: boolean): Promise<Response> {
  const { sb, actor, p, json } = ctx;
  let versions = unwrap(
    await sb
      .from("visual_studio_versions")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at"),
  );
  await Promise.all(
    versions.filter((v) =>
      (v.status === "processing" || v.status === "uncertain") && v.proposal.provider === "higgsfield"
    ).map(async (v) => {
      try {
        await reconcileHiggsfieldImage(sb, v.id);
      } catch (error) {
        console.error(
          "[studio:higgsfield-recovery]",
          error instanceof Error ? error.message : "recovery failed",
        );
      }
    }),
  );
  for (
    const v of versions.filter(
      (v) =>
        (v.status === "processing" || v.status === "uncertain") &&
        v.proposal.provider !== "higgsfield" &&
        shouldRecover(v.created_at),
    )
  ) {
    // Reconcile stored outputs after a worker timeout. Never reissue a provider request.
    const object = await sb.storage.from(BUCKET).download(v.result_path);
    if (object.data) {
      unwrap(await sb.rpc("studio_complete_generation", { p_version: v.id }));
    } else if (v.status === "processing" && await missingObject(object.error)) {
      unwrap(
        await sb
          .from("visual_studio_versions")
          .update({
            status: "uncertain",
            error_message:
              "La création a été interrompue et aucun résultat n’est disponible. Aucun crédit Studio n’a été décompté pour l’instant ; son issue chez le fournisseur reste inconnue.",
            completed_at: new Date().toISOString(),
          })
          .eq("id", v.id)
          .eq("status", "processing")
          .select("id")
          .single(),
      );
    }
  }
  session = unwrap(
    await sb
      .from("visual_studio_sessions")
      .select("*")
      .eq("id", session.id)
      .single(),
  );
  versions = unwrap(
    await sb
      .from("visual_studio_versions")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at"),
  );
  const compositions = unwrap(
    await sb.from("visual_studio_compositions").select("id,title,created_at")
      .eq("session_id", session.id).eq("workspace_id", p.workspace_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }).limit(20),
  );
  const signedPaths = new Map<string, Promise<string | null>>();
  const sign = (path: string): Promise<string | null> => {
    if (!signedPaths.has(path)) signedPaths.set(path,
      sb.storage.from(BUCKET).createSignedUrl(path, 900)
        .then((result) => result.data?.signedUrl || null));
    return signedPaths.get(path)!;
  };
  const messages = await Promise.all((session.messages as Array<Record<string, unknown>>).map(async (message) => ({
    ...message,
    reference_snapshot: Array.isArray(message.reference_snapshot)
      ? await Promise.all(message.reference_snapshot.map(async (raw: unknown) => {
        const ref = raw as { path?: string };
        return { ...ref, url: ref.path ? await sign(ref.path) : null };
      }))
      : undefined,
  })));
  const quota = await checkQuota(actor, "photo_retouch", p.workspace_id);
  return json({
    session: {
      ...session,
      messages,
      active_reference_ids: activeReferences(session, legacyReferences(session)),
      conversation_branch_id: session.source_metadata?.studio_context?.branch_id || null,
      composition: session.composition
        ? {
          ...session.composition,
          background_url: session.composition.background_path
            ? await sign(session.composition.background_path)
            : null,
        }
        : null,
      source_url: session.source_path
        ? await sign(session.source_path)
        : null,
      references: await Promise.all(
        legacyReferences(session).map(async (r) => ({
          ...r,
          url: await sign(r.path),
        })),
      ),
    },
    versions: await Promise.all(
      versions.map(async (v) => ({
        ...v,
        url: v.status === "ready" ? await sign(v.result_path) : null,
      })),
    ),
    composition_history: compositions.map((entry) => ({
      id: entry.id,
      title: entry.title,
      created_at: entry.created_at,
    })),
    quota,
    generative_allowed: quota.reason === "error" ? undefined : premiumAllowed(quota.plan, isQaTestAccount(actor)),
    writable: writable && !session.archived_at,
    memory: await readMemory(sb, p.workspace_id),
    charter_references: await Promise.all(
      (await charterReferences(sb, p.workspace_id)).map(async (r, index) => ({
        index,
        name: r.name,
        url: unwrap(
          await sb.storage.from("moodboards").createSignedUrl(r.path, 900),
        ).signedUrl,
      })),
    ),
    suggested_photos: await (async () => {
      const ids = [
        ...new Set(
          (session.messages as { suggested_photo_ids?: string[] }[])
            .slice(-2)
            .flatMap((m) => m.suggested_photo_ids || []),
        ),
      ];
      if (!ids.length) return [];
      const photos = unwrap(
        await sb
          .from("user_photos")
          .select("id,name,kind,storage_path")
          .eq("workspace_id", p.workspace_id)
          .eq("status", "ready")
          .is("removed_from_library_at", null)
          .in("id", ids),
      );
      return Promise.all(
        photos.map(async (photo) => ({
          id: photo.id,
          name: photo.name,
          kind: photo.kind,
          url: unwrap(
            await sb.storage
              .from("user-photos")
              .createSignedUrl(photo.storage_path, 900),
          ).signedUrl,
        })),
      );
    })(),
  });
}
