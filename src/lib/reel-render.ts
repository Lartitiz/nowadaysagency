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
  buildRenderPlan,
  countSectionsWithoutVoice,
} from "@/lib/reel-plan";
export type { RenderPlan, RenderSectionInput } from "@/lib/reel-plan";

/** Lance un rendu. Renvoie l'identifiant de projet. */
export async function submitReelRender(plan: RenderPlan): Promise<string> {
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
      throw new Error(st.message || "Le montage a échoué.");
    }
  }
  throw new Error("Le montage prend plus de temps que prévu. Réessaie dans un instant.");
}
