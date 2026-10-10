// Plan du carrousel (structure_proposal) : rattrapage des appels lents.
//
// Le plan est un seul appel Sonnet non streamé (~55-62 s d'habitude) mais une
// réponse de l'API traîne parfois bien plus (164 s mesurés le 10/10/2026, sans
// erreur ni relance), et revient parfois vide (1 fois sur 12 le 10/10, après
// 72 s). L'écran abandonne à 170 s (STRUCTURE_PROPOSAL_TIMEOUT_MS,
// src/hooks/use-do-generate.ts) et génère alors SANS plan.
//
// Parade : si le premier appel n'a pas répondu après STRUCTURE_HEDGE_AFTER_MS,
// on lance UN second appel identique en parallèle et on garde la première
// réponse valide ; l'autre est alors annulé. Le premier n'est pas coupé au
// moment du second (il peut finir juste après). Un échec rapide du premier
// déclenche aussi le second tout de suite. Au-delà de STRUCTURE_DEADLINE_MS
// depuis le début de la requête, tout est annulé et on rend une erreur avant
// que l'écran ne coupe. Le plan demandé est strictement le même.

// Au-dessus des plans normaux (56 à 72 s sur 12 mesures en ligne le 10/10/2026) :
// un plan ordinaire n'est jamais demandé deux fois. Choix de Laetitia (10/10) :
// relance à 80 s et écran porté à 170 s plutôt qu'une relance plus précoce.
export const STRUCTURE_HEDGE_AFTER_MS = 80_000;
// 10 s sous les 170 s de l'écran (envoi des photos, réseau, lecture de la réponse).
export const STRUCTURE_DEADLINE_MS = 160_000;

export class StructureDeadlineError extends Error {
  status = 504;
  constructor() {
    super("La proposition de structure a pris trop de temps.");
  }
}

export interface HedgeReport {
  winner: 1 | 2 | null;
  calls: number;
  elapsed_ms: number;
  timed_out?: boolean;
  first_error?: string;
  second_error?: string;
}

export interface HedgeOptions {
  /** Temps déjà écoulé depuis le début de la requête (préparation). */
  elapsedMs?: number;
  hedgeAfterMs?: number;
  deadlineMs?: number;
  onReport?: (report: HedgeReport) => void;
}

const errText = (e: unknown) => String((e as any)?.message || e).slice(0, 160);
// Erreurs définitives (requête refusée, quota, limite de débit) : un second
// appel identique échouerait pareil.
const isFinalError = (e: unknown) => [400, 401, 402, 403, 413, 429].includes(Number((e as any)?.status));

/**
 * `start(n, signal)` lance l'appel n° n (1 ou 2). `signal` est annulé dès que
 * l'issue est connue (autre appel gagnant, échec, échéance).
 */
export function hedgedStructureCall<T>(
  start: (n: 1 | 2, signal: AbortSignal) => Promise<T>,
  opts: HedgeOptions = {},
): Promise<T> {
  const elapsed0 = opts.elapsedMs || 0;
  const t0 = Date.now() - elapsed0;
  const hedgeAfter = opts.hedgeAfterMs ?? STRUCTURE_HEDGE_AFTER_MS;
  const deadline = opts.deadlineMs ?? STRUCTURE_DEADLINE_MS;
  const left = () => deadline - (Date.now() - t0);
  const ac = new AbortController();

  return new Promise<T>((resolve, reject) => {
    const report: HedgeReport = { winner: null, calls: 0, elapsed_ms: 0 };
    let settled = false, pending = 0;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (ok: boolean, value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedgeTimer);
      clearTimeout(deadlineTimer);
      ac.abort();
      report.elapsed_ms = Date.now() - t0;
      opts.onReport?.(report);
      if (ok) resolve(value as T); else reject(value);
    };
    const launch = (n: 1 | 2) => {
      report.calls = n;
      pending++;
      let call: Promise<T>;
      try { call = start(n, ac.signal); } catch (e) { call = Promise.reject(e); }
      call.then(
        (value) => { if (!settled) report.winner = n; finish(true, value); },
        (err) => {
          pending--;
          if (settled) return;
          if (n === 1) report.first_error = errText(err); else report.second_error = errText(err);
          // Échec du premier avant le départ du second : relance immédiate.
          if (n === 1 && report.calls === 1 && !isFinalError(err)) {
            clearTimeout(hedgeTimer);
            launch(2);
            return;
          }
          if (pending === 0) finish(false, err);
        },
      );
    };
    launch(1);
    hedgeTimer = setTimeout(() => { if (!settled && report.calls === 1) launch(2); }, Math.max(0, hedgeAfter - elapsed0));
    deadlineTimer = setTimeout(() => {
      report.timed_out = true;
      finish(false, new StructureDeadlineError());
    }, Math.max(0, left()));
  });
}
