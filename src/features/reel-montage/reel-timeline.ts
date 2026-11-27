// Ligne de temps de l'écran de montage (27/11/2026) : un bloc par passage, large
// comme sa durée dans le reel. Calculée sans attendre (même calcul de durées que
// le plan envoyé au moteur, `buildRenderPlan`), pour s'afficher avant toute lecture.
// Sert aussi à la lecture du reel entier avec la voix : sous-titres provisoires.
import { buildRenderPlan, sectionDuration, type RenderPlan } from "@/lib/reel-plan";
import { voiceTracks, type CaptionWord } from "../../../supabase/functions/reel-render/captions.ts";
import { chosenClips } from "./assemble-guards";
import { hasInstantPreview, maxDurationsFor, sanitizeTweaks, tweakedPlan, type ReelTweaks } from "./reel-preview";
import type { MontageMode, Section, SelectedClip } from "./types";

export interface TimelineBlock {
  /** Index du passage dans le script. */
  passage: number;
  /** Seconde de début dans le reel ; null = passage sans clip, absent du reel. */
  start: number | null;
  duration: number;
}

interface TimelineInputs {
  spoken: Section[];
  clips: (SelectedClip | null)[];
  montageMode: MontageMode | null;
  voiceMode: "recorded" | "silent";
  voiceUrls: (string | null)[];
  voiceDurations: (number | null)[];
  tweaks: ReelTweaks;
}

/** Index (dans le script) des passages qui ont un clip : l'ordre des sections du plan. */
export function passagesInPlan(clips: (SelectedClip | null)[]): number[] {
  return clips.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
}

/** Les blocs dans l'ordre où le reel les joue ; les passages sans clip gardent leur place du script. */
export function reelTimeline({ spoken, clips, montageMode, voiceMode, voiceUrls, voiceDurations, tweaks }: TimelineInputs): TimelineBlock[] {
  const chosen = chosenClips(clips);
  const draft = montageMode === "filme"
    ? buildRenderPlan(spoken, chosen, { mode: "filme", voice_mode: "tts", clipDurations: clips.map((c) => c?.duration ?? null) })
    : buildRenderPlan(spoken, chosen, { mode: "cache", voice_mode: voiceMode, voiceAudioUrls: voiceUrls, voiceDurations });
  const inPlan = passagesInPlan(clips);
  const instant = hasInstantPreview(montageMode, voiceMode);
  const t = sanitizeTweaks(tweaks, draft.sections.length);
  const sections = instant ? tweakedPlan(draft, t, maxDurationsFor(clips)).sections : draft.sections;
  const order = (instant && t.order) || inPlan.map((_, k) => k);
  let cursor = 0;
  const blocks: TimelineBlock[] = sections.map((s, k) => {
    const block = { passage: inPlan[order[k]], start: Math.round(cursor * 1000) / 1000, duration: s.duration };
    cursor += s.duration;
    return block;
  });
  spoken.forEach((s, i) => {
    if (!clips[i]) blocks.splice(Math.min(i, blocks.length), 0, { passage: i, start: null, duration: sectionDuration(s) });
  });
  return blocks;
}

export function timelineTotal(blocks: TimelineBlock[]): number {
  return blocks.reduce((sum, b) => (b.start === null ? sum : sum + b.duration), 0);
}

/** Le bloc joué à la seconde `time` (null avant toute lecture possible). */
export function blockAt(blocks: TimelineBlock[], time: number): TimelineBlock | null {
  const played = blocks.filter((b) => b.start !== null);
  return played.find((b) => time < (b.start as number) + b.duration) ?? played[played.length - 1] ?? null;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Sous-titres provisoires de la lecture avec « Ma voix » : les mots du script,
 * répartis sur la durée de la prise (les vrais sont calés sur la voix entendue,
 * à la fabrication). « Je me filme » : aucun, on ne sait pas ce qui est dit.
 * Une liste par piste de `voiceTracks(plan)`, dans le même ordre.
 */
export function provisionalCaptions(plan: RenderPlan, clips: (SelectedClip | null)[], spoken: Section[], voiceDurations: (number | null)[]): CaptionWord[][] {
  const inPlan = passagesInPlan(clips);
  return voiceTracks(plan).map((track) => {
    if ((plan.mode ?? "cache") === "filme") return [];
    const passage = inPlan[track.section];
    const words = String(spoken[passage]?.texte_parle || "").trim().split(/\s+/).filter(Boolean);
    const length = Math.max(0.5, voiceDurations[passage] ?? track.duration);
    const weights = words.map((w) => w.length + 2);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let at = 0;
    return words.map((text, k) => {
      const start = at;
      at += (weights[k] / total) * length;
      return { text, start: Math.round(start * 100) / 100, end: Math.round(at * 100) / 100 };
    });
  });
}
