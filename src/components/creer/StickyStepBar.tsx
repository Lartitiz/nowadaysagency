import type { ReactNode } from "react";

/**
 * Barre d'actions collée en bas de l'écran, pour que le bouton principal reste
 * visible sans défiler (règle « presque pas de défilement »). Même rendu que la
 * barre « Suivant » de l'écran Format (chantier B) : sur téléphone, elle se pose
 * au-dessus de la barre du menu du bas ; sur ordinateur, tout en bas.
 * Le parent doit avoir le padding horizontal de /creer (px-4 sm:px-6).
 */
export default function StickyStepBar({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2 pb-3 bg-background/95 backdrop-blur-sm border-t border-border/60 space-y-1"
    >
      {children}
    </div>
  );
}
