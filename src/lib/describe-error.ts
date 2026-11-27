// Traduction commune d'une erreur en phrase de tous les jours + sorte d'erreur
// (chantier 4 de la carte des doublons, 27/11/2026). Réutilise
// `readableError` (src/lib/error-messages.ts) : on n'écrit pas de deuxième
// liste de messages. Sert au bloc `ErrorWithRetry` et aux écrans qui veulent
// savoir si « Réessayer » a un sens (un quota atteint ne se réessaie pas).
import { findQuota, quotaLimitMessage } from "@/lib/quota-message";
import { readableError } from "@/lib/error-messages";
import { Sentry } from "@/lib/sentry-lazy";

export type ErrorKind = "quota" | "timeout" | "offline" | "auth" | "empty" | "generic";

export interface DescribedError {
  kind: ErrorKind;
  message: string;
  /** « Réessayer » a un sens (faux pour un quota atteint ou une session expirée). */
  retryable: boolean;
}

const DEFAULT_FALLBACK = "Quelque chose n'a pas fonctionné. Réessaie, et si le problème persiste, contacte-nous.";

// Phrases de quota du serveur (plan-limiter) et code « limit_reached ».
const QUOTA_TEXT = /^limit_reached$|^Tu as (utilisé|fait|créé) tes \d+ |^Tu as atteint (la|une) limite|limites? du mois|comprises? dans Premium|disponible à partir/i;

function rawOf(e: unknown): string {
  if (typeof e === "string") return e;
  const anyE = e as any;
  return String(anyE?.message ?? anyE?.error ?? "");
}

export function describeError(e: unknown, opts: { fallback?: string } = {}): DescribedError {
  const fallback = opts.fallback ?? DEFAULT_FALLBACK;
  const anyE = e as any;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { kind: "offline", message: "Tu n'as plus de connexion. Vérifie ton Wi-Fi, puis réessaie.", retryable: true };
  }
  const quota = findQuota(e);
  if (quotaLimitMessage(quota)) {
    return { kind: "quota", message: readableError(e, fallback), retryable: false };
  }
  const raw = rawOf(e).trim();
  // Quota reconnu au texte quand l'objet quota s'est perdu en route (erreur
  // recréée avec le seul message, ou message passé en chaîne). Une panne de
  // VÉRIFICATION du quota (quota_check_failed) n'est pas un quota atteint.
  if (anyE?._isQuota || (QUOTA_TEXT.test(raw) && !/quota_check_failed|impossible de vérifier/i.test(raw))) {
    return { kind: "quota", message: readableError(e, fallback), retryable: false };
  }
  if (anyE?.isTimeout || anyE?.code === "TIMEOUT") {
    // Le message de invokeWithTimeout dit de vérifier le résultat avant de relancer
    // (le traitement peut s'être terminé et avoir débité) : on le garde tel quel.
    return { kind: "timeout", message: raw ? readableError(e, fallback) : "Ça prend plus longtemps que prévu. Vérifie si le résultat est arrivé avant de relancer.", retryable: true };
  }
  if (!raw) return { kind: "empty", message: fallback, retryable: true };
  const message = readableError(e, fallback);
  if (anyE?.isAuth || anyE?.code === "AUTH" || anyE?.code === "FORBIDDEN") {
    return { kind: "auth", message, retryable: false };
  }
  if (/\b401\b|non.?authentifi|not.?authenticated|\bjwt\b|session a expiré/i.test(raw) || /session a expiré/i.test(message)) {
    return { kind: "auth", message, retryable: false };
  }
  return { kind: "generic", message, retryable: true };
}

/**
 * Trace d'un bloc d'erreur affiché, comme generation-telemetry : catégories
 * fermées seulement (jamais le texte de l'erreur ni le contenu de la personne).
 */
export function reportErrorBlock(where: string, kind: ErrorKind): void {
  try {
    // Comme generation-telemetry : quota, session expirée et coupure réseau
    // ne sont pas des pannes de l'outil.
    if (kind === "quota" || kind === "auth" || kind === "offline") return;
    if (!import.meta.env.PROD) return;
    const w = /^[a-z0-9_.-]{1,60}$/i.test(where) ? where : "inconnu";
    (Sentry as any).captureMessage(`Erreur affichée : ${w}`, {
      level: "warning",
      tags: { error_block_where: w, error_block_kind: kind },
      fingerprint: ["error-block", w, kind],
    });
  } catch {
    /* la télémétrie ne doit jamais créer une deuxième erreur */
  }
}
