import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { PRODUCT_OPTIONS } from "@/lib/onboarding-constants";

interface Props {
  value: string;
  onChange: (v: string) => void;
  detailValue: string;
  onDetailChange: (v: string) => void;
  /** Activité saisie à l'étape précédente : sert de pré-remplissage. */
  activite?: string;
  onNext?: () => void;
}

export default function ProductServiceScreen({
  value, onChange, detailValue, onDetailChange, activite, onNext,
}: Props) {
  // Pré-remplissage unique depuis l'étape 1 (« ton activité »), éditable ensuite.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current) return;
    if (!detailValue && activite && activite.trim().length >= 2) {
      prefilled.current = true;
      onDetailChange(activite.trim());
    }
  }, [activite, detailValue, onDetailChange]);

  const canNext = !!value && detailValue.trim().length >= 5;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Tu proposes plutôt quoi&nbsp;?
        </h1>
        <p className="text-sm text-muted-foreground italic">
          pour adapter les contenus qu'on va créer ensemble
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PRODUCT_OPTIONS.map(o => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`relative rounded-xl border-2 px-4 py-5 transition-all duration-200 flex sm:flex-col items-center sm:justify-center gap-3 sm:gap-2 text-left sm:text-center ${
              value === o.key
                ? "border-primary bg-secondary shadow-sm"
                : "border-border bg-card hover:border-primary/40 hover:bg-secondary/30"
            }`}
          >
            <span className="text-2xl leading-none">{o.emoji}</span>
            <span className="text-sm font-semibold text-foreground">{o.label}</span>
            {value === o.key && (
              <span className="absolute top-2 right-3 text-primary font-bold text-sm">✓</span>
            )}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="activity-detail" className="block text-sm font-semibold text-foreground mb-2">
          Et concrètement, tu fais quoi&nbsp;?
        </label>
        <input
          id="activity-detail"
          type="text"
          value={detailValue}
          onChange={e => onDetailChange(e.target.value)}
          placeholder="céramiste, je vends mes pièces en ligne"
          className="w-full text-base p-3 border-b-2 border-border focus:border-primary outline-none bg-transparent transition-colors text-foreground placeholder:text-muted-foreground/50"
        />
        <p className="text-2xs text-muted-foreground mt-1.5 italic">
          (une phrase suffit — c'est ce qui rend tes contenus justes)
        </p>
      </div>

      {canNext && onNext && (
        <div className="flex justify-center">
          <Button type="button" onClick={onNext} className="rounded-full px-8">
            Suivant →
          </Button>
        </div>
      )}
    </div>
  );
}
