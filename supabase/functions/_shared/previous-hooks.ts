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
): Promise<string[]> {
  const key = subjectKey(subject);
  if (!userId || key.length < 8) return [];

  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await getServiceClient()
      .from("content_quality_events")
      .select("content_preview, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      // On filtre le sujet côté code (la clé est normalisée) : on ratisse donc
      // un peu large en base, borné pour rester léger.
      .limit(60);
    if (error) throw error;

    const hooks: string[] = [];
    for (const row of data || []) {
      const p = (row as { content_preview?: { sujet?: string; hook?: string } }).content_preview;
      if (!p?.hook || typeof p.hook !== "string") continue;
      if (subjectKey(p.sujet) !== key) continue;
      hooks.push(p.hook);
      if (hooks.length >= limit) break;
    }
    return hooks;
  } catch (e) {
    console.error("[previous-hooks] lecture ignorée (génération intacte) :", (e as Error)?.message || e);
    return [];
  }
}
