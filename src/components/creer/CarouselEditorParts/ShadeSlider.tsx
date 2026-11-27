// Curseur « Ombre sur la photo » (carousel-shade.ts) : le même réglage dans l'onglet Photo
// et sur la barre posée sur la slide. De 0 (aucune) à 100 (forte).
export function ShadeSlider({ value, onChange, compact = false, narrow = false, disabled = false }: {
  value: number;
  onChange: (value: number) => void;
  /** Sur la barre de la slide : une ligne, sans repères. */
  compact?: boolean;
  /** Barre de la slide serrée : curseur plus court. */
  narrow?: boolean;
  disabled?: boolean;
}) {
  const percent = Math.round(value * 100);
  const input = (
    <input
      type="range"
      min={0}
      max={100}
      step={5}
      value={percent}
      disabled={disabled}
      aria-label="Ombre sur la photo"
      aria-valuetext={percent === 0 ? "Aucune ombre" : `${percent} %`}
      data-testid={compact ? "shade-slider-slide" : "shade-slider"}
      // La barre de la slide retient les clics pour garder la sélection : pas celui du curseur.
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      className={`h-6 cursor-pointer accent-primary ${compact ? (narrow ? "w-14" : "w-20 sm:w-24") : "w-full"}`}
    />
  );
  if (compact)
    return (
      <label className="flex h-8 items-center gap-1.5 px-1.5 text-xs font-semibold">
        Ombre {input}
      </label>
    );
  return (
    <div>
      {input}
      <div className="flex justify-between text-2xs text-muted-foreground" aria-hidden="true">
        <span>Aucune</span>
        <span>Forte</span>
      </div>
    </div>
  );
}
