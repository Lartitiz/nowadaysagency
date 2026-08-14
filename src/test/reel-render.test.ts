import { describe, it, expect } from "vitest";
import {
  parseTimingSeconds,
  sectionDuration,
  voiceSectionDuration,
  videoSectionDuration,
  buildRenderPlan,
  countSectionsWithoutVoice,
  sectionsWithVoiceButNoClip,
} from "@/lib/reel-plan";

// Garde « prise perdue » : une phrase enregistrée mais sans clip est écartée du
// montage, la voix avec. L'UI prévient avant d'assembler.
describe("sectionsWithVoiceButNoClip", () => {
  it("renvoie les NUMÉROS de phrase enregistrées mais sans clip", () => {
    const clips = [{ url: "a" }, null, null];
    expect(sectionsWithVoiceButNoClip(clips, ["v1", "v2", "v3"])).toEqual([2, 3]);
  });

  it("ignore les phrases sans voix (rien à perdre)", () => {
    expect(sectionsWithVoiceButNoClip([null, null], [null, undefined])).toEqual([]);
  });

  it("vide quand chaque prise a son clip", () => {
    expect(sectionsWithVoiceButNoClip([{ url: "a" }, { url: "b" }], ["v1", "v2"])).toEqual([]);
  });
});

// Garde « voix mixte » : compte les sections qui partiraient au montage avec
// un clip mais SANS la voix enregistrée (donc basculées en voix générée par
// le moteur). L'UI s'en sert pour confirmer avant d'assembler.
describe("countSectionsWithoutVoice", () => {
  it("compte les sections avec clip mais sans voix", () => {
    const clips = [{ url: "a" }, { url: "b" }, { url: "c" }];
    expect(countSectionsWithoutVoice(clips, ["v1", null, undefined])).toBe(2);
  });

  it("ignore les sections sans clip (elles ne partent pas au montage)", () => {
    expect(countSectionsWithoutVoice([null, { url: "b" }], [null, "v2"])).toBe(0);
  });

  it("0 quand toutes les voix sont là", () => {
    expect(countSectionsWithoutVoice([{ url: "a" }], ["v1"])).toBe(0);
  });
});

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

// La prise de la créatrice commande sa scène : sinon une lecture posée se fait
// couper par la durée estimée du script, et une lecture rapide laisse un blanc.
describe("voiceSectionDuration", () => {
  it("garde un petit silence après la voix (0,4 s)", () => {
    expect(voiceSectionDuration(4)).toBe(4.4);
    expect(voiceSectionDuration(7.25)).toBe(7.7);
  });

  it("plancher à 2 s et plafond à 90 s", () => {
    expect(voiceSectionDuration(0.5)).toBe(2);
    expect(voiceSectionDuration(200)).toBe(90);
  });
});

// Mode "je me filme" : la durée vient de la prise réelle, sans le silence de
// fin ajouté pour la voix (le dernier plan filmé EST déjà la fin).
describe("videoSectionDuration", () => {
  it("reprend la durée réelle du clip, arrondie au dixième", () => {
    expect(videoSectionDuration(8)).toBe(8);
    expect(videoSectionDuration(6.23)).toBe(6.2);
  });

  it("plancher à 2 s et plafond à 90 s", () => {
    expect(videoSectionDuration(0.5)).toBe(2);
    expect(videoSectionDuration(200)).toBe(90);
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

  it("mode recorded : pose l'enregistrement et garde le texte en repli", () => {
    const plan = buildRenderPlan(sections, ["a.mp4", "b.mp4"], {
      voice_mode: "recorded",
      voiceAudioUrls: ["voix1.wav", null],
    });
    expect(plan.sections[0].voice_audio_url).toBe("voix1.wav");
    // Le texte reste présent : repli voix générée côté moteur.
    expect(plan.sections[0].voice_text).toBe("Phrase une.");
    // Section sans enregistrement : pas d'URL audio, le texte fera le travail.
    expect(plan.sections[1].voice_audio_url).toBeUndefined();
    expect(plan.sections[1].voice_text).toBe("Phrase deux.");
  });

  it("accepte un clip objet {url, seek} : la fenêtre choisie est transmise", () => {
    const plan = buildRenderPlan(sections, [{ url: "mine.mp4", seek: 7.5 }, "b.mp4"]);
    expect(plan.sections[0].clip_url).toBe("mine.mp4");
    expect(plan.sections[0].seek).toBe(7.5);
    // Une simple string reste acceptée (seek 0).
    expect(plan.sections[1].seek).toBe(0);
  });

  it("un seek négatif est ramené à 0", () => {
    const plan = buildRenderPlan(sections, [{ url: "mine.mp4", seek: -3 }]);
    expect(plan.sections[0].seek).toBe(0);
  });

  it("mode recorded : la durée de la prise commande la scène, pas le script", () => {
    // Le script annonce 4 s ; la lecture réelle en fait 6,2 → la scène suit la voix.
    const plan = buildRenderPlan(sections, ["a.mp4"], {
      voice_mode: "recorded",
      voiceAudioUrls: ["voix1.wav"],
      voiceDurations: [6.2],
    });
    expect(plan.sections[0].duration).toBe(6.6);
  });

  it("sans durée de prise, on retombe sur l'estimation du script", () => {
    const plan = buildRenderPlan(sections, ["a.mp4"], {
      voice_mode: "recorded",
      voiceAudioUrls: ["voix1.wav"],
    });
    expect(plan.sections[0].duration).toBe(4);
  });

  it("une durée de prise sans enregistrement ne s'applique pas", () => {
    // Voix non enregistrée : la scène reste calée sur le script (voix générée).
    const plan = buildRenderPlan(sections, ["a.mp4"], {
      voice_mode: "recorded",
      voiceAudioUrls: [null],
      voiceDurations: [30],
    });
    expect(plan.sections[0].duration).toBe(4);
  });

  it("mode recorded : les URLs voix suivent l'index des SECTIONS, pas des clips", () => {
    // La section du milieu n'a pas de clip : sa voix ne doit pas glisser sur la suivante.
    const plan = buildRenderPlan(sections, ["a.mp4", null, "c.mp4"], {
      voice_mode: "recorded",
      voiceAudioUrls: ["voix1.wav", "voix2.wav", "voix3.wav"],
    });
    expect(plan.sections).toHaveLength(2);
    expect(plan.sections[1].voice_audio_url).toBe("voix3.wav");
  });

  // Mode "je me filme" : pas de voix séparée, la durée vient de la prise.
  describe("mode filme", () => {
    it("la durée vient du clip réel, pas du script, et aucune voix n'est embarquée", () => {
      const plan = buildRenderPlan(sections, ["a.mp4"], {
        mode: "filme",
        voice_mode: "tts",
        clipDurations: [9.4],
      });
      expect(plan.mode).toBe("filme");
      expect(plan.sections[0].duration).toBe(9.4);
      expect(plan.sections[0].voice_audio_url).toBeUndefined();
      expect(plan.sections[0].voice_text).toBeUndefined();
    });

    it("sans durée de clip connue, on retombe sur l'estimation du script", () => {
      const plan = buildRenderPlan(sections, ["a.mp4"], { mode: "filme", voice_mode: "tts" });
      expect(plan.sections[0].duration).toBe(4);
    });

    it("des voiceAudioUrls fournis par erreur n'ont aucun effet en mode filme", () => {
      const plan = buildRenderPlan(sections, ["a.mp4"], {
        mode: "filme",
        voice_mode: "recorded",
        voiceAudioUrls: ["voix1.wav"],
        clipDurations: [5],
      });
      expect(plan.sections[0].voice_audio_url).toBeUndefined();
    });
  });

  it("mode par défaut (omis) : \"cache\", comportement inchangé", () => {
    const plan = buildRenderPlan(sections, ["a.mp4"], { voice_mode: "tts" });
    expect(plan.mode).toBe("cache");
  });
});
