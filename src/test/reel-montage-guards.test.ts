import { beforeEach, describe, expect, it, vi } from "vitest";

/* Fonctions pures de l'écran de montage d'un reel (fiche 16 de
   docs/robustesse/gros-fichiers.md, lot 3) : clé de rendu et projet sauvegardé,
   gardes de « Assembler mon reel », plan envoyé au moteur. */

const readStudio = vi.hoisted(() => vi.fn());
vi.mock("@/features/studio-video/api", () => ({ readStudioVideo: readStudio }));

import { montageRenderKey, savedMontageProject } from "@/features/reel-montage/montage-project";
import { assembleRefusal, chosenClips, voiceGuards } from "@/features/reel-montage/assemble-guards";
import { buildMontagePlan } from "@/features/reel-montage/build-montage-plan";
import { reelSourceKey } from "@/lib/reel-publication";
import { buildRenderPlan, subtitleSettingsFromCharter } from "@/lib/reel-plan";

const sections = [
  { texte_parle: "Phrase un", texte_overlay: "Un", timing: "0-3 sec" },
  { texte_parle: "Phrase deux", texte_overlay: "Deux", timing: "3-6 sec" },
];
const studio = { id: "studio-a", studioJobId: "a", url: "https://clips.test/a.mp4", thumbnail: null, duration: 5, source: "studio" as const, label: "A", seek: 1 };
const mine = { id: "mine-b", url: "https://clips.test/b.mp4", thumbnail: null, duration: 7, source: "mine" as const, label: "B", seek: 2 };
const cutaway = { jobId: "c", url: "https://clips.test/c.mp4", duration: 2, start: 0.5, seek: 0, label: "C" };
const voice = { url: "https://voix.test/1.webm", duration: 2.5 };
const charter = { font_title: "Lora", color_accent: "#FB3D80" };

beforeEach(() => {
  readStudio.mockReset();
  readStudio.mockImplementation(async (_ws: string, id: string) => ({ job: { status: "ready", video_url: `https://signed.test/${id}.mp4` } }));
});

describe("montageRenderKey / savedMontageProject", () => {
  const inputs = { clips: [studio, mine], cutaways: [null, cutaway], voiceClips: [voice, null], voiceMode: "recorded" as const, montageMode: "cache" as const };

  it("clé de rendu : même formule et même ordre qu'avant le découpage", () => {
    expect(montageRenderKey({ sections, charter, ...inputs })).toBe(JSON.stringify([
      reelSourceKey({ sections }),
      [{ ...studio, url: "" }, mine],
      [null, { ...cutaway, url: "" }],
      [voice, null], "recorded", "cache", subtitleSettingsFromCharter(charter),
    ]));
  });

  it("une URL du Studio re-signée ne change pas la clé (le MP4 reste valide)", () => {
    const a = montageRenderKey({ sections, charter, ...inputs });
    const b = montageRenderKey({ sections, charter, ...inputs, clips: [{ ...studio, url: "https://clips.test/autre.mp4" }, mine], cutaways: [null, { ...cutaway, url: "x" }] });
    expect(b).toBe(a);
    expect(montageRenderKey({ sections, charter, ...inputs, voiceMode: "silent" })).not.toBe(a);
  });

  it("projet sauvegardé : clés dans l'ordre, URL du Studio vidées", () => {
    const project = savedMontageProject({ associationTexts: ["Phrase un", "Phrase deux"], ...inputs });
    expect(Object.keys(project)).toEqual(["version", "sectionTexts", "montageMode", "voiceMode", "clips", "voiceClips", "cutaways"]);
    expect(project).toEqual({
      version: 1, sectionTexts: ["Phrase un", "Phrase deux"], montageMode: "cache", voiceMode: "recorded",
      clips: [{ ...studio, url: "" }, mine], voiceClips: [voice, null], cutaways: [null, { ...cutaway, url: "" }],
    });
  });
});

describe("assembleRefusal", () => {
  it("texte à revérifier, puis clip Studio muet en « Je me filme », puis aucun clip", () => {
    expect(assembleRefusal({ needsReview: true, montageMode: "filme", clips: [studio] })).toBe("Vérifie les passages après la modification du texte.");
    expect(assembleRefusal({ needsReview: false, montageMode: "filme", clips: [studio] })).toBe("Un clip du Studio est muet. Choisis une prise face caméra pour porter ta voix, puis ajoute ce clip comme plan.");
    expect(assembleRefusal({ needsReview: false, montageMode: "cache", clips: [null, null] })).toBe("Choisis au moins un clip avant d'assembler.");
  });

  it("un clip Studio est accepté en « Je ne me montre pas » ; rien à refuser", () => {
    expect(assembleRefusal({ needsReview: false, montageMode: "cache", clips: [studio, null] })).toBeNull();
    expect(chosenClips([studio, null])).toEqual([{ url: studio.url, seek: 1 }, null]);
  });
});

describe("voiceGuards", () => {
  const chosen = chosenClips([mine, mine]);

  it("rien à garder en « Je me filme » ni sans voix", () => {
    expect(voiceGuards({ montageMode: "filme", voiceMode: "recorded", chosen, voiceUrls: [null, null] })).toEqual({ confirm: null, refuse: null });
    expect(voiceGuards({ montageMode: "cache", voiceMode: "silent", chosen, voiceUrls: [null, null] })).toEqual({ confirm: null, refuse: null });
  });

  it("prises manquantes : singulier et pluriel", () => {
    expect(voiceGuards({ montageMode: "cache", voiceMode: "recorded", chosen, voiceUrls: ["v1", null] }).refuse)
      .toBe("Enregistre la voix de cette phrase, ou choisis « Sans voix » pour monter un reel muet.");
    expect(voiceGuards({ montageMode: "cache", voiceMode: "recorded", chosen, voiceUrls: [null, null] }).refuse)
      .toBe("Enregistre les 2 phrases sans voix, ou choisis « Sans voix » pour monter un reel muet.");
  });

  it("phrase enregistrée sans clip : confirmation, singulier et pluriel", () => {
    const one = voiceGuards({ montageMode: "cache", voiceMode: "recorded", chosen: [chosen[0], null], voiceUrls: ["v1", "v2"] });
    expect(one).toEqual({ confirm: "La phrase 2 est enregistrée mais n'a aucun clip : elle ne sera PAS dans la vidéo, ta voix non plus. Assembler quand même ?", refuse: null });
    const many = voiceGuards({ montageMode: "cache", voiceMode: "recorded", chosen: [chosen[0], null, null], voiceUrls: ["v1", "v2", "v3"] });
    expect(many.confirm).toBe("Les phrases 2, 3 sont enregistrées mais n'ont aucun clip : elles ne seront PAS dans la vidéo, ta voix non plus. Assembler quand même ?");
  });
});

describe("buildMontagePlan", () => {
  const base = { spoken: sections, cutaways: [null, null], voiceMode: "recorded" as const, voiceUrls: [null, null], voiceDurations: [null, null], charter, workspaceId: "space" };

  it("« Je me filme » : durées des prises, URL du Studio re-signées, sous-titres à la charte", async () => {
    const clips = [studio, mine];
    const plan = await buildMontagePlan({ ...base, clips, chosen: chosenClips(clips), cutaways: [null, cutaway], montageMode: "filme" });
    expect(readStudio).toHaveBeenCalledWith("space", "a");
    expect(readStudio).toHaveBeenCalledWith("space", "c");
    expect(plan).toEqual({
      ...buildRenderPlan(sections, [{ url: "https://signed.test/a.mp4", seek: 1 }, { url: mine.url, seek: 2 }], {
        mode: "filme", voice_mode: "tts", clipDurations: [5, 7],
        brollBySection: [null, { url: "https://signed.test/c.mp4", start: 0.5, duration: 2, seek: 0 }],
      }),
      subtitle_settings: { "font-family": "Lora", "word-color": "#FB3D80" },
    });
  });

  it("« Je ne me montre pas » + voix : URL et durées des prises", async () => {
    const clips = [mine, mine];
    const plan = await buildMontagePlan({ ...base, clips, chosen: chosenClips(clips), montageMode: "cache", voiceUrls: ["v1", "v2"], voiceDurations: [2, 3], charter: null });
    expect(readStudio).not.toHaveBeenCalled();
    expect(plan).toEqual({
      ...buildRenderPlan(sections, chosenClips(clips), { mode: "cache", voice_mode: "recorded", voiceAudioUrls: ["v1", "v2"], voiceDurations: [2, 3], brollBySection: [null, null] }),
      subtitle_settings: {},
    });
  });

  it("clip ou plan du Studio introuvable → erreurs lisibles", async () => {
    await expect(buildMontagePlan({ ...base, clips: [studio, null], chosen: chosenClips([studio, null]), montageMode: "cache", workspaceId: undefined }))
      .rejects.toThrow("Espace du Studio introuvable.");
    readStudio.mockResolvedValue({ job: { status: "processing", video_url: null } });
    await expect(buildMontagePlan({ ...base, clips: [studio, null], chosen: chosenClips([studio, null]), montageMode: "cache" }))
      .rejects.toThrow("Ce clip du Studio n’est plus disponible.");
    await expect(buildMontagePlan({ ...base, clips: [mine, null], chosen: chosenClips([mine, null]), cutaways: [cutaway, null], montageMode: "cache" }))
      .rejects.toThrow("Ce plan du Studio n’est plus disponible.");
  });
});
