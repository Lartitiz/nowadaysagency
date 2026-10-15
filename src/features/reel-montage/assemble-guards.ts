// Gardes de « Assembler mon reel » (écran ReelMontage). Sorties de
// handleAssemble à l'identique (fiche 16 de docs/robustesse/gros-fichiers.md,
// lot 3), messages compris (apostrophes droites et typographiques telles
// quelles). Le toast et le window.confirm restent dans le composant.
import { countSectionsWithoutVoice, sectionsWithVoiceButNoClip } from "@/lib/reel-render";
import type { MontageMode, SelectedClip } from "./types";

export type ChosenClip = { url: string; seek: number } | null;

export function chosenClips(clips: (SelectedClip | null)[]): ChosenClip[] {
  return clips.map((c) => (c ? { url: c.url, seek: c.seek } : null));
}

/** Refus avant tout rendu (texte à revérifier, clip Studio muet, aucun clip) : le message, ou null. */
export function assembleRefusal({ needsReview, montageMode, clips }:
  { needsReview: boolean; montageMode: MontageMode | null; clips: (SelectedClip | null)[] }): string | null {
  if (needsReview) return "Vérifie les passages après la modification du texte.";
  if (montageMode === "filme" && clips.some(clip => clip?.source === "studio")) {
    return "Un clip du Studio est muet. Choisis une prise face caméra pour porter ta voix, puis ajoute ce clip comme plan.";
  }
  if (!chosenClips(clips).some(Boolean)) return "Choisis au moins un clip avant d'assembler.";
  return null;
}

/**
 * Gardes de la voix enregistrée. Elles ne concernent que le mode "cache" avec
 * « Ma voix off » : en mode "filme", la voix est dans le clip.
 * `confirm` : une phrase enregistrée sans clip sera écartée (on le dit AVANT) ;
 * `refuse` : une phrase avec clip n'a pas de prise (aucun repli en voix générée).
 */
export function voiceGuards({ montageMode, voiceMode, chosen, voiceUrls }:
  { montageMode: MontageMode | null; voiceMode: "recorded" | "silent"; chosen: ChosenClip[]; voiceUrls: (string | null)[] }):
  { confirm: string | null; refuse: string | null } {
  if (montageMode !== "cache" || voiceMode !== "recorded") return { confirm: null, refuse: null };
  const orphans = sectionsWithVoiceButNoClip(chosen, voiceUrls);
  const list = orphans.join(", ");
  const confirm = orphans.length === 0 ? null : orphans.length === 1
    ? `La phrase ${list} est enregistrée mais n'a aucun clip : elle ne sera PAS dans la vidéo, ta voix non plus. Assembler quand même ?`
    : `Les phrases ${list} sont enregistrées mais n'ont aucun clip : elles ne seront PAS dans la vidéo, ta voix non plus. Assembler quand même ?`;
  const missing = countSectionsWithoutVoice(chosen, voiceUrls);
  const refuse = missing === 0 ? null : missing === 1
    ? "Enregistre la voix de cette phrase, ou choisis « Sans voix » pour monter un reel muet."
    : `Enregistre les ${missing} phrases sans voix, ou choisis « Sans voix » pour monter un reel muet.`;
  return { confirm, refuse };
}
