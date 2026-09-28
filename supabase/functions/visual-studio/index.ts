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
  intentSchema,
  intentTool,
  studioSystem,
  shouldRecover,
} from "./contract.ts";
import { executeStudioJob } from "./worker.ts";

declare const EdgeRuntime: { waitUntil: (work: Promise<unknown>) => void };
const schema = z.object({
  action: z.enum(["create", "read", "message", "generate", "save"]),
  workspace_id: z.string().uuid(),
  session_id: z.string().uuid(),
  photo_id: z.string().uuid().optional(),
  proposal_id: z.string().uuid().optional(),
  version_id: z.string().uuid().optional(),
  viewed_version_id: z.string().uuid().nullable().optional(),
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
  if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || blob.size > 15_000_000)
    throw new Error("Photo non prise en charge");
  return blob;
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
export async function handleStudioRequest(req: Request): Promise<Response> {
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
    if (p.action !== "read" && !writable)
      return json({ error: "Cet espace est en lecture seule." }, 403);
    let sessionResult = await sb
      .from("visual_studio_sessions")
      .select("*")
      .eq("id", p.session_id)
      .eq("workspace_id", p.workspace_id)
      .maybeSingle();
    if (sessionResult.error) throw sessionResult.error;
    if (p.action === "create") {
      if (!p.photo_id) return json({ error: "Choisis une photo." }, 400);
      const photo = unwrap(
        await sb
          .from("user_photos")
          .select("*")
          .eq("id", p.photo_id)
          .eq("workspace_id", p.workspace_id)
          .eq("status", "ready")
          .single(),
      );
      if (sessionResult.data && sessionResult.data.source_photo_id !== photo.id)
        return json({ error: "Cette session utilise une autre photo." }, 409);
      if (!sessionResult.data) {
        const { error } = await sb.from("visual_studio_sessions").insert({
          id: p.session_id,
          workspace_id: p.workspace_id,
          user_id: actor,
          source_photo_id: photo.id,
          name: (photo.name || "Ma session photo").slice(0, 120),
          source_path: `${p.workspace_id}/${p.session_id}/original`,
          source_metadata: {
            kind: photo.kind,
            description: photo.description,
            input_path: photo.original_storage_path || photo.storage_path,
          },
          messages: [
            {
              role: "assistant",
              text: "Décris le nouveau fond que tu aimerais. Le sujet de ta photo sera conservé. Tu vérifieras la demande et son coût avant de lancer.",
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
      if (sourceSession.source_photo_id !== photo.id)
        throw new Error("studio_conflict");
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
          )
            throw uploaded.error;
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
    if (!session.source_ready)
      return json(
        {
          error:
            "La photo de départ n’a pas pu être conservée. Réessaie son ouverture.",
        },
        409,
      );
    if (p.action === "message") {
      if (!p.message || p.revision == null || !p.request_id)
        return json({ error: "Demande incomplète." }, 400);
      // A lost acknowledgement is replayed without paying the interpreter again.
      if (
        !(session.messages as Array<{ id?: string }>).some(
          (m) => m.id === p.request_id,
        )
      ) {
        if (session.revision !== p.revision)
          return json(
            {
              code: "refresh_request",
              error: "La session a changé. Recharge-la avant d’envoyer.",
            },
            409,
          );
        if (
          (session.messages as Array<{ role: string }>).filter(
            (m) => m.role === "user",
          ).length >= 50
        )
          return json(
            {
              error:
                "Cette session contient déjà 50 demandes. Ouvre une nouvelle session depuis la photo.",
            },
            429,
          );
        if (p.viewed_version_id)
          unwrap(
            await sb
              .from("visual_studio_versions")
              .select("id")
              .eq("id", p.viewed_version_id)
              .eq("session_id", session.id)
              .eq("status", "ready")
              .single(),
          );
        const { data: active, error: activeError } = await sb
          .from("visual_studio_versions")
          .select("id")
          .eq("session_id", session.id)
          .eq("status", "processing")
          .limit(1);
        if (activeError) throw activeError;
        if (active?.length)
          return json(
            {
              error: "Attends le résultat en cours avant une nouvelle demande.",
            },
            409,
          );
        const reserved = unwrap(
          await sb.rpc("studio_reserve_interpretation", {
            p_actor: actor,
            p_session: session.id,
            p_request: p.request_id,
          }),
        );
        if (!reserved)
          return json(
            {
              code: "refresh_request",
              error:
                "Cette demande a déjà été reçue. Recharge la session ; si elle n’a pas abouti, renvoie-la.",
            },
            409,
          );
        const charter = await sb
          .from("brand_charter")
          .select(
            "photo_style,mood_keywords,visual_donts,moodboard_description",
          )
          .eq("workspace_id", p.workspace_id)
          .maybeSingle();
        if (charter.error) throw charter.error;
        const raw = await callAnthropic({
          model: "claude-haiku-4-5",
          system: studioSystem,
          tool: intentTool,
          max_tokens: 600,
          temperature: 0.2,
          abortTimeoutMs: 25_000,
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                photo: session.source_metadata,
                marque: charter.data,
                historique: session.messages.slice(-12),
                demande: p.message,
              }),
            },
          ],
        });
        const intent = intentSchema.parse(JSON.parse(raw));
        const proposal =
          intent.operation === "background"
            ? {
                ...intent,
                id: crypto.randomUUID(),
                viewed_version_id: p.viewed_version_id || null,
                cost: 1,
              }
            : null;
        const messages = [
          ...session.messages,
          { id: p.request_id, role: "user", text: p.message },
          {
            role: "assistant",
            text: intent.summary,
            operation: intent.operation,
          },
        ];
        const updated = await sb
          .from("visual_studio_sessions")
          .update({
            messages,
            proposal,
            revision: session.revision + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.id)
          .eq("revision", p.revision)
          .select("*")
          .maybeSingle();
        if (updated.error) throw updated.error;
        if (!updated.data)
          return json(
            {
              code: "refresh_request",
              error: "Une autre demande a modifié cette session. Recharge-la.",
            },
            409,
          );
        session = updated.data;
      }
    }
    if (p.action === "generate") {
      if (!p.proposal_id)
        return json({ error: "Confirme une proposition." }, 400);
      const existing = await sb
        .from("visual_studio_versions")
        .select("id")
        .eq("id", p.proposal_id)
        .eq("session_id", session.id)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) {
        if (!Deno.env.get("PHOTOROOM_API_KEY"))
          return json(
            { error: "Le service photo est momentanément indisponible." },
            503,
          );
        const quota = await checkQuota(actor, "photo_retouch", p.workspace_id);
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
            p_image_limit:
              bonus > 0
                ? (quota.usage?.total.limit ?? 9999)
                : limits.photo_retouch,
            p_charge: !exempt,
            p_base_total: limits.total,
          }),
        );
        if (claim.claimed) {
          const version = claim.version;
          const work = executeStudioJob({
            readSource: () => download(sb, BUCKET, session.source_path),
            generate: async (original) => {
              if (!(await canWrite(sb, actor, p.workspace_id)))
                throw new Error("Droits retirés");
              const form = new FormData();
              form.append("imageFile", original, "source.jpg");
              form.append("referenceBox", "originalImage");
              form.append(
                "background.prompt",
                version.proposal.background_prompt,
              );
              form.append("removeBackground", "true");
              form.append("outputSize", "originalImage");
              form.append("export.format", "jpeg");
              const response = await fetch(
                "https://image-api.photoroom.com/v2/edit",
                {
                  method: "POST",
                  headers: { "x-api-key": Deno.env.get("PHOTOROOM_API_KEY")! },
                  body: form,
                  signal: AbortSignal.timeout(60_000),
                },
              );
              if (!response.ok) throw new Error("Échec fournisseur");
              const blob = await response.blob();
              if (blob.type !== "image/jpeg" || blob.size > 15_000_000)
                throw new Error("Réponse image invalide");
              return blob;
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
          }).catch(() =>
            console.error("[visual-studio] task state could not be persisted"),
          );
          if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
          else await work;
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
        const [result, original] = await Promise.all([
          download(sb, BUCKET, v.result_path),
          download(sb, BUCKET, session.source_path),
        ]);
        await store(
          sb,
          "user-photos",
          `${v.user_id}/studio_${v.id}.jpg`,
          result,
        );
        await store(
          sb,
          "user-photos",
          `${v.user_id}/studio_${v.id}_original.jpg`,
          original,
        );
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
    for (const v of versions.filter(
      (v) => v.status === "processing" && shouldRecover(v.created_at),
    )) {
      // Reconcile stored outputs after a worker timeout. Never reissue a provider request.
      const object = await sb.storage.from(BUCKET).download(v.result_path);
      if (object.data)
        unwrap(await sb.rpc("studio_complete_generation", { p_version: v.id }));
      else if (
        object.error &&
        (("statusCode" in object.error &&
          String(object.error.statusCode) === "404") ||
          object.error.message === "Object not found")
      ) {
        unwrap(
          await sb
            .from("visual_studio_versions")
            .update({
              status: "failed",
              error_message:
                "Le résultat n’a pas pu être récupéré. Aucune image décomptée.",
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
    const sign = async (path: string) =>
      unwrap(await sb.storage.from(BUCKET).createSignedUrl(path, 900))
        .signedUrl;
    const quota = await checkQuota(actor, "photo_retouch", p.workspace_id);
    return json({
      session: { ...session, source_url: await sign(session.source_path) },
      versions: await Promise.all(
        versions.map(async (v) => ({
          ...v,
          url: v.status === "ready" ? await sign(v.result_path) : null,
        })),
      ),
      quota,
      writable,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      "[visual-studio]",
      message.replace(/https?:\/\/\S+/g, "[url]"),
    );
    const known: Record<string, string> = {
      studio_interpretation_limit:
        "Tu as envoyé beaucoup de demandes. Réessaie un peu plus tard.",
      studio_busy:
        "Une image est déjà en cours dans cet espace. Reprends sa session.",
      studio_quota: "Le quota a changé. Recharge la session.",
      studio_proposal_changed:
        "Cette proposition a changé. Vérifie la dernière demande.",
      studio_conflict: "La session a changé. Recharge-la.",
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
