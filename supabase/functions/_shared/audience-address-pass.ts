// Passe IA courte du contrôle tu/vous (cf. audience-address.ts, module pur).
import { callAnthropicSimple } from "./anthropic.ts";
import { unwrapCorrectionOutput } from "./correction-pass.ts";
import { keepStructureOrRevert } from "./text-structure-guard.ts";
import { audienceAddressFixPrompt, type AudienceAddressPass } from "./audience-address.ts";

/** Appel IA court (Haiku, température 0). Toute erreur rend le texte intact. */
export const applyAudienceAddressPass: AudienceAddressPass = async (content, addr, items, opts) => {
  if (!content || !items.length) return content;
  try {
    const raw = await callAnthropicSimple(
      "claude-haiku-4-5",
      audienceAddressFixPrompt(addr),
      `PASSAGES À CORRIGER :\n${items.map((t) => `- « ${t} »`).join("\n")}\n\nTEXTE :\n"""\n${content}\n"""`,
      0,
      4096,
      undefined,
      opts.abortTimeoutMs,
    );
    const corrected = unwrapCorrectionOutput(raw);
    if (!corrected || corrected.length < content.length * 0.85 || corrected.length > content.length * 1.2) {
      opts.logger?.(`[audience-address] FALLBACK (longueur ${corrected?.length} vs ${content.length})`);
      return content;
    }
    const guarded = keepStructureOrRevert(content, corrected, "audience-address", opts.logger);
    return guarded.reverted ? content : corrected;
  } catch (e) {
    opts.logger?.(`[audience-address] ERROR: ${e}`);
    return content;
  }
};


/** Options prêtes pour audience-address-fields.ts (passe IA réelle, journaux nommés). */
export function addressPassOptions(scope: string, abortTimeoutMs = 30_000) {
  return { pass: applyAudienceAddressPass, abortTimeoutMs, scope, logger: (m: string) => console.log(`[${scope}] ${m}`) };
}
