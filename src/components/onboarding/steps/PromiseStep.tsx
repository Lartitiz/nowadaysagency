import { Button } from "@/components/ui/button";

interface PromiseStepProps {
  onNext: () => void;
}

export default function PromiseStep({ onNext }: PromiseStepProps) {
  return (
    <div className="flex flex-col items-center text-center space-y-8 animate-fade-in max-w-md mx-auto">
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold text-foreground leading-tight">
          Ce que tu vas débloquer<br />en 5 minutes :
        </h1>
      </div>

      <div className="space-y-4 w-full text-left">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <span className="text-2xl">🎯</span>
          <p className="text-sm text-foreground">Un diagnostic complet de ta com' avec un score sur 100</p>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <span className="text-2xl">🧠</span>
          <p className="text-sm text-foreground">Un outil qui connaît ta marque, ton ton, ta cible</p>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <span className="text-2xl">📅</span>
          <p className="text-sm text-foreground">Un espace avec tes priorités, ton calendrier, tes contenus</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Plus tu me donnes de contexte, plus l'outil est puissant pour toi.
      </p>

      <Button className="rounded-pill w-full" onClick={onNext}>
        J'ai compris, on y va →
      </Button>
    </div>
  );
}
