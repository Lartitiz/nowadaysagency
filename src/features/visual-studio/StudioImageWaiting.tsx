// Attente d'une image du Studio visuel (27/11/2026, Loom de Laetitia : « une
// espèce d'animation où on voit petit à petit l'image se faire pour que
// l'attente soit moins longue »). Le fournisseur n'envoie l'image qu'une fois
// finie : on ne peut pas montrer la vraie image en train de se faire. À la
// place, la photo de départ apparaît floue et pâle, un reflet passe dessus et
// elle se précise au fil des secondes ; sans photo de départ, un cadre rose
// pâle avec le même reflet. Avant : une phrase fixe pendant ~40 s.
// Temps compté depuis `created_at` de l'image : il continue après un
// rechargement de la page.
import { useEffect, useState } from "react";

/** Mesuré le 27/11/2026 sur une photo de pièce meublée : ~35 à 40 s. */
const USUAL_SECONDS = 60;

export function elapsedSince(createdAt: string, now: number): number {
  const start = Date.parse(createdAt);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 1000));
}

export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function waitingMessage(seconds: number): string {
  return seconds < USUAL_SECONDS * 2
    ? "Ta nouvelle image se prépare… compte environ 1 minute"
    : "C’est plus long que d’habitude, l’image continue de se préparer…";
}

/** Secondes écoulées depuis `createdAt`, rafraîchies chaque seconde. */
export function useStudioElapsed(createdAt: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return elapsedSince(createdAt, now);
}

/** « Création en cours · 0:18 » dans l'en-tête de la carte. */
export function StudioWaitingLabel({ createdAt }: { createdAt: string }) {
  const seconds = useStudioElapsed(createdAt);
  return <>Création en cours · {formatElapsed(seconds)}</>;
}

export function StudioImageWaiting({ createdAt, startPhoto, format }: {
  createdAt: string;
  startPhoto?: string;
  format?: "square" | "portrait" | "landscape";
}) {
  const seconds = useStudioElapsed(createdAt);
  // Se précise doucement sur la première minute, sans jamais devenir nette :
  // ce n'est pas le résultat.
  const progress = Math.min(seconds / USUAL_SECONDS, 1);
  const blur = 16 - 8 * progress;
  return (
    <div className={`studio-image-waiting studio-image-waiting-${format || "portrait"}`} role="status" aria-live="polite">
      {startPhoto && <img
        src={startPhoto}
        alt=""
        className="studio-image-waiting-photo"
        style={{ filter: `blur(${blur}px) saturate(${0.35 + 0.3 * progress})`, opacity: 0.5 + 0.2 * progress }}
      />}
      <div className="studio-image-waiting-sweep" aria-hidden="true" />
      <p className="studio-image-waiting-note">{waitingMessage(seconds)}</p>
    </div>
  );
}
