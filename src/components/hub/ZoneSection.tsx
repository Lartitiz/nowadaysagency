export default function ZoneSection({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="font-display text-lg font-bold text-foreground mb-3 flex items-center gap-2">
        <span>{emoji}</span> {title}
      </h2>
      <div className="rounded-2xl border border-border bg-card/50 p-4">
        {children}
      </div>
    </section>
  );
}
