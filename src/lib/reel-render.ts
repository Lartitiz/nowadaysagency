/**
 * reel-render (client) — pilotage du moteur de montage (edge `reel-render`).
 * Les helpers PURS (durée, plan) sont dans `reel-plan.ts` et ré-exportés ici
 * pour un point d'entrée unique.
 */

import { supabase } from "@/integrations/supabase/client";
import type { RenderPlan } from "@/lib/reel-plan";

export {
  parseTimingSeconds,
  sectionDuration,
  voiceSectionDuration,
  videoSectionDuration,
  buildRenderPlan,
  countSectionsWithoutVoice,
  sectionsWithVoiceButNoClip,
  subtitleSettingsFromCharter,
} from "@/lib/reel-plan";
export type {
  RenderPlan,
  RenderSectionInput,
  RenderPlanOptions,
  CharterForSubtitles,
} from "@/lib/reel-plan";

/**
 * Durée maximale d'un reel monté : celle de l'abonnement JSON2Video (60 s au
 * 12/11/2026). Au-delà, le moteur refuse en anglais (« Movie duration (62s) is
 * longer than your plan allowance (60s). Upgrade your plan ») après une minute
 * d'attente. On refuse donc AVANT l'envoi, en français, avec quoi faire.
 */
export const MAX_REEL_SECONDS = 60;

/** Durée totale du reel tel qu'il partira au montage, en secondes. */
export function renderPlanSeconds(plan: Pick<RenderPlan, "sections">): number {
  return plan.sections.reduce((total, s) => total + (Number.isFinite(s.duration) ? s.duration : 0), 0);
}

export function reelTooLongMessage(seconds: number, max = MAX_REEL_SECONDS): string {
  return `Ton reel dure environ ${Math.ceil(seconds)} s, et le montage automatique s'arrête à ${max} s. `
    + "Raccourcis le texte avec « Éditer le texte » (ou retire un passage), puis relance l'assemblage.";
}

/** Traduit les refus connus du moteur de montage ; renvoie le message tel quel sinon. */
export function readableRenderMessage(message: string): string {
  const tooLong = /movie duration \((\d+(?:\.\d+)?)s\) is longer than your plan allowance \((\d+)s\)/i.exec(message);
  if (tooLong) return reelTooLongMessage(Number(tooLong[1]), Number(tooLong[2]));
  return message;
}

/** Lance un rendu. Renvoie l'identifiant de projet. */
export async function submitReelRender(plan: RenderPlan): Promise<string> {
  const seconds = renderPlanSeconds(plan);
  if (seconds > MAX_REEL_SECONDS) throw new Error(reelTooLongMessage(seconds));
  const { data, error } = await supabase.functions.invoke("reel-render", {
    body: { action: "submit", ...plan },
  });
  if (error) {
    console.error("[submitReelRender] échec de l'appel à reel-render:", error);
    throw new Error("Le montage n'a pas pu démarrer. Réessaie dans un instant.");
  }
  if (data?.error) throw new Error(data.error);
  if (!data?.project) throw new Error("Le montage n'a pas pu démarrer.");
  return data.project as string;
}

export interface RenderStatus {
  status: "running" | "done" | "error" | "unknown";
  url: string | null;
  message?: string;
}

async function fetchRenderStatus(project: string): Promise<RenderStatus> {
  const { data, error } = await supabase.functions.invoke("reel-render", {
    body: { action: "status", project },
  });
  if (error) throw new Error("Impossible de récupérer l'avancement.");
  if (data?.error) throw new Error(data.error);
  return data as RenderStatus;
}

/**
 * Interroge le rendu jusqu'à `done`/`error`. Best-effort, borné dans le temps.
 * `onTick` permet d'afficher l'avancement.
 */
export async function pollReelRender(
  project: string,
  opts: { intervalMs?: number; maxTries?: number; onTick?: (n: number) => void } = {},
): Promise<string> {
  const interval = opts.intervalMs ?? 6000;
  const maxTries = opts.maxTries ?? 30;
  for (let i = 1; i <= maxTries; i++) {
    await new Promise((r) => setTimeout(r, interval));
    opts.onTick?.(i);
    const st = await fetchRenderStatus(project);
    if (st.status === "done" && st.url) return st.url;
    if (st.status === "error") {
      throw new Error(st.message ? readableRenderMessage(st.message) : "Le montage a échoué.");
    }
  }
  throw new Error("Le montage prend plus de temps que prévu. Réessaie dans un instant.");
}

/**
 * Recopie le MP4 rendu dans le bucket `calendar-media` et renvoie SON url.
 *
 * L'URL renvoyée par le rendu est celle de JSON2Video, un service externe dont
 * les rendus expirent : la joindre à un contenu programmerait un lien mort.
 * Tant que ce n'est pas passé par ici, la vidéo n'appartient pas à la cliente.
 */
export async function archiveReelMp4(renderUrl: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("reel-render", {
    body: { action: "archive", url: renderUrl },
  });
  if (error) {
    console.error("[archiveReelMp4] échec de l'appel à reel-render:", error);
    throw new Error("La vidéo montée n'a pas pu être rangée dans ta bibliothèque.");
  }
  if (data?.error) throw new Error(data.error);
  if (!data?.url) throw new Error("La vidéo montée n'a pas pu être rangée dans ta bibliothèque.");
  return data.url as string;
}
