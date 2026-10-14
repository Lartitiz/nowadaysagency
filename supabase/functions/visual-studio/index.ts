import { imageInputPaths, inheritedPhotoSource } from "./photo-preservation.ts";
import { soulStyles, selectSoulStyles, resolveSoulStyle } from "./soul-direction.ts";
import { activeReferences, adviceTurn, independentRequest, explicitRoles, dialogueHistory, CONVERSATION_SYSTEM, type ConversationContext } from "./conversation.ts";
import { exactReference, validTargets, repairTargets, targetProblems, sceneInputs, asksIntegration, sceneWithoutPlaceholders, withoutPlaceholders } from "./scene-workflow.ts";
import { resolvePersonMemory } from "./person-reference.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { schema } from "./request-schema.ts";
import { BUCKET, unwrap, visionFromStorage } from "./storage.ts";
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
import { runPipeline } from "../_shared/request-pipeline.ts";
import { callAnthropic, SONNET_MODEL } from "../_shared/anthropic.ts";
import {
  getServiceClient,
} from "../_shared/plan-limiter.ts";
import {
  cleanStudioSummary,
  generative,
  intentSchema,
  intentTool,
  conversationTool,
  studioSystem,
} from "./contract.ts";
import {
  imageModel,
  legacyReferences,
  type Reference,
} from "./media.ts";
import {
  COMPETENCIES,
  isIdentity,
  MAX_REFERENCES,
  RULES_VERSION,
} from "./competencies.ts";
import {
  SOUL2_MODEL, soul2Enabled, soul2Eligible,
  higgsfieldImagesEnabled,
  marketingFidelityEligible,
  MARKETING_MAX_IMAGES,
  routeToMarketingStudio,
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
                          ...(sceneWithoutPlaceholders(parent.proposal.scene_workflow, parent.proposal.planning_references)
                            ? { sujets_provisoires: "aucun : décor vide. Les originaux y sont AJOUTÉS ; ne parle jamais de personne, de visage ni de produit provisoire à remplacer." }
                            : {}),
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
        // The selected scene is also joined as a "Décor à conserver" reference: the
        // interpreter may name it by its version ID with any base role (03/10/2026).
        if (parent && (intent.source_reference_id === parent.id ||
          intent.reference_use.some(use => use.id === parent.id && ["composition", "scene", "edit_source"].includes(use.role)))) {
          if (intent.source_reference_id === parent.id) intent.source_reference_id = undefined;
          intent.reference_use = intent.reference_use.filter(use => !(use.id === parent.id && ["composition", "scene", "edit_source"].includes(use.role)));
          intent.uses_selected_version = true;
        }
        // A known source image omitted from reference_use is still that image.
        const namedSource = intent.source_reference_id && requestReferences.find(ref => ref.id === intent.source_reference_id);
        if (namedSource && !intent.reference_use.some(use => use.id === namedSource.id)) {
          intent.reference_use.push({ id: namedSource.id, role: namedSource.role });
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
        // Never generate without an exact original the user attached: an omitted
        // product or person would silently vanish while the summary still promises it.
        const forgotten = p.studio_version === 4 && !newPhoto && generative(intent.operation)
          ? requestReferences.filter(ref => exactReference(ref) && !(parent && versionIds.has(ref.id)) &&
            !reservedProducts.some(r => r.id === ref.id) && !resolvedReferences.some(r => r.id === ref.id))
          : [];
        if (forgotten.length) {
          intent.operation = "clarify";
          intent.summary = `Je n’ai pas su comment utiliser ${forgotten.map(ref => `« ${ref.name} »`).join(", ")}. Dis-moi où la placer dans l’image, ou retire-la de ta demande. Aucune image n’a été lancée.`;
        }
        // An unconfirmed role is told to the generator as "not a product or person":
        // ask instead of losing the user's product.
        const unconfirmed = resolvedReferences.filter(ref => ref.role === "auto");
        if (generative(intent.operation) && unconfirmed.length) {
          intent.operation = "clarify";
          intent.summary = `Que montre ${unconfirmed.map(ref => `« ${ref.name} »`).join(", ")} : ton produit exact, une personne, un décor ou une inspiration ? Aucune image n’a été lancée.`;
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
          // Originals attached after this scene was made can only be meant for it.
          (["edit", "product"].includes(intent.operation) && resolvedReferences.some(ref => exactReference(ref) && !versionIds.has(ref.id)) ||
            asksIntegration(intent.operation, intent.change || [], resolvedReferences))) {
          const sw = intent.scene_workflow;
          intent.scene_workflow = { ...sw, phase: "integration",
            targets: sw.targets?.length ? sw.targets : parent.proposal.scene_workflow.targets,
            camera_match: sw.camera_match || parent.proposal.scene_workflow.camera_match };
          intent.uses_selected_version = true;
          // The interpreter wrote a scene announcement ("provisional at this stage");
          // the confirmation must say what will really happen.
          if (/provisoire|d['’]abord la sc[eè]ne/i.test(intent.summary)) {
            const names = resolvedReferences.filter(exactReference).map(ref => `« ${ref.name} »`);
            intent.summary = `Je pars de la scène sélectionnée et j’y intègre tes photos exactes (${names.join(", ")}), en conservant au maximum son cadrage, son décor et sa lumière.${intent.product_placement ? ` Placement : ${intent.product_placement}` : ""}`;
          }
        }
        const phase = intent.scene_workflow?.phase;
        // An empty decor has no stand-in: say that the originals are added, never
        // that a provisional person or product is replaced.
        // Server-set only: the interpreter's schema does not expose empty_scene.
        const emptyDecor = phase === "integration" && !!intent.scene_workflow && !!parent &&
          sceneWithoutPlaceholders(parent.proposal.scene_workflow, parent.proposal.planning_references);
        if (emptyDecor && intent.scene_workflow) {
          const added = "Ajouter ce sujet exact depuis ses originaux, une seule fois, de façon physiquement plausible.";
          Object.assign(intent.scene_workflow, { empty_scene: true });
          intent.summary = withoutPlaceholders(intent.summary);
          intent.change = (intent.change || []).map(item => withoutPlaceholders(item, added));
          intent.scene_workflow.targets = intent.scene_workflow.targets?.map(t => ({ ...t,
            location: withoutPlaceholders(t.location, intent.product_placement || "À l’emplacement le plus naturel de la scène"),
            instruction: withoutPlaceholders(t.instruction, added) }));
        }
        // A correction to the scene must not discard the reserved original just
        // because the interpreter omitted a planning-only image in reference_use.
        if (phase && intent.operation === "edit") {
          if (resolvedReferences.length + reservedProducts.filter(ref => !resolvedReferences.some(r => r.id === ref.id)).length > MAX_REFERENCES) {
            intent.operation = "clarify";
            intent.summary = "Retire une référence pour conserver le produit original avec cette scène (huit images maximum).";
          } else resolvedReferences.push(...reservedProducts.filter(ref => !resolvedReferences.some(r => r.id === ref.id)));
        }
        let rebaseScenePath: string | null = null;
        if (phase && intent.scene_workflow && generative(intent.operation)) {
          const previous = parent?.proposal?.scene_workflow;
          const sameBranch = !newPhoto && parent && (!explicitSource || explicitSource.path === parent.result_path);
          if (sameBranch && previous) {
            intent.scene_workflow = { ...previous, ...intent.scene_workflow,
              targets: intent.scene_workflow.targets || previous.targets };
          }
          const workflow = intent.scene_workflow!;
          // On a selected scene or integration branch, the clean product shot (and
          // every view marked as the same product) governs exact product fidelity.
          // Worn photos are excluded: they made the generator copy a vague ring.
          if (phase === "integration" && ["scene", "integration"].includes(parent?.proposal.scene_workflow?.phase) &&
            (workflow.targets || []).some(target => target.role === "product")) {
            if (cleanProductGroup.ambiguous) {
              intent.operation = "clarify";
              intent.summary = "Plusieurs produits seuls sont joints. Choisis la photo du produit exact à intégrer, ou indique qu’une photo est une « Autre vue » du même produit. Aucune image n’a été lancée.";
            } else if (cleanProductGroup.references.length) {
              const group = cleanProductGroup.references;
              const ids = group.map(ref => ref.id);
              const dropped = new Set(resolvedReferences.filter(ref => (ref.role === "product" && !ids.includes(ref.id)) || excludedWorn(ref)).map(ref => ref.id));
              for (let i = resolvedReferences.length - 1; i >= 0; i--) {
                if (dropped.has(resolvedReferences[i].id)) resolvedReferences.splice(i, 1);
              }
              for (const ref of group) {
                if (!resolvedReferences.some(r => r.id === ref.id) && resolvedReferences.length < MAX_REFERENCES) resolvedReferences.push(ref);
              }
              const sent = ids.filter(id => resolvedReferences.some(r => r.id === id));
              // One exact product = one target, sourced from all its views.
              let productKept = false;
              workflow.targets = (workflow.targets || []).flatMap(target => {
                if (target.role === "product") {
                  if (productKept) return [];
                  productKept = true;
                  return [{ ...target, reference_ids: sent }];
                }
                const kept = target.reference_ids.filter(id => !dropped.has(id));
                return kept.length ? [{ ...target, reference_ids: kept }] : [];
              });
              // The selected integration already shows a product built from other
              // photos (e.g. the worn shot): retouching it keeps the wrong product.
              // Re-integrate from the approved scene instead.
              const parentWorkflow = parent?.proposal.scene_workflow;
              const parentProducts = ((parent?.proposal.reference_snapshot || parent?.proposal.references || []) as Reference[])
                .filter(ref => ref.role === "product" || ref.role === "person_product");
              const parentUsedOther = parentProducts.some(ref => !sent.includes(ref.id)) || sent.some(id => !parentProducts.some(ref => ref.id === id));
              if (parentWorkflow?.phase === "integration" && parentWorkflow.scene_path && parent?.result_path &&
                parentWorkflow.scene_path !== parent.result_path && parentUsedOther &&
                (!explicitSource || explicitSource.path === parent.result_path)) {
                rebaseScenePath = parentWorkflow.scene_path;
                intent.summary = `${intent.summary} Je repars de la scène validée pour y placer ton produit exact, sans garder le produit de l’image précédente.`.trim();
              }
            }
          }
          if (generative(intent.operation)) {
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
        }
        // Targets completed above may carry the default "where the person is" location.
        if (emptyDecor && intent.scene_workflow) {
          intent.scene_workflow.targets = intent.scene_workflow.targets?.map(t => ({ ...t,
            location: /^À l’emplacement (?:de la personne|du produit) dans la scène proposée$/.test(t.location)
              ? (t.role === "product" && intent.product_placement) || "À l’emplacement le plus naturel de la scène, selon la demande"
              : t.location }));
        }
        const sourcePath = rebaseScenePath || (intent.operation === "product"
          ? explicitSource?.role !== "product" ? explicitSource?.path || null : null
          : finalInputPath);
        const inputs = sceneInputs(phase, intent.operation, resolvedReferences,
          sourcePath, rebaseScenePath || parent?.result_path || null, intent.uses_selected_version);
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
