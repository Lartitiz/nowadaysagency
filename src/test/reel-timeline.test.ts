/* Ligne de temps de l'écran de montage du reel et sous-titres provisoires de la lecture (27/11/2026). */
import { describe, expect, it } from "vitest";
import { buildRenderPlan } from "@/lib/reel-plan";
import { blockAt, formatClock, provisionalCaptions, reelTimeline, timelineTotal } from "@/features/reel-montage/reel-timeline";
import { DEFAULT_TWEAKS } from "@/features/reel-montage/reel-preview";
import type { SelectedClip } from "@/features/reel-montage/types";

const SECTIONS = [
  { type: "hook", label: "A", timing: "0-4s", texte_parle: "Un deux trois" },
  { type: "body", label: "B", timing: "4-10s", texte_parle: "Quatre cinq" },
  { type: "cta", label: "C", timing: "10-13s", texte_parle: "Six" },
];
const clip = (n: number, duration: number | null = 20): SelectedClip => ({ id: `c${n}`, url: `https://clips.test/${n}.mp4`, thumbnail: null, duration, source: "stock", label: `Clip ${n}`, seek: 0 });
const base = { spoken: SECTIONS, montageMode: "cache" as const, voiceUrls: [null, null, null], voiceDurations: [null, null, null], tweaks: DEFAULT_TWEAKS };

describe("reelTimeline", () => {
  it("sans voix : un bloc par passage, durées du script, débuts cumulés", () => {
    const blocks = reelTimeline({ ...base, voiceMode: "silent", clips: [clip(1), clip(2), clip(3)] });
    expect(blocks.map((b) => b.passage)).toEqual([0, 1, 2]);
    expect(blocks.map((b) => b.duration)).toEqual([4, 6, 3]);
    expect(blocks.map((b) => b.start)).toEqual([0, 4, 10]);
    expect(timelineTotal(blocks)).toBe(13);
  });

  it("ma voix : la durée d'un passage enregistré est celle de sa prise ; un passage sans clip reste à sa place, hors du reel", () => {
    const blocks = reelTimeline({ ...base, voiceMode: "recorded", clips: [clip(1), null, clip(3)],
      voiceUrls: ["https://voix.test/1.wav", null, null], voiceDurations: [7, null, null] });
    expect(blocks.map((b) => b.passage)).toEqual([0, 1, 2]);
    expect(blocks[0].duration).toBeGreaterThanOrEqual(7);
    expect(blocks[1].start).toBeNull();
    expect(blocks[2].start).toBe(blocks[0].duration);
    expect(timelineTotal(blocks)).toBe(blocks[0].duration + blocks[2].duration);
  });

  it("sans voix, ordre retouché : les blocs suivent l'ordre joué", () => {
    const blocks = reelTimeline({ ...base, voiceMode: "silent", clips: [clip(1), clip(2), clip(3)], tweaks: { ...DEFAULT_TWEAKS, order: [2, 0, 1] } });
    expect(blocks.map((b) => b.passage)).toEqual([2, 0, 1]);
    expect(blocks.map((b) => b.start)).toEqual([0, 3, 7]);
  });

  it("blockAt : le passage joué à une seconde donnée ; formatClock", () => {
    const blocks = reelTimeline({ ...base, voiceMode: "silent", clips: [clip(1), clip(2), clip(3)] });
    expect(blockAt(blocks, 0)?.passage).toBe(0);
    expect(blockAt(blocks, 4.2)?.passage).toBe(1);
    expect(blockAt(blocks, 99)?.passage).toBe(2);
    expect(formatClock(73)).toBe("1:13");
  });
});

describe("provisionalCaptions", () => {
  it("ma voix : les mots du script répartis sur la durée de la prise, une liste par prise", () => {
    const clips = [clip(1), null, clip(3)];
    const plan = buildRenderPlan(SECTIONS, [{ url: clip(1).url, seek: 0 }, null, { url: clip(3).url, seek: 0 }],
      { mode: "cache", voice_mode: "recorded", voiceAudioUrls: ["https://voix.test/1.wav", null, null], voiceDurations: [3, null, null] });
    const captions = provisionalCaptions(plan, clips, SECTIONS, [3, null, null]);
    expect(captions).toHaveLength(1);
    expect(captions[0].map((w) => w.text)).toEqual(["Un", "deux", "trois"]);
    expect(captions[0][0].start).toBe(0);
    expect(captions[0][2].end).toBeCloseTo(3, 1);
  });

  it("je me filme : pas de sous-titres provisoires (on ne sait pas ce qui est dit)", () => {
    const clips = [clip(1, 5), clip(2, 5), clip(3, 5)];
    const plan = buildRenderPlan(SECTIONS, clips.map((c) => ({ url: c.url, seek: 0 })), { mode: "filme", voice_mode: "tts", clipDurations: [5, 5, 5] });
    expect(provisionalCaptions(plan, clips, SECTIONS, [null, null, null])).toEqual([[], [], []]);
  });
});
