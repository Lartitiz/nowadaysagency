// Plan envoyé au moteur reel-render depuis l'écran ReelMontage. Sorti de
// handleAssemble à l'identique (fiche 16 de docs/robustesse/gros-fichiers.md,
// lot 3) : nouvelle signature des URL du Studio, plan selon le mode, sous-titres
// à la charte. Sans état React.
import { buildRenderPlan, subtitleSettingsFromCharter, type CharterForSubtitles, type RenderPlan } from "@/lib/reel-render";
import { readStudioVideo } from "@/features/studio-video/api";
import type { ChosenClip } from "./assemble-guards";
import type { MontageMode, Section, SelectedClip, StudioCutaway } from "./types";

interface MontagePlanInputs {
  spoken: Section[];
  clips: (SelectedClip | null)[];
  chosen: ChosenClip[];
  cutaways: (StudioCutaway | null)[];
  montageMode: MontageMode | null;
  voiceMode: "recorded" | "silent";
  voiceUrls: (string | null)[];
  voiceDurations: (number | null)[];
  charter: CharterForSubtitles | null | undefined;
  workspaceId?: string;
}

export async function buildMontagePlan({ spoken, clips, chosen, cutaways, montageMode, voiceMode, voiceUrls, voiceDurations, charter, workspaceId }: MontagePlanInputs): Promise<RenderPlan> {
  // Private Studio URLs expire. Sign them afresh before the render service
  // fetches the media; a saved project stores job IDs, never relies on URLs.
  const fresh = await Promise.all(clips.map(async (clip, i) => {
    if (!clip || clip.source !== "studio" || !clip.studioJobId) return chosen[i];
    if (!workspaceId) throw new Error("Espace du Studio introuvable.");
    const { job } = await readStudioVideo(workspaceId, clip.studioJobId);
    if (job.status !== "ready" || !job.video_url) throw new Error("Ce clip du Studio n’est plus disponible.");
    return { url: job.video_url, seek: clip.seek };
  }));
  const freshCutaways = await Promise.all(cutaways.map(async cutaway => {
    if (!cutaway) return null;
    if (!workspaceId) throw new Error("Espace du Studio introuvable.");
    const { job } = await readStudioVideo(workspaceId, cutaway.jobId);
    if (job.status !== "ready" || !job.video_url) throw new Error("Ce plan du Studio n’est plus disponible.");
    return { url: job.video_url, start: cutaway.start, duration: cutaway.duration, seek: cutaway.seek };
  }));
  const plan =
    montageMode === "filme"
      ? buildRenderPlan(spoken, fresh, {
          mode: "filme",
          voice_mode: "tts", // ignoré côté moteur en mode "filme"
          clipDurations: clips.map((c) => c?.duration ?? null),
          brollBySection: freshCutaways,
        })
      : buildRenderPlan(spoken, fresh, {
          mode: "cache",
          voice_mode: voiceMode,
          voiceAudioUrls: voiceUrls,
          voiceDurations,
          brollBySection: freshCutaways,
        });
  // Police + couleur d'accent de la charte sur les sous-titres ; sans
  // charte (ou champs vides), le moteur retombe sur son style par défaut.
  plan.subtitle_settings = subtitleSettingsFromCharter(charter);
  return plan;
}
