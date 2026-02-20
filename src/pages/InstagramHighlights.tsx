import AppHeader from "@/components/AppHeader";

export default function InstagramHighlights() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <h1 className="font-display text-[26px] font-bold text-foreground">⭐ Stories à la une</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Organise tes highlights pour guider les visiteurs de ton profil.
        </p>
        <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          <p className="text-lg">🚧 Cette page arrive bientôt.</p>
        </div>
      </main>
    </div>
  );
}
