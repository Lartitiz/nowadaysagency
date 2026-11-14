// « Dis ce que tu veux changer » : demande libre → réglages bornés. Les
// demandes simples sont comprises dans le navigateur, sans IA ni crédit ; le
// reste passe par l'edge `reel-render` (action "tweak", 1 crédit, jamais de HTML).
import { supabase } from "@/integrations/supabase/client";
import { quotaLimitMessage } from "@/lib/quota-message";
import { quickTweakFromText, sanitizeTweaks, type ReelTweaks } from "./reel-preview";

export interface TweakAnswer { tweaks: ReelTweaks; message: string; understood: boolean; usedAi: boolean }

export async function askReelTweak(args: {
  request: string;
  current: ReelTweaks;
  passages: { duration: number; text: string }[];
  workspaceId?: string;
}): Promise<TweakAnswer> {
  const n = args.passages.length;
  const quick = quickTweakFromText(args.request, args.current);
  if (quick) return { tweaks: sanitizeTweaks(quick, n), message: "C'est changé, regarde l'aperçu.", understood: true, usedAi: false };
  const { data, error } = await supabase.functions.invoke("reel-render", {
    body: {
      action: "tweak", request: args.request.slice(0, 500), current: args.current,
      passages: args.passages.map((p) => ({ duration: p.duration, text: p.text.slice(0, 400) })),
      ...(args.workspaceId ? { workspace_id: args.workspaceId } : {}),
    },
  });
  if (error || data?.error) {
    // Refus du serveur (ex. plus de crédit, 429) : le corps de la réponse porte le vrai message.
    let body = data;
    const context = (error as { context?: Response } | null)?.context;
    if (!body && context && typeof context.json === "function") body = await context.json().catch(() => null);
    throw new Error(quotaLimitMessage(body?.quota) || body?.error || "Je n'ai pas réussi à comprendre la demande. Réessaie avec d'autres mots.");
  }
  return { tweaks: sanitizeTweaks(data?.tweaks, n), message: String(data?.message || "C'est changé."), understood: data?.understood !== false, usedAi: true };
}
