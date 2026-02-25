import { Button } from "@/components/ui/button";

interface BrandingTransitionStepProps {
  onNext: () => void;
}

export default function BrandingTransitionStep({ onNext }: BrandingTransitionStepProps) {
  return (
    <div className="flex flex-col items-center text-center space-y-8 animate-fade-in max-w-md mx-auto">
      <div className="space-y-4">
        <p className="text-5xl">🎨</p>
        <h1 className="font-display text-2xl font-bold text-foreground leading-tight">
          OK, maintenant on entre<br />dans le cœur de ta marque.
        </h1>
        <p className="text-sm text-muted-foreground">
          Les 5 prochaines questions vont nourrir ton IA perso. Elle s'en servira pour écrire tes contenus, auditer ton profil, et te coacher.
        </p>
        <p className="text-sm font-medium text-foreground">
          Réponds comme tu parles. Il n'y a pas de mauvaise réponse.
        </p>
      </div>

      <Button className="rounded-pill w-full" onClick={onNext}>
        C'est parti →
      </Button>
    </div>
  );
}
