const PRODUCT_OPTIONS = [
  { key: "produits", emoji: "🎁", label: "Des produits" },
  { key: "services", emoji: "🤝", label: "Des services" },
  { key: "les_deux", emoji: "✨", label: "Les deux" },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function ProductServiceScreen({ value, onChange }: Props) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Tu vends plutôt...
        </h1>
        <p className="text-sm text-muted-foreground italic">
          produits, services, ou un peu des deux ?
        </p>
      </div>
      <div className="space-y-3">
        {PRODUCT_OPTIONS.map(o => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`w-full text-left rounded-xl border-2 px-5 py-4 transition-all duration-200 flex items-center gap-3 ${
              value === o.key
                ? "border-primary bg-secondary shadow-sm"
                : "border-border bg-card hover:border-primary/40 hover:bg-secondary/30"
            }`}
          >
            <span className="text-xl">{o.emoji}</span>
            <span className="text-sm font-semibold text-foreground">{o.label}</span>
            {value === o.key && <span className="ml-auto text-primary font-bold text-sm">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
