import { Button } from "@/components/ui/button";

interface WelcomeStepProps {
  onNext: () => void;
}

export default function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="text-center space-y-8">
      <div className="space-y-5 max-w-md mx-auto">
        <p className="text-3xl md:text-4xl font-display font-bold text-foreground leading-tight">
          Hey 👋 Bienvenue.
        </p>
        <div className="space-y-4 text-left">
          <p className="text-base text-muted-foreground leading-relaxed">
            Ici, on ne va pas juste "créer un compte". En 5 minutes de questions, je vais comprendre ton activité, tes objectifs et là où tu en es dans ta com.
          </p>
          <p className="text-base text-foreground font-medium leading-relaxed">
            L'idée ? Que tu arrêtes de poster au hasard. Que tu saches enfin quoi dire, à qui, sur quel canal, et quand. Pas dans trois mois. Dès aujourd'hui.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm text-primary">
          <span className="text-base">🎤</span>
          <span className="italic">Tu peux dicter tes réponses avec le micro, c'est plus rapide.</span>
        </div>
      </div>
      <Button onClick={onNext} size="lg" className="rounded-full px-8 gap-2">
        C'est parti →
      </Button>
    </div>
  );
}
