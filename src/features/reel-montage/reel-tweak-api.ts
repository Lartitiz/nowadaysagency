// « Dis ce que tu veux changer » : demande libre → réglages bornés. Les
// demandes simples sont comprises dans le navigateur, sans IA ni crédit ; le
// reste passe par l'edge `reel-render` (action "tweak", 1 crédit, jamais de HTML).
import { supabase } from "@/integrations/supabase/client";
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
  if (error || data?.error) throw new Error(data?.error || "Je n'ai pas réussi à comprendre la demande. Réessaie avec d'autres mots.");
  return { tweaks: sanitizeTweaks(data?.tweaks, n), message: String(data?.message || "C'est changé."), understood: data?.understood !== false, usedAi: true };
}
