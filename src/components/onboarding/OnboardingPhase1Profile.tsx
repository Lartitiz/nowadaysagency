import { Button } from "@/components/ui/button";
import { VoiceInput } from "./OnboardingShared";

export default function OnboardingPhase1Profile({ prenom, activite, onPrenomChange, onActiviteChange, onNext }: {
  prenom: string;
  activite: string;
  onPrenomChange: (v: string) => void;
  onActiviteChange: (v: string) => void;
  onNext: () => void;
}) {
  const canNext = prenom.trim().length >= 2 && activite.trim().length >= 2;

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Dis-moi qui tu es
        </h1>
        <p className="text-sm text-muted-foreground italic">
          en deux mots, comme tu le dirais à quelqu'un dans un café
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ton prénom</label>
          <input
            type="text"
            value={prenom}
            onChange={e => onPrenomChange(e.target.value)}
            placeholder="Léa"
            autoFocus
            aria-label="Ton prénom"
            onKeyDown={e => { if (e.key === "Enter" && prenom.trim().length >= 2) { e.preventDefault(); const activiteInput = document.getElementById("onboarding-activite"); activiteInput?.focus(); } }}
            className="w-full text-xl p-4 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tu fais quoi ?</label>
          <VoiceInput
            value={activite}
            onChange={onActiviteChange}
            placeholder="Photographe portrait pour entrepreneures"
            onEnter={canNext ? onNext : undefined}
            showVoiceTip
          />
        </div>
      </div>

      <div className="text-center">
        <Button onClick={onNext} disabled={!canNext} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}
