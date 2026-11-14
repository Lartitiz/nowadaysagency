// Projet de montage sauvegardé et clé de rendu de l'écran ReelMontage. Sortis
// de ReelMontage.tsx (fiche 16 de docs/robustesse/gros-fichiers.md, lot 3) :
// les deux retirent l'URL des clips et plans du Studio (elle expire ; le projet
// garde l'identifiant). Garder EXACTEMENT l'ordre des clés : une autre clé de
// rendu invaliderait le MP4 d'un reel déjà monté à la première modification.
import { reelSourceKey } from "@/lib/reel-publication";
import { subtitleSettingsFromCharter, type CharterForSubtitles } from "@/lib/reel-render";
import type { VoiceClip } from "@/lib/reel-voice";
import { isDefaultTweaks, type ReelTweaks } from "./reel-preview";
import type { MontageMode, ReelMontageProject, Section, SelectedClip, StudioCutaway } from "./types";

interface MontageInputs {
  montageMode: MontageMode | null;
  voiceMode: "recorded" | "silent";
  clips: (SelectedClip | null)[];
  voiceClips: (VoiceClip | null)[];
  cutaways: (StudioCutaway | null)[];
}

// Changing any render input invalidates publication, while preserving takes,
// chosen clips and the old downloadable MP4. Late rendering responses are ignored.
export function montageRenderKey({ sections, clips, cutaways, voiceClips, voiceMode, montageMode, charter }:
  MontageInputs & { sections: Section[]; charter: CharterForSubtitles | null | undefined }): string {
  return JSON.stringify([reelSourceKey({ sections }),
    clips.map(clip => clip?.source === "studio" ? { ...clip, url: "" } : clip),
    cutaways.map(plan => plan ? { ...plan, url: "" } : plan),
    voiceClips, voiceMode, montageMode, subtitleSettingsFromCharter(charter)]);
}

export function savedMontageProject({ associationTexts, montageMode, voiceMode, clips, voiceClips, cutaways, tweaks }:
  MontageInputs & { associationTexts: string[]; tweaks?: ReelTweaks }): ReelMontageProject {
  return { version: 1, sectionTexts: associationTexts, montageMode, voiceMode,
    clips: clips.map(clip => clip?.source === "studio" ? { ...clip, url: "" } : clip),
    voiceClips, cutaways: cutaways.map(plan => plan ? { ...plan, url: "" } : plan),
    // Retouches de l'aperçu : gardées seulement si la cliente en a fait (forme d'avant sinon).
    ...(tweaks && !isDefaultTweaks(tweaks) ? { tweaks: { ...tweaks } } : {}) };
}

/**
 * Clé de rendu avec les retouches de l'aperçu : une retouche détache le MP4
 * déjà rangé (il ne correspond plus). Sans retouche, la clé est celle d'avant.
 */
export function withTweaksKey(key: string, tweaks: ReelTweaks, instantPreview: boolean): string {
  return instantPreview && !isDefaultTweaks(tweaks) ? `${key}|${JSON.stringify(tweaks)}` : key;
}
