// Accroches déjà écrites par la même utilisatrice sur le MÊME sujet — la
// matière que le gate rédactionnel n'a jamais eue (bilan hebdo 24/08/2026).
//
// Le gate note chaque contenu isolément : trois reels d'un même sujet ouvrant
// tous par « En 2026, on… » ont été notés 100/100 chacun. Pour voir la redite,
// il faut lui donner les accroches précédentes — et elles existent déjà :
// `content_quality_events.content_preview.hook`, écrit à CHAQUE génération par
// `logContentQuality`. Aucune nouvelle table, aucune écriture en plus.
//
// 🔑 Contrat de sûreté, identique à logContentQuality : lecture best-effort,
// jamais bloquante. Toute erreur (colonne absente, table vide, réseau) renvoie
// une liste vide, et le gate retombe exactement sur son comportement d'avant.
// Une garde qualité ne doit JAMAIS pouvoir faire échouer une génération.
import { getServiceClient } from "./plan-limiter.ts";

/** Fenêtre de recherche : au-delà, une reprise du même angle est légitime. */
const LOOKBACK_DAYS = 30;
/** Assez pour couvrir une série ; au-delà l'instruction de correction devient illisible. */
const MAX_HOOKS = 6;

/** New events keep a normalized key apart from their 100-character preview. */
export function matchesHookSubject(preview: { sujet?: string; subject_key?: string }, subject: string): boolean {
  const key = subjectKey(subject);
  if (typeof preview.subject_key === "string" && preview.subject_key) return preview.subject_key === key;
  // Old events have only the display preview. Compare the same truncation;
  // distinctions beyond its 100 characters cannot be reconstructed retroactively.
  const legacySubject = subject.replace(/\s+/g, " ").trim().slice(0, 100);
  return subjectKey(preview.sujet) === subjectKey(legacySubject);
}

/** Clé de rapprochement d'un sujet : tolère la casse, les espaces et la ponctuation de bord. */
export function subjectKey(subject: string | undefined | null): string {
  return (subject || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim()
    .slice(0, 120);
}

/**
 * Accroches des contenus précédents de CETTE utilisatrice sur CE sujet.
 * Renvoie [] dès que le sujet est trop court pour être un sujet (un rapprochement
 * sur « oui » ou sur une chaîne vide ramasserait des contenus sans rapport).
 */
export async function fetchPreviousHooks(
  userId: string,
  subject: string | undefined,
  limit = MAX_HOOKS,
  workspaceId?: string | null,
): Promise<string[]> {
  const key = subjectKey(subject);
  if (!userId || key.length < 8) return [];

  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    let query = getServiceClient()
      .from("content_quality_events")
      .select("content_preview, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      // On filtre le sujet côté code (la clé est normalisée) : on ratisse donc
      // un peu large en base, borné pour rester léger.
      .limit(60);
    query = workspaceId ? query.eq("workspace_id", workspaceId) : query.is("workspace_id", null);
    const { data, error } = await query;
    if (error) throw error;

    const hooks: string[] = [];
    for (const row of data || []) {
      const p = (row as { content_preview?: { sujet?: string; subject_key?: string; hook?: string } }).content_preview;
      if (!p?.hook || typeof p.hook !== "string") continue;
      if (!matchesHookSubject(p, subject!)) continue;
      hooks.push(p.hook);
      if (hooks.length >= limit) break;
    }
    return hooks;
  } catch (e) {
    console.error("[previous-hooks] lecture ignorée (génération intacte) :", (e as Error)?.message || e);
    return [];
  }
}

/**
 * Accroches récentes de la même utilisatrice pour un FORMAT donné, tous
 * sujets confondus (audit stories 07/09/2026 : « Un truc qui me fatigue
 * dans… » ouvrait deux séquences de stories à trois semaines d'écart, sur deux
 * sujets différents — la garde par sujet ne pouvait pas le voir). Même contrat
 * de sûreté : best-effort, jamais bloquant, [] en cas d'erreur.
 */
export async function fetchPreviousHooksByFormat(
  userId: string,
  format: string,
  limit = MAX_HOOKS,
  workspaceId?: string | null,
): Promise<string[]> {
  if (!userId || !format) return [];
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    let query = getServiceClient()
      .from("content_quality_events")
      .select("content_preview, created_at")
      .eq("user_id", userId)
      .eq("format", format)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);
    query = workspaceId ? query.eq("workspace_id", workspaceId) : query.is("workspace_id", null);
    const { data, error } = await query;
    if (error) throw error;
    const hooks: string[] = [];
    for (const row of data || []) {
      const p = (row as { content_preview?: { hook?: string } }).content_preview;
      if (typeof p?.hook === "string" && p.hook.trim()) hooks.push(p.hook.trim());
    }
    return hooks;
  } catch (e) {
    console.error("[previous-hooks] lecture par format ignorée (génération intacte) :", (e as Error)?.message || e);
    return [];
  }
}
