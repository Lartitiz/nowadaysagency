import { compositionSchema } from "./composition.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { callAnthropic } from "../_shared/anthropic.ts";
import {
  checkQuota,
  getBonusCredits,
  getServiceClient,
  isQaTestAccount,
  PLAN_LIMITS,
  quotaDeniedResponse,
} from "../_shared/plan-limiter.ts";
import {
  generative,
  intentSchema,
  intentTool,
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
  failHiggsfieldImage,
  higgsfieldImagesEnabled,
  imageCallback,
  reconcileHiggsfieldImage,
  submitHiggsfieldImage,
} from "./higgsfield-image.ts";
import { handleMemory, readMemory } from "./memory.ts";
import { executeStudioJob } from "./worker.ts";
import { referencesAtVersion, referencesDiffer } from "./branch-context.ts";

declare const EdgeRuntime: { waitUntil: (work: Promise<unknown>) => void };
const schema = z.object({
  studio_version: z.union([z.literal(2), z.literal(3)]).optional(),
  action: z.enum([
    "create",
    "read",
    "message",
    "generate",
    "save",
    "reference",
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
  composition: compositionSchema.optional(),
  composition_use_image: z.boolean().optional(),
  composition_history_id: z.string().uuid().optional(),
  charter_index: z.number().int().min(0).max(8).optional(),
  reference_id: z.string().uuid().optional(),
  memory_id: z.string().uuid().optional(),
  memory_revision: z.number().int().min(-1).optional(),
  memory_kind: z.enum(["preference", "direction", "casting"]).optional(),
  memory_name: z.string().trim().min(1).max(120).optional(),
  memory_note: z.string().trim().min(1).max(1500).optional(),
  fictional_model: z.literal(true).optional(),
  remove: z.boolean().optional(),
  viewed_reference_id: z.string().uuid().nullable().optional(),
  proposal_id: z.string().uuid().optional(),
  version_id: z.string().uuid().optional(),
  viewed_version_id: z.string().uuid().nullable().optional(),
  branch_reference_mode: z.enum(["version", "current"]).optional(),
  revision: z.number().int().nonnegative().optional(),
  message: z.string().trim().min(1).max(1000).optional(),
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
  return await visionBlock(await download(sb, bucket, path), async (width) => {
    const { data, error } = await sb.storage.from(bucket).download(path, {
      transform: { width, quality: 75, resize: "contain" },
    });
    return error ? null : data;
  });
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
    !!r && typeof r === "object" && "path" in r && typeof r.path === "string" &&
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
    if (p.action === "reference") {
      if (
        (!p.photo_id && !p.reference_id && p.charter_index == null) ||
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
        p.reference_id ? r.id === p.reference_id : r.photo_id === p.photo_id;
      const found = references.find(matches);
      if (p.remove) {
        references = references.filter((r) => !matches(r));
      } else if (found) {
        references = references.map((r) =>
          r === found ? { ...r, role: p.reference_role || "subject" } : r
        );
      } else {
        if (!p.photo_id && p.charter_index == null) {
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
        const photo = charterImage ? null : unwrap(
          await sb.from("user_photos").select("*")
            .eq("id", p.photo_id).eq("workspace_id", p.workspace_id).eq(
              "status",
              "ready",
            ).is("removed_from_library_at", null).single(),
        );
        const id = crypto.randomUUID(),
          path = `${p.workspace_id}/${session.id}/reference-${id}`;
        const blob = await download(
          sb,
          charterImage ? "moodboards" : "user-photos",
          charterImage?.path || photo!.storage_path,
        );
        await store(sb, BUCKET, path, blob);
        references = [
          ...references,
          {
            id,
            photo_id: photo?.id || null,
            path,
            role: charterImage ? "style" : p.reference_role || "subject",
            name: (charterImage?.name || photo?.name || "Référence").slice(
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
        const parent = p.viewed_version_id
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
        if (changedReferences && !p.branch_reference_mode) {
          return json({
            code: "branch_reference_choice",
            error:
              "Les références ont changé depuis cette version. Choisis celles à utiliser avant d’envoyer ; aucune image n’a été lancée.",
          }, 409);
        }
        const requestReferences = changedReferences &&
            p.branch_reference_mode === "version"
          ? versionReferences
          : references;
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
                "color_primary,color_secondary,color_accent,color_background,color_text,font_title,font_body,photo_style,mood_keywords,visual_donts,moodboard_description",
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
        const selectedReference = requestReferences.find((r) =>
          r.id === p.viewed_reference_id
        ) ||
          requestReferences.find((r) => isIdentity(r.role)) ||
          requestReferences[0];
        const inputPath = parent?.result_path || selectedReference?.path ||
          null;
        const vision = [];
        if (parent) {
          vision.push({
            type: "text",
            text: "Version sélectionnée à modifier",
          });
          vision.push(await visionFromStorage(sb, BUCKET, parent.result_path));
        }
        for (const ref of requestReferences) {
          vision.push({
            type: "text",
            text: `Référence ${ref.id} : ${ref.role}, ${ref.name}`,
          });
          vision.push(await visionFromStorage(sb, BUCKET, ref.path));
        }
        let intent: ReturnType<typeof intentSchema.parse>;
        try {
          const raw = await callAnthropic({
            model: "claude-haiku-4-5",
            system: studioSystem,
            tool: intentTool,
            // Supplied titles, dates and time ranges must survive structured output verbatim.
            keepDashes: true,
            max_tokens: 6000,
            temperature: 0.2,
            abortTimeoutMs: 30_000,
            maxRetries: 0,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      composition_editable: !parent && session.composition ? { ...session.composition.design, logo_data_url: undefined, logo_present: !!session.composition.design?.logo_data_url } : null,
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
                          brief: parent.proposal.brief,
                          summary: parent.proposal.summary,
                          preserve: parent.proposal.preserve,
                          change: parent.proposal.change,
                        }
                        : null,
                      brief: parent
                        ? parent.proposal.brief || parent.proposal.summary || ""
                        : session.brief || "",
                      historique: parent ? [] : session.messages.slice(-12),
                      catalogue: (catalogue.data || []).map((row) => ({
                        ...row,
                        description: row.description?.slice(0, 250),
                      })),
                      demande: p.message,
                    }),
                  },
                  ...vision,
                ],
              },
            ],
          });
          intent = intentSchema.parse(JSON.parse(raw));
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
        // The model cannot invent a real reference or authorize a source-free identity reconstruction.
        if (
          (["background", "edit", "product"].includes(intent.operation) &&
            !inputPath) ||
          ((intent.requires_real_subject || intent.operation === "product") &&
            !requestReferences.some((r) => isIdentity(r.role)))
        ) {
          intent.operation = "clarify";
          intent.summary =
            "Pour représenter fidèlement cette personne ou ce produit, choisis sa photo dans la bibliothèque. Tu peux aussi me demander une illustration sans représentation réelle.";
        }
        const normalizeName = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        const requestText = ` ${normalizeName(p.message)} `;
        const memoryToSelect = memory.filter((m) => m.kind !== "preference" &&
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
        const editInput = parent?.result_path ||
          (intent.operation === "edit" ? selectedReference?.path : null) ||
          null;
        const proposedRefs = intent.operation === "background"
          ? []
          : requestReferences.filter((r) => r.path !== editInput);
        const originalPath =
          (selectedReference && isIdentity(selectedReference.role)
            ? selectedReference.path
            : null) ||
          requestReferences.find((r) => isIdentity(r.role))?.path ||
          (parent
            ? parent.proposal.original_path || null
            : ["background", "edit"].includes(intent.operation)
            ? selectedReference?.path || null
            : null);
        const proposal = ["background", "create", "edit", "product"].includes(
            intent.operation,
          )
          ? {
            ...intent,
            id: crypto.randomUUID(),
            viewed_version_id: parent?.id || null,
            viewed_reference_id: selectedReference?.id || null,
            cost: 1 + (p.studio_version === 3 && generative(intent.operation)
              ? intent.shots.length
              : 0),
            shots: p.studio_version === 3 && generative(intent.operation)
              ? intent.shots.map((shot) => ({
                ...shot,
                id: crypto.randomUUID(),
              }))
              : [],
            references: proposedRefs,
            reference_snapshot: requestReferences,
            input_path: intent.operation === "background"
              ? inputPath
              : editInput,
            original_path: originalPath,
            subject_kind: requestReferences.find((r) => isIdentity(r.role))?.kind ||
              null,
            model: generative(intent.operation) && higgsfieldImagesEnabled()
              ? `marketing-studio/image/${
                intent.operation === "create" ? "flare" : "sunburst"
              }`
              : imageModel(intent.operation),
            provider: generative(intent.operation) && higgsfieldImagesEnabled()
              ? "higgsfield"
              : "default",
            rules_version: RULES_VERSION,
            brand_context: brandContext,
            warning: generative(intent.operation) &&
                (requestReferences.some((r) => isIdentity(r.role)) || parent)
              ? "Cette transformation redessine l’image. Elle peut modifier des détails du produit ou du visage. Compare le résultat aux références avant de l’utiliser."
              : null,
          }
          : null;
        const suggestions = intent.suggested_photo_ids.filter((id) =>
          (catalogue.data || []).some((row) => row.id === id)
        );
        const messages = [
          ...session.messages,
          { id: p.request_id, role: "user", text: p.message },
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
        const updated = await sb
          .from("visual_studio_sessions")
          .update({
            messages,
            proposal,
            brief: intent.brief ||
              (parent
                ? parent.proposal.brief || parent.proposal.summary || ""
                : session.brief || ""),
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
      session = unwrap(
        await sb.from("visual_studio_sessions").update({
          proposal: next,
          revision: session.revision + 1,
        }).eq("id", session.id).eq("revision", p.revision).select("*").single(),
      );
    }
    if (p.action === "generate") {
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
        const exempt = isQaTestAccount(actor) || quota.plan === "admin",
          bonus = exempt ? 0 : await getBonusCredits(sb, actor);
        const limits = PLAN_LIMITS[quota.plan] || PLAN_LIMITS.free;
        const claim = unwrap(
          await sb.rpc("studio_confirm_generation", {
            p_actor: actor,
            p_session: session.id,
            p_proposal: p.proposal_id,
            p_total_limit: quota.usage?.total.limit ?? 9999,
            p_image_limit: bonus > 0
              ? (quota.usage?.total.limit ?? 9999)
              : limits.photo_retouch,
            p_charge: !exempt,
            p_base_total: limits.total,
          }),
        );
        if (claim.claimed) {
          const batch = async () => {
            for (const version of (claim.versions || [claim.version])) {
              const readInputs = async () => {
                const proposal = version.proposal;
                const paths = proposal.references
                  ? [
                    ...(proposal.input_path ? [proposal.input_path] : []),
                    ...proposal.references.map((r: Reference) => r.path),
                  ]
                  : [session.source_path];
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
        v.status === "processing" && v.proposal.provider === "higgsfield"
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
    const sign = async (path: string) =>
      unwrap(await sb.storage.from(BUCKET).createSignedUrl(path, 900))
        .signedUrl;
    const quota = await checkQuota(actor, "photo_retouch", p.workspace_id);
    return json({
      session: {
        ...session,
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
      generative_allowed: premiumAllowed(quota.plan, isQaTestAccount(actor)),
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
          : "Le Studio est momentanément indisponible. Ta demande reste conservée ; réessaie.",
      },
      key ? 409 : 503,
    );
  }
}

if (import.meta.main) serve(handleStudioRequest);
