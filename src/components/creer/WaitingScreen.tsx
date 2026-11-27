import { useEffect, useRef, useState, type ReactNode } from "react";
import { elapsedLabel } from "@/components/creer/GenerationTimeHint";
import { waitPhaseEnded, waitPhaseStarted } from "@/lib/generation-wait-clock";

/**
 * Brique commune des écrans d'attente (chantier 1 de la carte des doublons,
 * 27/11/2026). Elle règle COMMENT l'attente s'affiche ; chaque écran garde SES
 * phrases, ses durées et ses textes :
 *  - une barre honnête : monte vite puis plafonne, ne touche jamais 100 % seule ;
 *  - des phrases qui tournent (`rotation`) ou qui suivent le temps (`timeline`) ;
 *  - « Déjà X s », avec un chrono qui continue d'un écran d'attente à l'autre
 *    (`generation-wait-clock`) quand `shareClock` est vrai ;
 *  - des notes de réassurance qui s'affichent après N secondes (`notes`).
 * Affichage pur : rien en base, aucun appel IA, aucun crédit.
 */

export type WaitingNote = { afterSeconds: number; text: string };

/** Réassurance par défaut, à reprendre telle quelle ou à remplacer par ses propres phrases. */
export const DEFAULT_REASSURANCE: WaitingNote[] = [
  { afterSeconds: 15, text: "Ça travaille bien, je ne t'ai pas oublié·e." },
  { afterSeconds: 30, text: "C'est un peu long, mais ça avance. Tu peux rester sur cette page." },
];

export interface WaitingOptions {
  /** Faux : le décompte est à l'arrêt (écran pas affiché). */
  active?: boolean;
  /** Rythme de rafraîchissement, en ms. */
  tickMs?: number;
  /** Courbe de la barre : scale × (1 − e^(−t/tau)), plafonnée à ceiling. */
  tauSeconds?: number;
  ceiling?: number;
  scale?: number;
  /** Phrases qui tournent à intervalle fixe. */
  rotation?: { messages: string[]; everyMs: number };
  /** Phrases qui suivent le temps écoulé (time en ms, déjà triées). */
  timeline?: { time: number; text: string }[];
  /** Phrases de réassurance, dans l'ordre des secondes. */
  notes?: WaitingNote[];
  /** Le « Déjà X s » reprend le chrono de l'écran d'attente d'avant. */
  shareClock?: boolean;
}

export function waitingProgress(elapsedSeconds: number, { tauSeconds = 25, ceiling = 90, scale }: { tauSeconds?: number; ceiling?: number; scale?: number } = {}) {
  return Math.min(ceiling, (scale ?? ceiling) * (1 - Math.exp(-elapsedSeconds / tauSeconds)));
}

export function useWaitingScreen(opts: WaitingOptions = {}) {
  const { active = true, tickMs = 300, shareClock = false } = opts;
  const startRef = useRef(Date.now());
  const [clockStart] = useState(() => (shareClock && active ? waitPhaseStarted() : Date.now()));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    startRef.current = Date.now();
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(t);
  }, [active, tickMs]);
  useEffect(() => (shareClock ? () => waitPhaseEnded() : undefined), [shareClock]);

  const localMs = Math.max(0, now - startRef.current);
  const localSeconds = localMs / 1000;
  const elapsedSeconds = Math.max(0, Math.round((now - (shareClock ? clockStart : startRef.current)) / 1000));

  let message = "";
  if (opts.rotation && opts.rotation.messages.length > 0) {
    const { messages, everyMs } = opts.rotation;
    message = messages[Math.floor(localMs / everyMs) % messages.length];
  } else if (opts.timeline && opts.timeline.length > 0) {
    message = opts.timeline[0].text;
    for (const m of opts.timeline) if (localMs >= m.time) message = m.text;
  }
  let note: string | null = null;
  for (const n of opts.notes ?? []) if (localSeconds >= n.afterSeconds) note = n.text;

  return { progress: waitingProgress(localSeconds, opts), message, note, elapsedSeconds, elapsedLabel: elapsedLabel(elapsedSeconds), localSeconds };
}

export function WaitingBar({ value, className = "bg-secondary rounded-full h-2", fillClassName = "bg-primary h-2 rounded-full transition-all duration-500 ease-out" }: { value: number; className?: string; fillClassName?: string }) {
  return (
    <div className={`w-full ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <div className={fillClassName} style={{ width: `${value}%` }} />
    </div>
  );
}

/** « Déjà X s » seul, pour les écrans qui ont déjà leur propre phrase de durée. */
export function WaitingElapsed({ seconds, testId }: { seconds: number; testId?: string }) {
  return <span data-testid={testId}>Déjà {elapsedLabel(seconds)}.</span>;
}

export interface WaitingScreenProps extends WaitingOptions {
  badge?: ReactNode;
  /** Phrase de durée annoncée, suivie de « Déjà X s ». */
  hint?: ReactNode;
  className?: string;
  messageClassName?: string;
  elapsedTestId?: string;
  /** Contenu propre à l'écran, sous la durée. */
  children?: ReactNode;
}

export default function WaitingScreen({ badge, hint, className = "text-center space-y-5 animate-fade-in mx-auto", messageClassName = "text-sm font-medium text-foreground animate-fade-in", elapsedTestId, children, ...opts }: WaitingScreenProps) {
  const w = useWaitingScreen(opts);
  return (
    <div className={className}>
      {badge}
      <div className="space-y-3">
        <p key={w.message} className={messageClassName}>{w.message}</p>
        <WaitingBar value={Math.round(w.progress)} />
      </div>
      <p className="text-xs text-muted-foreground">
        {hint}{hint ? " " : ""}
        <WaitingElapsed seconds={w.elapsedSeconds} testId={elapsedTestId} />
      </p>
      {children}
      {w.note && <p className="text-xs text-muted-foreground animate-fade-in" data-testid="waiting-note">{w.note}</p>}
    </div>
  );
}
