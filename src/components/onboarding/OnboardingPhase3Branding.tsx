import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChoiceCard, ChoiceChip, VoiceInput } from "./OnboardingShared";
import {
  TIME_OPTIONS, CHANNELS, DESIRED_CHANNELS,
} from "@/lib/onboarding-constants";
import { useAuth } from "@/contexts/AuthContext";
import { getOnboardingVariant } from "@/lib/onboarding-variants";
import type { Answers } from "@/hooks/use-onboarding";

/* ── Canaux Combined (Step 5) ── */
export function CanauxCombinedScreen({ answers, set, onNext }: {
  answers: Answers;
  set: <K extends keyof Answers>(k: K, v: Answers[K]) => void;
  onNext: () => void;
}) {
  useEffect(() => {
    const preSelected = [
      ...(answers.instagram ? ["instagram"] : []),
      ...(answers.website ? ["website"] : []),
      ...(answers.linkedin ? ["linkedin"] : []),
    ];
    if (preSelected.length > 0 && answers.canaux.length === 0) {
      set("canaux", preSelected);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCanal = (key: string) => {
    if (key === "none") {
      set("canaux", answers.canaux.includes("none") ? [] : ["none"]);
      return;
    }
    const without = answers.canaux.filter(s => s !== "none");
    set("canaux", without.includes(key) ? without.filter(s => s !== key) : [...without, key]);
  };

  const toggleDesired = (key: string) => {
    const curr = answers.desired_channels;
    set("desired_channels", curr.includes(key) ? curr.filter(s => s !== key) : [...curr, key]);
  };

  const filteredDesired = DESIRED_CHANNELS.filter(c => !answers.canaux.includes(c.key));

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Tes canaux de communication</h1>
        <p className="text-sm text-muted-foreground italic">dis-moi où tu en es et où tu veux aller</p>
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Tu communiques déjà sur...</h2>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map(o => (
            <ChoiceChip key={o.key} emoji={o.emoji} label={o.label} selected={answers.canaux.includes(o.key)} onClick={() => toggleCanal(o.key)} />
          ))}
        </div>
      </div>
      {filteredDesired.length > 0 && (
        <>
          <div className="border-t border-border/50" />
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Et tu aimerais te lancer sur...</h2>
            <p className="text-xs text-muted-foreground italic mb-1">même si c'est juste une envie</p>
            <div className="flex flex-wrap gap-2">
              {filteredDesired.map(o => (
                <ChoiceChip key={o.key} emoji={o.emoji} label={o.label} selected={answers.desired_channels.includes(o.key)} onClick={() => toggleDesired(o.key)} />
              ))}
            </div>
          </div>
        </>
      )}
      <div className="text-center">
        <Button onClick={onNext} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

/* ── Objectif + temps (une seule étape) ──
   Les deux réponses sont des choix simples : l'écran avance tout seul quand
   les deux sont données (voir Onboarding.tsx). */
export function ObjectifScreen({ value, onChange, temps, onTempsChange }: {
  value: string;
  onChange: (v: string) => void;
  temps: string;
  onTempsChange: (v: string) => void;
}) {
  const { user } = useAuth();
  const { objectives } = getOnboardingVariant(user?.email);
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Et si tout marchait bien dans 6 mois, ça ressemblerait à quoi ?</h1>
      </div>
      <div className="space-y-2">
        {objectives.map(o => (
          <ChoiceCard key={o.key} emoji={o.emoji} label={o.label} selected={value === o.key} onClick={() => onChange(o.key)} />
        ))}
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Et tu peux y consacrer combien de temps par semaine ?</h2>
        <div className="flex flex-wrap gap-2">
          {TIME_OPTIONS.map(t => (
            <ChoiceChip key={t.key} emoji={t.emoji} label={t.label} selected={temps === t.key} onClick={() => onTempsChange(t.key)} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Blocage (Step 7) ── */
export function BlocageScreen({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { user } = useAuth();
  const { blockers } = getOnboardingVariant(user?.email);
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">C'est quoi ton plus gros blocage en com' aujourd'hui ?</h1>
        <p className="text-sm text-muted-foreground italic">ce qui te fait soupirer quand tu y penses</p>
      </div>
      <div className="space-y-3">
        {blockers.map(b => (
          <ChoiceCard key={b.key} emoji={b.emoji} label={b.label} selected={value === b.key} onClick={() => onChange(b.key)} />
        ))}
      </div>
    </div>
  );
}

/* ── Deux questions libres et facultatives, sur un seul écran ──
   (« ce que tu changerais » + « ce qui te rend différente »). Dernière étape
   avant le diagnostic : le bouton le lance. */
export function OpenQuestionsScreen({ change, onChangeChange, uniqueness, onUniquenessChange, onNext }: {
  change: string;
  onChangeChange: (v: string) => void;
  uniqueness: string;
  onUniquenessChange: (v: string) => void;
  onNext: () => void;
}) {
  const filled = !!(change.trim() || uniqueness.trim());
  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Pour aller plus loin</h1>
        <p className="text-sm text-muted-foreground italic">facultatif, pas de mauvaise réponse</p>
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Si tu pouvais changer UNE chose dans ta com' demain, ce serait quoi ?</h2>
        <VoiceInput value={change} onChange={onChangeChange} label="Ce que tu changerais dans ta com'" placeholder="Ex : trouver ma ligne éditoriale, publier plus régulièrement..." multiline rows={2} />
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">C'est quoi LE truc qui te rend différente des autres dans ton domaine ?</h2>
        <VoiceInput value={uniqueness} onChange={onUniquenessChange} label="Ce qui te rend différente" placeholder="Ex : mon approche est très humaine, je mets les gens à l'aise..." multiline rows={2} autoFocus={false} />
      </div>
      <div className="text-center space-y-2">
        <Button onClick={onNext} className="rounded-full px-8">{filled ? "Voir mon diagnostic →" : "Passer et voir mon diagnostic →"}</Button>
        <p className="text-xs text-muted-foreground">Tu pourras compléter ça plus tard dans ta fiche de marque.</p>
      </div>
    </div>
  );
}
