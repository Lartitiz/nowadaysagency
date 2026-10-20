// Appel Opus de l'enrichissement, compté HORS CRÉDIT (audit de coût du 20/10/2026) :
// le crédit est déjà décompté par deep-diagnostic, mais le coût doit apparaître au
// bilan du lundi (source « inscription » pendant l'inscription, « passe_interne » sinon).
import { callAnthropic, type AnthropicOptions, type UsageSink } from "../_shared/anthropic.ts";
import { logUsageHorsCredit } from "../_shared/usage-hors-credit.ts";

export async function appelEnrichissement(
  options: AnthropicOptions,
  qui: { isOnboarding: unknown; userId: string; workspaceId?: string | null },
): Promise<string> {
  const usage: UsageSink = {};
  const raw = await callAnthropic(options, usage);
  await logUsageHorsCredit({
    source: qui.isOnboarding ? "inscription" : "passe_interne", action: "diagnostic_enrichment",
    userId: qui.userId, workspaceId: qui.workspaceId, model: usage.model, tokens: usage.total_tokens,
  });
  return raw;
}
