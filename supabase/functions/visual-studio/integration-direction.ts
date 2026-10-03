import { PHOTO_PRESERVATION } from "./photo-preservation.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { callAnthropic, SONNET_MODEL } from "../_shared/anthropic.ts";
import type { Proposal } from "./media.ts";
import { validTargets } from "./scene-workflow.ts";

const schema = z.object({
  image_prompt: z.string().trim().min(30).max(5000),
  targets: z.array(z.object({ role: z.enum(["person", "casting", "product"]),
    reference_ids: z.array(z.string()).min(1).max(8), location: z.string().min(1).max(400), instruction: z.string().min(1).max(1000) })).min(1).max(8),
  blocked_reason: z.string().max(600).default(""),
});
export const INTEGRATION_DIRECTION = `${PHOTO_PRESERVATION}
Tu prépares une retouche photographique ciblée. Observe la scène effectivement générée et CHAQUE original joint. La demande confirmée et les associations cible/originaux sont l'autorité ; les anciennes descriptions textuelles des références peuvent être erronées, leurs pixels font foi.
La scène est l'Image 1. Chaque original est étiqueté avec son vrai numéro, ID et rôle. Écris un prompt anglais concis et complet : modifier Image 1, remplacer explicitement CHAQUE personne provisoire par LA personne de ses originaux, remplacer CHAQUE produit provisoire par le produit exact de ses originaux. Conserver seulement la pose et la tenue approuvées pour la personne ; son visage, ses cheveux et sa morphologie proviennent des originaux. Ne garder ni le visage provisoire ni un mélange des identités. Le produit exact ne compense jamais une personne incorrecte. Ne modifier aucune autre personne du décor.
Si la scène ne contient encore aucune personne ou aucun produit provisoire pour une cible (décor vide), AJOUTE ce sujet exact une seule fois, à l'emplacement et dans la pose demandés, avec contacts, échelle, perspective et ombres plausibles : l'absence de sujet provisoire n'est jamais un motif de blocage.
Pour chaque cible, indique son emplacement visible dans la scène et une instruction précise en français, avec les mêmes role et reference_ids ; ne fusionne ni ne sépare les sujets. Les contours, contacts, perspective, ombres et raccords locaux peuvent s'adapter. Conserve le cadrage, le décor, la lumière, la palette et les textures hors des remplacements demandés. Aucune nouvelle direction artistique, aucun lissage global, aucun nouveau preset. Ne transforme pas une ancienne description approximative du motif en consigne de redessiner le produit.
Le prompt commence par les remplacements obligatoires, puis précise ce qui reste inchangé. Ne te contente pas de « conserver le sourire » pour une personne à remplacer. Si une référence est inexploitable ou si l'emplacement est réellement ambigu, renseigne blocked_reason en français ; n'invente pas. image_prompt et targets restent requis pour un diagnostic structuré. Sinon blocked_reason est une chaîne vide, sans guillemets. Ne promets pas une fidélité garantie.`;

export async function prepareIntegration<T extends Proposal>(proposal: T, readVision: (path: string) => Promise<unknown>): Promise<T> {
  const refs = proposal.references || [], targets = proposal.scene_workflow?.targets || [];
  if (!proposal.input_path || !validTargets(targets, refs) || !targets.length) throw new Error("studio_integration_sources");
  const content: unknown[] = [{ type: "text", text: "Image 1 : scène approuvée à éditer." }, await readVision(proposal.input_path)];
  for (const [i, ref] of refs.entries()) {
    content.push({ type: "text", text: `Image ${i + 2} : original ID ${ref.id}, rôle ${ref.role}, nom ${ref.name}.` }, await readVision(ref.path));
  }
  content.push({ type: "text", text: JSON.stringify({ demande_confirmee: proposal.summary, targets, preserve: proposal.preserve, changements_acceptes: proposal.scene_workflow?.accepted_changes }) });
  const started = Date.now();
  const raw = await callAnthropic({ model: SONNET_MODEL, system: INTEGRATION_DIRECTION,
    messages: [{ role: "user", content }], max_tokens: 3000, maxRetries: 0, abortTimeoutMs: 40_000, keepDashes: true,
    tool: { name: "prepare_integration", description: "Retouche de la scène observée avec chaque original", input_schema: {
      type: "object", properties: {
        image_prompt: { type: "string", minLength: 30, maxLength: 5000 }, blocked_reason: { type: "string", maxLength: 600 },
        targets: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", properties: {
          role: { type: "string", enum: ["person", "casting", "product"] }, reference_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
          location: { type: "string", maxLength: 400 }, instruction: { type: "string", maxLength: 1000 },
        }, required: ["role", "reference_ids", "location", "instruction"] } },
      }, required: ["image_prompt", "targets", "blocked_reason"],
    } },
  });
  const result = schema.parse(JSON.parse(raw));
  // The model sometimes writes an empty reason as quotes or "aucun": that is not a block.
  const blocked = result.blocked_reason.replace(/^[\s"'«»“”.]+|[\s"'«»“”.]+$/g, "");
  if (blocked && !/^(aucune?|rien|none|n\/a|null)$/i.test(blocked)) throw new Error(`Intégration à préciser : ${blocked}`);
  const signature = (items: typeof targets) => JSON.stringify(items.map(t => `${t.role}:${[...t.reference_ids].sort().join(",")}`).sort());
  if (!validTargets(result.targets, refs) || signature(result.targets) !== signature(targets)) throw new Error("studio_integration_sources");
  return { ...proposal, image_prompt: result.image_prompt,
    // Keep the user's visible confirmation as the authority; refinements only locate the same subjects.
    change: result.targets.map(t => `${t.location} : ${t.instruction}`),
    scene_workflow: { ...proposal.scene_workflow!, targets: result.targets },
    integration_preparation: { model: SONNET_MODEL, elapsed_ms: Date.now() - started, source_path: proposal.input_path, reference_ids: refs.map(r => r.id) },
  };
}
