import { soulStyles } from "./soul-direction.ts";
import { activeReferences, adviceTurn, independentRequest, type ConversationContext } from "./conversation.ts";
import { exactReference } from "./scene-workflow.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { schema } from "./request-schema.ts";
import { unwrap } from "./storage.ts";
import { translateStudioError } from "./errors.ts";
import type { StudioContext } from "./actions/context.ts";
import { archiveSession, createSession, readComposition, selectReferences } from "./actions/session.ts";
import { updateReference } from "./actions/reference.ts";
import { saveComposition } from "./actions/composition.ts";
import { saveToLibrary } from "./actions/save.ts";
import { prepareNextProposal } from "./actions/pilot.ts";
import { generate } from "./actions/generate.ts";
import { readState } from "./read-state.ts";
import { loadBrandContext } from "./turn/brand-context.ts";
import { interpret } from "./turn/interpret.ts";
import { saveProposal } from "./turn/proposal.ts";
import { applyGuardrails, type TurnContext } from "./turn/guardrails.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import {
  getServiceClient,
} from "../_shared/plan-limiter.ts";
import {
  legacyReferences,
  type Reference,
} from "./media.ts";
import {
  MAX_REFERENCES,
} from "./competencies.ts";
import {
  imageCallback,
} from "./higgsfield-image.ts";
import { handleMemory } from "./memory.ts";
import { isWornProduct, onlyAdditions, preferredProductGroup, referencesAtVersion, referencesDiffer } from "./branch-context.ts";

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
  const ctx: StudioContext = { sb, actor, p, json, corsHeaders: pipe.corsHeaders };
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
    const sessionResult = await sb
      .from("visual_studio_sessions")
      .select("*")
      .eq("id", p.session_id)
      .eq("workspace_id", p.workspace_id)
      .maybeSingle();
    if (sessionResult.error) throw sessionResult.error;
    if (p.action === "create") {
      const refused = await createSession(ctx, sessionResult);
      if (refused) return refused;
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
      session = await archiveSession(ctx, session);
    } else if (session.archived_at && !["read", "composition_read"].includes(p.action)) {
      throw new Error("studio_archived");
    }
    if (p.action === "composition_read") return await readComposition(ctx, session);
    let references: Reference[] = legacyReferences(session);
    if (p.action === "memory_save" || p.action === "memory_apply") {
      session = await handleMemory(sb, actor, p, session, references);
      references = legacyReferences(session);
    }
    if (p.action === "selection") {
      const result = await selectReferences(ctx, session, references);
      if (result instanceof Response) return result;
      session = result;
    }
    if (p.action === "reference") {
      const result = await updateReference(ctx, session, references);
      if (result instanceof Response) return result;
      session = result;
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
        // not user choices: they never cause a conflict and are left out, unless
        // still attached (e.g. a generated model joined to this request).
        const versionIds = new Set(versionReferences.map((r) => r.id));
        const attachedNow = new Set(activeReferences(session, references));
        const userReferences = parent
          ? references.filter((r) => !r.version_id || r.version_id === parent.id || versionIds.has(r.id) || attachedNow.has(r.id))
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
        // A scene keeps its own references plus the photos added since: those can
        // only be the originals to integrate into it.
        const availableReferences = changedReferences &&
            branchMode === "version" && !sceneKeepsRefs
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
        // Once a clean product shot is attached, a worn photo of it is never
        // reinjected from an earlier version: it made the generator copy the
        // blurry worn ring instead of the exact product.
        const cleanProductGroup = preferredProductGroup(references);
        const wornIds = new Set(references.filter(isWornProduct).map(ref => ref.id));
        const excludedWorn = (ref: Reference) => cleanProductGroup.references.length > 0 &&
          (isWornProduct(ref) || wornIds.has(ref.id));
        const reservedProducts: Reference[] = (parent?.proposal?.scene_workflow?.phase === "scene"
          ? parent.proposal.planning_references || []
          : parent?.proposal?.scene_workflow?.phase === "integration"
          ? (parent.proposal.reference_snapshot || []).filter(exactReference) : [])
          .filter((ref: Reference) => !excludedWorn(ref));
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
        const { memory, brandContext, catalogue } = await loadBrandContext(ctx, p.message);
        const interpreted = await interpret(ctx, { requestReferences, parent, session, conversation, conversational,
          newRequest, reservedProducts, memory, brandContext, catalogue });
        if (interpreted instanceof Response) return interpreted;
        const { statedRoles, selectedReference, vision, availableSoulStyles, interpreterArgs } = interpreted;
        const ruled = await applyGuardrails(ctx as TurnContext, { session, parent, references, requestReferences, reservedProducts, cleanProductGroup, excludedWorn, versionIds, statedRoles, selectedReference, vision, interpreterArgs, intent: interpreted.intent, memory, conversation, newRequest });
        if (ruled instanceof Response) return ruled;
        const { intent, rawOperation, dialogueOnly, person, addedMemoryReferences, resolvedReferences, explicitSource, effectiveReference, finalInputPath, memoryToSelect, newPhoto, phase, inputs } = ruled;
        const saved = await saveProposal(ctx, { session, parent, references, requestReferences, resolvedReferences, addedMemoryReferences, message: p.message, selectedReference, explicitSource, effectiveReference, finalInputPath, inputs, intent, rawOperation, dialogueOnly, newPhoto, newRequest, person, phase, availableSoulStyles, memoryToSelect, conversation, brandContext, catalogue });
        if (saved instanceof Response) return saved;
        session = saved;
      }
    }
    if (p.action === "composition_save") session = await saveComposition(ctx, session, references);
    if (p.action === "pilot" || p.action === "retry") session = await prepareNextProposal(ctx, session);
    if (p.action === "generate") {
      const result = await generate(ctx, session);
      if (result instanceof Response) return result;
      session = result;
    }
    if (p.action === "save") return await saveToLibrary(ctx, session);
    return await readState(ctx, session, writable);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      "[visual-studio]",
      message.replace(/https?:\/\/\S+/g, "[url]"),
    );
    const translated = translateStudioError(message);
    return json({ error: translated.error }, translated.status);
  }
}

if (import.meta.main) serve(handleStudioRequest);
