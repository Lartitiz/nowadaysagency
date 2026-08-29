import { Button } from "@/components/ui/button";

interface WelcomeStepProps {
  onNext: () => void;
}

export default function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="text-center space-y-8">
      <div className="space-y-5 max-w-md mx-auto">
        <p className="text-3xl md:text-4xl font-display font-bold text-foreground leading-tight">
          {/* L'espace typographique d'Instrument Serif est étroite (0,17 em) et
              l'emoji, lui, est calé à droite dans son approche : le 👋 vient
              coller le « B » de Bienvenue alors que le texte contient bien des
              espaces. On compense l'approche droite plutôt que d'ajouter une
              seconde espace, pour que le titre reste « Hey 👋 Bienvenue. » à la
              sélection et à la lecture d'écran. */}
          Hey <span className="mr-[0.12em]">👋</span> Bienvenue.
        </p>
        <div className="space-y-4 text-left">
          <p className="text-base text-muted-foreground leading-relaxed">
            Ici, on ne va pas juste "créer un compte". En 3 minutes, je vais comprendre ton activité et là où tu en es dans ta com.
          </p>
          <p className="text-base text-foreground font-medium leading-relaxed">
            L'idée ? Que tu puisses gagner un max de temps dans ta communication.
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
