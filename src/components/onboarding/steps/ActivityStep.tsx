import { Button } from "@/components/ui/button";
import { ACTIVITY_SECTIONS } from "@/lib/onboarding-constants";
import type { Answers } from "@/hooks/use-onboarding";

interface ActivityStepProps {
  value: string;
  detailValue: string;
  onChange: (v: string) => void;
  onDetailChange: (v: string) => void;
  onNext: () => void;
}

export default function ActivityStep({ value, detailValue, onChange, onDetailChange, onNext }: ActivityStepProps) {
  const showDetail = value === "autre";
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Tu te reconnais dans quoi ?</h1>
        <p className="text-sm text-muted-foreground italic">choisis ce qui te correspond le mieux</p>
      </div>
      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1" onPointerDown={e => e.stopPropagation()}>
        {ACTIVITY_SECTIONS.map(section => (
          <div key={section.label}>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{section.label}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {section.items.map(t => (
                <button key={t.key} type="button" onClick={() => onChange(t.key)}
                  className={`relative text-left rounded-xl border-2 px-4 py-3.5 transition-all duration-200 ${
                    value === t.key ? "border-primary bg-secondary shadow-sm" : "border-border bg-card hover:border-primary/40 hover:bg-secondary/30"
                  }`}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none mt-0.5">{t.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground">{t.label}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                    </div>
                  </div>
                  {value === t.key && <span className="absolute top-2.5 right-3 text-primary font-bold text-sm">✓</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div>
          <button type="button" onClick={() => onChange("autre")}
            className={`w-full text-left rounded-xl border-2 px-4 py-3.5 transition-all duration-200 ${
              showDetail ? "border-primary bg-secondary shadow-sm" : "border-border bg-card hover:border-primary/40 hover:bg-secondary/30"
            }`}>
            <span className="flex items-center gap-3">
              <span className="text-2xl">✏️</span>
              <span className="text-sm font-semibold text-foreground">Autre</span>
              {showDetail && <span className="ml-auto text-primary font-bold text-sm">✓</span>}
            </span>
          </button>
          {showDetail && (
            <div className="mt-3 space-y-3">
              <input type="text" value={detailValue} onChange={e => onDetailChange(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && detailValue.trim()) onNext(); }}
                placeholder="Décris ton activité en quelques mots" autoFocus
                className="w-full text-base p-3 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50" />
              <div className="text-center">
                <Button onClick={onNext} disabled={!detailValue.trim()} className="rounded-full px-8">Suivant →</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
