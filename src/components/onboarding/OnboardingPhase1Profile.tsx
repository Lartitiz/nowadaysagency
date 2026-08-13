import { useState } from "react";
import { Button } from "@/components/ui/button";
import { VoiceInput } from "./OnboardingShared";

/**
 * Étape 1 en deux écrans successifs :
 *   1. le prénom (modifiable, on arrive dessus en premier)
 *   2. « Tu fais quoi ? »
 * Les deux sous-écrans vivent dans la même étape globale pour ne pas
 * renuméroter tout le flux d'onboarding (validators, progression, diagnostic).
 */
export default function OnboardingPhase1Profile({ prenom, activite, onPrenomChange, onActiviteChange, onNext }: {
  prenom: string;
  activite: string;
  onPrenomChange: (v: string) => void;
  onActiviteChange: (v: string) => void;
  onNext: () => void;
}) {
  const [sub, setSub] = useState<0 | 1>(0);

  const prenomOk = prenom.trim().length >= 2;
  const activiteOk = activite.trim().length >= 2;

  if (sub === 0) {
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

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ton prénom</label>
          {/* given-name (et pas name) : l'autofill navigateur mettait le NOM de
              famille dans le champ « Tu fais quoi ? » de l'écran suivant */}
          <input
            type="text"
            value={prenom}
            onChange={e => onPrenomChange(e.target.value)}
            placeholder="Léa"
            autoFocus
            autoComplete="given-name"
            aria-label="Ton prénom"
            onKeyDown={e => { if (e.key === "Enter" && prenomOk) { e.preventDefault(); setSub(1); } }}
            className="w-full text-xl p-4 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50"
          />
        </div>

        <div className="text-center">
          <Button onClick={() => setSub(1)} disabled={!prenomOk} className="rounded-full px-8">Suivant →</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          {prenom.trim() ? `Enchantée ${prenom.trim()} 👋` : "Enchantée 👋"}
        </h1>
        <p className="text-sm text-muted-foreground italic">
          tu fais quoi, en deux mots ?
        </p>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tu fais quoi ?</label>
        <VoiceInput
          value={activite}
          onChange={onActiviteChange}
          placeholder="Photographe portrait pour entrepreneures"
          onEnter={activiteOk ? onNext : undefined}
          showVoiceTip
        />
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button variant="ghost" onClick={() => setSub(0)} className="rounded-full px-5">← Mon prénom</Button>
        <Button onClick={onNext} disabled={!activiteOk} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}
