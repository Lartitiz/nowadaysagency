import { useEffect, useRef, useState } from "react";

/**
 * Loader de l'étape "structure" des carrousels photo/mix.
 *
 * Remplace l'ancien spinner figé + texte "ça prend quelques secondes" (qui
 * mentait : l'IA fait une analyse visuelle de toutes les photos, ~30 s).
 *
 * Apporte :
 *  - une barre de progression animée (même ressenti que l'étape génération),
 *  - des messages qui tournent et décrivent ce qui se passe vraiment,
 *  - une attente honnête + l'annonce qu'il y a 2 étapes (structure → génération).
 */

const MESSAGES_PHOTOS = [
  "Je regarde chacune de tes photos…",
  "Je repère ce qu'elles racontent…",
  "Je construis le fil narratif slide par slide…",
  "J'ordonne tes idées pour que ça accroche…",
];

const MESSAGES_SANS_PHOTOS = [
  "Je structure ton sujet en slides…",
  "Je construis le fil narratif…",
  "J'ordonne tes idées pour que ça accroche…",
];

export default function CarouselStructureLoader({ hasPhotos = false }: { hasPhotos?: boolean }) {
  const messages = hasPhotos ? MESSAGES_PHOTOS : MESSAGES_SANS_PHOTOS;
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();

    const msgInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 3500);

    // Barre de progression : rapide au début, ralentit en approchant 90 %.
    // Calée sur ~30 s (constante /14) car l'analyse vision dure souvent 25-40 s.
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const p = Math.min(90, 90 * (1 - Math.exp(-elapsed / 14)));
      setProgress(Math.round(p));
    }, 300);

    return () => {
      clearInterval(msgInterval);
      clearInterval(progressInterval);
    };
  }, [messages.length]);

  return (
    <div className="py-16 text-center space-y-5 animate-fade-in max-w-md mx-auto">
      <span className="inline-block text-2xs font-semibold uppercase tracking-wide text-primary/70 bg-primary/10 rounded-full px-3 py-1">
        Étape 1 / 2 · Structure
      </span>

      <div className="space-y-3">
        <p
          key={messageIndex}
          className="text-sm font-medium text-foreground animate-fade-in"
        >
          {messages[messageIndex]}
        </p>
        <div className="w-full bg-secondary rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {hasPhotos
          ? "J'analyse tes photos une par une — compte une trentaine de secondes. Tu valideras la structure avant la rédaction."
          : "Je prépare la structure — quelques secondes. Tu la valideras avant la rédaction."}
      </p>
    </div>
  );
}
