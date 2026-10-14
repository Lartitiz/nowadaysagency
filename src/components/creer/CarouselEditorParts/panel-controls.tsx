// Lot E3-4 (14/10/2026) : petits outils du panneau de réglages (curseur avec
// sa valeur, conversion de couleurs), déplacés à l'identique depuis
// CarouselEditor.tsx où ils ne dépendaient de rien.

export const range = (
  label: string,
  value: number,
  min: number,
  max: number,
  onValue: (n: number) => void,
  step = 1,
) => (
  <label className="block text-xs space-y-1">
    <span className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <input
        aria-label={`${label} (valeur)`}
        type="number"
        min={min}
        max={max}
        step={step}
        value={Math.round(value * 10) / 10}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isNaN(n)) return;
          onValue(Math.min(max, Math.max(min, n)));
        }}
        className="w-16 rounded-md border border-input bg-background px-1 py-0.5 text-right text-xs"
      />
    </span>
    <input
      aria-label={label}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onValue(Number(e.target.value))}
      className="w-full accent-primary"
    />
  </label>

);
export const toHex = (value: string | undefined, fallback: string) => {
  if (/^#[0-9a-f]{6}$/i.test(value || "")) return value!;
  const rgb = value?.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return rgb
    ? `#${rgb
        .slice(1)
        .map((v) => Number(v).toString(16).padStart(2, "0"))
        .join("")}`
    : fallback;
};
export const alphaOf = (value: string | undefined) => {
  if (!value || value === "transparent") return 0;
  const m = value.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)/);
  return m ? Number(m[1]) : 1;
};
