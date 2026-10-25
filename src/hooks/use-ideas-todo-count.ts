import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Compteur « Accéder à mes idées (N) » de l'accueil : les idées encore à faire
 * (ni posées au calendrier, ni planned/published).
 *
 * Historique (21-25/10/2026) : le `HEAD count exact` direct sur `saved_ideas`
 * était la requête la plus lourde de l'accueil — la policy RLS plpgsql
 * `user_has_workspace_access` s'évaluait ligne à ligne (~500 lignes de 50 Ko
 * pour le compte test) — et la première à dépasser le statement_timeout de 8 s
 * les matins où la base est saturée → HTTP 500 sans corps (HEAD) + bandeau
 * « données incomplètes ». D'où trois parades :
 *  1. la RPC `count_ideas_a_faire` : un seul contrôle d'accès puis un count
 *     sur index partiel, sans RLS ligne à ligne (repli sur l'ancienne requête
 *     tant que la migration n'est pas en base) ;
 *  2. 2 nouvelles tentatives espacées (1 s puis 3 s) au lieu d'une seule ;
 *  3. le dernier compte connu (localStorage) reste affiché si seule cette
 *     lecture échoue — le bandeau ne s'allume que si on ne sait rien du tout.
 * On ne maquille jamais une erreur en « 0 idée ».
 */

const STORAGE_PREFIX = "lac_ideas_todo_count:";

type CountClient = {
  rpc: (fn: "count_ideas_a_faire", args: { p_workspace_id?: string }) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
  from: typeof supabase.from;
};

/** La fonction n'existe pas (encore) côté base : PostgREST 404 PGRST202, Postgres 42883. */
export function isMissingFunction(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? "");
}

export function readLastKnownIdeasCount(scopeKey: string): number | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + scopeKey);
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

export function rememberIdeasCount(scopeKey: string, n: number): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + scopeKey, String(n));
  } catch {
    /* stockage indisponible : on vit sans mémoire */
  }
}

/** Délai avant nouvelle tentative : 1 s, puis 3 s (une base qui se réveille a besoin d'air). */
export function ideasCountRetryDelay(failureCount: number): number {
  return failureCount <= 0 ? 1000 : 3000;
}
export const IDEAS_COUNT_RETRY = 2;

export async function fetchIdeasTodoCount(client: CountClient, userId: string, workspaceId: string | null): Promise<number> {
  const rpc = await client.rpc("count_ideas_a_faire", workspaceId ? { p_workspace_id: workspaceId } : {});
  if (!rpc.error) return typeof rpc.data === "number" ? rpc.data : Number(rpc.data ?? 0) || 0;
  if (!isMissingFunction(rpc.error)) {
    // Le code PostgREST (57014 = délai dépassé, PGRST002 = cache de schéma…) est
    // la seule trace exploitable par la visite du matin : on le laisse en console.
    console.warn("[accueil] compteur d'idées (rpc)", rpc.error.code ?? "", rpc.error.message ?? "");
    throw rpc.error;
  }
  // Migration pas encore appliquée : ancienne requête, en ne lisant que l'id.
  const filterCol = workspaceId ? "workspace_id" : "user_id";
  const { count, error } = await client
    .from("saved_ideas")
    .select("id", { count: "exact", head: true })
    .eq(filterCol, workspaceId ?? userId)
    .is("calendar_post_id", null)
    .or("status.is.null,status.not.in.(planned,published)");
  if (error) {
    console.warn("[accueil] compteur d'idées (head)", error.code ?? "", error.message ?? "");
    throw error;
  }
  return count ?? 0;
}

export type IdeasTodoCount = {
  /** Compte à afficher (dernier connu si la lecture du jour a échoué), 0 si rien n'est su. */
  count: number;
  /** false = on ne sait rien (ni lecture réussie, ni mémoire) → le bandeau d'erreur a sa place. */
  known: boolean;
  /** true = la lecture a échoué, le compte vient de la mémoire locale. */
  fromMemory: boolean;
  isError: boolean;
};

export function useIdeasTodoCount(userId: string | undefined, workspaceId: string | null, opts?: { retry?: number | boolean }): IdeasTodoCount {
  const scopeKey = workspaceId ?? userId ?? "";
  const lastKnown = useMemo(() => (scopeKey ? readLastKnownIdeasCount(scopeKey) : undefined), [scopeKey]);
  const { data, isError } = useQuery<number>({
    queryKey: ["adaptive-home-ideas-count", userId, workspaceId],
    queryFn: async () => {
      if (!userId) return 0;
      const n = await fetchIdeasTodoCount(supabase as unknown as CountClient, userId, workspaceId);
      rememberIdeasCount(scopeKey, n);
      return n;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
    retry: opts?.retry ?? IDEAS_COUNT_RETRY,
    retryDelay: ideasCountRetryDelay,
  });
  const fromMemory = data === undefined && lastKnown !== undefined;
  return {
    count: data ?? lastKnown ?? 0,
    known: data !== undefined || lastKnown !== undefined,
    fromMemory,
    isError,
  };
}
