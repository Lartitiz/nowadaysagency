import { Button } from "@/components/ui/button";
import { CHANNELS } from "@/lib/onboarding-constants";

interface ChannelsStepProps {
  value: string[];
  onChange: (v: string[]) => void;
  onNext: () => void;
}

export default function ChannelsStep({ value, onChange, onNext }: ChannelsStepProps) {
  const toggle = (key: string) => {
    if (key === "none") { onChange(["none"]); return; }
    const without = value.filter(v => v !== "none");
    if (without.includes(key)) onChange(without.filter(v => v !== key));
    else onChange([...without, key]);
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Tu communiques où aujourd'hui ?</h1>
        <p className="text-sm text-muted-foreground italic">sélectionne tout ce que tu utilises, même un petit peu</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {CHANNELS.map(c => (
          <button key={c.key} onClick={() => toggle(c.key)}
            className={`px-5 py-3 rounded-full border-2 text-sm font-medium transition-all ${
              value.includes(c.key) ? "border-primary bg-secondary text-primary" : "border-border bg-card text-foreground hover:border-primary/40"
            }`}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
      <div className="text-center">
        <Button onClick={onNext} disabled={value.length === 0} className="rounded-full px-8">Suivant →</Button>
      </div>
    </div>
  );
}
