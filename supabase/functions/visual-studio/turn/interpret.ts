// Tour de conversation du Studio : préparation de la demande avec Claude.
// 1. Rôles déclarés dans le message (« image 2 est mon produit ») : appliqués
//    EN PLACE sur les objets de requestReferences, qui sont les mêmes objets
//    que les références de la session (ne jamais les copier : le test
//    « rôles déclarés dans le message » de handler_contract_test.ts casse).
// 2. Images pour la vision (version sélectionnée, puis références jointes).
// 3. Appel unique (Haiku pour le conseil, Sonnet pour la préparation),
//    réparation d'une sortie incomplète et d'une réponse qui se répète.
//    Échec : réponse 503 refresh_request, rien n'est écrit ni lancé.
// Déplacé tel quel depuis index.ts (fiche 5, lot 6, docs/robustesse/gros-fichiers.md).
import { callAnthropic, SONNET_MODEL, HAIKU_MODEL } from "../../_shared/anthropic.ts";
import { COMPETENCIES, isIdentity } from "../competencies.ts";
import { cleanStudioSummary, conversationTool, intentSchema, intentTool, studioSystem } from "../contract.ts";
import { CONVERSATION_SYSTEM, type ConversationContext, dialogueHistory, explicitRoles } from "../conversation.ts";
import type { Reference } from "../media.ts";
import { sceneWithoutPlaceholders } from "../scene-workflow.ts";
import { selectSoulStyles, soulStyles } from "../soul-direction.ts";
import { BUCKET, visionFromStorage } from "../storage.ts";
import type { StudioContext, StudioSession } from "../actions/context.ts";
import type { loadBrandContext } from "./brand-context.ts";

type BrandContext = Awaited<ReturnType<typeof loadBrandContext>>;
export type InterpretInput = {
  /** Mêmes objets que les références de la session : modifiés en place. */
  requestReferences: Reference[];
  parent: StudioSession | null;
  session: StudioSession;
  conversation: ConversationContext | undefined;
  conversational: boolean;
  newRequest: boolean;
  reservedProducts: Reference[];
  memory: BrandContext["memory"];
  brandContext: BrandContext["brandContext"];
  catalogue: BrandContext["catalogue"];
};

/** Réponse 503 si la préparation échoue, sinon ce que la suite du tour utilise. */
export async function interpret(ctx: StudioContext, input: InterpretInput) {
  const { sb, p, json } = ctx;
  const { requestReferences, parent, session, conversation, conversational, newRequest, reservedProducts, memory, brandContext, catalogue } = input;
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
      model: conversational ? HAIKU_MODEL : SONNET_MODEL,
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
  return { statedRoles, selectedReference, vision, availableSoulStyles, intent, interpreterArgs };
}
