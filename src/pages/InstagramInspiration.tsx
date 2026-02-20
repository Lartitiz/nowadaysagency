import AppHeader from "@/components/AppHeader";

export default function InstagramInspiration() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <h1 className="font-display text-[26px] font-bold text-foreground">🔍 M'inspirer</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Observe 3 comptes qui t'inspirent et note ce que tu veux tester.
        </p>
        <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          <p className="text-lg">🚧 Cette page arrive bientôt.</p>
        </div>
      </main>
    </div>
  );
}
