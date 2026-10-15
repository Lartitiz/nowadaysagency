import { Button } from "@/components/ui/button";
import { VoiceInput } from "./OnboardingShared";

/**
 * Étape 1 : le prénom et « Tu fais quoi ? » sur un seul écran (les deux sont
 * souvent déjà pré-remplis depuis l'inscription : un écran de moins à cliquer).
 */
export default function OnboardingPhase1Profile({ prenom, activite, onPrenomChange, onActiviteChange, onNext }: {
  prenom: string;
  activite: string;
  onPrenomChange: (v: string) => void;
  onActiviteChange: (v: string) => void;
  onNext: () => void;
}) {
  const prenomOk = prenom.trim().length >= 2;
  const activiteOk = activite.trim().length >= 2;

  return (
    <div className="space-y-7">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Dis-moi qui tu es
        </h1>
        <p className="text-sm text-muted-foreground italic">
          en deux mots, comme tu le dirais à quelqu'un dans un café
        </p>
      </div>

      <div>
        <label htmlFor="onb-prenom" className="text-xs font-medium text-muted-foreground mb-1.5 block">Ton prénom</label>
        {/* given-name (et pas name) : l'autofill navigateur mettait le NOM de
            famille dans le champ « Tu fais quoi ? » */}
        <input
          id="onb-prenom"
          type="text"
          value={prenom}
          onChange={e => onPrenomChange(e.target.value)}
          placeholder="Léa"
          autoFocus={!prenomOk}
          autoComplete="given-name"
          aria-label="Ton prénom"
          className="w-full text-xl p-3 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tu fais quoi, en deux mots ?</label>
        <VoiceInput
          value={activite}
          onChange={onActiviteChange}
          placeholder="Photographe portrait pour entrepreneures"
          onEnter={prenomOk && activiteOk ? onNext : undefined}
          autoFocus={prenomOk}
          showVoiceTip
        />
      </div>

      <div className="text-center">
        <Button onClick={onNext} disabled={!prenomOk || !activiteOk} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}
