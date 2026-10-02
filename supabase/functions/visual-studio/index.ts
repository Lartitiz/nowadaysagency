import { imageInputPaths, inheritedPhotoSource } from "./photo-preservation.ts";
import { soulStyles, selectSoulStyles, resolveSoulStyle } from "./soul-direction.ts";
import { prepareIntegration } from "./integration-direction.ts";
import { activeReferences, adviceTurn, independentRequest, explicitRoles, dialogueHistory, CONVERSATION_SYSTEM, type ConversationContext } from "./conversation.ts";
import { integrationProposal, referenceSignature } from "./integration-proposal.ts";
import { exactReference, validTargets, repairTargets, targetProblems, sceneInputs, asksIntegration } from "./scene-workflow.ts";
import { resolvePersonMemory } from "./person-reference.ts";
import { compositionSchema } from "./composition.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { callAnthropic, SONNET_MODEL } from "../_shared/anthropic.ts";
import {
  checkQuota,
  getServiceClient,
  isQaTestAccount,
  PLAN_LIMITS,
  quotaDeniedResponse,
} from "../_shared/plan-limiter.ts";
import {
  cleanStudioSummary,
  generative,
  intentSchema,
  intentTool,
  conversationTool,
  premiumAllowed,
  shouldRecover,
  studioSystem,
} from "./contract.ts";
import {
  generateImage,
  imageModel,
  legacyReferences,
  type Reference,
  visionBlock,
} from "./media.ts";
import {
  COMPETENCIES,
  isIdentity,
  MAX_REFERENCES,
  REFERENCE_ROLES,
  RULES_VERSION,
  searchTerms,
} from "./competencies.ts";
import {
  SOUL2_MODEL, soul2Enabled, soul2Eligible,
  failHiggsfieldImage,
  higgsfieldImagesEnabled,
  marketingFidelityEligible,
  MARKETING_MAX_IMAGES,
  marketingPromptTooLong, MARKETING_PROMPT_ERROR,
  routeToMarketingStudio,
  imageCallback,
  reconcileHiggsfieldImage,
  submitHiggsfieldImage,
} from "./higgsfield-image.ts";
import { handleMemory, readMemory } from "./memory.ts";
import { executeStudioJob } from "./worker.ts";
import { onlyAdditions, preferredProductReference, referencesAtVersion, referencesDiffer } from "./branch-context.ts";

declare const EdgeRuntime: { waitUntil: (work: Promise<unknown>) => void };
const schema = z.object({
  studio_version: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  action: z.enum([
    "create",
    "styles",
    "read",
    "message",
    "generate",
    "integrate",
    "save",
    "reference",
    "selection",
    "memory_save",
    "memory_apply",
    "pilot",
    "composition_save",
    "composition_read",
    "retry",
    "archive",
    "restore",
  ]),
  workspace_id: z.string().uuid(),
  session_id: z.string().uuid(),
  photo_id: z.string().uuid().optional(),
  reference_role: z.enum(REFERENCE_ROLES).optional(),
  role_source: z.enum(["library", "user", "conversation"]).optional(),
  subject_group: z.string().max(100).optional(),
  new_request: z.boolean().optional(),
  composition: compositionSchema.optional(),
  composition_use_image: z.boolean().optional(),
  composition_history_id: z.string().uuid().optional(),
  charter_index: z.number().int().min(0).max(8).optional(),
  reference_id: z.string().uuid().optional(),
  reference_ids: z.array(z.string().uuid()).max(MAX_REFERENCES).optional(),
  memory_id: z.string().uuid().optional(),
  memory_revision: z.number().int().min(-1).optional(),
  memory_kind: z.enum(["preference", "direction", "casting"]).optional(),
  memory_name: z.string().trim().min(1).max(120).optional(),
  memory_note: z.string().trim().min(1).max(1500).optional(),
  fictional_model: z.literal(true).optional(),
  remove: z.boolean().optional(),
  viewed_reference_id: z.string().uuid().nullable().optional(),
  proposal_id: z.string().uuid().optional(),
  approved_scene_id: z.string().uuid().optional(),
  version_id: z.string().uuid().optional(),
  viewed_version_id: z.string().uuid().nullable().optional(),
  branch_reference_mode: z.enum(["version", "current"]).optional(),
  revision: z.number().int().nonnegative().optional(),
  message: z.string().trim().min(1).max(6000).optional(),
  request_id: z.string().uuid().optional(),
});
const BUCKET = "visual-studio";
function requireValue<T>(
  value: T,
  message = "Ressource indisponible",
): NonNullable<T> {
  if (value == null) throw new Error(message);
  return value;
}
function unwrap<T>(result: {
  data: T;
  error: { message: string } | null;
}): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  return requireValue(result.data);
}
async function download(
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
async function visionFromStorage(
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
async function store(
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
async function canWrite(
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
async function charterReferences(
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
export async function handleStudioRequest(req: Request): Promise<Response> {
  const callback = await imageCallback(req);
  if (callback) return callback;
  const parsed = schema.safeParse(
    req.method === "OPTIONS" ? null : await req.json().catch(() => null),
  );
  const pipe = await runPipeline(req, {
    skipQuota: true,
    rateLimit: { max: 120, windowMs: 60_000 },
  });
  if (!pipe.ok) return pipe.response;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...pipe.corsHeaders, "Content-Type": "application/json" },
    });
  if (!parsed.success) return json({ error: "Demande invalide." }, 400);
  const p = parsed.data,
    sb = getServiceClient(),
    actor = pipe.userId;
  try {
    const member = unwrap(
      await sb
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", p.workspace_id)
        .eq("user_id", actor)
        .single(),
    );
    const writable = ["owner", "manager", "editor"].includes(member.role);
    if (!["read", "composition_read"].includes(p.action) && !writable) {
      return json({ error: "Cet espace est en lecture seule." }, 403);
    }
    if (p.action === "styles") return json({ styles: await soulStyles() });
    let sessionResult = await sb
      .from("visual_studio_sessions")
      .select("*")
      .eq("id", p.session_id)
      .eq("workspace_id", p.workspace_id)
      .maybeSingle();
    if (sessionResult.error) throw sessionResult.error;
    if (p.action === "create") {
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
    let session = unwrap(
      await sb
        .from("visual_studio_sessions")
        .select("*")
        .eq("id", p.session_id)
        .eq("workspace_id", p.workspace_id)
        .single(),
    );
    if (!session.source_ready) {
      return json(
        {
          error:
            "La photo de départ n’a pas pu être conservée. Réessaie son ouverture.",
        },
        409,
      );
    }
    if (p.action === "archive" || p.action === "restore") {
      if (p.revision == null) throw new Error("studio_conflict");
      session = unwrap(await sb.rpc("studio_set_session_archived", {
        p_workspace: p.workspace_id,
        p_session: session.id,
        p_revision: p.revision,
        p_archive: p.action === "archive",
      }));
    } else if (session.archived_at && !["read", "composition_read"].includes(p.action)) {
      throw new Error("studio_archived");
    }
    if (p.action === "composition_read") {
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
    let references: Reference[] = legacyReferences(session);
    if (p.action === "memory_save" || p.action === "memory_apply") {
      session = await handleMemory(sb, actor, p, session, references);
      references = legacyReferences(session);
    }
    if (p.action === "selection") {
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
    }
    if (p.action === "reference") {
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
    }
    if (p.action === "message") {
      if (!p.message || p.revision == null || !p.request_id) {
        return json({ error: "Demande incomplète." }, 400);
      }
      // A lost acknowledgement is replayed without paying the interpreter again.
      if (
        !(session.messages as Array<{ id?: string }>).some(
          (m) => m.id === p.request_id,
        )
      ) {
        if (session.revision !== p.revision) {
          return json(
            {
              code: "refresh_request",
              error: "La session a changé. Recharge-la avant d’envoyer.",
            },
            409,
          );
        }
        if (
          (session.messages as Array<{ role: string }>).filter(
            (m) => m.role === "user",
          ).length >= 50
        ) {
          return json(
            {
              error:
                "Cette session contient déjà 50 demandes. Ouvre une nouvelle session depuis la photo.",
            },
            429,
          );
        }
        const newRequest = !!p.new_request || independentRequest(p.message!);
        const conversation = session.source_metadata?.studio_context as ConversationContext | undefined;
        const conversational = adviceTurn(p.message!);
        const parent = p.viewed_version_id && !newRequest
          ? unwrap(
            await sb
              .from("visual_studio_versions")
              .select("*")
              .eq("id", p.viewed_version_id)
              .eq("session_id", session.id)
              .eq("status", "ready")
              .single(),
          )
          : null;
        const versionReferences: Reference[] = parent
          ? referencesAtVersion(parent.proposal)
          : references;
        const changedReferences = !!parent &&
          referencesDiffer(versionReferences, references);
        // Earlier created images auto-joined to the session (older scenes) are
        // not user choices: they never cause a conflict and are left out.
        const versionIds = new Set(versionReferences.map((r) => r.id));
        const userReferences = parent
          ? references.filter((r) => !r.version_id || r.version_id === parent.id || versionIds.has(r.id))
          : references;
        const additionsOnly = changedReferences && !p.branch_reference_mode && !p.reference_ids &&
          onlyAdditions(versionReferences, userReferences);
        // After a scene, extra photos are not a conflict: keep the scene's own
        // references. Elsewhere, photos only added since then are kept too.
        const sceneKeepsRefs = additionsOnly && parent?.proposal?.scene_workflow?.phase === "scene";
        const branchMode = p.branch_reference_mode ||
          (sceneKeepsRefs ? "version" : additionsOnly ? "current" : undefined);
        if (changedReferences && !branchMode && !p.reference_ids) {
          return json({
            code: "branch_reference_choice",
            version_names: versionReferences.map((r) => r.name).filter(Boolean),
            current_names: userReferences.map((r) => r.name).filter(Boolean),
            error:
              "Les références ont changé depuis cette version. Choisis celles à utiliser avant d’envoyer ; aucune image n’a été lancée.",
          }, 409);
        }
        const availableReferences = changedReferences &&
            branchMode === "version"
          ? versionReferences
          : changedReferences && additionsOnly ? userReferences : references;
        if (p.reference_ids && p.reference_ids.some((id) =>
          !availableReferences.some((ref) => ref.id === id)
        )) return json({ error: "Une image jointe n'est plus disponible. Vérifie ta demande." }, 409);
        const effectiveIds = newRequest ? (p.new_request || !session.messages.some((m: { role: string }) => m.role === "user") ? p.reference_ids || activeReferences(session, availableReferences) : []) : p.reference_ids ?? (branchMode || p.studio_version !== 4 ? availableReferences.map(ref => ref.id) : activeReferences(session, availableReferences));
        const requestReferences: Reference[] = [...(effectiveIds
          ? effectiveIds.length
            ? effectiveIds.map((id) => availableReferences.find((ref) => ref.id === id)!).filter(Boolean)
            : p.studio_version === 4 ? [] : parent ? versionReferences : []
          : availableReferences)];
        // These originals belong to this selected scene branch, not to an unrelated
        // session result. Claude may use them only when continuing the workflow.
        const reservedProducts: Reference[] = parent?.proposal?.scene_workflow?.phase === "scene"
          ? parent.proposal.planning_references || []
          : parent?.proposal?.scene_workflow?.phase === "integration"
          ? (parent.proposal.reference_snapshot || []).filter(exactReference) : [];
        for (const ref of reservedProducts) {
          if (!requestReferences.some(r => r.id === ref.id) && requestReferences.length < MAX_REFERENCES) requestReferences.push(ref);
        }
        if (
          p.viewed_reference_id &&
          !references.some((r) => r.id === p.viewed_reference_id)
        ) {
          return json({ error: "Référence indisponible." }, 409);
        }
        const { data: active, error: activeError } = await sb
          .from("visual_studio_versions")
          .select("id")
          .eq("session_id", session.id)
          .eq("status", "processing")
          .limit(1);
        if (activeError) throw activeError;
        if (active?.length) {
          return json(
            {
              error: "Attends le résultat en cours avant une nouvelle demande.",
            },
            409,
          );
        }
        const reserved = unwrap(
          await sb.rpc("studio_reserve_interpretation", {
            p_actor: actor,
            p_session: session.id,
            p_request: p.request_id,
          }),
        );
        if (!reserved) {
          return json(
            {
              code: "refresh_request",
              error:
                "Cette demande a déjà été reçue. Recharge la session ; si elle n’a pas abouti, renvoie-la.",
            },
            409,
          );
        }
        // Read only brand fields useful for visual direction, scoped to the active workspace.
        const [charter, profile, proposition, strategy, recentCatalogue] =
          await Promise.all([
            sb
              .from("brand_charter")
              .select(
                "color_primary,color_secondary,color_accent,color_background,color_text,font_title,font_body,photo_style,mood_keywords,visual_donts,moodboard_description,mood_board_urls,visual_direction",
              )
              .eq("workspace_id", p.workspace_id)
              .maybeSingle(),
            sb
              .from("brand_profile")
              .select(
                "mission,offer,target_description,voice_description,things_to_avoid",
              )
              .eq("workspace_id", p.workspace_id)
              .maybeSingle(),
            sb
              .from("brand_proposition")
              .select("version_final,version_one_liner")
              .eq("workspace_id", p.workspace_id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            sb
              .from("brand_strategy")
              .select(
                "creative_concept,pillar_major,pillar_minor_1,pillar_minor_2",
              )
              .eq("workspace_id", p.workspace_id)
              .maybeSingle(),
            sb
              .from("user_photos")
              .select("id,name,kind,description")
              .eq("workspace_id", p.workspace_id)
              .eq("status", "ready")
              .is("removed_from_library_at", null)
              .order("created_at", { ascending: false })
              .limit(60),
          ]);
        for (
          const result of [
            charter,
            profile,
            proposition,
            strategy,
            recentCatalogue,
          ]
        ) {
          if (result.error) throw result.error;
        }
        const memory = await readMemory(sb, p.workspace_id);
        // Keep the exact brand context supplied to the interpreter with the
        // resulting version. Later edits to the charter must not rewrite the
        // history of an image that was already generated.
        const brandContext = {
          captured_at: new Date().toISOString(),
          charter: charter.data,
          identity: profile.data,
          proposition: proposition.data,
          strategy: strategy.data,
          memory: memory.map((item) => ({
            id: item.id,
            kind: item.kind,
            name: item.name,
            note: item.note,
            revision: item.revision,
          })),
        };
        const terms = searchTerms(p.message);
        let catalogue = recentCatalogue;
        if (terms.length) {
          const matches = await sb.from("user_photos").select(
            "id,name,kind,description",
          )
            .eq("workspace_id", p.workspace_id).eq("status", "ready").is(
              "removed_from_library_at",
              null,
            )
            .or(
              terms.flatMap(
                (t) => [`name.ilike.%${t}%`, `description.ilike.%${t}%`],
              ).join(","),
            )
            .order("created_at", { ascending: false }).limit(40);
          if (matches.error) throw matches.error;
          const seen = new Set<string>();
          catalogue = {
            ...recentCatalogue,
            error: null,
            data: [...(matches.data || []), ...(recentCatalogue.data || [])]
              .filter((row) => {
                if (seen.has(row.id)) return false;
                seen.add(row.id);
                return true;
              }).slice(0, 80),
          };
        }
        const statedRoles = explicitRoles(p.message!, requestReferences);
        for (const ref of requestReferences) {
          const stated = statedRoles.get(ref.id);
          if (stated) { ref.role = stated; ref.role_source = "conversation"; ref.role_explicit = true; }
        }
        const selectedReference = requestReferences.find((r) =>
          r.id === p.viewed_reference_id
        ) ||
          requestReferences.find((r) => isIdentity(r.role)) ||
          requestReferences[0];
        const vision = [];
        if (parent) {
          vision.push({
            type: "text",
            text: "Version sélectionnée à modifier",
          });
          vision.push(await visionFromStorage(sb, BUCKET, parent.result_path));
        }
        for (const [index, ref] of requestReferences.entries()) {
          vision.push({
            type: "text",
            text: `Référence jointe ${index + 1}, ID ${ref.id} : ${ref.role}, ${ref.name}`,
          });
          // The selected version is already attached above; don't load it twice.
          if (parent && ref.path === parent.result_path) continue;
          vision.push(await visionFromStorage(sb, BUCKET, ref.path));
        }
        const availableSoulStyles = conversational ? [] : selectSoulStyles(await soulStyles());
        let intent: ReturnType<typeof intentSchema.parse>;
        let interpreterArgs: Parameters<typeof callAnthropic>[0];
        try {
          interpreterArgs = {
            model: conversational ? "claude-haiku-4-5" : SONNET_MODEL,
            system: conversational ? CONVERSATION_SYSTEM : studioSystem,
            tool: conversational ? conversationTool : intentTool,
            // Supplied titles, dates and time ranges must survive structured output verbatim.
            keepDashes: true,
            max_tokens: 6000,
            temperature: 0.2,
            abortTimeoutMs: 45_000,
            maxRetries: 0,
            messages: [
              ...dialogueHistory(session.messages, newRequest ? session.messages.length : conversation?.start_index || 0, parent?.id || null),
              {
                role: "user",
                content: [
                  ...vision,
                  {
                    type: "text",
                    text: JSON.stringify({
                      composition_editable: !parent && session.composition ? { ...session.composition.design, logo_data_url: undefined, logo_present: !!session.composition.design?.logo_data_url } : null,
                      presets_soul_disponibles: availableSoulStyles,
                      competences_disponibles: COMPETENCIES,
                      memoire_confirmee: memory.filter((m) =>
                        m.kind === "preference"
                      ).map((m) => ({ id: m.id, name: m.name, note: m.note })),
                      directions_et_castings_disponibles: memory.filter((m) =>
                        m.kind !== "preference"
                      ).map((m) => ({
                        id: m.id,
                        kind: m.kind,
                        name: m.name,
                        note: m.note,
                      })),
                      marque: {
                        charte: brandContext.charter,
                        identite: brandContext.identity,
                        proposition: brandContext.proposition,
                        strategy: brandContext.strategy,
                      },
                      references: requestReferences.map(({ path, ...ref }) => ref),
                      reference_selectionnee: selectedReference?.id,
                      version_selectionnee: parent
                        ? {
                          id: parent.id,
                          scene_workflow: parent.proposal.scene_workflow,
                          image_prompt: parent.proposal.image_prompt,
                          format: parent.proposal.format,
                          originaux_reserves: reservedProducts.map(({ id, name }) => ({ id, name })),
                          person_reference: parent.proposal.person_reference,
                          brief: parent.proposal.brief,
                          summary: parent.proposal.summary,
                          preserve: parent.proposal.preserve,
                          change: parent.proposal.change,
                          product_placement: parent.proposal.product_placement,
                          photo_treatment: parent.proposal.photo_treatment,
                        }
                        : null,
                      brief: newRequest ? "" : parent
                        ? parent.proposal.brief || parent.proposal.summary || ""
                        : session.brief || "",
                      proposition_a_corriger: !newRequest && session.proposal && (session.proposal.viewed_version_id || null) === (parent?.id || null)
                        ? { summary: session.proposal.summary, image_prompt: session.proposal.image_prompt, preserve: session.proposal.preserve, change: session.proposal.change, scene_workflow: session.proposal.scene_workflow, product_placement: session.proposal.product_placement } : null,
                      historique: dialogueHistory(session.messages, newRequest ? session.messages.length : conversation?.start_index || 0, parent?.id || null),
                      decisions_acquises: newRequest ? {} : conversation?.decisions || {},
                      catalogue: (catalogue.data || []).map((row) => ({
                        ...row,
                        description: row.description?.slice(0, 250),
                      })),
                      demande: p.message,
                    }),
                  },
                ],
              },
            ],
          };
          const raw = await callAnthropic(interpreterArgs);
          const parsed = intentSchema.safeParse(JSON.parse(raw));
          if (!parsed.success) {
            // A malformed preparation is a technical issue, never a question for the user.
            const issues = parsed.error.issues.map(issue => ({ code: issue.code, path: issue.path, message: issue.message }));
            console.warn("[visual-studio:contract]", JSON.stringify({ request_id: p.request_id, issues }));
            intent = intentSchema.parse(JSON.parse(await callAnthropic({ ...interpreterArgs,
              system: `${interpreterArgs.system}\nCONTRÔLE DE COMPLÉTUDE : ta réponse précédente était techniquement incomplète (${JSON.stringify(issues)}). Renvoie maintenant la réponse structurée complète pour cette même demande. Pour create/edit/product, image_prompt est obligatoire et non vide, ainsi que summary. Pour background, background_prompt est non vide. Pour compose, composition est obligatoire. N'invente pas de nouvelle demande à l'utilisatrice pour réparer ces champs techniques.`,
            })));
          } else intent = parsed.data;
          intent.summary = cleanStudioSummary(intent.summary);
          if (intent.reply) intent.reply = cleanStudioSummary(intent.reply);
          if (["advise", "clarify"].includes(intent.operation)) {
            intent.summary = intent.reply || intent.summary;
            if (!intent.summary.trim()) throw new Error("empty_conversation_reply");
          } else if (!intent.summary.trim()) throw new Error("empty_proposal_summary");
          const lastReply = [...session.messages].reverse().find((m: {role:string}) => m.role === "assistant")?.text;
          if (conversational && (intent.summary.trim() === lastReply?.trim() || /^(tu demandes|tu souhaites savoir|je vais comparer|je compare ces)/i.test(intent.summary.trim()))) {
            const repaired = intentSchema.parse(JSON.parse(await callAnthropic({ ...interpreterArgs,
              system: `${CONVERSATION_SYSTEM}\nLa précédente tentative répétait la question ou annonçait une réponse sans la donner. Réponds maintenant au fond, avec une recommandation et sa raison, sans reposer la même question.`,
              tool: conversationTool, max_tokens: 1800,
            })));
            const answer = cleanStudioSummary(repaired.reply || repaired.summary);
            if (!answer || answer.trim() === lastReply?.trim() || /^(tu demandes|tu souhaites savoir|je vais comparer|je compare ces)/i.test(answer.trim()) || !["advise", "clarify"].includes(repaired.operation)) throw new Error("repeated_conversation_reply");
            intent = { ...repaired, summary: answer, reply: answer };
          }
        } catch (error) {
          console.error(
            "[visual-studio:interpretation]",
            String(error).replace(/https?:\/\/\S+/g, "[url]"),
          );
          // No session write or image generation has happened at this point.
          // A deliberate resend may reserve a fresh interpretation request.
          return json(
            {
              error:
                "Je n’ai pas pu préparer ta demande. Ton texte est conservé : renvoie-le pour réessayer. Aucune image n’a été lancée.",
              code: "refresh_request",
            },
            503,
          );
        }
        const rawOperation = intent.operation;
        const dialogueOnly = ["advise", "clarify"].includes(intent.operation);
        if (dialogueOnly) {
          // Generation-only fields cannot erase an otherwise valid answer.
          intent.reference_use = requestReferences.map(ref => ({ id: ref.id, role: intent.operation === "advise" ? ref.role : intent.reference_use.find(use => use.id === ref.id)?.role || ref.role, explicit_change: intent.operation === "advise" ? undefined : intent.reference_use.find(use => use.id === ref.id)?.explicit_change }));
          intent.source_reference_id = undefined;
          intent.requires_real_subject = false;
          intent.person_reference = undefined;
          intent.scene_workflow = undefined;
        }
        let person = intent.person_reference;
        const memoryIds = person?.memory_ids || [];
        const memoryReferences = resolvePersonMemory(memoryIds, memory);
        const ambiguousMemory = memoryIds.some(id => {
          const selected = memory.find(item => item.id === id);
          return selected && memory.filter(item => item.kind === "casting" && item.name.trim().toLocaleLowerCase() === selected.name.trim().toLocaleLowerCase()).length > 1 &&
            !requestReferences.some(ref => ref.memory_id === id);
        });
        if (!memoryReferences || ambiguousMemory) {
          intent.operation = "clarify";
          intent.summary = "Quelle personne souhaites-tu reprendre ? Choisis sa référence dans la mémoire de cette marque pour éviter de mélanger deux identités.";
        }
        const addedMemoryReferences = (memoryReferences || []).filter(ref => !requestReferences.some(old => old.path === ref.path));
        if (requestReferences.length + addedMemoryReferences.length > MAX_REFERENCES || references.length + addedMemoryReferences.filter(ref => !references.some(old => old.path === ref.path)).length > MAX_REFERENCES) {
          return json({ error: "Huit références maximum. Retire une image avant de reprendre cette personne." }, 409);
        }
        requestReferences.push(...addedMemoryReferences);
        for (const ref of memoryReferences || []) {
          const attached = requestReferences.find(item => item.path === ref.path)!;
          Object.assign(attached, { memory_id: ref.memory_id, description: ref.description, name: ref.name });
          const use = intent.reference_use.find(item => item.id === attached.id);
          if (use) use.role = "casting";
          else intent.reference_use.push({ id: attached.id, role: "casting" });
        }
        if (addedMemoryReferences.length && generative(intent.operation)) {
          // The first pass selects the explicitly named identity. The final plan
          // must observe its actual pixels before it can describe a compatible pose.
          const memoryVision = [];
          for (const ref of addedMemoryReferences) {
            memoryVision.push({ type: "text", text: `Original résolu : ID ${ref.id}, rôle casting, ${ref.name}` });
            memoryVision.push(await visionFromStorage(sb, BUCKET, ref.path));
          }
          try {
            const checked = intentSchema.parse(JSON.parse(await callAnthropic({ ...interpreterArgs,
              messages: [{ role: "user", content: [...memoryVision, { type: "text", text: JSON.stringify({
                demande: p.message, proposition_a_verifier: intent,
                references: requestReferences.map(({ path, ...ref }) => ref),
                consigne: "Les originaux de la personne demandée sont maintenant visibles. Corrige la préparation avec ces pixels. Conserve les mêmes memory_ids et références sélectionnées. Pour une nouvelle photographie prépare une scène provisoire Soul, avec targets et scene_prompt, puis intégration après validation."
              }) }, ...vision] }],
            })));
            if (JSON.stringify(checked.person_reference?.memory_ids || []) !== JSON.stringify(memoryIds)) throw new Error("identity_selection_changed");
            intent = checked; intent.summary = cleanStudioSummary(intent.summary); person = intent.person_reference;
            for (const ref of memoryReferences || []) {
              const use = intent.reference_use.find(item => item.id === ref.id);
              if (use) use.role = "casting"; else intent.reference_use.push({ id: ref.id, role: "casting" });
            }
          } catch {
            return json({ error: "Je n’ai pas pu vérifier la préparation avec la référence enregistrée. Renvoie ta demande ; aucune image n’a été lancée.", code: "refresh_request" }, 503);
          }
        }
        // The selected version is already authorised and loaded above. The
        // interpreter can name its ID as a composition source instead of using
        // uses_selected_version. Resolve only this exact known alias; arbitrary
        // reference IDs still fail closed below.
        if (parent && (intent.source_reference_id === parent.id ||
          intent.reference_use.some(use => use.id === parent.id && use.role === "composition"))) {
          if (intent.source_reference_id === parent.id) intent.source_reference_id = undefined;
          intent.reference_use = intent.reference_use.filter(use => !(use.id === parent.id && use.role === "composition"));
          intent.uses_selected_version = true;
        }
        if (intent.reference_use.some(use => !requestReferences.some(ref => ref.id === use.id)) ||
          (intent.source_reference_id && !intent.reference_use.some(use => use.id === intent.source_reference_id))) {
          intent.operation = "clarify";
          intent.summary = "Je n’ai pas pu identifier toutes les images à utiliser. Précise laquelle est la scène et laquelle montre le produit ; aucune image n’a été lancée.";
        }
        for (const use of intent.reference_use) {
          const quote = use.explicit_change?.trim();
          if (quote && quote.length >= 8 && p.message.includes(quote) && !statedRoles.has(use.id)) {
            const ref = requestReferences.find(ref => ref.id === use.id);
            if (ref) { ref.role = use.role; ref.role_source = "conversation"; ref.role_explicit = true; ref.subject_group = undefined; }
          }
        }
        // Explicit choices stay authoritative across follow-ups, including partial model output.
        for (const ref of requestReferences.filter(r => r.role_source === "user" || r.role_explicit)) {
          const use = intent.reference_use.find(use => use.id === ref.id);
          if (use) use.role = ref.role;
          else intent.reference_use.push({ id: ref.id, role: ref.role });
        }
        const baseReferences = requestReferences.filter(ref => ["scene", "edit_source"].includes(ref.role));
        if (!dialogueOnly && generative(intent.operation) && baseReferences.length === 1) {
          intent.source_reference_id = baseReferences[0].id;
          intent.operation = "edit";
          if (!intent.reference_use.some(use => use.id === baseReferences[0].id)) intent.reference_use.push({ id: baseReferences[0].id, role: baseReferences[0].role });
          if (intent.scene_workflow?.phase === "scene") intent.scene_workflow = undefined;
        }
        const newPhoto = intent.visual_kind === "photo" && !intent.exact_text.length && person?.mode !== "sheet" &&
          (intent.operation === "create" || intent.operation === "product" && intent.scene_workflow?.phase !== "integration" && !intent.source_reference_id && !(intent.uses_selected_version && parent));
        if (newPhoto) {
          intent.operation = "create";
          intent.uses_selected_version = false;
          intent.scene_workflow = { ...intent.scene_workflow, phase: "scene",
            camera_match: intent.scene_workflow?.camera_match || "Point de vue adapté à la pose et aux références fournies." };
          intent.image_prompt = intent.scene_workflow.scene_prompt || intent.image_prompt;
          if (intent.scene_workflow.phase === "scene") {
            intent.summary = intent.summary.replace(/en une (?:seule )?passe|en une seule génération|directement/gi, "après validation de la scène");
          }
          if (intent.shots.length) {
            intent.brief = [intent.brief, "Prises suivantes après validation du pilote :", ...intent.shots.map(shot => shot.summary)].join("\n").slice(0, 6000);
            intent.summary += " Nous commençons par une scène pilote ; les autres prises restent à préparer après sa validation.";
            intent.shots = [];
          }
        }
        const usedReferences = p.studio_version === 4 && !newPhoto
          ? requestReferences.filter((ref) => intent.reference_use.some((use) => use.id === ref.id))
          : requestReferences.filter(ref => !newPhoto || !reservedProducts.some(r => r.id === ref.id) || !!p.reference_ids?.includes(ref.id) || intent.reference_use.some(use => use.id === ref.id));
        const resolvedReferences: Reference[] = usedReferences.map((ref) => ({ ...ref,
          role: statedRoles.get(ref.id) || ((ref.role_source === "user" || ref.role_explicit) ? ref.role : intent.reference_use.find(use => use.id === ref.id)?.role || ref.role),
          role_source: (statedRoles.has(ref.id) ? "conversation" : ref.role_source === "user" ? "user" : "conversation") as Reference["role_source"],
        }));
        // Preserve all originals on this branch, even if the interpreter omits them.
        if (intent.scene_workflow?.phase === "scene" || intent.scene_workflow?.phase === "integration") {
          for (const ref of requestReferences) {
            const role = intent.reference_use.find(use => use.id === ref.id)?.role || ref.role;
            if ((!newPhoto || usedReferences.some(r => r.id === ref.id)) && ["product", "person", "casting", "person_product"].includes(role) && !resolvedReferences.some(r => r.id === ref.id)) resolvedReferences.push({ ...ref, role });
          }
        }
        const explicitSource = resolvedReferences.find((ref) =>
          ref.id === intent.source_reference_id
        );
        const effectiveReference = explicitSource || resolvedReferences.find((ref) => ref.id === selectedReference?.id) ||
          resolvedReferences.find((ref) => isIdentity(ref.role)) || resolvedReferences[0];
        const finalInputPath = explicitSource?.path || parent?.result_path || effectiveReference?.path || null;
        // The model cannot invent a real reference or authorize a source-free identity reconstruction.
        // Retoucher une image déjà générée (ou une photo source explicite) garde
        // le sujet réel déjà présent dedans : pas besoin de redemander la photo.
        const editsExistingImage = ["background", "edit"].includes(intent.operation) &&
          !!(explicitSource?.path || parent?.result_path);
        const parentHadIdentity = !!parent &&
          ((parent.proposal?.reference_snapshot || []) as Array<{ role?: string }>)
            .some((r) => isIdentity(String(r.role || "")));
        if (
          (["background", "edit", "product"].includes(intent.operation) &&
            !finalInputPath) ||
          (!editsExistingImage && !parentHadIdentity &&
            (intent.requires_real_subject || intent.operation === "product") &&
            !resolvedReferences.some((r) => isIdentity(r.role)))
        ) {
          intent.operation = "clarify";
          intent.summary =
            "Pour représenter fidèlement cette personne ou ce produit, choisis sa photo dans la bibliothèque. Tu peux aussi me demander une illustration sans représentation réelle.";
        }
        if (person && generative(intent.operation)) {
          let identityRefs = resolvedReferences.filter(ref => ref.role === "casting" || ref.role === "person");
          const parentIdentity = !!parent && (parent.proposal?.person_reference ||
            (parent.proposal?.reference_snapshot || []).some((ref: Reference) => ref.role === "casting" || ref.role === "person"));
          if (parentIdentity && !identityRefs.length && intent.operation === "create" && (person.mode === "scene" || person.uses_existing_identity)) {
            resolvedReferences.push({ id: parent.id, version_id: parent.id, photo_id: null, path: parent.result_path,
              name: parent.proposal.person_reference?.name || "Personne de la version sélectionnée",
              role: (parent.proposal.reference_snapshot || []).some((ref: Reference) => ref.role === "person") ? "person" : "casting" });
            identityRefs = resolvedReferences.filter(ref => ref.role === "casting" || ref.role === "person");
          }
          if (resolvedReferences.length > MAX_REFERENCES) {
            intent.operation = "clarify";
            intent.summary = "Retire une référence pour joindre l’image validée de cette personne (huit images maximum).";
          } else if ((person.mode === "scene" || person.uses_existing_identity) && !identityRefs.length && !parentIdentity) {
            intent.operation = "clarify";
            intent.summary = "Pour reprendre la même personne, choisis son image validée ou indique son nom enregistré dans la mémoire de cette marque.";
          } else if (person.mode === "sheet" && (intent.shots.length || !person.views.length || new Set(identityRefs.map(ref => ref.memory_id || ref.id)).size > 1 && memoryIds.length > 1)) {
            intent.operation = "clarify";
            intent.summary = "Préparons une seule planche de cette personne. Souhaites-tu les vues du visage, ou une planche complémentaire silhouette et mains à partir du visage validé ?";
          }
        }
        if (p.studio_version === 4 && intent.operation === "product" && !intent.product_placement.trim()) {
          intent.operation = "clarify";
          intent.summary = "Comment veux-tu poser ou tenir ton produit dans ce décor ? Précise sa position et ce qui le soutient ; aucune image n'est lancée.";
        }
        const normalizeName = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        const requestText = ` ${normalizeName(p.message)} `;
        const memoryToSelect = memory.filter((m) => m.kind !== "preference" && !memoryIds.length &&
          !requestReferences.some((r) => r.memory_id === m.id || m.references.some((source) => source.path === r.path)) &&
          (intent.suggested_memory_ids.includes(m.id) ||
            (/reutilis|reprendr|utiliser/.test(requestText) && requestText.includes(` ${normalizeName(m.name)} `))));
        if (memoryToSelect.length) {
          intent.operation = "advise";
          intent.summary = "Cette référence est enregistrée, mais son image n’est pas encore jointe à cette session. Clique sur « Utiliser ce mannequin » ou « Utiliser cette direction » ci-dessous, puis décris les photos souhaitées. Aucune image n’a été générée.";
          intent.suggestions = [];
        }
        if (generative(intent.operation) && !p.studio_version) {
          intent.operation = "existing_tool";
          intent.summary =
            "Recharge le Studio pour accéder à la création et aux retouches étendues. Aucune image n’a été lancée.";
        }
        if (p.studio_version !== 4 && intent.composition && generative(intent.operation)) {
          intent.composition.layout = "image_full";
        } else if (intent.operation === "compose" && intent.composition) {
          intent.composition.layout = session.composition?.design?.layout === "image_full"
            ? "image_full"
            : "image_top";
        }
        // A new take may use the selected result as a visual reference without
        // treating it as the image to edit. An independent creation stays independent.
        if (intent.operation === "create" && intent.uses_selected_version && parent &&
          !resolvedReferences.some((ref) => ref.path === parent.result_path)) {
          if (resolvedReferences.length >= MAX_REFERENCES) {
            intent.operation = "clarify";
            intent.summary = "Retire une référence pour joindre l’image sélectionnée (huit images maximum).";
          } else {
            resolvedReferences.unshift({ id: parent.id, version_id: parent.id, photo_id: null,
              path: parent.result_path, name: "Version sélectionnée", role: "subject" });
          }
        }
        // Editing the selected scene continues its workflow even if the model
        // omits this optional field. Do not inherit when another source is edited
        // or for an independent creation.
        if (!intent.scene_workflow && intent.operation === "edit" && intent.visual_kind === "photo" && !intent.exact_text.length && parent &&
          (!explicitSource || explicitSource.path === parent.result_path) &&
          ["scene", "integration"].includes(parent.proposal.scene_workflow?.phase)) {
          intent.scene_workflow = parent.proposal.scene_workflow;
        }
        // A request to place the exact originals into the selected provisional scene
        // must send them: promote it to integration instead of a scene correction.
        if (parent?.result_path && parent.proposal.scene_workflow?.phase === "scene" &&
          intent.scene_workflow?.phase === "scene" && intent.visual_kind === "photo" && !intent.exact_text.length &&
          (!explicitSource || explicitSource.path === parent.result_path) &&
          asksIntegration(intent.operation, intent.change || [],
            resolvedReferences)) {
          const sw = intent.scene_workflow;
          intent.scene_workflow = { ...sw, phase: "integration",
            targets: sw.targets?.length ? sw.targets : parent.proposal.scene_workflow.targets,
            camera_match: sw.camera_match || parent.proposal.scene_workflow.camera_match };
          intent.uses_selected_version = true;
        }
        const phase = intent.scene_workflow?.phase;
        // On a selected scene branch, a clean product shot currently attached to
        // the request governs exact product fidelity. A worn shot is only a
        // fallback and must not silently displace the clean product photograph.
        if (phase === "integration" && parent?.proposal.scene_workflow?.phase === "scene" &&
          intent.scene_workflow?.targets?.some(target => target.role === "product")) {
          const preferred = preferredProductReference(references);
          if (preferred.ambiguous) {
            intent.operation = "clarify";
            intent.summary = "Plusieurs produits seuls sont joints. Choisis la photo du produit exact à intégrer avant de lancer l’image. Aucune image n’a été lancée.";
          } else if (preferred.reference) {
            const preferredReference = preferred.reference;
            for (let i = resolvedReferences.length - 1; i >= 0; i--) {
              if (resolvedReferences[i].role === "product" && resolvedReferences[i].id !== preferredReference.id) resolvedReferences.splice(i, 1);
            }
            if (!resolvedReferences.some(ref => ref.id === preferredReference.id)) resolvedReferences.push(preferredReference);
            intent.scene_workflow.targets = intent.scene_workflow.targets.map(target => target.role === "product"
              ? { ...target, reference_ids: [preferredReference.id] }
              : target);
          }
        }
        // A correction to the scene must not discard the reserved original just
        // because the interpreter omitted a planning-only image in reference_use.
        if (phase && intent.operation === "edit") {
          if (resolvedReferences.length + reservedProducts.filter(ref => !resolvedReferences.some(r => r.id === ref.id)).length > MAX_REFERENCES) {
            intent.operation = "clarify";
            intent.summary = "Retire une référence pour conserver le produit original avec cette scène (huit images maximum).";
          } else resolvedReferences.push(...reservedProducts.filter(ref => !resolvedReferences.some(r => r.id === ref.id)));
        }
        if (phase && intent.scene_workflow && generative(intent.operation)) {
          const previous = parent?.proposal?.scene_workflow;
          const sameBranch = !newPhoto && parent && (!explicitSource || explicitSource.path === parent.result_path);
          if (sameBranch && previous) {
            intent.scene_workflow = { ...previous, ...intent.scene_workflow,
              targets: intent.scene_workflow.targets || previous.targets };
          }
          const workflow = intent.scene_workflow!;
          const originals = resolvedReferences.filter(exactReference);
          workflow.targets = repairTargets(workflow.targets || [], originals,
            newRequest ? [] : conversation?.targets || [], intent.product_placement);
          if (!validTargets(workflow.targets, originals)) {
            const problems = targetProblems(workflow.targets, originals);
            console.warn("[visual-studio:targets]", JSON.stringify({ request_id: p.request_id, revision: session.revision, problems }));
            intent.operation = "clarify";
            intent.summary = problems.length === 1 && problems[0] === "unmapped_original" && originals.filter(r => r.role === "person" || r.role === "casting").length > 1
              ? "Ces portraits montrent-ils la même personne sous plusieurs angles, ou des personnes différentes ?"
              : "La préparation des références est incohérente. Tes photos et tes indications sont conservées ; renvoie ta demande pour réessayer. Aucune image n’a été lancée.";
          }
        }
        const sourcePath = intent.operation === "product"
          ? explicitSource?.role !== "product" ? explicitSource?.path || null : null
          : finalInputPath;
        const inputs = sceneInputs(phase, intent.operation, resolvedReferences,
          sourcePath, parent?.result_path || null, intent.uses_selected_version);
        if (phase === "scene" && generative(intent.operation) && (intent.visual_kind !== "photo" || intent.exact_text.length ||
          intent.shots.length || !["create", "edit"].includes(intent.operation) ||
          inputs.planning.some(ref => ref.path === inputs.input))) {
          intent.operation = "clarify";
          intent.summary = "Préparons d’abord une seule scène photographique provisoire, sans texte ajouté. Tes originaux seront intégrés après validation de cette scène.";
        }
        if (phase === "integration" && generative(intent.operation) && (!["product", "edit"].includes(intent.operation) || !inputs.input || !inputs.references.some(exactReference))) {
          intent.operation = "clarify";
          intent.summary = "Pour intégrer tes références, sélectionne la scène à conserver et joins les photos originales de la personne ou du produit.";
        }
        if (newPhoto && generative(intent.operation)) {
          const hasOriginals = inputs.planning.some(exactReference);
          intent.summary += hasOriginals
            ? " Je prépare d’abord la scène : personnes et objets à remplacer sont provisoires. Tu pourras voir et corriger cet aperçu avant d’y intégrer tes références originales."
            : " Je prépare cette nouvelle scène photographique.";
        }
        const editInput = inputs.input;
        const proposedRefs = inputs.references;
        const originalPath =
          ((intent.operation === "edit" || intent.operation === "background")
            ? effectiveReference?.path
            : resolvedReferences.find((r) => isIdentity(r.role))?.path) ||
          (parent && intent.operation !== "create"
            ? parent.proposal.original_path || null
            : ["background", "edit"].includes(intent.operation)
            ? effectiveReference?.path || null
            : null);

        const proposal = ["background", "create", "edit", "product"].includes(
            intent.operation,
          )
          ? {
            ...intent,
            ...(intent.scene_workflow ? { scene_workflow: { ...intent.scene_workflow,
              accepted_changes: [...new Set([
                ...(!newPhoto && parent && (!explicitSource || explicitSource.path === parent.result_path)
                  ? parent.proposal.scene_workflow?.accepted_changes || parent.proposal.change || [] : []),
                ...intent.change,
              ])].slice(-48),
            } } : {}),
            ...(person?.mode === "sheet" ? { visual_kind: "photo" as const, exact_text: [] } : {}),
            id: crypto.randomUUID(),
            viewed_version_id: intent.operation === "create" && !intent.uses_selected_version ? null : parent?.id || null,
            viewed_reference_id: inputs.snapshot.find(ref => ref.id === effectiveReference?.id)?.id || null,
            cost: 1 + (p.studio_version && p.studio_version >= 3 && generative(intent.operation)
              ? intent.shots.length
              : 0),
            shots: p.studio_version && p.studio_version >= 3 && generative(intent.operation)
              ? intent.shots.map((shot) => ({
                ...shot,
                id: crypto.randomUUID(),
                image_prompt: shot.image_prompt,
              }))
              : [],
            references: proposedRefs,
            reference_snapshot: inputs.snapshot,
            planning_references: phase === "scene" ? inputs.planning : [],
            scene_reference_signature: phase === "scene" ? referenceSignature([...references, ...addedMemoryReferences.filter(ref => !references.some(r => r.id === ref.id))]) : undefined,
            input_path: intent.operation === "background"
              ? finalInputPath
              : editInput,
            photo_source_path: inheritedPhotoSource({ ...intent, input_path: editInput }, parent),
            original_path: originalPath,
            subject_kind: resolvedReferences.find((r) => isIdentity(r.role))?.kind ||
              null,
            image_prompt: intent.image_prompt,
            ...(phase === "scene" && intent.operation === "create" ? { soul_style: resolveSoulStyle(intent.soul_style_id, availableSoulStyles), soul_style_options: availableSoulStyles } : {}),
            prompt_author: SONNET_MODEL,
            photo_treatment: intent.photo_treatment,
            composition: p.studio_version === 4 && generative(intent.operation)
              ? undefined
              : intent.composition,
            model: imageModel(intent.operation),
            provider: "default",
            rules_version: RULES_VERSION,
            brand_context: brandContext,
            warning: generative(intent.operation) &&
                (resolvedReferences.some((r) => isIdentity(r.role)) ||
                  (parent && intent.operation !== "create"))
              ? "Cette transformation redessine l’image. Elle peut modifier des détails du produit ou du visage. Compare le résultat aux références avant de l’utiliser."
              : null,
          }
          : !newRequest && dialogueOnly && intent.operation === "advise" ? session.proposal : null;
        if (proposal?.scene_workflow?.phase === "scene" && proposal.operation === "create") {
          if (!soul2Enabled()) return json({ error: "La création de scène est momentanément indisponible. Tes références sont conservées ; aucune autre génération n’a été lancée." }, 503);
          if (!soul2Eligible(proposal)) return json({ error: "La scène doit être préparée séparément de ses références. Aucune image n’a été lancée." }, 409);
          proposal.provider = "higgsfield"; proposal.model = SOUL2_MODEL;
        }
        if (proposal && marketingFidelityEligible(proposal) && higgsfieldImagesEnabled() &&
          imageInputPaths(proposal).length <= MARKETING_MAX_IMAGES) {
          Object.assign(proposal, routeToMarketingStudio(proposal));
        }

        const suggestions = intent.suggested_photo_ids.filter((id) =>
          (catalogue.data || []).some((row) => row.id === id)
        );
        const messages = [
          ...session.messages,
          {
            id: p.request_id,
            role: "user",
            text: p.message,
            reference_ids: requestReferences.map((ref) => ref.id),
            viewed_version_id: parent?.id || null,
            request_scope: newRequest ? "new" : "continue",
            reference_snapshot: resolvedReferences.map(({ id, name, path, role }) => ({ id, name, path, role })),
          },
          {
            role: "assistant",
            existing_tool: intent.existing_tool,
            preparation: intent.operation === "existing_tool" && intent.existing_tool === "preparation"
              ? intent.preparation
              : undefined,
            viewed_version_id: parent?.id || null,
            viewed_reference_id: selectedReference?.id || null,
            composition: intent.operation === "compose"
              ? intent.composition
              : undefined,
            text: intent.summary,
            operation: intent.operation,
            suggestions: intent.suggestions,
            suggested_photo_ids: suggestions,
            suggested_memory_ids: memoryToSelect.map((m) => m.id),
          },
        ];
        console.info("[visual-studio:turn]", JSON.stringify({ request_id: p.request_id, revision: session.revision,
          operation: rawOperation, final_operation: intent.operation, references: requestReferences.map(ref => ({ id: ref.id, role: ref.role })),
          scope: newRequest ? "new" : "continue", dialogue: dialogueOnly }));
        const updated = await sb
          .from("visual_studio_sessions")
          .update({
            messages,
            proposal,
            references: [
              ...references.map(ref => { const resolved = resolvedReferences.find(r => r.id === ref.id); return resolved ? { ...ref, role: resolved.role, role_source: resolved.role_source, role_explicit: resolved.role_explicit, subject_group: resolved.subject_group } : ref; }),
              ...addedMemoryReferences.filter(ref => !references.some(old => old.path === ref.path)),
            ],
            source_metadata: { ...session.source_metadata, studio_context: {
              reference_ids: requestReferences.map(ref => ref.id), branch_id: parent?.id || null,
              start_index: newRequest ? session.messages.length : conversation?.start_index || 0,
              targets: intent.scene_workflow?.targets || (newRequest ? [] : conversation?.targets || []),
              decisions: { ...(newRequest ? {} : conversation?.decisions || {}), ...(intent.operation === "advise" ? {} : intent.decisions || {}) },
            } },
            brief: dialogueOnly && !newRequest ? session.brief : intent.brief ||
              (parent
                ? parent.proposal.brief || parent.proposal.summary || ""
                : newRequest ? "" : session.brief || ""),
            ...(session.name === "Nouvelle idée"
              ? { name: p.message.slice(0, 100) }
              : {}),
            revision: session.revision + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.id)
          .eq("revision", p.revision)
          .select("*")
          .maybeSingle();
        if (updated.error) throw updated.error;
        if (!updated.data) {
          return json(
            {
              code: "refresh_request",
              error: "Une autre demande a modifié cette session. Recharge-la.",
            },
            409,
          );
        }
        session = updated.data;
      }
    }
    if (p.action === "composition_save") {
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
    }
    if (p.action === "pilot" || p.action === "retry") {
      if (session.revision !== p.revision) throw new Error("studio_conflict");
      const active = unwrap(
        await sb.from("visual_studio_versions").select("id").eq(
          "session_id",
          session.id,
        ).eq("status", "processing"),
      );
      if (active.length) throw new Error("studio_busy");
      let next = session.proposal;
      if (p.action === "retry") {
        const failed = unwrap(
          await sb.from("visual_studio_versions").select("proposal").eq(
            "id",
            p.version_id,
          ).eq("session_id", session.id).eq("status", "failed").single(),
        );
        next = {
          ...failed.proposal,
          id: crypto.randomUUID(),
          shots: [],
          cost: 1,
        };
        // New proposal (not a submitted job): apply the current routing so the
        // confirmation shows the provider that will really be used.
        if (higgsfieldImagesEnabled() && marketingFidelityEligible(next)) next = routeToMarketingStudio(next);
      } else {
        if (!next || next.id !== p.proposal_id || !next.shots?.length) {
          throw new Error("studio_conflict");
        }
        next = {
          ...next,
          id: crypto.randomUUID(),
          shots: [],
          cost: 1,
          summary: "Créer uniquement la première image prévue dans la série, pour valider sa direction avant la suite.",
          // The complete first-shot prompt remains authoritative; the plan-wide
          // change list can contain contradictory instructions for later shots.
          change: [],
        };
      }
      if (next?.provider === "higgsfield" && next.soul_style) resolveSoulStyle(next.soul_style.id, await soulStyles());
      session = unwrap(
        await sb.from("visual_studio_sessions").update({
          proposal: next,
          revision: session.revision + 1,
        }).eq("id", session.id).eq("revision", p.revision).select("*").single(),
      );
    }
    if (p.action === "integrate") {
      if (!p.version_id || !p.proposal_id || p.revision !== session.revision) throw new Error("studio_conflict");
      const source = unwrap(await sb.from("visual_studio_versions").select("*").eq("id", p.version_id).eq("session_id", session.id).eq("status", "ready").single());
      let next = await integrationProposal(source, references);
      if (!next || next.id !== p.proposal_id || p.approved_scene_id !== source.id) return json({ error: "La scène ou les références ont changé. Vérifie l’aperçu avant l’intégration." }, 409);
      const integrationQuota = await checkQuota(actor, "photo_retouch", p.workspace_id);
      if (!integrationQuota.allowed) return quotaDeniedResponse(integrationQuota, pipe.corsHeaders);
      if (!premiumAllowed(integrationQuota.plan, isQaTestAccount(actor))) return json({ error: "Cette création est disponible en Premium." }, 403);
      next = await prepareIntegration(next, path => visionFromStorage(sb, BUCKET, path));
      if (!(await canWrite(sb, actor, p.workspace_id))) return json({ error: "Les droits de cet espace ont changé." }, 403);
      // Persist the approval and immutable inputs before the existing atomic claim.
      session = unwrap(await sb.from("visual_studio_sessions").update({ proposal: { ...next,
        scene_workflow: { ...next.scene_workflow, approved_scene_id: source.id, approved_at: new Date().toISOString() } },
        revision: session.revision + 1, updated_at: new Date().toISOString(),
      }).eq("id", session.id).eq("revision", p.revision).select("*").single());
    }
    if (p.action === "generate" || p.action === "integrate") {
      if (!p.proposal_id) {
        return json({ error: "Confirme une proposition." }, 400);
      }
      const existing = await sb
        .from("visual_studio_versions")
        .select("id")
        .eq("id", p.proposal_id)
        .eq("session_id", session.id)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) {
        if (generative(session.proposal?.operation) && !p.studio_version) {
          return json(
            { error: "Recharge le Studio avant de confirmer cette création." },
            409,
          );
        }
        if (!session.proposal || session.proposal.id !== p.proposal_id) {
          return json(
            {
              error: "Cette proposition a changé. Vérifie la dernière demande.",
            },
            409,
          );
        }
        if (session.proposal.provider === "higgsfield" && session.proposal.soul_style) resolveSoulStyle(session.proposal.soul_style.id, await soulStyles());
        if (session.proposal.scene_workflow?.phase === "integration") {
          const workflow = session.proposal.scene_workflow;
          const baseId = session.proposal.viewed_version_id || session.proposal.viewed_reference_id;
          if (!workflow.approved_scene_id && (!baseId || p.approved_scene_id !== baseId || session.proposal.viewed_version_id && p.viewed_version_id !== baseId)) return json({ error: "Valide la scène affichée avant d’intégrer les références." }, 409);
          if (!workflow.approved_scene_id) {
            session = unwrap(await sb.from("visual_studio_sessions").update({ proposal: { ...session.proposal,
              scene_workflow: { ...workflow, scene_version_id: baseId, scene_path: session.proposal.input_path,
                approved_scene_id: baseId, approved_at: new Date().toISOString() } },
            }).eq("id", session.id).eq("revision", session.revision).select("*").single());
          }
        }
        // Pending proposals prepared before the temporary Higgsfield routing: reroute
        // BEFORE the atomic claim, so no OpenAI call and no resubmission can happen.
        if (marketingFidelityEligible(session.proposal) && higgsfieldImagesEnabled()) {
          if (imageInputPaths(session.proposal).length > MARKETING_MAX_IMAGES) {
            return json({ error: `Cette retouche utilise plus de ${MARKETING_MAX_IMAGES} images. Retire quelques références puis réessaie. Rien n’a été décompté.` }, 409);
          }
          session = unwrap(await sb.from("visual_studio_sessions").update({ proposal: routeToMarketingStudio(session.proposal) })
            .eq("id", session.id).eq("revision", session.revision).select("*").single());
        }
        // Old prepared direct-photo proposals must not bypass the new policy after reload.
        if (session.proposal.visual_kind === "photo" && session.proposal.person_reference?.mode !== "sheet" &&
          (session.proposal.operation === "create" || session.proposal.scene_workflow?.phase === "direct") &&
          (session.proposal.provider !== "higgsfield" || session.proposal.model !== SOUL2_MODEL)) {
          return json({ error: "Cette ancienne proposition doit être repréparée : une nouvelle photo commence par une scène à valider. Utilise Modifier ma demande." }, 409);
        }
        if (
          !Deno.env.get(
            generative(session.proposal.operation)
              ? (session.proposal.provider === "higgsfield"
                ? "HIGGSFIELD_API_KEY"
                : "OPENAI_API_KEY")
              : "PHOTOROOM_API_KEY",
          )
        ) {
          return json(
            { error: "Le service photo est momentanément indisponible." },
            503,
          );
        }
        const quota = await checkQuota(actor, "photo_retouch", p.workspace_id);
        if (quota.reason === "error") return quotaDeniedResponse(quota, pipe.corsHeaders);
        if (
          generative(session.proposal.operation) &&
          !premiumAllowed(quota.plan, isQaTestAccount(actor))
        ) {
          return json(
            {
              error:
                "Cette création est disponible en Premium. Rien n’a été décompté.",
            },
            403,
          );
        }
        if (!quota.allowed) return quotaDeniedResponse(quota, pipe.corsHeaders);
        const workflow = session.proposal.scene_workflow;
        if (workflow?.phase === "integration" && !session.proposal.integration_preparation &&
          session.proposal.input_path === workflow.scene_path) {
          const prepared = await prepareIntegration(session.proposal, path => visionFromStorage(sb, BUCKET, path));
          if (!(await canWrite(sb, actor, p.workspace_id))) return json({ error: "Les droits de cet espace ont changé." }, 403);
          session = unwrap(await sb.from("visual_studio_sessions").update({ proposal: prepared })
            .eq("id", session.id).eq("revision", session.revision).select("*").single());
        }
        // Check the final prepared prompt before creating a processing version or
        // reserving usage. Keep the proposal and originals available for editing.
        if (marketingPromptTooLong(session.proposal)) return json({ error: MARKETING_PROMPT_ERROR }, 409);
        const exempt = isQaTestAccount(actor) || quota.plan === "admin";
        const limits = PLAN_LIMITS[quota.plan] || PLAN_LIMITS.free;
        const claim = unwrap(
          await sb.rpc("studio_confirm_generation", {
            p_actor: actor,
            p_session: session.id,
            p_proposal: p.proposal_id,
            p_total_limit: quota.usage ? quota.usage.total.used + (quota.available_total ?? 0) : 9999,
            // Plafond DUR (grille du 01/10/2026) : les crédits bonus ne lèvent
            // plus le plafond images (cf. HARD_CAP_CATEGORIES, plan-limiter).
            p_image_limit: limits.photo_retouch,
            p_charge: !exempt,
            p_base_total: limits.total,
          }),
        );
        if (claim.claimed) {
          const batch = async () => {
            for (const version of (claim.versions || [claim.version])) {
              const readInputs = async () => {
                const proposal = version.proposal;
                const paths = imageInputPaths(proposal);
                // Very old snapshots without an explicit source must still use the
                // stored source as pixels, with the same manifest and prompt roles.
                if (!paths.length && proposal.operation !== "create" && session.source_path) {
                  proposal.input_path = session.source_path;
                  paths.push(...imageInputPaths(proposal));
                }
                return Promise.all(
                  paths
                    .filter(Boolean)
                    .map((path: string) => download(sb, BUCKET, path)),
                );
              };
              const work = version.proposal.provider === "higgsfield"
                ? (async () => {
                  let inputs: Blob[];
                  try {
                    if (!(await canWrite(sb, actor, p.workspace_id))) throw new Error("Droits retirés");
                    inputs = await readInputs();
                  } catch {
                    await failHiggsfieldImage(sb, version.id);
                    return;
                  }
                  // Once submission starts, a lost receipt must never become a retryable failure.
                  await submitHiggsfieldImage(sb, version, inputs);
                })().catch((error) => console.error("[studio:higgsfield-worker]", error instanceof Error ? error.message : "worker failed"))
                : executeStudioJob({
                  readSource: readInputs,
                  generate: async (inputs) => {
                    if (!(await canWrite(sb, actor, p.workspace_id))) {
                      throw new Error("Droits retirés");
                    }
                    return generateImage(version.proposal, inputs);
                  },
                  store: (blob) => store(sb, BUCKET, version.result_path, blob),
                  complete: async () => {
                    unwrap(
                      await sb.rpc("studio_complete_generation", {
                        p_version: version.id,
                      }),
                    );
                  },
                  fail: async () => {
                    unwrap(
                      await sb
                        .from("visual_studio_versions")
                        .update({
                          status: "failed",
                          error_message:
                            "La création a échoué. Aucune image décomptée.",
                          completed_at: new Date().toISOString(),
                        })
                        .eq("id", version.id)
                        .eq("status", "processing")
                        .select("id")
                      .single(),
                    );
                  },
                  uncertain: async () => {
                    unwrap(
                      await sb.from("visual_studio_versions").update({
                        status: "uncertain",
                        error_message:
                          "La réponse du service photo a été perdue. Le résultat est incertain. Aucun crédit Studio n’a été décompté pour l’instant ; si l’image est retrouvée, elle comptera une fois. Recharge la session pour vérifier son état avant de relancer cette demande.",
                        completed_at: new Date().toISOString(),
                      }).eq("id", version.id).eq("status", "processing")
                        .select("id").single(),
                    );
                  },
                }).catch(() =>
                  console.error(
                    "[visual-studio] task state could not be persisted",
                  )
                );
              await work;
            }
          };
          if (typeof EdgeRuntime !== "undefined") {
            EdgeRuntime.waitUntil(batch());
          } else await batch();
        }
      }
    }
    if (p.action === "save") {
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
      } else if (
        v.status === "processing" &&
        object.error &&
        (("statusCode" in object.error &&
          String(object.error.statusCode) === "404") ||
          object.error.message === "Object not found")
      ) {
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
          integration_proposal: await (async () => { const next = await integrationProposal(v, legacyReferences(session)); return next ? { ...next,
            references: await Promise.all(next.references.map(async ref => ({ ...ref, url: await sign(ref.path) }))) } : null; })(),
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      "[visual-studio]",
      message.replace(/https?:\/\/\S+/g, "[url]"),
    );
    const known: Record<string, string> = {
      studio_soul_style_unavailable: "Ce preset Soul n’est plus disponible. Modifie ta demande ou choisis sans preset.",
      studio_soul_prompt_missing: "La consigne photographique est incomplète. Modifie ta demande avant de générer.",
      studio_integration_sources: "Chaque personne et produit doit être associé à ses originaux. Reprécise les références avant l’intégration.",
      studio_reference_limit:
        "Garde jusqu’à huit références. Retire une référence avant d’ajouter cette direction.",
      studio_image_too_large:
        "Cette photo dépasse 5 Mo. Ajoute une version plus légère pour que le Studio puisse l’examiner.",
      studio_interpretation_limit:
        "Tu as envoyé beaucoup de demandes. Réessaie un peu plus tard.",
      studio_memory_limit:
        "La marque conserve déjà 100 éléments. Retire une ancienne préférence pour en ajouter une.",
      studio_casting_source:
        "Choisis une image de mannequin fictif. Une photo de personne réelle ne devient pas un mannequin fictif.",
      studio_busy:
        "Une image est déjà en cours dans cet espace. Reprends sa session.",
      studio_quota: "Le quota a changé. Recharge la session.",
      studio_proposal_changed:
        "Cette proposition a changé. Vérifie la dernière demande.",
      studio_conflict: "La session a changé. Recharge-la.",
      studio_archived: "Cette session est archivée. Restaure-la pour continuer.",
    };
    const key = Object.keys(known).find((k) => message.includes(k));
    return json(
      {
        error: key
          ? known[key]
          : message.startsWith("Intégration à préciser :") ? message : "Le Studio est momentanément indisponible. Ta demande reste conservée ; réessaie.",
      },
      key ? 409 : 503,
    );
  }
}

if (import.meta.main) serve(handleStudioRequest);
