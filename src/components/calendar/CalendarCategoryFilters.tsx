interface Props {
  value: string;
  onChange: (v: string) => void;
}

const FILTERS = [
  { id: "all", label: "Tout" },
  { id: "visibilite", emoji: "👁️", label: "Visibilité" },
  { id: "confiance", emoji: "🤝", label: "Confiance" },
  { id: "vente", emoji: "💰", label: "Vente" },
  { id: "launch", emoji: "🚀", label: "Lancement" },
  { id: "a_rediger", emoji: "📝", label: "À rédiger" },
];

export function CalendarCategoryFilters({ value, onChange }: Props) {
  return (
    <div className="flex gap-1.5 flex-wrap mb-4">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={`whitespace-nowrap rounded-pill px-3 py-1.5 text-xs font-medium border transition-all ${
            value === f.id
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-foreground border-border hover:border-primary/40"
          }`}
        >
          {f.emoji && <span className="mr-1">{f.emoji}</span>}
          {f.label}
        </button>
      ))}
    </div>
  );
}
