import { describe, it, expect } from "vitest";
import {
  parseTimingSeconds,
  sectionDuration,
  buildRenderPlan,
} from "@/lib/reel-plan";

describe("parseTimingSeconds", () => {
  it("extrait la durée d'un intervalle", () => {
    expect(parseTimingSeconds("3-15 sec")).toBe(12);
    expect(parseTimingSeconds("0-3 sec")).toBe(3);
    expect(parseTimingSeconds("35-45 sec")).toBe(10);
  });
  it("renvoie null si non parsable", () => {
    expect(parseTimingSeconds("face cam")).toBeNull();
    expect(parseTimingSeconds(undefined)).toBeNull();
    expect(parseTimingSeconds("12 sec")).toBeNull();
  });
});

describe("sectionDuration", () => {
  it("préfère le timing", () => {
    expect(sectionDuration({ timing: "3-15 sec", texte_parle: "mot " })).toBe(12);
  });
  it("estime depuis les mots si pas de timing (2,5 mots/s)", () => {
    // 10 mots ÷ 2,5 = 4 s
    const s = { texte_parle: "un deux trois quatre cinq six sept huit neuf dix" };
    expect(sectionDuration(s)).toBe(4);
  });
  it("plancher à 2 s", () => {
    expect(sectionDuration({ texte_parle: "court" })).toBe(2);
  });
});

describe("buildRenderPlan", () => {
  const sections = [
    { timing: "0-4 sec", texte_parle: "Phrase une." },
    { timing: "4-14 sec", texte_parle: "Phrase deux." },
    { timing: "14-20 sec", texte_parle: "Phrase trois." },
  ];

  it("une entrée par section AVEC clip, dans l'ordre", () => {
    const plan = buildRenderPlan(sections, ["a.mp4", null, "c.mp4"]);
    expect(plan.sections).toHaveLength(2);
    expect(plan.sections[0].clip_url).toBe("a.mp4");
    expect(plan.sections[1].clip_url).toBe("c.mp4");
  });

  it("mode tts : embarque le texte parlé et la bonne durée", () => {
    const plan = buildRenderPlan(sections, ["a.mp4"], { voice_mode: "tts" });
    expect(plan.voice_mode).toBe("tts");
    expect(plan.sections[0].voice_text).toBe("Phrase une.");
    expect(plan.sections[0].duration).toBe(4);
  });

  it("mode recorded : n'injecte pas le texte comme voix TTS", () => {
    const plan = buildRenderPlan(sections, ["a.mp4"], { voice_mode: "recorded" });
    expect(plan.sections[0].voice_text).toBeUndefined();
  });
});
