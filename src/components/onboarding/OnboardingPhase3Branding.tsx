import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChoiceCard, VoiceInput } from "./OnboardingShared";
import {
  BLOCKERS, OBJECTIVES, TIME_OPTIONS, CHANNELS, DESIRED_CHANNELS,
} from "@/lib/onboarding-constants";
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
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Tes canaux de communication</h1>
        <p className="text-sm text-muted-foreground italic">dis-moi où tu en es et où tu veux aller</p>
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Tu communiques déjà sur...</h2>
        <div className="space-y-2">
          {CHANNELS.map(o => (
            <ChoiceCard key={o.key} emoji={o.emoji} label={o.label} selected={answers.canaux.includes(o.key)} onClick={() => toggleCanal(o.key)} />
          ))}
        </div>
      </div>
      {filteredDesired.length > 0 && (
        <>
          <div className="border-t border-border/50" />
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Et tu aimerais te lancer sur...</h2>
            <p className="text-xs text-muted-foreground italic mb-1">même si c'est juste une envie</p>
            <div className="space-y-2">
              {filteredDesired.map(o => (
                <ChoiceCard key={o.key} emoji={o.emoji} label={o.label} selected={answers.desired_channels.includes(o.key)} onClick={() => toggleDesired(o.key)} />
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

/* ── Objectif (Step 6) ── */
export function ObjectifScreen({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Et si tout marchait bien dans 6 mois, ça ressemblerait à quoi ?</h1>
      </div>
      <div className="space-y-3">
        {OBJECTIVES.map(o => (
          <ChoiceCard key={o.key} emoji={o.emoji} label={o.label} selected={value === o.key} onClick={() => onChange(o.key)} />
        ))}
      </div>
    </div>
  );
}

/* ── Blocage (Step 7) ── */
export function BlocageScreen({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">C'est quoi ton plus gros blocage en com' aujourd'hui ?</h1>
        <p className="text-sm text-muted-foreground italic">ce qui te fait soupirer quand tu y penses</p>
      </div>
      <div className="space-y-3">
        {BLOCKERS.map(b => (
          <ChoiceCard key={b.key} emoji={b.emoji} label={b.label} selected={value === b.key} onClick={() => onChange(b.key)} />
        ))}
      </div>
    </div>
  );
}

/* ── Temps (Step 8) ── */
export function TempsScreen({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Tu peux consacrer combien de temps à ta com' par semaine ?</h1>
        <p className="text-sm text-muted-foreground italic">sois honnête, on s'adapte</p>
      </div>
      <div className="space-y-3">
        {TIME_OPTIONS.map(t => (
          <ChoiceCard key={t.key} emoji={t.emoji} label={t.label} selected={value === t.key} onClick={() => onChange(t.key)} />
        ))}
      </div>
    </div>
  );
}

/* ── Change priority (Step 9) ── */
export function ChangeScreen({ value, onChange, onNext }: { value: string; onChange: (v: string) => void; onNext: () => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Si tu pouvais changer UNE chose dans ta com' demain, ce serait quoi ?
        </h1>
        <p className="text-sm text-muted-foreground italic">pas de mauvaise réponse, dis ce qui te vient</p>
      </div>
      <VoiceInput value={value} onChange={onChange} placeholder="Ex : avoir un feed Instagram cohérent, trouver ma ligne éditoriale..." multiline />
      <div className="text-center">
        <Button onClick={onNext} disabled={!value.trim()} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}

/* ── Uniqueness (Step 10) ── */
export function UniquenessScreen({ value, onChange, onNext }: { value: string; onChange: (v: string) => void; onNext: () => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          C'est quoi LE truc qui te rend différente des autres dans ton domaine ?
        </h1>
        <p className="text-sm text-muted-foreground italic">même si tu penses que c'est pas grand-chose</p>
      </div>
      <VoiceInput value={value} onChange={onChange} placeholder="Ex : mon approche est très humaine, je mets les gens à l'aise..." multiline />
      <div className="text-center">
        <Button onClick={onNext} disabled={!value.trim()} className="rounded-full px-8">Voir mon diagnostic →</Button>
      </div>
    </div>
  );
}
