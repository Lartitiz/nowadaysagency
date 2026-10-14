// Contexte commun aux actions du Studio, passé par index.ts.
import { getServiceClient } from "../../_shared/plan-limiter.ts";
import type { StudioParams } from "../request-schema.ts";

export type StudioContext = {
  sb: ReturnType<typeof getServiceClient>;
  actor: string;
  p: StudioParams;
  /** Réponse JSON avec les en-têtes CORS de la requête. */
  json: (body: unknown, status?: number) => Response;
  /** En-têtes CORS de la requête (réponses de quota construites hors `json`). */
  corsHeaders: Record<string, string>;
};
/** Ligne visual_studio_sessions telle que la renvoie le client Supabase (non typé). */
// deno-lint-ignore no-explicit-any
export type StudioSession = any;
