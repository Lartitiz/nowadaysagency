// Aperçu immédiat du reel « sans voix » (14/11/2026) : la page de montage
// HyperFrames est fabriquée DANS le navigateur, par le même code que l'edge
// `reel-render` (un seul code source, testé côté Deno), avec les retouches de
// la cliente. Le MP4 n'est fabriqué qu'au téléchargement.
import { buildReelComposition } from "../../../supabase/functions/reel-render/hyperframes.ts";
import { applyCut, lookOf, sanitizeTweaks, type ReelTweaks } from "../../../supabase/functions/reel-render/tweaks.ts";
import type { RenderPlan } from "@/lib/reel-plan";
import type { MontageMode, SelectedClip } from "./types";

export type { ReelTweaks } from "../../../supabase/functions/reel-render/tweaks.ts";
export {
  DEFAULT_TWEAKS, biggerText, isDefaultTweaks, lookOf, quickTweakFromText, sanitizeTweaks, shorter, toggleCalm, toggleSounds,
} from "../../../supabase/functions/reel-render/tweaks.ts";

/** Lecteur officiel HyperFrames, même version que le moteur de rendu (v0.9.42). */
export const PLAYER_SCRIPT = "https://cdn.jsdelivr.net/npm/@hyperframes/player@0.9.42/dist/hyperframes-player.global.js";

/** L'aperçu n'existe que pour le reel sans voix monté sur clips (celui que fabrique HyperFrames). */
export function hasInstantPreview(montageMode: MontageMode | null, voiceMode: "recorded" | "silent"): boolean {
  return montageMode === "cache" && voiceMode === "silent";
}

/**
 * Temps disponible dans le clip de chaque passage du plan (même ordre que
 * `buildRenderPlan`, qui écarte les passages sans clip). null = pas de limite.
 */
export function maxDurationsFor(clips: (SelectedClip | null)[]): (number | null)[] {
  return clips.filter((c): c is SelectedClip => !!c).map((c) =>
    c.source === "photo" || c.duration == null ? null : Math.max(0, c.duration - (c.seek || 0)));
}

/** Plan retouché (durées, ordre) : celui de l'aperçu ET celui envoyé au rendu MP4. */
export function tweakedPlan(plan: RenderPlan, tweaks: ReelTweaks, maxDurations: (number | null)[]): RenderPlan {
  return { ...plan, sections: applyCut(plan.sections, sanitizeTweaks(tweaks, plan.sections.length), maxDurations) };
}

export function previewComposition(plan: RenderPlan, tweaks: ReelTweaks, maxDurations: (number | null)[], origin: string) {
  const cut = tweakedPlan(plan, tweaks, maxDurations);
  return buildReelComposition(cut, {
    look: lookOf(sanitizeTweaks(tweaks, plan.sections.length)),
    assetBase: `${origin.replace(/\/$/, "")}/reel-assets/`,
    brand: plan.brand,
  });
}
