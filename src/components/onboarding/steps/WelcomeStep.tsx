import { Button } from "@/components/ui/button";

interface WelcomeStepProps {
  onNext: () => void;
}

export default function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="text-center space-y-8">
      <div className="space-y-5">
        <p className="text-3xl md:text-4xl font-display font-bold text-foreground leading-tight">
          Hey 👋<br />Je suis ton assistante com'.
        </p>
        <p className="text-base text-muted-foreground leading-relaxed max-w-sm mx-auto">
          Avant de commencer, j'ai besoin de te poser quelques questions pour personnaliser ton espace.
        </p>
        <p className="text-sm text-muted-foreground">
          Ça prend 5 minutes. Promis.
        </p>
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm text-primary">
          <span className="text-base">🎤</span>
          <span>Dès que tu vois l'icône micro, tu peux dicter : c'est plus rapide !</span>
        </div>
      </div>
      <Button onClick={onNext} size="lg" className="rounded-full px-8 gap-2">
        C'est parti →
      </Button>
    </div>
  );
}
