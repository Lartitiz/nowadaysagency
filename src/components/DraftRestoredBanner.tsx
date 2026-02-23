import { useState } from "react";

interface DraftRestoredBannerProps {
  onContinue: () => void;
  onDiscard: () => void;
}

export function DraftRestoredBanner({ onContinue, onDiscard }: DraftRestoredBannerProps) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-rose-pale px-4 py-3 flex items-center justify-between gap-3 animate-fade-in">
      <p className="text-sm text-foreground">
        💡 Brouillon restauré — tu avais des données en cours.
      </p>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => { setVisible(false); onContinue(); }}
          className="text-xs font-medium text-primary hover:underline"
        >
          Continuer
        </button>
        <button
          onClick={() => { setVisible(false); onDiscard(); }}
          className="text-xs text-muted-foreground hover:underline"
        >
          Recommencer
        </button>
      </div>
    </div>
  );
}
